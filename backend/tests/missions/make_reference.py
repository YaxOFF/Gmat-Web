"""Regenera reference.json corriendo cada misión como GMAT escritorio (`batch.run_desktop`:
gmatpy directo, sin sanitize). Uso, desde backend/ con GMAT_HOME definido:
    python tests/missions/make_reference.py
"""
import json
import re
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))  # backend/

from app import batch, config  # noqa: E402

REPORT = re.compile(r"^Report\s+\w+\s+(.+?);", re.M)
QUOTED = re.compile(r'^\s*"\s*(\d+):')


def columns(text: str) -> list[str]:
    """Parámetros del último `Report` del script: nombres de las columnas del reporte."""
    return REPORT.findall(text)[-1].split()


def last_row(path: Path) -> list[float]:
    """Última fila del ReportFile (WriteHeaders = false) como números."""
    rows = [ln for ln in path.read_text().splitlines() if ln.strip()]
    return [float(x) for x in rows[-1].split()]


def desktop(script: Path) -> dict:
    """Corre con run_desktop y devuelve reporte final + resumen de solvers, o el error."""
    with tempfile.TemporaryDirectory(prefix="desk-", dir=config.RUNS_DIR) as d:
        return _desktop(script, Path(d))


def _desktop(script: Path, out: Path) -> dict:
    t0 = time.monotonic()
    try:
        evs, err = batch.run_desktop(script, out=out), None
    except AssertionError as e:  # run_desktop exige código 0; las misiones con error dan 2
        evs, err = [], str(e)
    res: dict = {"time": round(time.monotonic() - t0, 1)}
    if err:
        log = (out / "gmat.log").read_text(encoding="utf-8", errors="replace").splitlines()
        res["error"] = {"exit": int(err.rsplit(" ", 1)[-1]),
                        "lines": sorted({int(m[1]) for ln in log if (m := QUOTED.match(ln))}),
                        "log": [ln.strip() for ln in log if "ERROR" in ln or QUOTED.match(ln)]}
        return res
    text = script.read_text(encoding="utf-8")
    name = Path(re.search(r"Filename\s*=\s*'([^']+)'", text)[1]).name
    res["report"] = dict(zip(columns(text), last_row(out / name), strict=True))
    res["solvers"] = batch.solver_summary(evs)
    return res


def main() -> None:
    assert config.GMAT_HOME, "Definir GMAT_HOME"
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)
    ref = {}
    for s in sorted(HERE.glob("*.script")):
        ref[s.stem] = desktop(s)
        print(s.stem, ref[s.stem]["time"], "s", "error" if "error" in ref[s.stem] else "ok")
    (HERE / "reference.json").write_text(json.dumps(ref, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
