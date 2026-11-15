"""Corridas de scripts: un proceso spawn por corrida (gmatpy es singleton global),
con log en vivo leído del archivo de log de GMAT, timeout y cancelación."""
import asyncio
import multiprocessing as mp
import re
import shutil
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from app import config
from app.engine import results, worker
from app.engine.sanitize import sanitize
from app.engine.solver import SolverLog

LOG = "gmat.log"
SCRIPT = "mission.script"
HIDDEN = {LOG, SCRIPT, "startup.txt", "GmatLog.txt"}
EXIT_MSG = {2: "The script has errors and could not be loaded", 3: "The run failed"}


def _child(gmat_home: str, cache_dir: str, run_dir: str) -> None:
    """Proceso de la corrida: único lugar (junto al pool) donde se importa gmatpy."""
    import os

    # Como GMAT escritorio: rutas de entrada '../data/...' relativas a bin. Las salidas ya
    # apuntan a run_dir (sanitize + OUTPUT_PATH).
    os.chdir(Path(gmat_home, "bin"))
    worker._init(gmat_home, cache_dir, run_dir)
    g = worker.gmat
    g.UseLogFile(str(Path(run_dir, LOG)))
    if not g.LoadScript(str(Path(run_dir, SCRIPT))):
        sys.exit(2)
    sys.exit(0 if g.RunScript() else 3)


def classify(line: str) -> dict:
    """Evento `log` con nivel y, si GMAT la cita, la línea del script."""
    ev: dict = {"type": "log", "level": "info", "text": line}
    if "**** ERROR ****" in line or "Exception" in line:
        ev["level"] = "error"
    elif "warning" in line.lower():
        ev["level"] = "warning"
    m = re.match(r'^\s*"\s*(\d+):', line)  # GMAT cita la línea así:    "  57: Obj.X = 1;"
    if m:
        ev["level"], ev["line"] = "error", int(m[1])
    return ev


@dataclass
class Run:
    id: str
    dir: Path
    proc: mp.Process | None = None
    events: list[dict] = field(default_factory=list)
    cond: asyncio.Condition = field(default_factory=asyncio.Condition)
    cancelled: bool = False
    manifest: dict = field(default_factory=dict)
    ended: float | None = None

    @property
    def finished(self) -> bool:
        return bool(self.events) and self.events[-1]["type"] in ("done", "error")

    async def emit(self, ev: dict) -> None:
        async with self.cond:
            self.events.append(ev)
            if ev["type"] in ("done", "error"):
                self.ended = time.time()
            self.cond.notify_all()


runs: dict[str, Run] = {}
_tasks: set[asyncio.Task] = set()


def active() -> int:
    return sum(not r.finished for r in runs.values())


def prune() -> None:
    """Olvida las corridas terminadas hace más de RUN_KEEP_S y borra su carpeta; también borra
    carpetas viejas de corridas (`run-*`, `desk-*`, `val-*`) que no están en `runs` (reinicios, lote)."""
    limit = time.time() - config.RUN_KEEP_S
    for rid, run in list(runs.items()):
        if run.ended and run.ended < limit:
            del runs[rid]
            shutil.rmtree(run.dir, ignore_errors=True)
    live = {r.dir.resolve() for r in runs.values()}
    for d in config.RUNS_DIR.glob("*-*"):
        if d.name.split("-")[0] in ("run", "desk", "val") and d.is_dir() and d.resolve() not in live \
                and d.stat().st_mtime < limit:
            shutil.rmtree(d, ignore_errors=True)


def create(text: str) -> Run:
    """Sanea (puede lanzar ScriptRejected), prepara la carpeta y arranca el proceso."""
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)
    prune()
    run_dir = Path(tempfile.mkdtemp(prefix="run-", dir=config.RUNS_DIR))
    try:
        safe = sanitize(text, run_dir)
    except Exception:
        run_dir.rmdir()
        raise
    safe, manifest = results.inject(safe, run_dir)
    (run_dir / SCRIPT).write_text(safe, encoding="utf-8")
    run = Run(id=uuid.uuid4().hex, dir=run_dir, manifest=manifest)
    run.proc = mp.get_context("spawn").Process(
        target=_child, args=(config.GMAT_HOME, str(config.CACHE_DIR), str(run_dir)), daemon=True)
    run.proc.start()
    runs[run.id] = run
    task = asyncio.get_running_loop().create_task(_supervise(run))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return run


async def _supervise(run: Run) -> None:
    start, pos, buf, last_tick = time.monotonic(), 0, "", 0
    log = run.dir / LOG
    solver = SolverLog((run.dir / SCRIPT).read_text(encoding="utf-8"))
    for name in solver.silent:
        await run.emit({"type": "solver", "event": "silent", "solver": name})

    async def drain(final: bool = False):
        nonlocal pos, buf
        if log.exists():
            with log.open("r", encoding="utf-8", errors="replace") as f:
                f.seek(pos)
                buf += f.read()
                pos = f.tell()
        *lines, buf = buf.split("\n")
        if final and buf:
            lines, buf = lines + [buf], ""
        for line in lines:
            if line.strip():
                ev = classify(line.rstrip("\r"))
                if "line" in ev:  # el script corrido lleva líneas inyectadas antes de BeginMissionSequence
                    ev["line"] = results.original_line(ev["line"], run.manifest)
                await run.emit(ev)
                for sev in solver.feed(line.rstrip("\r")):
                    await run.emit(sev)

    while run.proc.is_alive():
        await asyncio.sleep(0.2)
        await drain()
        elapsed = time.monotonic() - start
        if run.cancelled or elapsed > config.RUN_TIMEOUT_S:
            run.proc.terminate()
            run.proc.join(5)
            await drain(final=True)
            msg = "Corrida detenida" if run.cancelled else f"Tiempo límite ({config.RUN_TIMEOUT_S:.0f} s) agotado"
            await run.emit({"type": "error", "message": msg})
            return
        if int(elapsed) > last_tick:
            last_tick = int(elapsed)
            await run.emit({"type": "progress", "elapsed": round(elapsed, 1)})
    await drain(final=True)
    code = run.proc.exitcode
    if code != 0:
        await run.emit({"type": "error", "message": EXIT_MSG.get(code, f"The engine exited with code {code}")})
        return
    files = sorted(p.name for p in run.dir.iterdir()
                   if p.is_file() and p.name not in HIDDEN and not p.name.startswith(results.PREFIX))
    m = run.manifest
    await run.emit({"type": "done", "results": {
        "elapsed": round(time.monotonic() - start, 2), "files": files,
        "available": bool(m.get("ships") or m.get("reports") or m.get("xyplots"))}})


def cancel(run: Run) -> None:
    run.cancelled = True


def stop_all() -> None:
    for run in runs.values():
        if run.proc and run.proc.is_alive():
            run.proc.terminate()
