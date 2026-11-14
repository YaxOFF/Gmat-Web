"""Fase 5b: Ex_HohmannTransfer armado como modelo (lo que producen los formularios: recursos + `args`→`text`)
da los mismos resultados del targeter que el sample corrido tal cual."""
import pytest
from fastapi.testclient import TestClient

from app import config
from app.engine import runner
from app.main import app
from app.script.parser import _args


def res(type_, name, **fields):
    return {"type": type_, "name": name, "fields": fields, "comments": []}


def cmd(name, text, label=None, children=None):
    c = {"cmd": name, "text": text, "args": _args(name, text), "comments": []}
    assert c["args"], text  # todo comando tiene formulario: el texto sale de `toText` de la UI
    if label:
        c["label"] = label
    if children is not None:
        c["children"] = children
    return c


BURN = dict(CoordinateSystem="Local", Origin="Earth", Axes="VNB")
VARY_OPTS = "{Perturbation = 0.0001, Lower = 0, Upper = 3.14159, MaxStep = 0.2}"
REPORT = cmd("Report", "Rep TOI.Element1 GOI.Element1 DefaultSC.Earth.RMAG DefaultSC.ECC")
MODEL = {
    "resources": [
        res("Spacecraft", "DefaultSC"), res("ForceModel", "DefaultProp_ForceModel"),
        res("Propagator", "DefaultProp", FM={"ref": "DefaultProp_ForceModel"}),
        res("ImpulsiveBurn", "TOI", **BURN), res("ImpulsiveBurn", "GOI", **BURN),
        res("DifferentialCorrector", "DC"), res("ReportFile", "Rep", Filename="hohmann.txt"),
    ],
    "sequence": [
        cmd("Propagate", "DefaultProp(DefaultSC) {DefaultSC.Periapsis}", "Prop to Perigee"),
        cmd("Target", "DC {SolveMode = Solve, ExitMode = DiscardAndContinue}", "Raise and Circularize", [
            cmd("Vary", f"DC(TOI.Element1 = 0.5, {VARY_OPTS})", "Vary TOI.V"),
            cmd("Maneuver", "TOI(DefaultSC)", "Apply TOI"),
            cmd("Propagate", "DefaultProp(DefaultSC) {DefaultSC.Apoapsis}", "Prop to Apogee"),
            cmd("Achieve", "DC(DefaultSC.Earth.RMAG = 42165, {Tolerance = 0.1})", "Achieve RMAG"),
            cmd("Vary", f"DC(GOI.Element1 = 0.5, {VARY_OPTS})", "Vary GOI.V"),
            cmd("Maneuver", "GOI(DefaultSC)", "Apply GOI"),
            cmd("Achieve", "DC(DefaultSC.ECC = 0, {Tolerance = 0.1})", "Achieve ECC"),
        ]),
        REPORT,
        cmd("Propagate", "DefaultProp(DefaultSC) {DefaultSC.ElapsedSecs = 86400}", "Prop 1 Day"),
    ],
    "raw": [],
}


@pytest.fixture(scope="module")
def client():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    with TestClient(app) as c:
        yield c


def report_row(client, model) -> list[float]:
    script = client.post("/api/script/serialize", json=model).json()["script"]
    run_id = client.post("/api/runs", json={"script": script}).json()["runId"]
    with client.websocket_connect(f"/api/ws/runs/{run_id}") as ws:
        ev = ws.receive_json()
        while ev["type"] not in ("done", "error"):
            ev = ws.receive_json()
    assert ev["type"] == "done", ev
    lines = (runner.runs[run_id].dir / "hohmann.txt").read_text().splitlines()
    return [float(x) for x in lines[-1].split()]


def test_hohmann_from_model_matches_sample(client):
    sample = client.get("/api/samples/Ex_HohmannTransfer.script").json()["text"]
    ref = client.post("/api/script/parse", json={"script": sample}).json()
    # mismo reporte en el sample, justo después del EndTarget
    ref["resources"].append(MODEL["resources"][-1])
    k = next(i for i, c in enumerate(ref["sequence"]) if c["cmd"] == "Target")
    ref["sequence"].insert(k + 1, REPORT)

    built, expected = report_row(client, MODEL), report_row(client, ref)
    assert built == pytest.approx(expected, rel=1e-9)
    toi, goi, rmag, ecc = built
    assert toi == pytest.approx(2.2408, abs=1e-3) and goi == pytest.approx(1.4330, abs=1e-3)
    assert rmag == pytest.approx(42165, abs=0.1) and ecc < 0.1
