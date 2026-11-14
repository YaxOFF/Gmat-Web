import multiprocessing as mp
import re
import sys
from concurrent.futures import ProcessPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app import config, samples
from app.engine import worker
from app.engine.sanitize import ScriptRejected, sanitize
from app.main import app
from app.script import parse, serialize

SAMPLE_IDS = [s["id"] for s in samples.list_samples()] if config.GMAT_HOME else []
# Ver docs/ROUNDTRIP_EXCEPTIONS.md
XFAIL = {
    "Navigation/Simulate_DSN_Range_then_Estimate_CartesianState_and_Cr.script":
        "copia de objeto 'A = B' entre asignaciones de recursos: el modelo agrupa campos por "
        "recurso y la copia queda después (copia un estado distinto)",
}

SCRIPT = """% encabezado
Create Spacecraft Sat, Sat2;  % dos naves
GMAT Sat.DisplayStateType = Keplerian;
Sat.SMA = 7000.5; Sat.Epoch = '01 Jan 2000 11:59:28.000';
Sat.Tanks = {Tank1};
Sat.OrbitColor = [255 0 ...
   0];
Create ChemicalTank Tank1;
Create Array M[2,2];
Earth.EopFileName = 'eop.txt';
Sat.Comment = 'a % no es comentario';
BeginMissionSequence;
Target 'T1' DC {SolveMode = Solve};
   Vary DC(Burn.Element1 = 1);
   If Sat.ECC > 0.1
      M = M';
   Else
      Propagate Prop(Sat) {Sat.Apoapsis};
   EndIf;
   % antes de EndTarget
EndTarget;  % fin
x = 3;
"""


def test_parse_features():
    m = parse(SCRIPT)
    sat, sat2, tank, arr = m["resources"]
    assert (sat["type"], sat["name"], sat2["name"]) == ("Spacecraft", "Sat", "Sat2")
    assert sat["fields"] == {"DisplayStateType": "Keplerian", "SMA": 7000.5,
                             "Epoch": "01 Jan 2000 11:59:28.000", "Tanks": [{"ref": "Tank1"}],
                             "OrbitColor": [255, 0, 0], "Comment": "a % no es comentario"}
    assert sat["comments"] == ["% encabezado", "% dos naves"]
    assert arr["fields"] == {"NumRows": 2, "NumCols": 2}
    assert m["raw"] == ["Earth.EopFileName = 'eop.txt';"]
    target, assign = m["sequence"]
    assert (target["cmd"], target["label"], target["text"]) == ("Target", "T1", "DC {SolveMode = Solve}")
    assert target["endComments"] == ["% antes de EndTarget", "% fin"]
    vary, iff = target["children"]
    assert [c["cmd"] for c in iff["children"]] == ["GMAT", "Else", "Propagate"]
    assert iff["children"][0]["text"] == "M = M'"
    assert (assign["cmd"], assign["text"]) == ("GMAT", "x = 3")
    text = serialize(m)
    assert "Create Array M[2,2];" in text and "\nSat.OrbitColor = [255 0 0];" in text
    assert "\nx = 3;\n" in text and "GMAT " not in text  # sin prefijo, como los samples (QA 4b)
    assert "   EndIf;\n   % antes de EndTarget\n   % fin\nEndTarget;" in text
    assert parse(text) == m


def test_command_args_and_disabled():
    m = parse("""BeginMissionSequence;
Propagate 'P' Synchronized BackProp Prop(Sat1, Sat2) Prop2(Sat3) {Sat1.ElapsedSecs = 60, Sat1.Apoapsis};
Propagate Prop(Sat);
Maneuver Burn1(Sat);
BeginFiniteBurn FB(Sat, Sat2);
Report RF Sat.A1ModJulian Sat.Earth.Altitude;
Toggle RF XY Off;
GMAT x = Sat.SMA + 1;
Propagate Prop(Sat, 'Covariance') {Sat.ElapsedDays = 1};
%Maneuver 'off' Burn1(Sat);
% Propagate to apoapsis
""")
    p, p2, man, fb, rep, tog, asg, odd, off = m["sequence"]
    assert p["args"] == {"mode": "Synchronized", "backwards": True,
                         "props": [{"prop": "Prop", "sats": ["Sat1", "Sat2"]}, {"prop": "Prop2", "sats": ["Sat3"]}],
                         "stops": [{"param": "Sat1.ElapsedSecs", "value": "60"}, {"param": "Sat1.Apoapsis", "value": ""}]}
    assert p2["args"]["stops"] == [] and man["args"] == {"burn": "Burn1", "sats": ["Sat"]}
    assert fb["args"]["sats"] == ["Sat", "Sat2"]
    assert rep["args"] == {"file": "RF", "params": ["Sat.A1ModJulian", "Sat.Earth.Altitude"]}
    assert tog["args"] == {"subs": ["RF", "XY"], "state": "Off"}
    assert asg["args"] == {"lhs": "x", "rhs": "Sat.SMA + 1"}
    assert odd["args"] == {}  # sintaxis no reconocida: el formulario cae al editor de texto
    assert off["disabled"] is True and off["label"] == "off" and off["args"]["burn"] == "Burn1"
    assert m["raw"] == ["% Propagate to apoapsis"]  # comentario normal: no es comando
    text = serialize(m)
    assert "\n% Maneuver 'off' Burn1(Sat);\n" in text
    assert parse(text) == m


