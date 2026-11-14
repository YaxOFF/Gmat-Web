import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from test_runs import events


@pytest.fixture(scope="module")
def client():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    with TestClient(app) as c:
        yield c


def solver_events(client, text):
    run_id = client.post("/api/runs", json={"script": text}).json()["runId"]
    evs = events(client, run_id)
    assert evs[-1]["type"] == "done", evs[-1]
    return [e for e in evs if e["type"] == "solver"]


def test_hohmann_emits_iterations_and_converges(client):
    text = client.get("/api/samples/Ex_HohmannTransfer.script").json()["text"]
    evs = solver_events(client, text)
    assert evs[0] == {"type": "solver", "event": "start", "run": 1, "solver": "DC", "kind": "Target",
                      "algorithm": "Differential Correction"}
    rows = [e for e in evs if e["event"] == "iteration"]
    assert [r["iteration"] for r in rows] == list(range(1, len(rows) + 1)) and len(rows) > 2
    first, last = rows[0], rows[-1]
    assert [v["name"] for v in first["variables"]] == ["TOI.Element1", "GOI.Element1"]
    assert first["variables"][0]["value"] == 0.5
    g = {x["name"]: x for x in last["goals"]}
    assert g["DefaultSC.Earth.RMAG"]["desired"] == 42165 and g["DefaultSC.Earth.RMAG"]["tolerance"] == 0.1
    assert all(x["met"] for x in last["goals"]) and not all(x["met"] for x in first["goals"])
    # mismos números que el sample en escritorio
    assert last["variables"][0]["value"] == pytest.approx(2.24028397735, rel=1e-9)
    end = evs[-1]
    assert end["event"] == "end" and end["converged"] and end["status"] == "converged"
    assert end["iterations"] == len(rows)


def test_low_max_iterations_reports_not_converged(client):
    text = client.get("/api/samples/Ex_HohmannTransfer.script").json()["text"]
    text = text.replace("BeginMissionSequence", "DC.MaximumIterations = 3;\nBeginMissionSequence", 1)
    evs = solver_events(client, text)
    rows = [e for e in evs if e["event"] == "iteration"]
    end = evs[-1]
    assert end["event"] == "end" and not end["converged"] and end["status"] == "failed"
    assert end["iterations"] == 3 and len(rows) == 3


def test_yukon_cost_and_constraints(client):
    text = client.get("/api/samples/Ex_Yukon_AlgebraicOptimization.script").json()["text"]
    evs = solver_events(client, text)
    assert evs[0]["kind"] == "Optimize"
    rows = [e for e in evs if e["event"] == "iteration"]
    assert all("cost" in r and r["constraints"][0]["kind"] == "ineq" for r in rows)
    assert rows[-1]["cost"] == pytest.approx(0, abs=1e-12)
    assert evs[-1]["converged"]


def feed_all(log, lines):
    return [e for line in lines for e in log.feed(line)]


def test_nested_targets_close_the_inner_first():
    from app.engine.solver import SolverLog
    script = "Create DifferentialCorrector A B;\nBeginMissionSequence;\n"
    evs = feed_all(SolverLog(script), [
        '*** Performing Differential Correction (using "A")', "A Iteration 1; Nominal Pass",
        '*** Performing Differential Correction (using "B")', "B Iteration 1; Nominal Pass",
        "*** Targeting Completed in 1 iterations", "*** The Targeter converged!",
        "A Iteration 2; Nominal Pass",
        '*** Performing Differential Correction (using "B")', "B Iteration 1; Nominal Pass",
        "*** Targeting did not converge in 1 iterations",
        "*** Targeting Completed in 2 iterations", "*** The Targeter converged!"])
    ends = [(e["solver"], e["run"], e["status"], e["iterations"]) for e in evs if e["event"] == "end"]
    assert ends == [("B", 2, "converged", 1), ("B", 3, "failed", 1), ("A", 1, "converged", 2)]


def test_fmincon_cost_and_constraints():
    from app.engine.solver import SolverLog
    evs = feed_all(SolverLog("BeginMissionSequence;\n"), [
        '*** Performing FminconOptimizer Optimization (using "SQP")',
        "SQP Control Sequence Pass 1; Fmincon Pass", "   Variables:  X = 1, Y = 2",
        "   Equality constraint variances:",
        "      C1  Achieved: 0.5,  C2  Achieved: -1   Inequality constraint variances:",
        "      C3  Achieved: 2", "   Cost Function Value: 7",
        "*** Optimization Completed in 1 passes through the Solver Control Sequence",
        "*** The Optimizer Converged!"])
    it = next(e for e in evs if e["event"] == "iteration")
    assert it["cost"] == 7 and [v["value"] for v in it["variables"]] == [1, 2]
    assert [(c["name"], c["kind"], c["value"]) for c in it["constraints"]] == [
        ("C1", "eq", 0.5), ("C2", "eq", -1), ("C3", "ineq", 2)]
    assert evs[-1]["status"] == "converged" and evs[-1]["iterations"] == 1


def test_show_progress_false_is_listed():
    from app.engine.solver import SolverLog
    log = SolverLog("Create DifferentialCorrector DC Q;\nDC.ShowProgress = false;\nQ.ShowProgress = true;\n"
                    "BeginMissionSequence;\n")
    assert log.silent == ["DC"]
