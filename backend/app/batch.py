"""Lote de samples raíz de GMAT_HOME por el mismo camino que la web (sanitize + runner),
y corrida "escritorio" (gmatpy directo, sin sanitize ni inyección) para comparar.

Regenerar docs/COMPATIBILIDAD.md (desde backend/, con GMAT_HOME definido):
    python -m app.batch [--jobs 4] [--timeout 300]
Herramienta de desarrollo: la API no importa este módulo.
"""
import argparse
import asyncio
import multiprocessing as mp
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path

from app import config, samples
from app.engine import runner, worker
from app.engine.sanitize import ScriptRejected
from app.engine.solver import SolverLog

# Huella en el script de cada plugin que puede venir comentado en el startup file. Solo cuentan los
# que el startup activo deja sin cargar (`disabled_plugins`); lo demás se corre y se juzga por el resultado.
# shortcut: un plugin comentado que no está en esta lista no se detecta; su sample sale como `error`.
PLUGIN_MARKS = {
    "libMarsGRAM": r"AtmosphereModel\s*=\s*MarsGRAM",
    "libMsise86": r"AtmosphereModel\s*=\s*MSISE86",
    "libExternalForceModel": r"\.(?:DerivativesFunction|External\.\w+)\s*=",
    "libPolyhedronGravity": r"PolyhedronGravity|\.PolyhedronBody",
    "libVF13Optimizer": r"^\s*Create\s+VF13ad\b",
    "libSNOptimizer": r"^\s*Create\s+SNOPT\b",
    "libCsaltInterface": r"^\s*Create\s+(?:Trajectory|Phase|OptimalControlGuess|DynamicsConfiguration)\b",
    "libEMTGModels": r"^\s*Create\s+EMTG\w*\b",
}
PLUGIN_LINE = re.compile(r"(?m)^\s*(#)?\s*PLUGIN\s*=\s*\S*?(lib\w+?)(?:_py\d+)?\s*$")
ERROR_PREFIX = re.compile(r"^\d+: .*?\.script: |\*\*\*\* ERROR \*\*\*\* ")
# Textos del motor cuando no encuentra un archivo de entrada.
MISSING = re.compile(r"does not exist|not found|cannot open|can not open|unable to open|could not open|"
                     r"error opening|failed to open|no such file", re.I)
DOC = Path(__file__).resolve().parents[2] / "docs" / "COMPATIBILIDAD.md"
STATES = ["ok", "rechazado", "error", "timeout", "falta archivo", "plugin"]


def disabled_plugins(startup: str) -> set[str]:
    """Librerías con línea PLUGIN comentada (y sin otra línea activa) en el startup file."""
    on = {m[2] for m in PLUGIN_LINE.finditer(startup) if not m[1]}
    return {m[2] for m in PLUGIN_LINE.finditer(startup) if m[1]} - on


def plugin_of(text: str, disabled: set[str]) -> str | None:
    code = re.sub(r"%.*", "", text)  # shortcut: corta también un % dentro de comillas; basta para detectar
    return next((f"{lib} (desactivado en el startup file)" for lib, rx in PLUGIN_MARKS.items()
                 if lib in disabled and re.search(rx, code, re.M)), None)


def solver_summary(evs: list[dict]) -> dict | None:
    """Por solver: veces que corrió, estado del último `end` y, por corrida, las variables y el
    costo de su última iteración (valores finales)."""
    out: dict = {}
    for e in evs:
        if e.get("type") != "solver" or e["event"] == "silent":
            continue
        s = out.setdefault(e["solver"], {"runs": 0, "final": []})
        if e["event"] == "start":
            s["runs"] += 1
            s["final"].append({})
        elif e["event"] == "iteration" and s["final"]:
            s["final"][-1] = {v["name"]: v["value"] for v in e["variables"]} | (
                {"cost": e["cost"]} if "cost" in e else {})
        elif e["event"] == "end":
            s["status"] = e["status"]
    return out or None


async def run_web(text: str) -> dict:
    """Corre como POST /api/runs y espera el fin. Devuelve estado, motivo, tiempo, eventos."""
    t0 = time.monotonic()
    try:
        run = runner.create(text)
    except ScriptRejected as e:
        return {"state": "rechazado", "reason": f"{e} (línea {e.line})" if e.line else str(e), "time": 0, "events": []}
    while not run.finished:
        await asyncio.sleep(0.2)
    evs, last = run.events, run.events[-1]
    res = {"time": round(time.monotonic() - t0, 1), "events": evs, "solvers": solver_summary(evs)}
    if last["type"] == "done":
        return {**res, "state": "ok", "reason": ""}
    if last["message"].startswith("Tiempo límite"):
        return {**res, "state": "timeout", "reason": last["message"]}
    errors = [ERROR_PREFIX.sub("", e["text"].strip()) for e in evs
              if e.get("level") == "error" and "line" not in e]  # sin las líneas citadas del script
    miss = next((t for t in errors if MISSING.search(t)), None)
    first = miss or (errors[0] if errors else last["message"])
    return {**res, "state": "falta archivo" if miss else "error", "reason": first[:160]}


def _desktop_child(gmat_home: str, cache_dir: str, script: str, out_dir: str) -> None:
    import os
    os.chdir(Path(gmat_home, "bin"))
    worker._init(gmat_home, cache_dir, out_dir)
    g = worker.gmat
    g.UseLogFile(str(Path(out_dir, "gmat.log")))
    if not g.LoadScript(script):
        sys.exit(2)
    sys.exit(0 if g.RunScript() else 3)


