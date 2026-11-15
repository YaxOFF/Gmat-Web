"""Misiones propias (tests/missions) por el camino de la app (sanitize + runner + ReportFile
ocultos) contra reference.json, sacado de GMAT escritorio con `missions/make_reference.py`.
Lento: `pytest -m slow`."""
import asyncio
import json
import math
import re
from pathlib import Path

import pytest

from app import batch, config
from app.engine import runner

pytestmark = pytest.mark.slow

DIR = Path(__file__).parent / "missions"
REF = json.loads((DIR / "reference.json").read_text(encoding="utf-8"))
QUOTED = re.compile(r'^\s*"\s*(\d+):(.*)"\s*$')


def _close(a, b) -> bool:
    return math.isclose(a, b, rel_tol=1e-8, abs_tol=1e-10)


def _run(name: str):
    assert config.GMAT_HOME, "Definir GMAT_HOME"
    text = (DIR / f"{name}.script").read_text(encoding="utf-8")
    web = asyncio.run(asyncio.wait_for(batch.run_web(text), 300))  # no debe colgar
    return text, web, list(runner.runs.values())[-1]


@pytest.mark.parametrize("name", [n for n, r in REF.items() if "report" in r])
def test_mission_matches_desktop(name):
    ref = REF[name]
    text, web, run = _run(name)
    assert web["state"] == "ok", web["reason"]
    report = Path(re.search(r"Filename\s*=\s*'([^']+)'", text)[1]).name
    rows = [ln for ln in (run.dir / report).read_text().splitlines() if ln.strip()]
    got = [float(x) for x in rows[-1].split()]
    assert len(got) == len(ref["report"])
    for (k, v), g in zip(ref["report"].items(), got):
        assert _close(g, v), (k, g, v)
    assert (web["solvers"] or {}).keys() == (ref["solvers"] or {}).keys()
    for solver, d in (ref["solvers"] or {}).items():
        w = web["solvers"][solver]
        assert w["status"] == d["status"] == "converged" and w["runs"] == d["runs"], (solver, w)
        for df, wf in zip(d["final"], w["final"], strict=True):
            assert df.keys() == wf.keys()
            for k, v in df.items():
                assert _close(wf[k], v), (k, wf[k], v)


@pytest.mark.parametrize("name", [n for n, r in REF.items() if "error" in r])
def test_mission_error(name):
    ref = REF[name]["error"]
    _, web, _ = _run(name)
    assert web["state"] == "error", web
    evs = [e for e in web["events"] if e.get("level") == "error"]
    assert sorted({e["line"] for e in evs if "line" in e}) == ref["lines"]
    for ln in ref["log"]:
        if m := QUOTED.match(ln):  # misma línea del script del usuario, mismo texto
            assert any(e.get("line") == int(m[1]) and m[2].strip() in e["text"] for e in evs), ln
        else:  # mismo mensaje del intérprete (sin la ruta, que cambia)
            msg = ln.split("**** ERROR ****", 1)[1].strip()
            assert any(msg in e["text"] for e in evs), msg
