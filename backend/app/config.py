"""Configuración por variables de entorno. Nada de rutas hardcodeadas."""
import os
from pathlib import Path

GMAT_HOME = os.environ.get("GMAT_HOME", "")
CACHE_DIR = Path(os.environ.get("GMAT_WEB_CACHE", Path(__file__).resolve().parent.parent / ".cache"))

# Límites
WORKERS = int(os.environ.get("GMAT_WEB_WORKERS", "2"))
TASK_TIMEOUT_S = float(os.environ.get("GMAT_WEB_TASK_TIMEOUT", "60"))
