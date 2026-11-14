"""POST /api/convert/state y POST /api/script/validate con el motor real."""
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app

KEP = {"SMA": 7000.0, "ECC": 0.01, "INC": 28.5, "RAAN": 10.0, "AOP": 20.0, "TA": 30.0}


@pytest.fixture(scope="module")
def client():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    with TestClient(app) as c:
        yield c


def test_convert_round_trip(client):
    r = client.post("/api/convert/state", json={"fromType": "Keplerian", "toType": "Cartesian", "elements": KEP})
    assert r.status_code == 200
    cart = r.json()["elements"]
    assert set(cart) == {"X", "Y", "Z", "VX", "VY", "VZ"}
    assert 6900 < (cart["X"] ** 2 + cart["Y"] ** 2 + cart["Z"] ** 2) ** 0.5 < 7100
    back = client.post("/api/convert/state", json={"fromType": "Cartesian", "toType": "Keplerian",
                                                   "elements": cart}).json()["elements"]
    for k, v in KEP.items():
        assert back[k] == pytest.approx(v, rel=1e-9)


def test_convert_rejects_injection(client):
    bad = {"fromType": "Keplerian; System", "toType": "Cartesian", "elements": KEP}
    assert client.post("/api/convert/state", json=bad).status_code == 422
    bad = {"fromType": "Keplerian", "toType": "Cartesian", "elements": {"SMA;\nSystem": 1.0}}
    assert client.post("/api/convert/state", json=bad).status_code == 422


def test_validate(client):
    ok = client.post("/api/script/validate",
                     json={"script": "Create Spacecraft Sat;\nSat.SMA = 7000;\nBeginMissionSequence;\n"}).json()
    assert ok == {"ok": True, "errors": []}
    bad = client.post("/api/script/validate",
                      json={"script": "Create Spacecraft Sat;\nSat.Foo = 3;\nBeginMissionSequence;\n"}).json()
    assert bad["ok"] is False
    assert any(e.get("line") == 2 for e in bad["errors"])
    rejected = client.post("/api/script/validate", json={"script": "BeginMissionSequence;\nSystem 'dir';\n"}).json()
    assert rejected["ok"] is False and rejected["errors"]
