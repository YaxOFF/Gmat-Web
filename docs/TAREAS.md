<!-- fuente: backend/app, frontend/src, backend/tests | rev: 078da86 -->
# Tareas

## Comandos
Requieren `GMAT_HOME` (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`).
- Correr todo: `./dev.ps1` (Windows) o `./dev.sh`. Backend `:8000`, frontend `:5173`.
- Pruebas backend: `cd backend; .venv/Scripts/python -m pytest` (usa el motor real, tarda).
- Frontend: `cd frontend; npm run lint; npm run build`. No hay runner de pruebas en el frontend.
- Backend a mano: `cd backend; .venv/Scripts/python -m uvicorn app.main:app --port 8000`.

## Endpoint nuevo
1. Si toca el motor: función de módulo en `backend/app/engine/worker.py` (corre dentro del worker, usa `gmat`).
2. Ruta en `backend/app/main.py` con `await worker.submit(fn, ...)`. Validar toda entrada que viaje a un script.
3. Prueba en `backend/tests/` y fila en `docs/API.md`.
4. Llamada en `frontend/src/store.ts`.

Modelo: `/api/convert/state` en `main.py` + `worker.convert_state` + `tests/test_tools.py`.
Verificar: `cd backend; .venv/Scripts/python -m pytest tests/test_tools.py`.

## Soportar un comando o sintaxis nueva del script
1. `backend/app/script/parser.py` y `serializer.py`.
2. Round-trip en `backend/tests/test_script.py` (162 samples). Si queda una excepción, anótala en `docs/EXCEPCIONES_ROUNDTRIP.md`.

Verificar: `pytest tests/test_script.py`.

## Regla nueva de sanitize
`backend/app/engine/sanitize.py` y caso en `backend/tests/test_sanitize.py` (no necesita motor).

## Componente o texto de UI
1. Texto en `frontend/src/i18n/es.ts`, nunca literal en el JSX.
2. Estado en `store.ts`; estilos en CSS modules junto al componente.

Modelo: `frontend/src/resources/ResourceTree.tsx`.
Verificar: `npm run lint; npm run build` y revisar en navegador sin errores de consola.

## Cerrar una fase
Protocolo de `PLAN.md`: Avance, Bitácora, commit + push, `sh docs/docs.sh stale`.
