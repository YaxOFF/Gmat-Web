import pytest
from fastapi.testclient import TestClient

from app import config
from app.engine import schema, worker
from app.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    mp = pytest.MonkeyPatch()
    mp.setattr(config, "CACHE_DIR", tmp_path_factory.mktemp("cache"))  # caché nueva: se construye aquí
    schema.reset()
    with TestClient(app) as c:
        yield c
    schema.reset()
    mp.undo()


def test_types(client):
    info = client.get("/api/schema").json()
    types = {t["type"]: t for t in info}
    for t in ("Spacecraft", "ChemicalTank", "ChemicalThruster", "ForceModel", "Propagator", "ImpulsiveBurn",
              "FiniteBurn", "CoordinateSystem", "DifferentialCorrector", "Variable", "Array", "String",
              "ReportFile", "XYPlot", "EphemerisFile"):
        assert t in types
    assert "SMA" not in types  # parámetros calculados no son creables
    assert types["ChemicalTank"]["category"] == "HARDWARE"
    assert types["Variable"]["category"] == "PARAMETER"
    assert types["ForceModel"]["objectType"] != types["Propagator"]["objectType"]


def test_spacecraft(client):
    r = client.get("/api/schema/Spacecraft")
    assert r.status_code == 200
    fields = {f["name"]: f for f in r.json()["fields"]}
    assert isinstance(fields["SMA"]["default"], float) and fields["SMA"]["default"] > 6378
    assert "Keplerian" in fields["DisplayStateType"]["enum"]
    assert fields["DisplayStateType"]["default"] == "Cartesian"
    assert fields["DryMass"]["default"] == 850 and fields["DryMass"]["readOnly"] is False
    assert fields["A1Epoch"]["readOnly"] is True


def test_propagator_alias(client):
    names = {f["name"] for f in client.get("/api/schema/Propagator").json()["fields"]}
    assert "FM" in names or "Type" in names


@pytest.mark.parametrize("type_name", ["EphemerisFile", "Array", "Variable", "SolarPowerSystem"])
def test_tricky_types(client, type_name):
    """Tipos que fallan al cargar, piden dimensiones o tiran el motor al leer campos calculados."""
    r = client.get(f"/api/schema/{type_name}")
    assert r.status_code == 200 and r.json()["fields"]


def test_unknown_type(client):
    assert client.get("/api/schema/NoExiste").status_code == 404
    assert client.get("/api/schema/Spacecraft%20x;%20System").status_code == 404


def test_cache_reused(client, monkeypatch):
    first = client.get("/api/schema/Spacecraft").json()

    def boom(*_, **__):
        raise AssertionError("no debería consultar el motor")
    monkeypatch.setattr(worker, "submit", boom)
    monkeypatch.setattr(schema, "_isolated", boom)
    schema.reset()  # olvida la memoria: debe salir del archivo en disco
    assert client.get("/api/schema/Spacecraft").json() == first
    assert list(config.CACHE_DIR.glob("schema/*.json"))
