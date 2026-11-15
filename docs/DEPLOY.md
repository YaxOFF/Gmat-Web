<!-- fuente: docker-compose.yml, backend/Dockerfile, frontend/Dockerfile, frontend/nginx.conf, .env.example | rev: 8739818 -->
# Despliegue con Docker

```sh
cp .env.example .env        # opcional: puertos y límites
docker compose up -d --build
```

Abrir `http://localhost:8080` (`WEB_PORT`). El primer build descarga GMAT (400 MB). Si el mirror automático de SourceForge va lento, fijar uno en `GMAT_URL` (`.env.example` trae un ejemplo). El Dockerfile verifica el sha256, así que cualquier mirror vale.

## Servicios

| Servicio | Imagen | Puerto | Qué hace |
|---|---|---|---|
| `api` | `backend/Dockerfile`: `python:3.12-slim-bookworm` + `gmat-ubuntu-x64-R2026a.tar.gz` en `/opt/gmat` | 8000, solo en la red interna | FastAPI + workers `gmatpy`. Usuario `app` (uid 10001) |
| `web` | `frontend/Dockerfile`: build de Vite + `nginx-unprivileged` | 8080 → `${WEB_BIND}:${WEB_PORT}` | Estáticos, proxy `/api` (HTTP y WebSocket) a `api:8000` |

## GMAT en la imagen
- Tarball fijado: `gmat-ubuntu-x64-R2026a.tar.gz`, sha256 `fe124b4a606b2e3b704a6fbb1c37b87598d5df0d18cb661c304b5f60074a7754` (md5 igual al publicado por SourceForge). Trae su raíz en `GMAT/R2026a/` (`--strip-components=2`).
- No trae `bin/api_startup_file.txt`: el backend lo genera en `GMAT_WEB_CACHE`.
- Sin paquetes de sistema extra: `gmatpy` importa en Debian slim. Las librerías que faltan (GL/X11 de OpenFrames, osg, SNOPT de CSALT) son de plugins de escritorio que la web no usa.
- Para otra versión de GMAT: cambiar `GMAT_URL` y `GMAT_SHA256` (build args del Dockerfile).

## Endurecimiento
- Los dos contenedores: `read_only`, `cap_drop: ALL`, `no-new-privileges` y usuario sin privilegios.
- `api`: lo único escribible es `/var/lib/gmat-web/cache` (volumen `api-cache`), `/var/lib/gmat-web/runs` (tmpfs, `GMAT_WEB_RUNS_SIZE`), `/opt/gmat/output` (tmpfs: el `GmatLog.txt` de los workers del pool) y `/tmp`. La instalación de GMAT es de solo lectura. Límites: `mem_limit` (`API_MEM_LIMIT`) y `pids_limit` 512.
- `web`: rate limit de 10 req/s por IP en `/api` (ráfaga 40, responde 429), `client_max_body_size 2m`, `server_tokens off`, `nosniff` y `X-Frame-Options DENY`. El WebSocket de una corrida aguanta 600 s.
- uvicorn corre en **un solo proceso**: las corridas viven en la memoria de ese proceso (`runner.runs`). No escalar `api` con réplicas ni con `--workers`.

## Operación
- Estado: `docker compose ps`. Los dos servicios tienen healthcheck; `api` solo queda sano si `/api/health` responde `status: ok`, o sea, si el motor carga.
- Logs: `docker compose logs -f api`.
- Reinicio limpio: `docker compose down && docker compose up -d`. Las corridas (tmpfs) se pierden y la caché de esquemas se conserva. Para borrarla también: `docker compose down -v`.
- Publicar en la red o en un VPS: `WEB_BIND=0.0.0.0`, con TLS delante (proxy inverso o Portainer + Traefik). Si TLS termina fuera, el WebSocket usa `wss` solo (el frontend toma el protocolo de la página).

## Pendientes
- Un `ThrustHistoryFile` o un `TrackingFileSet` sin `Simulator` puede leer una ruta absoluta dentro del contenedor (Bitácora 7c1). El contenedor no tiene secretos y es de solo lectura, pero conviene restringirlo a `GMAT_HOME`.
