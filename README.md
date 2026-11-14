# GMAT Web

Port web de GMAT R2026a: backend FastAPI sobre `gmatpy` (el motor real de GMAT) y frontend React + Vite + TypeScript.

## Requisitos

- GMAT R2026a instalado (Windows o Linux) y la variable `GMAT_HOME` apuntando a su carpeta raíz (la que contiene `bin/gmatpy`).
- Python 3.12–3.14 (debe coincidir con una versión incluida en `bin/gmatpy/_pyXY`) y [`uv`](https://docs.astral.sh/uv/).
- Node.js 20+ y npm.

## Arrancar en local

```powershell
$env:GMAT_HOME = 'C:\ruta\a\gmat-win-R2026a'
./dev.ps1
```

```sh
GMAT_HOME=/opt/gmat ./dev.sh
```

La primera vez crean `backend/.venv` e instalan dependencias. Backend en `http://127.0.0.1:8000`, frontend en `http://localhost:5173` (proxy `/api` → `:8000`).

Si `GMAT_HOME/bin/api_startup_file.txt` no existe, el backend genera uno equivalente en `backend/.cache/`.

## Pruebas

```sh
cd backend && .venv/Scripts/python -m pytest   # requiere GMAT_HOME
cd frontend && npm run lint && npm run build
```

## Configuración (variables de entorno)

| Variable | Defecto | Uso |
|---|---|---|
| `GMAT_HOME` | — | Carpeta de GMAT (obligatoria) |
| `GMAT_WEB_WORKERS` | 2 | Procesos worker con `gmatpy` |
| `GMAT_WEB_TASK_TIMEOUT` | 60 | Timeout por tarea (s) |
| `GMAT_WEB_CACHE` | `backend/.cache` | Archivos generados |

## Licencia

MIT (ver `LICENSE`). Usa GMAT, Apache 2.0 (ver `NOTICE`).
