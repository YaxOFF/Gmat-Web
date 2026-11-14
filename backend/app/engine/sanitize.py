"""Saneo de scripts antes de correrlos en el servidor.

Rechaza lo que ejecuta código externo o lee/escribe fuera de la corrida y
reescribe las rutas de salida a la carpeta temporal de la corrida.
Python puro: no importa gmatpy.
"""
import re
from pathlib import Path, PureWindowsPath

from app import config


class ScriptRejected(ValueError):
    def __init__(self, message: str, line: int | None = None):
        super().__init__(message)
        self.line = line


# Comandos/tipos que llaman Python, MATLAB, el sistema o funciones/archivos externos.
FORBIDDEN = re.compile(
    r"(?<![\w.])(CallPythonFunction|CallMatlabFunction|CallGmatFunction|SystemCommand|System"
    r"|PythonFunction|MatlabFunction|GmatFunction|Save|SaveMission|Python\.\w+|#Include)(?![\w])",
)
# Campos que nombran archivos que GMAT escribe.
OUTPUT_FIELDS = {"filename", "outputfile", "reportfile", "matlabfile"}
# Tipos cuyo `Filename` solo se lee: se deja tal cual.
INPUT_TYPES = {"ThrustHistoryFile", "FileInterface"}
ASSIGN = re.compile(r"(?P<lhs>(?<![\w.])(?P<obj>[A-Za-z_]\w*)(?:\.\w+)*\.(?P<field>\w+)\s*=\s*)"
                    r"(?P<val>\{[^}]*\}|'[^']*'|\"[^\"]*\"|[^;\s%]+)")
CREATE = re.compile(r"^\s*Create\s+(\w+)\s+(.+?)\s*;?\s*$")
# Visores de GMAT escritorio: en la API no existen y rompen la carga.
GUI_ONLY = {"OpenFramesInterface", "OpenFramesView", "OrbitView", "GroundTrackPlot"}


def _split_comment(line: str) -> tuple[str, str]:
    """Separa código y comentario `%` (ignorando `%` dentro de comillas)."""
    quote = None
    for i, ch in enumerate(line):
        if quote:
            quote = None if ch == quote else quote
        elif ch in "'\"":
            quote = ch
        elif ch == "%":
            return line[:i], line[i:]
    return line, ""


def _strip_strings(code: str) -> str:
    return re.sub(r"'[^']*'|\"[^\"]*\"", "''", code)


def _out_path(value: str, out_dir: Path) -> str:
    name = PureWindowsPath(value.strip().strip("'\"")).name or "output.txt"
    return "'" + (out_dir / name).as_posix() + "'"


def _rewrite(match: re.Match, out_dir: Path, types: dict[str, str]) -> str:
    if match["field"].lower() not in OUTPUT_FIELDS or types.get(match["obj"]) in INPUT_TYPES:
        return match[0]
    val = match["val"]
    if val.startswith("{"):
        items = [v for v in val[1:-1].split(",") if v.strip()]
        new = "{" + ", ".join(_out_path(v, out_dir) for v in items) + "}"
    else:
        new = _out_path(val, out_dir)
    return match["lhs"] + new


def sanitize(text: str, out_dir: Path) -> str:
    """Devuelve el script listo para correr; lanza ScriptRejected si no es seguro.
    Conserva el número de líneas para que los errores de GMAT apunten bien."""
    if len(text.encode("utf-8")) > config.MAX_SCRIPT_BYTES:
        raise ScriptRejected(f"Script demasiado grande (máx. {config.MAX_SCRIPT_BYTES} bytes)")
    lines = text.splitlines()
    types: dict[str, str] = {}
    for n, line in enumerate(lines, 1):
        code, _ = _split_comment(line)
        bad = FORBIDDEN.search(_strip_strings(code))
        if bad:
            raise ScriptRejected(f"'{bad[1]}' no está permitido en el servidor", n)
        m = CREATE.match(code)
        if m:
            types.update((name, m[1]) for name in re.split(r"[\s,]+", m[2]) if name)
    gui = [name for name, t in types.items() if t in GUI_ONLY]
    gui_ref = re.compile(r"(?<![\w.])(" + "|".join(map(re.escape, gui)) + r")(?![\w])") if gui else None

    out = []
    for line in lines:
        code, comment = _split_comment(line)
        # shortcut: comenta toda línea que nombre un visor GUI (p. ej. `Toggle OV RF On` pierde RF);
        # mejorar cuando el parser de la Fase 3 permita quitar solo el nombre.
        if gui_ref and gui_ref.search(_strip_strings(code)):
            out.append("% [gmat-web] solo GUI: " + line)
            continue
        out.append(ASSIGN.sub(lambda m: _rewrite(m, out_dir, types), code) + comment)
    return "\n".join(out) + "\n"
