"""Pool de procesos worker que cargan gmatpy.

gmatpy es un singleton global por proceso: el proceso FastAPI nunca lo importa.
Todo lo que toque el motor se envía aquí con `submit(fn, ...)`.
"""
import asyncio
import multiprocessing as mp
import sys
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
    src = (gmat_home / "bin" / "gmat_startup_file.txt").read_text()
    out.write_text(src.replace("..", gmat_home.as_posix()))
    return out


def _init(gmat_home: str, cache_dir: str) -> None:
    global gmat
    home = Path(gmat_home)
    sys.path.insert(1, str(home / "bin"))
    import gmatpy

    gmatpy.Setup(str(api_startup_file(home, Path(cache_dir))))
    gmat = gmatpy


def gmat_version() -> dict:
    g = gmat.GmatGlobal.Instance()
    return {"version": g.GetGmatVersion(), "build_date": g.GetGMATBuildDate()}


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
