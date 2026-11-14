"""Pool de procesos worker que cargan gmatpy.

gmatpy es un singleton global por proceso: el proceso FastAPI nunca lo importa.
Todo lo que toque el motor se envía aquí con `submit(fn, ...)`.
"""
import asyncio
import multiprocessing as mp
import os
import re
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from app import config

_pool: ProcessPoolExecutor | None = None
gmat = None  # módulo gmatpy, solo dentro del worker


def api_startup_file(gmat_home: Path, cache_dir: Path) -> Path:
    """Usa bin/api_startup_file.txt si existe; si no, lo genera en cache_dir
    igual que api/BuildApiStartupFile.py (rutas '..' → GMAT_HOME absoluto)."""
    existing = gmat_home / "bin" / "api_startup_file.txt"
    if existing.exists():
        return existing
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / "api_startup_file.txt"
    text = (gmat_home / "bin" / "gmat_startup_file.txt").read_text().replace("..", gmat_home.as_posix())
    if not out.exists() or out.read_text() != text:
        # atómico: varios procesos de corrida arrancan a la vez y lo leen
        tmp = out.with_name(f"{out.name}.{os.getpid()}")
        tmp.write_text(text)
        try:
            os.replace(tmp, out)
        except PermissionError:  # Windows: otro proceso lo tiene abierto; ya lo escribió igual
            tmp.unlink(missing_ok=True)
    return out


def _init(gmat_home: str, cache_dir: str, output_path: str | None = None) -> None:
    global gmat
    home = Path(gmat_home)
    sys.path.insert(1, str(home / "bin"))
    import gmatpy

    startup = api_startup_file(home, Path(cache_dir))
    if output_path:  # corrida: salidas por defecto (GmatLog, ReportFile sin Filename) a su carpeta
        text = re.sub(r"(?m)^OUTPUT_PATH\s*=.*$", f"OUTPUT_PATH = {Path(output_path).as_posix()}/",
                      startup.read_text())
        startup = Path(output_path) / "startup.txt"
        startup.write_text(text)
    gmatpy.Setup(str(startup))
    gmat = gmatpy


def gmat_version() -> dict:
    g = gmat.GmatGlobal.Instance()
    return {"version": g.GetGmatVersion(), "build_date": g.GetGMATBuildDate()}


def snapshot(script_path: str) -> dict | None:
    """Carga un script (sin correrlo) y devuelve lo que el motor entendió: texto canónico de
    cada objeto y de cada comando de nivel superior. None si no carga."""
    os.chdir(Path(config.GMAT_HOME, "bin"))  # rutas '../data/...' como en GMAT escritorio
    g = gmat
    if not g.LoadScript(script_path):
        return None
    mod = g.Moderator.Instance()
    objs = {}
    for name in mod.GetListOfObjects(g.UNKNOWN_OBJECT):
        obj = mod.GetConfiguredObject(name)
        objs[name] = obj.GetGeneratingString(g.NO_COMMENTS) if obj else None
    cmds, cmd = [], mod.GetFirstCommand()
    while cmd is not None:
        cmds.append(cmd.GetGeneratingString(g.NO_COMMENTS))
        cmd = cmd.GetNext()
    return {"objects": objs, "commands": cmds}


def _load_text(text: str) -> bool:
    os.chdir(Path(config.GMAT_HOME, "bin"))
    fd, path = tempfile.mkstemp(suffix=".script")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(text)
    try:
        return bool(gmat.LoadScript(path))
    finally:
        os.unlink(path)


def convert_state(from_type: str, to_type: str, elements: dict[str, float]) -> dict[str, float] | None:
    """Convierte el estado de una nave (EarthMJ2000Eq por defecto) con el propio Spacecraft de GMAT.
    El llamador valida tipos y etiquetas: aquí ya son seguros para el script. None si no carga."""
    lines = ["Create Spacecraft ConvSat;", f"ConvSat.DisplayStateType = {from_type};"]
    lines += [f"ConvSat.{k} = {float(v)!r};" for k, v in elements.items()]
    if not _load_text("\n".join(lines + ["BeginMissionSequence;", ""])):
        return None
    sc = gmat.GetObject("ConvSat")
    sc.SetField("DisplayStateType", to_type)
    return {label: float(sc.GetField(label)) for label in sc.GetStateElementLabels(to_type)}


def convert_epoch(from_format: str, to_format: str, epoch: str) -> str | None:
    """Época de un formato a otro (UTCGregorian, TAIModJulian…) con el Spacecraft de GMAT.
    El llamador valida formato y texto. None si el motor no la acepta."""
    script = (f"Create Spacecraft ConvSat;\nConvSat.DateFormat = {from_format};\n"
              f"ConvSat.Epoch = '{epoch}';\nBeginMissionSequence;\n")
    if not _load_text(script):
        return None
    sc = gmat.GetObject("ConvSat")
    sc.SetField("DateFormat", to_format)
    return str(sc.GetField("Epoch"))


def validate_script(script_path: str, log_path: str) -> bool:
    """Carga (sin correr) un script ya saneado; los errores quedan en log_path."""
    os.chdir(Path(config.GMAT_HOME, "bin"))
    gmat.UseLogFile(log_path)
    return bool(gmat.LoadScript(script_path))


def start() -> None:
    global _pool
    if not config.GMAT_HOME or not Path(config.GMAT_HOME, "bin", "gmatpy").is_dir():
        raise RuntimeError(f"GMAT_HOME inválido: {config.GMAT_HOME!r}")
    _pool = ProcessPoolExecutor(
        max_workers=config.WORKERS,
        mp_context=mp.get_context("spawn"),
        initializer=_init,
        initargs=(config.GMAT_HOME, str(config.CACHE_DIR)),
    )


def stop() -> None:
    global _pool
    if _pool:
        _pool.shutdown(cancel_futures=True)
        _pool = None


async def submit(fn, *args, timeout: float | None = None):
    if _pool is None:
        raise RuntimeError("Motor GMAT no iniciado")
    fut = asyncio.get_running_loop().run_in_executor(_pool, fn, *args)
    return await asyncio.wait_for(fut, timeout or config.TASK_TIMEOUT_S)
