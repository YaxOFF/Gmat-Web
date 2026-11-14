<!-- fuente: backend/app/main.py, frontend/vite.config.ts, backend/app/config.py | rev: 078da86 -->
# Sistema

| Pieza | Dónde vive | Stack | Docs |
|---|---|---|---|
| Frontend | `frontend/` | React 19 + Vite + TS + Zustand + Monaco | `docs/MAP.md` |
| Backend API | `backend/` | FastAPI (Python 3.12-3.14) | `docs/API.md` |
| Motor GMAT | `GMAT_HOME` (fuera del repo) | `gmatpy` R2026a, solo dentro de procesos worker | `docs/GOTCHAS.md` |
| Esquema del modelo | `shared/mission.schema.json` | JSON Schema, espejo en `frontend/src/model/mission.ts` | `PLAN.md` |

No hay base de datos ni cuentas (v1). Despliegue Docker: fase 9 del plan, [TODO: aún no existe].

## Contrato frontend y backend
- URL base: rutas relativas `/api/...`. Vite hace proxy a `127.0.0.1:8000` (`frontend/vite.config.ts`, con `ws: true`).
- Formato de intercambio: el modelo de misión JSON (`resources`, `sequence`, `raw`). El texto `.script` es la fuente de verdad.
- Errores: `HTTPException` con `{detail}`; `/runs` rechazado por sanitize devuelve `{detail, line}` con 400.
- Corridas: `POST /api/runs` y luego `WS /api/ws/runs/{id}` (log en vivo). Ver `docs/API.md`.

## Qué toca cada tipo de cambio
| Cambio | Backend | Frontend |
|---|---|---|
| Campo/tipo nuevo de recurso | nada si el motor lo expone (`engine/schema.py` lo lee); subir sufijo de caché si cambia la forma | `ResourceForm.tsx` (genérico) o editor dedicado |
| Endpoint nuevo | `main.py`, función de worker en `engine/worker.py` si toca el motor, `docs/API.md` | llamada en `store.ts`, UI |
| Comando de secuencia nuevo | `script/parser.py` y `serializer.py` | `model/mission.ts` |
| Texto de UI | n/a | `frontend/src/i18n/es.ts` |
| Regla de seguridad de scripts | `engine/sanitize.py` + `tests/test_sanitize.py` | n/a |
