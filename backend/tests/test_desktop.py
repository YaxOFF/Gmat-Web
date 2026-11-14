"""Web (sanitize + runner + ReportFile ocultos) vs "escritorio" (gmatpy directo con el .script original):
los solvers deben converger igual y a los mismos valores. Lento: `pytest -m slow`."""
import asyncio
import math
from pathlib import Path

import pytest

from app import batch, config, samples

pytestmark = pytest.mark.slow

CASES = [
    "Ex_HohmannTransfer.script",  # Target (DC)
    "Ex_Yukon_AlgebraicOptimization.script",  # Optimize con Yukon (sin fmincon)
    "Ex_MarsBPlane.script",  # Target a coordenadas B-plane
]


def _close(a, b) -> bool:
    if isinstance(a, float) and isinstance(b, float):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12)
    return a == b


@pytest.mark.parametrize("name", CASES)
def test_web_matches_desktop(name):
    assert config.GMAT_HOME, "Definir GMAT_HOME"
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)
    web = asyncio.run(batch.run_web(samples.read(name)))
    assert web["state"] == "ok", web["reason"]
    desk = batch.solver_summary(batch.run_desktop(Path(samples.root(), name)))
    assert desk and web["solvers"].keys() == desk.keys()
    for solver, d in desk.items():
        w = web["solvers"][solver]
        assert d["status"] == w["status"] == "converged", (solver, d, w)
        assert d["runs"] == w["runs"] == len(d["final"])
        for df, wf in zip(d["final"], w["final"]):
            assert df and df.keys() == wf.keys()
            for k, v in df.items():
                assert _close(wf[k], v), (k, wf[k], v)
    if name == "Ex_HohmannTransfer.script":  # valores de GMAT escritorio (Bitácora 5b/7a)
        v = web["solvers"]["DC"]["final"][-1]
        assert math.isclose(v["TOI.Element1"], 2.24028397735, rel_tol=1e-9)
        assert math.isclose(v["GOI.Element1"], 1.432966302, rel_tol=1e-8)
