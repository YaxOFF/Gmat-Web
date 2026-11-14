<!-- fuente: backend/app, frontend/src, backend/tests | rev: 136b077 -->
# Tareas

## Comandos
Requieren `GMAT_HOME` (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`).
- Correr todo: `./dev.ps1` (Windows) o `./dev.sh`. Backend `:8000`, frontend `:5173`. Listo cuando `GET http://127.0.0.1:8000/api/health` da `status: "ok"`. Antes, confirmar que los dos puertos están libres (`docs/GOTCHAS.md`, Entorno de desarrollo).
- Pruebas backend: `cd backend; .venv/Scripts/python -m pytest` (motor real, ~30 s). Esperado: `322 passed, 46 skipped, 1 xfailed` y un aviso de Starlette.
- Frontend: `cd frontend; npm run lint; npm run build` (~2 s). Lint sin salida; build avisa de un chunk mayor a 500 kB (Monaco). No hay runner de pruebas en el frontend.
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

## Formulario de comando nuevo
1. `args` en `parser._args` (devolver `{}` si la sintaxis no encaja) + caso en `test_command_args_and_disabled` o `test_solver_and_control_args`.
2. `toText` y tipo en `frontend/src/mission/commands.ts`; default en `newCommand`; entrada en `MENU`.
3. Componente en `FORMS` de `CommandForm.tsx`; textos en `es.mission`.

Modelo: `PropagateForm`. Verificar: `pytest tests/test_script.py` y `npm run lint; npm run build`.

## Regla nueva de sanitize
`backend/app/engine/sanitize.py` y caso en `backend/tests/test_sanitize.py` (no necesita motor).

## Componente o texto de UI
1. Texto en `frontend/src/i18n/es.ts`, nunca literal en el JSX.
2. Estado en `store.ts`; estilos en CSS modules junto al componente.

Modelo: `frontend/src/resources/ResourceTree.tsx`.
Verificar: `npm run lint; npm run build` y revisar en navegador sin errores de consola.

## Cerrar una fase
Protocolo de `PLAN.md`: Avance, Bitácora, commit + push. Luego `sh docs/docs.sh stale` y actualizar lo que liste (casi siempre `MAP.md`, `TAREAS.md`, `API.md`), con el sello `rev` nuevo, y `sh docs/docs.sh map`.

Fase 9 (Docker): crear `docs/DEPLOY.md` solo con lo no obvio (tarball de GMAT con sha256, `GMAT_HOME=/opt/gmat`, nginx, `.env`).
