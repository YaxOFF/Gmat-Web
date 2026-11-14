"""Scripts de ejemplo de la instalación de GMAT (GMAT_HOME/samples). Solo lectura."""
import re
from functools import cache
from pathlib import Path

from app import config


def root() -> Path:
    return Path(config.GMAT_HOME, "samples").resolve()


def _description(path: Path) -> str:
    """Primer bloque de comentarios `%` del encabezado, sin el nombre ni separadores."""
    parts: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s:
            if parts:
                break
            continue
        if not s.startswith("%"):
            break
        s = s.lstrip("%").strip()
        if s and s != path.stem and not re.fullmatch(r"[-=*_\s]+", s):
            parts.append(s)
    return " ".join(parts)[:300]


@cache
def list_samples() -> list[dict]:
    base = root()
    return [
        {"id": p.relative_to(base).as_posix(), "name": p.stem,
         "folder": "" if p.parent == base else p.parent.relative_to(base).as_posix(),
         "description": _description(p)}
        for p in sorted(base.rglob("*.script"))
    ]


def read(sample_id: str) -> str | None:
    base = root()
    path = (base / sample_id).resolve()
    if path.suffix != ".script" or not path.is_relative_to(base) or not path.is_file():
        return None
    return path.read_text(encoding="utf-8", errors="replace")
