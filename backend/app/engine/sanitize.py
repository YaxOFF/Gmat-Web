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
# Tipos cuyo `Filename` solo se lee: no se lleva a la corrida.
INPUT_TYPES = {"ThrustHistoryFile", "FileInterface"}
# `TrackingFileSet.FileName` lo escribe un Simulator y lo lee un estimador: sin Simulator en el
# script nadie lo escribe y es entrada.
SIMULATOR = re.compile(r"(?<![\w.])Simulator(?!\w)")
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


def _in_path(value: str) -> str:
    """Ruta de entrada relativa: GMAT la busca en la carpeta del script (`GmatFileUtil::FindFile`),
    que en escritorio es `samples/` y aquí es la corrida. Si existe desde `GMAT_HOME/samples`
    se pasa a absoluta; si no, se deja igual. Solo lectura: no abre escritura en ningún lado."""
    raw = value.strip().strip("'\"")
    if not config.GMAT_HOME or not re.search(r"[/\\]", raw) or raw.startswith(("/", "\\")) \
            or PureWindowsPath(raw).is_absolute():
        return value
    path = Path(config.GMAT_HOME, "samples", raw).resolve()
    return "'" + path.as_posix() + "'" if path.is_file() else value


def _rewrite(match: re.Match, out_dir: Path, types: dict[str, str], inputs: set[str]) -> str:
    output = match["field"].lower() in OUTPUT_FIELDS and types.get(match["obj"]) not in inputs
    fix = (lambda v: _out_path(v, out_dir)) if output else _in_path
    val = match["val"]
    if val.startswith("{"):
        items = [v for v in val[1:-1].split(",") if v.strip()]
        fixed = [fix(v) for v in items]
        if fixed == items:
            return match[0]
        new = "{" + ", ".join(v.strip() for v in fixed) + "}"
    else:
        new = fix(val)
    return match["lhs"] + new


def sanitize(text: str, out_dir: Path) -> str:
    """Devuelve el script listo para correr; lanza ScriptRejected si no es seguro.
    Conserva el número de líneas para que los errores de GMAT apunten bien."""
    if len(text.encode("utf-8")) > config.MAX_SCRIPT_BYTES:
        raise ScriptRejected(f"Script demasiado grande (máx. {config.MAX_SCRIPT_BYTES} bytes)")
    lines = text.splitlines()
    types: dict[str, str] = {}
    inputs = set(INPUT_TYPES) | {"TrackingFileSet"}
    for n, line in enumerate(lines, 1):
        code, _ = _split_comment(line)
        bad = FORBIDDEN.search(_strip_strings(code))
        if bad:
            raise ScriptRejected(f"'{bad[1]}' no está permitido en el servidor", n)
        if SIMULATOR.search(_strip_strings(code)):
            inputs.discard("TrackingFileSet")
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
        out.append(ASSIGN.sub(lambda m: _rewrite(m, out_dir, types, inputs), code) + comment)
    return "\n".join(out) + "\n"
