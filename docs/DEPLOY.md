<!-- fuente: docker-compose.yml, Dockerfile, .dockerignore, .env.example, backend/app/main.py | rev: 1a95f8e -->
# Deployment with Docker

One container (`app`): Vite build + FastAPI + GMAT engine. uvicorn serves `/api` and the game's static files.

```sh
cp .env.example .env        # optional: port and limits
docker compose up -d --build
```

Open `http://localhost:8080` (`WEB_PORT`). The first build downloads GMAT (400 MB). If SourceForge's automatic mirror is slow, set one in `GMAT_URL` (`.env.example` includes an example). The Dockerfile checks the sha256, so any mirror works.

## Image (`Dockerfile` at the repo root)

| Stage | Base | What it does |
|---|---|---|
| `web` | `node:22-alpine` | `npm ci` + `npm run build` of `frontend/` (Cesium assets go to `dist/cesium`) |
| `gmat` | `debian:bookworm-slim` | Downloads `gmat-ubuntu-x64-R2026a.tar.gz`, checks sha256, unpacks to `/opt/gmat` |
| runtime | `python:3.12-slim-bookworm` | Backend + `/opt/gmat` + `dist` in `/srv/web` (`GMAT_WEB_STATIC`). User `app` (uid 10001), port 8000 |

- Static files: `backend/app/main.py` mounts `StaticFiles(html=True)` at `/` after every `/api` route, only when `GMAT_WEB_STATIC` is set. In dev it is empty and Vite serves the frontend.
- GMAT tarball sha256 `fe124b4a606b2e3b704a6fbb1c37b87598d5df0d18cb661c304b5f60074a7754` (md5 equal to the one published by SourceForge). Its root is in `GMAT/R2026a/` (`--strip-components=2`). It does not include `bin/api_startup_file.txt`: the backend generates it in `GMAT_WEB_CACHE`.
- No extra system packages: `gmatpy` imports on Debian slim. The missing libraries (OpenFrames GL/X11, osg, CSALT's SNOPT) belong to desktop plugins the web does not use.
- For another GMAT version: change `GMAT_URL` and `GMAT_SHA256` (Dockerfile build args). These are the only build args; everything else is runtime env.

## Hardening
- `read_only`, `cap_drop: ALL`, `no-new-privileges`, unprivileged user, log rotation (10 MB x 3).
- Writable paths: `/var/lib/gmat-web/cache` (volume `app-cache`), `/var/lib/gmat-web/runs` (tmpfs, `GMAT_WEB_RUNS_SIZE`), `/opt/gmat/output` (tmpfs: `GmatLog.txt` of the pool workers) and `/tmp`. Limits: `mem_limit` (`APP_MEM_LIMIT`) and `pids_limit` 512.
- There is no nginx: no rate limit and no security headers in the container. Put them in the external proxy if needed. The backend still limits runs (`GMAT_WEB_MAX_RUNS`, `GMAT_WEB_RUN_TIMEOUT`, `GMAT_WEB_MAX_SCRIPT_BYTES`).
- uvicorn runs in **a single process**: runs live in that process's memory (`runner.runs`). Do not scale with replicas or `--workers`.

## Deploy from Portainer
1. Stacks → Add stack → **Name: `gmat-web`** (same as `name:` in the compose).
2. Build method: Repository → repository URL, reference (branch), compose path `docker-compose.yml`.
3. Environment variables → "Load variables from .env file" → paste `.env.example` and set `WEB_PORT` to a free port on the VPS.
4. Deploy. The first build takes several minutes (GMAT download + npm build).
5. Point the external proxy (TLS) to `127.0.0.1:${WEB_PORT}`. WebSocket upgrade must be allowed for `/api/ws/` (a run lasts up to `GMAT_WEB_RUN_TIMEOUT`; set the proxy read timeout to 600 s). The frontend uses `wss` by itself under https.

Changing a variable: edit it in Portainer → "Update the stack" (no rebuild needed).

## Operation
- Status: `docker compose ps`. The healthcheck is healthy only if `/api/health` responds `status: ok`, that is, if the engine loads.
- Logs: `docker compose logs -f app`.
- Clean restart: `docker compose down && docker compose up -d`. Runs (tmpfs) are lost and the schema cache is kept. To delete it too: `docker compose down -v`.

## Pending
- A `ThrustHistoryFile` or a `TrackingFileSet` without a `Simulator` can read an absolute path inside the container (Log 7c1). The container has no secrets and is read-only, but it would be better to restrict it to `GMAT_HOME`.
