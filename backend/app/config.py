"""Configuración por variables de entorno. Nada de rutas hardcodeadas."""
import os
import tempfile
from pathlib import Path

GMAT_HOME = os.environ.get("GMAT_HOME", "")
CACHE_DIR = Path(os.environ.get("GMAT_WEB_CACHE", Path(__file__).resolve().parent.parent / ".cache"))
RUNS_DIR = Path(os.environ.get("GMAT_WEB_RUNS", Path(tempfile.gettempdir()) / "gmat-web-runs"))

# Límites
WORKERS = int(os.environ.get("GMAT_WEB_WORKERS", "2"))
TASK_TIMEOUT_S = float(os.environ.get("GMAT_WEB_TASK_TIMEOUT", "60"))
MAX_RUNS = int(os.environ.get("GMAT_WEB_MAX_RUNS", "2"))
RUN_TIMEOUT_S = float(os.environ.get("GMAT_WEB_RUN_TIMEOUT", "300"))
# Corridas terminadas (y sus carpetas) se borran pasado este tiempo (s).
RUN_KEEP_S = float(os.environ.get("GMAT_WEB_RUN_KEEP", "3600"))
MAX_SCRIPT_BYTES = int(os.environ.get("GMAT_WEB_MAX_SCRIPT_BYTES", "524288"))