def test_solver_and_control_args():
    m = parse("""BeginMissionSequence;
Target 'T' DC {SolveMode = Solve, ExitMode = DiscardAndContinue};
   Vary DC(TOI.Element1 = 0.5, {Perturbation = 0.0001, Lower = 0, MaxStep = 0.2});
   Achieve DC(Sat.Earth.RMAG = 42165, {Tolerance = 0.1});
   Achieve aDC(ev(3,1) = 1);
EndTarget;
Optimize Yukon1;
   Minimize Yukon1(cost);
   NonlinearConstraint Yukon1(G<=8);
   NonlinearConstraint Yukon1(a.X=b.X);
EndOptimize;
If a > 1 & Sat.Earth.Altitude <= 342 | b ~= 0
EndIf;
While Sat.ElapsedDays < 1.0
EndWhile;
For I = 1:2:14;
EndFor;
For i = 1:20
EndFor;
Vary DC(x = 1, {Perturbation});
""")
    t, o, i, w, f, f2, bad = m["sequence"]
    assert t["args"] == {"solver": "DC", "opts": {"SolveMode": "Solve", "ExitMode": "DiscardAndContinue"}}
    vary, ach, ach2 = t["children"]
    assert vary["args"] == {"solver": "DC", "lhs": "TOI.Element1", "rhs": "0.5",
                            "opts": {"Perturbation": "0.0001", "Lower": "0", "MaxStep": "0.2"}}
    assert ach["args"]["opts"] == {"Tolerance": "0.1"} and ach2["args"]["lhs"] == "ev(3,1)"
    assert o["args"] == {"solver": "Yukon1", "opts": {}}
    mn, nl, nl2 = o["children"]
    assert mn["args"] == {"solver": "Yukon1", "lhs": "cost"}
    assert nl["args"] == {"solver": "Yukon1", "lhs": "G", "op": "<=", "rhs": "8"} and nl2["args"]["op"] == "="
    assert i["args"]["conds"] == [{"join": "", "lhs": "a", "op": ">", "rhs": "1"},
                                  {"join": "&", "lhs": "Sat.Earth.Altitude", "op": "<=", "rhs": "342"},
                                  {"join": "|", "lhs": "b", "op": "~=", "rhs": "0"}]
    assert w["args"]["conds"] == [{"join": "", "lhs": "Sat.ElapsedDays", "op": "<", "rhs": "1.0"}]
    assert f["args"] == {"var": "I", "start": "1", "step": "2", "end": "14"}
    assert f2["args"] == {"var": "i", "start": "1", "step": "", "end": "20"}
    assert bad["args"] == {}
    assert parse(serialize(m)) == m


def test_parse_keeps_unknown_lines():
    m = parse("Create Spacecraft Sat;\nSat.Epoch = 19 Aug 2015;\nCreate 3D;\nfoo bar;\n")
    assert m["raw"] == ["Sat.Epoch = 19 Aug 2015;", "Create 3D;", "foo bar;"]


def test_endpoints():
    client = TestClient(app)  # sin lifespan: no hace falta el motor
    model = client.post("/api/script/parse", json={"script": SCRIPT}).json()
    assert model == parse(SCRIPT)
    assert client.post("/api/script/serialize", json=model).json() == {"script": serialize(model)}
    assert "gmatpy" not in sys.modules


@pytest.mark.parametrize("sample_id", SAMPLE_IDS)
def test_textual_roundtrip(sample_id):
    m = parse(samples.read(sample_id))
    assert parse(serialize(m)) == m


@pytest.fixture(scope="module")
def engine():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"

    def new():
        return ProcessPoolExecutor(1, mp_context=mp.get_context("spawn"), initializer=worker._init,
                                   initargs=(config.GMAT_HOME, str(config.CACHE_DIR)))
    state = {"pool": new(), "new": new}
    yield state
    state["pool"].shutdown(cancel_futures=True)


def _norm(text: str | None) -> list[str] | None:
    """Texto canónico de GMAT sin comentarios/vacías, sin prefijo GMAT ni NAIFId (lo asigna
    el motor según el orden de creación)."""
    if text is None:
        return None
    lines = (re.sub(r"\s+", " ", x.strip()) for x in text.splitlines())
    return [x.removeprefix("GMAT ") for x in lines if x and not x.startswith("%") and ".NAIFId" not in x]


@pytest.mark.parametrize("sample_id", [
    pytest.param(s, marks=pytest.mark.xfail(reason=XFAIL[s], strict=True)) if s in XFAIL else s
    for s in SAMPLE_IDS])
def test_engine_roundtrip(engine, tmp_path, sample_id):
    """serialize(parse(x)) carga en gmatpy con los mismos objetos, campos y comandos que x."""
    text = samples.read(sample_id)
    try:
        orig, rt = sanitize(text, tmp_path), sanitize(serialize(parse(text)), tmp_path)
    except ScriptRejected as e:
        pytest.skip(f"rechazado por sanitize: {e}")
    (tmp_path / "o.script").write_text(orig, encoding="utf-8")
    (tmp_path / "r.script").write_text(rt, encoding="utf-8")
    try:
        a = engine["pool"].submit(worker.snapshot, str(tmp_path / "o.script")).result(120)
        b = engine["pool"].submit(worker.snapshot, str(tmp_path / "r.script")).result(120) if a else None
    except Exception as e:  # el motor se cayó: proceso nuevo para el resto
        engine["pool"].shutdown(cancel_futures=True)
        engine["pool"] = engine["new"]()
        pytest.fail(f"el motor falló: {type(e).__name__}")
    if a is None:
        pytest.skip("el original no carga con la API de GMAT (plugin/archivo/función ausente)")
    assert b is not None, "el script serializado no carga"
    assert {k: _norm(v) for k, v in b["objects"].items()} == {k: _norm(v) for k, v in a["objects"].items()}
    assert [_norm(c) for c in b["commands"]] == [_norm(c) for c in a["commands"]]
