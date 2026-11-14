import sys

from fastapi.testclient import TestClient

from app import config
from app.main import app


def test_health_reports_real_gmat_version():
    assert config.GMAT_HOME, "Definir GMAT_HOME para correr las pruebas con el motor real"
    with TestClient(app) as client:
        body = client.get("/api/health").json()
    assert body["status"] == "ok", body
    assert body["version"].startswith("R20")
    assert "gmatpy" not in sys.modules  # el proceso API nunca importa el motor
