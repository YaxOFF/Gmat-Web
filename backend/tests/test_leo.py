"""Fase 4b: una misión LEO armada solo como modelo (lo que producen los formularios) da el mismo
resultado que el script equivalente escrito a mano."""
import pytest
from fastapi.testclient import TestClient

from app import config
from app.engine import runner
from app.main import app


def res(type_, name, **fields):
    return {"type": type_, "name": name, "fields": fields, "comments": []}


# Lo que dejan los editores dedicados: claves con el nombre GMAT exacto, referencias como {"ref"}.
MODEL = {
    "resources": [
        res("Spacecraft", "Sat", DateFormat="UTCGregorian", Epoch="01 Jan 2025 12:00:00.000",
            CoordinateSystem="EarthMJ2000Eq", DisplayStateType="Keplerian", SMA=6778.0, ECC=0.001,
            INC=51.6, RAAN=30.0, AOP=0.0, TA=10.0, DryMass=500.0, Cd=2.2, Cr=1.8, DragArea=4.0, SRPArea=4.0),
        res("ForceModel", "LeoFM", CentralBody="Earth", PrimaryBodies=["Earth"],
            **{"GravityField.Earth.Degree": 8, "GravityField.Earth.Order": 8,
               "Drag.AtmosphereModel": "Exponential"},
            PointMasses=["Sun", "Luna"], SRP="On"),
        res("Propagator", "LeoProp", FM={"ref": "LeoFM"}, Type="RungeKutta89", InitialStepSize=30.0,
            Accuracy=1e-12, MinStep=0.001, MaxStep=600.0),
        res("ReportFile", "Rep", Filename="leo.txt", Precision=16,
            Add=["Sat.UTCModJulian", "Sat.X", "Sat.Y", "Sat.Z", "Sat.VX", "Sat.VY", "Sat.VZ"]),
    ],
    "sequence": [{"cmd": "Propagate", "text": "LeoProp(Sat) {Sat.ElapsedSecs = 7200}", "args": {}, "comments": []}],
    "raw": [],
}

HAND = """Create Spacecraft Sat;
Sat.DateFormat = UTCGregorian;
Sat.Epoch = '01 Jan 2025 12:00:00.000';
Sat.CoordinateSystem = EarthMJ2000Eq;
Sat.DisplayStateType = Keplerian;
Sat.SMA = 6778;
Sat.ECC = 0.001;
Sat.INC = 51.6;
Sat.RAAN = 30;
Sat.AOP = 0;
Sat.TA = 10;
Sat.DryMass = 500;
Sat.Cd = 2.2;
Sat.Cr = 1.8;
Sat.DragArea = 4;
Sat.SRPArea = 4;

Create ForceModel LeoFM;
LeoFM.CentralBody = Earth;
LeoFM.PrimaryBodies = {Earth};
LeoFM.GravityField.Earth.Degree = 8;
LeoFM.GravityField.Earth.Order = 8;
LeoFM.Drag.AtmosphereModel = Exponential;
LeoFM.PointMasses = {Sun, Luna};
LeoFM.SRP = On;

Create Propagator LeoProp;
LeoProp.FM = LeoFM;
LeoProp.Type = RungeKutta89;
LeoProp.InitialStepSize = 30;
LeoProp.Accuracy = 1e-12;
LeoProp.MinStep = 0.001;
LeoProp.MaxStep = 600;

Create ReportFile Rep;
Rep.Filename = 'leo.txt';
Rep.Precision = 16;
Rep.Add = {Sat.UTCModJulian, Sat.X, Sat.Y, Sat.Z, Sat.VX, Sat.VY, Sat.VZ};

BeginMissionSequence;
Propagate LeoProp(Sat) {Sat.ElapsedSecs = 7200};
"""


@pytest.fixture(scope="module")
def client():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    with TestClient(app) as c:
        yield c


def run_rows(client, script: str) -> list[list[float]]:
    run_id = client.post("/api/runs", json={"script": script}).json()["runId"]
    with client.websocket_connect(f"/api/ws/runs/{run_id}") as ws:
        ev = ws.receive_json()
        while ev["type"] not in ("done", "error"):
            ev = ws.receive_json()
    assert ev["type"] == "done", ev
    lines = (runner.runs[run_id].dir / "leo.txt").read_text().splitlines()[1:]  # sin encabezado
    return [[float(x) for x in ln.split()] for ln in lines if ln.strip()]


def test_leo_from_model_matches_hand_script(client):
    r = client.post("/api/script/serialize", json=MODEL)
    assert r.status_code == 200
    from_model = run_rows(client, r.json()["script"])
    by_hand = run_rows(client, HAND)
    assert len(from_model) > 10 and len(from_model) == len(by_hand)
    assert from_model == by_hand
    # sanity: sigue en LEO tras 2 h (|r| entre 6500 y 7100 km)
    assert 6500 < sum(v * v for v in from_model[-1][1:4]) ** 0.5 < 7100


def test_srp_off_drops_srp_subfields(client):
    """Fallo de QA: ForceModel de ejemplo con SRP On -> Off en el editor. El editor quita SRP.* (GMAT rechaza
    SRP.Flux con SRP Off); misma transformación que `drop('SRP')` de Editors.tsx."""
    text = client.get("/api/samples/Ex_LEOStationKeeping.script").json()["text"]
    model = client.post("/api/script/parse", json={"script": text}).json()
    fm = next(r for r in model["resources"] if r["name"] == "LEOprop_ForceModel")
    assert fm["fields"]["SRP"] == "On" and "SRP.Flux" in fm["fields"]
    fm["fields"] = {k: v for k, v in fm["fields"].items() if k != "SRP" and not k.startswith("SRP.")} | {"SRP": "Off"}
    # corrida corta: solo recursos del ejemplo + un Propagate (el ejemplo completo tarda)
    model["sequence"] = [{"cmd": "Propagate", "text": "LEOprop(LEOsat) {LEOsat.ElapsedSecs = 600}",
                          "args": {}, "comments": []}]
    script = client.post("/api/script/serialize", json=model).json()["script"]
    assert "SRP.Flux" not in script
    run_id = client.post("/api/runs", json={"script": script}).json()["runId"]
    with client.websocket_connect(f"/api/ws/runs/{run_id}") as ws:
        evs = [ws.receive_json()]
        while evs[-1]["type"] not in ("done", "error"):
            evs.append(ws.receive_json())
    assert evs[-1]["type"] == "done", [e for e in evs if e.get("level") == "error"] or evs[-1]
