"""Resultados de una corrida. Python puro: no importa gmatpy.

`inject` agrega `ReportFile` ocultos (por nave y por XYPlot del usuario) justo antes de
`BeginMissionSequence`; `read` lee esos archivos y los `ReportFile` del usuario."""
import re
from pathlib import Path

from app.engine.sanitize import CREATE, _split_comment

PREFIX = "gmatweb_"  # archivos y recursos ocultos
SHIP_COLS = ["A1ModJulian", "UTCGregorian", "EarthMJ2000Eq.X", "EarthMJ2000Eq.Y", "EarthMJ2000Eq.Z",
             "EarthMJ2000Eq.VX", "EarthMJ2000Eq.VY", "EarthMJ2000Eq.VZ", "Earth.Latitude", "Earth.Longitude"]
FIELD = re.compile(r"^\s*(?:GMAT\s+)?(\w+)\.(XVariable|YVariables|Filename|WriteHeaders|Add)\s*=\s*(.+?)\s*;?\s*$", re.I)
MAX_ROWS = 200_000  # por archivo, para no mandar respuestas gigantes


def _report(name: str, path: Path, cols: list[str]) -> list[str]:
    # Coma sin ancho fijo: UTCGregorian lleva espacios. SolverIterations: con None GMAT omite también
    # la pasada final de un Target; con Current escribe solo esa, sin las iteraciones (verificado).
    return [f"Create ReportFile {name};", f"{name}.Filename = '{path.as_posix()}';",
            f"{name}.Delimiter = ',';", f"{name}.FixedWidth = false;", f"{name}.SolverIterations = Current;",
            f"{name}.Add = {{{', '.join(cols)}}};"]


def inject(text: str, run_dir: Path) -> tuple[str, dict]:
    """Devuelve el script con los reportes ocultos y el manifiesto para `read`.
    `manifest["at"]`/`["shift"]`: línea (1-based) desde la que GMAT citará líneas corridas."""
    lines = text.split("\n")
    types: dict[str, str] = {}
    fields: dict[tuple[str, str], str] = {}
    begin, cont = None, ""
    for i, line in enumerate(lines):
        code, _ = _split_comment(line)
        if code.rstrip().endswith("..."):  # continuación: se une para leer, el texto no cambia
            cont += code.rstrip()[:-3] + " "
            continue
        code, cont = cont + code, ""
        m = CREATE.match(code)
        if m:
            types.update((n, m[1]) for n in re.split(r"[\s,]+", m[2]) if n)
        elif (f := FIELD.match(code)):
            fields[(f[1], f[2].lower())] = f[3]
        elif begin is None and code.strip().startswith("BeginMissionSequence"):
            begin = i
    manifest: dict = {"ships": {}, "reports": {}, "xyplots": {}, "at": 0, "shift": 0}
    for name, t in types.items():
        if t == "ReportFile":  # sin Filename GMAT usa OUTPUT_PATH/<nombre>.txt
            val = fields.get((name, "filename"))
            manifest["reports"][name] = {
                "file": Path(val.strip("'\"")).name if val else f"{name}.txt",
                "headers": fields.get((name, "writeheaders"), "true").strip("'\"").lower() != "false",
                "add": [v.strip() for v in fields.get((name, "add"), "").strip("{} ").split(",") if v.strip()]}
    if begin is None:
        return text, manifest
    extra: list[str] = []
    for name in (n for n, t in types.items() if t == "Spacecraft"):
        file = f"{PREFIX}sc_{name}.csv"
        extra += _report(f"{PREFIX}sc_{name}", run_dir / file, [f"{name}.{c}" for c in SHIP_COLS])
        manifest["ships"][name] = file
    for name in (n for n, t in types.items() if t == "XYPlot"):
        x = fields.get((name, "xvariable"), "").strip("{} ")
        ys = [v.strip() for v in fields.get((name, "yvariables"), "").strip("{} ").split(",") if v.strip()]
        if x and ys:
            # shortcut: no sigue Toggle ni SolverIterations del XYPlot; hacerlo si alguien lo pide.
            file = f"{PREFIX}xy_{name}.csv"
            extra += _report(f"{PREFIX}xy_{name}", run_dir / file, [x, *ys])
            manifest["xyplots"][name] = {"file": file, "x": x, "y": ys}
    manifest["at"], manifest["shift"] = begin + 1 + len(extra), len(extra)
    return "\n".join(lines[:begin] + extra + lines[begin:]), manifest


def original_line(line: int, manifest: dict) -> int:
    return line - manifest["shift"] if manifest["shift"] and line >= manifest["at"] else line


def _csv(path: Path) -> tuple[list[str], list[list]]:
    head, rows = [], []
    with path.open(encoding="utf-8", errors="replace") as f:
        for n, line in enumerate(f):
            cells = [c.strip() for c in line.rstrip("\n").split(",")]
            if n == 0:
                head = cells
                continue
            if cells == [""]:
                continue
            if len(rows) < MAX_ROWS:
                rows.append([_num(c) for c in cells])
    return head, rows


def _num(s: str):
    try:
        return float(s)
    except ValueError:
        return s


def _table(path: Path, headers: bool = True) -> tuple[list[str], list[list]]:
    """ReportFile del usuario (ancho fijo): columnas separadas por 2+ espacios.
    Con `headers` False (WriteHeaders = false) todas las filas son datos."""
    # shortcut: una celda de ancho exacto sin 2 espacios de separación se pega a la vecina;
    # leer el ancho real (ColumnWidth) si aparece.
    head, rows = [], []
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip() or len(rows) >= MAX_ROWS:
                continue
            cells = re.split(r"\s{2,}", line.strip())
            if headers and not head:
                head = cells
            else:
                rows.append([_num(c) for c in cells])
    return head, rows


def read(run_dir: Path, manifest: dict) -> dict:
    out: dict = {"ships": [], "reports": [], "xyplots": []}
    for name, file in manifest["ships"].items():
        p = run_dir / file
        if not p.exists():
            continue
        _, rows = _csv(p)
        cols = {c: [r[i] if i < len(r) else None for r in rows] for i, c in enumerate(SHIP_COLS)}
        # Sin épocas de maniobra: GMAT no publica el estado justo tras un Maneuver (verificado).
        out["ships"].append({"name": name, "columns": cols})
    for name, rep in manifest["reports"].items():
        p = run_dir / rep["file"]
        if p.exists():
            head, rows = _table(p, rep["headers"])
            if not rep["headers"]:  # sin cabecera: nombres del Add si cuadran, si no números
                n = max((len(r) for r in rows), default=0)
                head = rep["add"] if len(rep["add"]) == n else [str(i + 1) for i in range(n)]
            out["reports"].append({"name": name, "file": rep["file"], "headers": head, "rows": rows})
    for name, xy in manifest["xyplots"].items():
        p = run_dir / xy["file"]
        if p.exists():
            _, rows = _csv(p)
            col = lambda i: [r[i] if i < len(r) else None for r in rows]  # noqa: E731
            out["xyplots"].append({"name": name, "x": {"name": xy["x"], "data": col(0)},
                                   "series": [{"name": y, "data": col(i + 1)} for i, y in enumerate(xy["y"])]})
    return out
