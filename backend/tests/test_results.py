import pytest
from fastapi.testclient import TestClient

from app import config
from app.engine import results
from app.main import app
from test_runs import events

RAW = ("Create ReportFile RawRF;\nRawRF.Filename = 'C:/elsewhere/raw.txt';\n"
       "RawRF.Add = {DefaultSC.A1ModJulian, DefaultSC.EarthMJ2000Eq.X, DefaultSC.EarthMJ2000Eq.VZ};\n")


@pytest.fixture(scope="module")
def client():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    with TestClient(app) as c:
        yield c


def run(client, text):
    run_id = client.post("/api/runs", json={"script": text}).json()["runId"]
    evs = events(client, run_id)
    assert evs[-1]["type"] == "done", evs[-1]
    return run_id, evs[-1]["results"]


def test_hohmann_results_match_raw_report(client):
    text = client.get("/api/samples/Ex_HohmannTransfer.script").json()["text"]
    text = text.replace("BeginMissionSequence", RAW + "BeginMissionSequence", 1)
    run_id, done = run(client, text)
    assert done["available"] and "raw.txt" in done["files"]
    assert not any(f.startswith(results.PREFIX) for f in done["files"])
    res = client.get(f"/api/runs/{run_id}/results").json()
    sc = next(s for s in res["ships"] if s["name"] == "DefaultSC")
    cols = sc["columns"]
    assert len(cols["A1ModJulian"]) > 100 and isinstance(cols["UTCGregorian"][0], str)
    rep = next(r for r in res["reports"] if r["name"] == "RawRF")
    assert rep["headers"] == ["DefaultSC.A1ModJulian", "DefaultSC.EarthMJ2000Eq.X", "DefaultSC.EarthMJ2000Eq.VZ"]
    # mismos puntos que el ReportFile del usuario (archivo crudo bajado por /files)
    raw = client.get(f"/api/runs/{run_id}/files/raw.txt").text.splitlines()[1:]
    raw = [[float(v) for v in line.split()] for line in raw if line.strip()]
    assert rep["rows"] == raw
    assert len(raw) == len(cols["A1ModJulian"])
    for i in (0, len(raw) // 2, -1):
        assert raw[i][0] == pytest.approx(cols["A1ModJulian"][i], abs=1e-9)
        assert raw[i][1] == pytest.approx(cols["EarthMJ2000Eq.X"][i], rel=1e-12)
        assert raw[i][2] == pytest.approx(cols["EarthMJ2000Eq.VZ"][i], rel=1e-12)


def test_ground_track_sample(client):
    text = client.get("/api/samples/Ex_EclipseLocation.script").json()["text"]
    assert "GroundTrackPlot" in text
    run_id, _ = run(client, text)
    sc = client.get(f"/api/runs/{run_id}/results").json()["ships"][0]["columns"]
    lat, lon = sc["Earth.Latitude"], sc["Earth.Longitude"]
    assert len(lat) > 100 and all(-90 <= v <= 90 for v in lat) and all(-180 <= v <= 180 for v in lon)


def test_xyplot_series(client):
    text = client.get("/api/samples/Ex_LEOStationKeeping.script").json()["text"]
    run_id, _ = run(client, text)
    xy = client.get(f"/api/runs/{run_id}/results").json()["xyplots"][0]
    assert xy["x"]["name"] == "LEOsat.A1ModJulian" and xy["series"][0]["name"] == "LEOsat.Earth.Altitude"
    assert len(xy["x"]["data"]) == len(xy["series"][0]["data"]) > 100


def test_error_line_ignores_injected_lines(client):
    text = "Create Spacecraft Sat;\nBeginMissionSequence;\nSat.Foo = 3;\n"
    run_id = client.post("/api/runs", json={"script": text}).json()["runId"]
    evs = events(client, run_id)
    assert evs[-1]["type"] == "error" and any(e.get("line") == 3 for e in evs)


@pytest.mark.parametrize("name", ["..%2Fmission.script", "mission.script", "startup.txt", "..", "nope.txt",
                                  "%2E%2E%2F%2E%2E%2Fpyproject.toml"])
def test_files_rejects_traversal_and_hidden(client, name):
    run_id, _ = run(client, "Create Spacecraft Sat;\nCreate Propagator P;\nBeginMissionSequence;\n"
                            "Propagate P(Sat) {Sat.ElapsedSecs = 60};\n")
    # `..` suelto lo normaliza el cliente a /api/runs/{id} (405): tampoco sirve nada
    assert client.get(f"/api/runs/{run_id}/files/{name}").status_code in (404, 405)


def test_backprop_kept_and_report_without_headers(client):
    text = ("Create Spacecraft Sat;\nCreate Propagator P;\nCreate ReportFile RawRF;\n"
            "RawRF.Filename = 'raw.txt';\nRawRF.WriteHeaders = false;\n"
            "RawRF.Add = {Sat.A1ModJulian, Sat.EarthMJ2000Eq.X};\nBeginMissionSequence;\n"
            "Propagate P(Sat) {Sat.ElapsedDays = 0.5};\nPropagate BackProp P(Sat) {Sat.ElapsedDays = -0.3};\n")
    run_id, _ = run(client, text)
    res = client.get(f"/api/runs/{run_id}/results").json()
    raw = client.get(f"/api/runs/{run_id}/files/raw.txt").text.splitlines()
    raw = [[float(v) for v in line.split()] for line in raw if line.strip()]
    rep = res["reports"][0]
    assert rep["headers"] == ["Sat.A1ModJulian", "Sat.EarthMJ2000Eq.X"] and rep["rows"] == raw
    epochs = res["ships"][0]["columns"]["A1ModJulian"]
    assert epochs == pytest.approx([r[0] for r in raw], abs=1e-9)
    assert min(epochs[epochs.index(max(epochs)):]) < max(epochs)  # el tramo hacia atrás sigue ahí
