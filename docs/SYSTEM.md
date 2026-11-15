<!-- fuente: backend/app/main.py, frontend/vite.config.ts, backend/app/config.py | rev: 7b35a0e -->
# System

| Piece | Where it lives | Stack | Docs |
|---|---|---|---|
| Frontend | `frontend/` | React 19 + Vite + TS + Zustand + Monaco | `docs/MAP.md` |
| Backend API | `backend/` | FastAPI (Python 3.12-3.14) | `docs/API.md` |
| GMAT engine | `GMAT_HOME` (outside the repo) | `gmatpy` R2026a, only inside worker processes | `docs/GOTCHAS.md` |
| Model schema | `shared/mission.schema.json` | JSON Schema, mirrored in `frontend/src/model/mission.ts` | `PLAN.md` |

There is no database and no accounts (v1). Docker deployment: `docker-compose.yml` with `api` (Python 3.12 + GMAT Ubuntu) and `web` (nginx with `/api` proxy), see `docs/DEPLOY.md`.

## Frontend and backend contract
- Base URL: relative paths `/api/...`. Vite proxies `/api` to `127.0.0.1:8000` with `ws: true` (`frontend/vite.config.ts`). The proxy's `/ws` entry is not used: the backend has no routes under `/ws` and the frontend opens `/api/ws/...`.
- Exchange format: the JSON mission model (`resources`, `sequence`, `raw`). The `.script` text is the source of truth.
- Errors: `HTTPException` with `{detail}`; `/runs` rejected by sanitize returns `{detail, line}` with 400.
- Runs: `POST /api/runs` and then `WS /api/ws/runs/{id}` (live log). The WebSocket uses the same host as the page (`ws` or `wss` depending on the protocol). Events in `docs/API.md`. When `done` arrives with `available`, `store` requests `GET /api/runs/{id}/results` and the Resultados and 3D tabs show it.
- Cesium (3D view): no Cesium ion and no ion credit (`creditContainer` outside the DOM). `vite.config.ts` copies `node_modules/cesium/Build/Cesium/{Assets,Workers,ThirdParty,Widgets}` to `frontend/public/cesium/` (gitignored; delete it when updating cesium) and `results/cesiumBase.ts` sets `CESIUM_BASE_URL=/cesium/`. If the frontend is served from another path, `/cesium/` must remain available.

## What each type of change touches
| Change | Backend | Frontend |
|---|---|---|
| New resource field/type | nothing if the engine exposes it (`engine/schema.py` reads it); bump the cache suffix if the shape changes | `ResourceForm.tsx` (generic) or dedicated editor |
| New endpoint | `main.py`, worker function in `engine/worker.py` if it touches the engine, `docs/API.md` | call in `store.ts`, UI |
| New sequence command | `script/parser.py` (`_args`, `COMMENTABLE`) and `serializer.py` | `model/mission.ts`, `mission/commands.ts`, `mission/CommandForm.tsx` |
| UI text | n/a | `frontend/src/i18n/en.ts` (active, English; `es.ts` keeps Spanish with the same keys) |
| Script security rule | `engine/sanitize.py` + `tests/test_sanitize.py` | n/a |
