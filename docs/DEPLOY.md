<!-- fuente: docker-compose.yml, backend/Dockerfile, frontend/Dockerfile, frontend/nginx.conf, .env.example | rev: 8739818 -->
# Deployment with Docker

```sh
cp .env.example .env        # optional: ports and limits
docker compose up -d --build
```

Open `http://localhost:8080` (`WEB_PORT`). The first build downloads GMAT (400 MB). If SourceForge's automatic mirror is slow, set one in `GMAT_URL` (`.env.example` includes an example). The Dockerfile checks the sha256, so any mirror works.

## Services

| Service | Image | Port | What it does |
|---|---|---|---|
| `api` | `backend/Dockerfile`: `python:3.12-slim-bookworm` + `gmat-ubuntu-x64-R2026a.tar.gz` in `/opt/gmat` | 8000, only on the internal network | FastAPI + `gmatpy` workers. User `app` (uid 10001) |
| `web` | `frontend/Dockerfile`: Vite build + `nginx-unprivileged` | 8080 → `${WEB_BIND}:${WEB_PORT}` | Static files, `/api` proxy (HTTP and WebSocket) to `api:8000` |

## GMAT in the image
- Pinned tarball: `gmat-ubuntu-x64-R2026a.tar.gz`, sha256 `fe124b4a606b2e3b704a6fbb1c37b87598d5df0d18cb661c304b5f60074a7754` (md5 equal to the one published by SourceForge). Its root is in `GMAT/R2026a/` (`--strip-components=2`).
- It does not include `bin/api_startup_file.txt`: the backend generates it in `GMAT_WEB_CACHE`.
- No extra system packages: `gmatpy` imports on Debian slim. The missing libraries (OpenFrames GL/X11, osg, CSALT's SNOPT) belong to desktop plugins the web does not use.
- For another GMAT version: change `GMAT_URL` and `GMAT_SHA256` (Dockerfile build args).

## Hardening
- Both containers: `read_only`, `cap_drop: ALL`, `no-new-privileges` and an unprivileged user.
- `api`: the only writable paths are `/var/lib/gmat-web/cache` (volume `api-cache`), `/var/lib/gmat-web/runs` (tmpfs, `GMAT_WEB_RUNS_SIZE`), `/opt/gmat/output` (tmpfs: the `GmatLog.txt` of the pool workers) and `/tmp`. The GMAT installation is read-only. Limits: `mem_limit` (`API_MEM_LIMIT`) and `pids_limit` 512.
- `web`: rate limit of 10 req/s per IP on `/api` (burst 40, responds 429), `client_max_body_size 2m`, `server_tokens off`, `nosniff` and `X-Frame-Options DENY`. A run's WebSocket lasts up to 600 s.
- uvicorn runs in **a single process**: runs live in that process's memory (`runner.runs`). Do not scale `api` with replicas or with `--workers`.

## Operation
- Status: `docker compose ps`. Both services have a healthcheck; `api` is only healthy if `/api/health` responds `status: ok`, that is, if the engine loads.
- Logs: `docker compose logs -f api`.
- Clean restart: `docker compose down && docker compose up -d`. Runs (tmpfs) are lost and the schema cache is kept. To delete it too: `docker compose down -v`.
- Publishing on the network or on a VPS: `WEB_BIND=0.0.0.0`, with TLS in front (reverse proxy or Portainer + Traefik). If TLS terminates outside, the WebSocket uses `wss` by itself (the frontend takes the page's protocol).

## Pending
- A `ThrustHistoryFile` or a `TrackingFileSet` without a `Simulator` can read an absolute path inside the container (Log 7c1). The container has no secrets and is read-only, but it would be better to restrict it to `GMAT_HOME`.