def run_desktop(script: Path, timeout: float = 300) -> list[dict]:
    """Como GMAT escritorio: el .script original con gmatpy, sin sanitize ni ReportFile ocultos.
    Devuelve los eventos `solver` de su log."""
    out = Path(tempfile.mkdtemp(prefix="desk-", dir=config.RUNS_DIR))
    p = mp.get_context("spawn").Process(target=_desktop_child, daemon=True,
                                        args=(config.GMAT_HOME, str(config.CACHE_DIR), str(script), str(out)))
    p.start()
    try:
        p.join(timeout)
        if p.is_alive():
            p.terminate()
            p.join(5)
            raise TimeoutError(script.name)
        assert p.exitcode == 0, f"{script.name}: código {p.exitcode}"
        log = SolverLog(script.read_text(encoding="utf-8", errors="replace"))
        lines = (out / "gmat.log").read_text(encoding="utf-8", errors="replace").splitlines()
        return [ev for line in lines for ev in log.feed(line)]
    finally:
        shutil.rmtree(out, ignore_errors=True)


def _solver_cell(r: dict) -> str:
    sv = r.get("solvers")
    if not sv:
        return ""
    return ", ".join(f"{n}: {s.get('status', 'sin cierre')}" + (f" ×{s['runs']}" if s["runs"] > 1 else "")
                     for n, s in sv.items())


def write_doc(rows: list[dict]) -> None:
    counts = {s: sum(r["state"] == s for r in rows) for s in STATES}
    lines = [
        "<!-- generado por backend/app/batch.py: no editar la tabla a mano -->",
        "# Compatibilidad de samples",
        "",
        f"Samples raíz de `GMAT_HOME/samples` (GMAT R2026a) corridos por el camino de la web "
        f"(`sanitize` + `runner` + ReportFile ocultos). Timeout {config.RUN_TIMEOUT_S:.0f} s.",
        "",
        "Regenerar (desde `backend/`, con `GMAT_HOME`): `python -m app.batch` (opciones `--jobs`, `--timeout`).",
        "",
        "## Resumen",
        "",
        " · ".join(f"{s}: {counts[s]}" for s in STATES) + f" · total: {len(rows)}",
        "",
        "Estados: `ok` terminó sin error; `rechazado` lo para `sanitize` (regla de seguridad, no se corre); "
        "`error` el motor no lo cargó o falló; `timeout` pasó el límite; `falta archivo` el motor no encontró "
        "un archivo de entrada; `plugin` usa un plugin que el startup file activo deja comentado (no se "
        "corre; los plugins activos, como estimación, eventos o formaciones, sí se corren). Solver: estado final de cada "
        "solver según los eventos `solver` (`converged`, `failed`, `initial`; `×N` = veces que corrió).",
        "",
        "## Límites conocidos (no son bugs del port)",
        "",
        "- `rechazado`: `GmatFunction`, `Python.*` e `#Include` están prohibidos en el servidor (`engine/sanitize.py`).",
        "- Rutas de entrada relativas: GMAT las busca en la carpeta del script (`GmatFileUtil::FindFile`), que "
        "en la web es la corrida; `sanitize` pasa a absoluta la que existe desde `GMAT_HOME/samples` "
        "(`'../samples/SupportFiles/...'`). Una ruta relativa a otra carpeta no se encuentra.",
        "- `TrackingFileSet.FileName`: con un `Simulator` en el script es salida y va a la corrida; sin él es "
        "entrada (`.gmd` que lee el estimador) y no se reescribe. Un script que simula y además lee otro "
        "`.gmd` existente no lo encuentra.",
        "- `plugin`: librerías con su línea `PLUGIN` comentada en el startup file que usa el worker "
        "(en R2026a: MarsGRAM, ExternalForceModel, VF13ad, SNOPT, CSALT, entre otras). Activarlas es "
        "decisión de despliegue, no del port.",
        "- Optimize con Yukon y Target (Hohmann, Mars B-plane) dan los mismos valores finales que GMAT "
        "escritorio: `tests/test_desktop.py` (`pytest -m slow`). VF13ad y fmincon no están en esta instalación.",
        "",
        "## Tabla",
        "",
        "| Sample | Estado | Tiempo (s) | Solver | Motivo |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        reason = r["reason"].replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {r['name']} | {r['state']} | {r['time'] or ''} | {_solver_cell(r)} | {reason} |")
    lines.append("")
    DOC.write_text("\n".join(lines), encoding="utf-8")


async def run_all(jobs: int) -> list[dict]:
    sem = asyncio.Semaphore(jobs)
    # el mismo startup que carga el worker de la corrida
    disabled = disabled_plugins(worker.api_startup_file(Path(config.GMAT_HOME), config.CACHE_DIR).read_text())

    async def one(s: dict) -> dict:
        text = samples.read(s["id"])
        if plug := plugin_of(text, disabled):
            return {"name": s["id"], "state": "plugin", "reason": plug, "time": 0}
        async with sem:
            r = await run_web(text)
        r.pop("events")
        print(f"{r['state']:>13}  {r['time']:>6}  {s['id']}  {r['reason'][:80]}", flush=True)
        return {"name": s["id"], **r}

    return await asyncio.gather(*(one(s) for s in samples.list_samples() if not s["folder"]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--timeout", type=float, default=config.RUN_TIMEOUT_S)
    args = ap.parse_args()
    assert config.GMAT_HOME, "Definir GMAT_HOME"
    config.RUN_TIMEOUT_S = args.timeout
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)
    rows = asyncio.run(run_all(args.jobs))
    write_doc(rows)
    print({s: sum(r["state"] == s for r in rows) for s in STATES}, "->", DOC)


if __name__ == "__main__":
    main()
