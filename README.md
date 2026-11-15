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

## Con Docker

```sh
cp .env.example .env   # opcional
docker compose up -d --build
```

Abre `http://localhost:8080` (`WEB_PORT`). Un solo contenedor: FastAPI sirve la API y el juego. No hace falta tener GMAT instalado: el build descarga la versión de Ubuntu (400 MB) y verifica su sha256. Detalles en `docs/DEPLOY.md`.

## Pruebas

```sh
cd backend && .venv/Scripts/python -m pytest   # requiere GMAT_HOME
cd frontend && npm run lint && npm run build
```

## Configuración (variables de entorno)

| Variable | Defecto | Uso |
|---|---|---|
| `GMAT_HOME` | — | Carpeta de GMAT (obligatoria) |
| `GMAT_WEB_WORKERS` | 2 | Procesos worker con `gmatpy` para tareas cortas |
| `GMAT_WEB_TASK_TIMEOUT` | 60 | Timeout por tarea corta (s): esquemas, validar, convertir |
| `GMAT_WEB_CACHE` | `backend/.cache` | Archivos generados: startup file de la API y caché de esquemas |
| `GMAT_WEB_MAX_RUNS` | 2 | Corridas simultáneas; la siguiente recibe 429 |
| `GMAT_WEB_RUN_TIMEOUT` | 300 | Tiempo máximo por corrida (s); al pasarlo se detiene |
| `GMAT_WEB_MAX_SCRIPT_BYTES` | 524288 | Tamaño máximo de un script (bytes, UTF-8) |
| `GMAT_WEB_RUNS` | `<temp>/gmat-web-runs` | Carpeta de corridas (script saneado, log y salidas) |
| `GMAT_WEB_STATIC` | vacío | Carpeta del build del frontend que FastAPI sirve en `/` (Docker: `/srv/web`). Vacía en dev |
| `GMAT_WEB_RUN_KEEP` | 3600 | Segundos que se guardan una corrida terminada y su carpeta; luego se borran (al arrancar y en cada corrida nueva) |

## Licencia

MIT (ver `LICENSE`). Usa GMAT, Apache 2.0 (ver `NOTICE`).
