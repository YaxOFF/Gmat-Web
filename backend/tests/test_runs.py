import sys

import pytest
from fastapi.testclient import TestClient

from app import config, samples
from app.main import app

# Ejemplos que corren limpios con la API (sin visores GUI obligatorios ni archivos externos).
SAMPLES = [
    "Ex_HohmannTransfer.script",
    "Ex_AnalyticMassProperties.script",
    "Ex_EclipseLocation.script",
    "Ex_NewMathFunctions.script",
    "Ex_TLE_Propagation.script",
    "Ex_WriteCommand.script",
]


@pytest.fixture(scope="module")
def client():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    with TestClient(app) as c:
        yield c


def events(client, run_id):
    with client.websocket_connect(f"/api/ws/runs/{run_id}") as ws:
        out = []
        while not out or out[-1]["type"] not in ("done", "error"):
            out.append(ws.receive_json())
    return out


def test_samples_list_and_read(client):
    items = client.get("/api/samples").json()
    hohmann = next(s for s in items if s["id"] == "Ex_HohmannTransfer.script")
    assert hohmann["folder"] == "" and "Hohmann" in hohmann["description"]
    assert any(s["folder"] for s in items)
    assert "BeginMissionSequence" in client.get("/api/samples/Ex_HohmannTransfer.script").json()["text"]
    assert samples.read("../bin/gmat_startup_file.txt") is None
    assert samples.read("../../outside.script") is None


@pytest.mark.parametrize("name", SAMPLES)
def test_run_sample_via_api(client, name):
    text = client.get(f"/api/samples/{name}").json()["text"]
    run_id = client.post("/api/runs", json={"script": text}).json()["runId"]
    evs = events(client, run_id)
    assert evs[-1]["type"] == "done", [e for e in evs if e.get("level") == "error"] or evs[-1]
    assert any(e["type"] == "log" for e in evs)
    assert "gmatpy" not in sys.modules


def test_script_errors_point_to_line(client):
    run_id = client.post("/api/runs", json={"script": "Create Spacecraft Sat;\nSat.Foo = 3;\n"}).json()["runId"]
    evs = events(client, run_id)
    assert evs[-1]["type"] == "error"
    assert any(e.get("line") == 2 for e in evs)


def test_rejected_script_returns_400_with_line(client):
    r = client.post("/api/runs", json={"script": "BeginMissionSequence;\nSystemCommand 'dir';\n"})
    assert r.status_code == 400 and r.json()["line"] == 2


def test_cancel_run(client):
    script = ("Create Spacecraft Sat;\nCreate Propagator P;\nBeginMissionSequence;\n"
              "Propagate P(Sat) {Sat.ElapsedDays = 100000};\n")
    run_id = client.post("/api/runs", json={"script": script}).json()["runId"]
    with client.websocket_connect(f"/api/ws/runs/{run_id}") as ws:
        ws.receive_json()  # ya arrancó
        assert client.delete(f"/api/runs/{run_id}").json() == {"ok": True}
        ev = ws.receive_json()
        while ev["type"] not in ("done", "error"):
            ev = ws.receive_json()
    assert ev == {"type": "error", "message": "Corrida detenida"}
