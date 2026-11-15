# GMAT Web

Web port of GMAT R2026a: a FastAPI backend on top of `gmatpy` (GMAT's real engine) and a React + Vite + TypeScript frontend.

## Requirements

- GMAT R2026a installed (Windows or Linux) and the `GMAT_HOME` variable pointing to its root folder (the one that contains `bin/gmatpy`).
- Python 3.12–3.14 (it must match a version included in `bin/gmatpy/_pyXY`) and [`uv`](https://docs.astral.sh/uv/).
- Node.js 20+ and npm.

## Running locally

```powershell
$env:GMAT_HOME = 'C:\path\to\gmat-win-R2026a'
./dev.ps1
```

```sh
GMAT_HOME=/opt/gmat ./dev.sh
```

The first time, they create `backend/.venv` and install the dependencies. Backend on `http://127.0.0.1:8000`, frontend on `http://localhost:5173` (proxy `/api` → `:8000`).

If `GMAT_HOME/bin/api_startup_file.txt` does not exist, the backend generates an equivalent one in `backend/.cache/`.

## With Docker

```sh
cp .env.example .env   # optional
docker compose up -d --build
```

Open `http://localhost:8080` (`WEB_PORT`). One container: FastAPI serves the API and the game. GMAT does not need to be installed: the build downloads the Ubuntu version (400 MB) and checks its sha256. Details in `docs/DEPLOY.md`.

## Tests

```sh
cd backend && .venv/Scripts/python -m pytest   # requires GMAT_HOME
cd frontend && npm run lint && npm run build
```

## Configuration (environment variables)

| Variable | Default | Use |
|---|---|---|
| `GMAT_HOME` | — | GMAT folder (required) |
| `GMAT_WEB_WORKERS` | 2 | Worker processes with `gmatpy` for short tasks |
| `GMAT_WEB_TASK_TIMEOUT` | 60 | Timeout per short task (s): schemas, validate, convert |
| `GMAT_WEB_CACHE` | `backend/.cache` | Generated files: the API startup file and the schema cache |
| `GMAT_WEB_MAX_RUNS` | 2 | Simultaneous runs; the next one gets 429 |
| `GMAT_WEB_RUN_TIMEOUT` | 300 | Maximum time per run (s); past it, the run is stopped |
| `GMAT_WEB_MAX_SCRIPT_BYTES` | 524288 | Maximum script size (bytes, UTF-8) |
| `GMAT_WEB_RUNS` | `<temp>/gmat-web-runs` | Runs folder (sanitized script, log and outputs) |
| `GMAT_WEB_STATIC` | empty | Frontend build folder that FastAPI serves at `/` (Docker: `/srv/web`). Empty in dev |
| `GMAT_WEB_RUN_KEEP` | 3600 | Seconds a finished run and its folder are kept; then they are deleted (at startup and on each new run) |

## Real data and 3D models

The game uses real NASA data wherever it can. Full credits in `NOTICE`; how each file is built in `tools/*/README.md`.

| What | Source | Details |
|---|---|---|
| Orbital physics (orbits, transfers, maneuvers) | NASA GMAT R2026a engine (`gmatpy`), never reimplemented in the frontend | `docs/SYSTEM.md` |
| Moon globe and rover terrain | LROC color and LOLA relief (NASA SVS CGI Moon Kit; polar LOLA LDEM from NASA PGDA). Crater windows keep the real slopes; crater positions from the USGS/IAU Gazetteer | `tools/moon/README.md` |
| Mars globe and rover terrain | Viking MDIM2.1 color mosaic (USGS, via NASA Mars Trek) and the HRSC+MOLA blended DEM at 200 m (USGS). Sites at their real coordinates (USGS/IAU Gazetteer) | `tools/mars/README.md` |
| Rover, sky crane, aeroshell, MSL cruise stage, Atlas V 541 | Based on NASA's public 3D models (NASA 3D Resources), simplified by the team (fewer polygons, parts split for animation, compressed textures) | `tools/msl/README.md` |
| Star sky and Earth | Tycho-2 star map and Natural Earth II imagery bundled with CesiumJS | `NOTICE` |
| Ground and rock textures | Poly Haven CC0 materials and one texture chosen by the team (not scanned data) | `NOTICE` |

## License

MIT (see `LICENSE`). Uses GMAT, Apache 2.0 (see `NOTICE`).
