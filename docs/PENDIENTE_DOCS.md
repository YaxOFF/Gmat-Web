<!-- fuente: docs | rev: ee1c08e -->
# Pendiente de documentación

Tarea para una sesión con un modelo más capaz. Meta: cerrar los huecos de `docs/` leyendo el código real. Reglas: no inventar (lo no confirmado va como `[TODO: ...]`), máximo ~150 líneas por doc, un hecho en un solo doc, sin números de línea, actualizar el sello `<!-- fuente | rev -->` de cada doc tocado con `git rev-parse --short HEAD`. Al terminar: `sh docs/docs.sh map`, `sh docs/docs.sh stale` (debe quedar vacío), commit `docs: ...` y push. Luego borrar este archivo.

## 1. Leer a fondo y completar `docs/GOTCHAS.md` y `docs/ARQUITECTURA.md`
Los gotchas actuales salen de `PLAN.md` (Bitácora), del reporte de un agente y de firmas. Leer completos y buscar trampas reales:
- `backend/app/engine/runner.py`: `_supervise` (timeout, cancelación, lectura de `gmat.log`, limpieza de carpetas), dict `runs` que nunca se limpia, `HIDDEN`, códigos de salida.
- `backend/app/engine/sanitize.py`: lista completa de reglas, falsos positivos/negativos de `FORBIDDEN`, `GUI_ONLY`, `OUTPUT_FIELDS`, reescritura de rutas.
- `backend/app/engine/schema.py`: caché, `_lock`, `_isolated`, `ENUM_CANDIDATES`, qué pasa con tipos que fallan.
- `backend/app/engine/worker.py`: `convert_state`, `validate_script`, `snapshot`, timeouts de `submit`.
- `backend/app/script/parser.py` y `serializer.py`: formato estable, qué va a `raw`, orden de campos.
- `frontend/src/store.ts`: `editText`, `setMission`, `loadText`, `run`, WebSocket, debounce, manejo de errores.
- `frontend/src/model/refs.ts`, `resources/ResourceTree.tsx`, `resources/ResourceForm.tsx`: tipos de campo soportados, combo de referencias, botón de default, categorías del árbol.
- Corregir cualquier afirmación de los docs actuales que el código desmienta.

## 2. Verificar los comandos de `docs/TAREAS.md`
Con `GMAT_HOME=C:\Users\Yaxon\Downloads\gmat-win-R2026a`:
- `cd backend; .venv/Scripts/python -m pytest` (anotar duración y resultado esperado: última vez 315 passed, 46 skipped, 1 xfailed).
- `cd frontend; npm run lint; npm run build`.
- `./dev.ps1` levanta ambos y `GET /api/health` responde `ok`.
- Cualquier comando que falle va a `GOTCHAS.md` con su causa.

## 3. Variables de entorno
Faltan en la tabla de `README.md` (están en `backend/app/config.py`): `GMAT_WEB_MAX_RUNS` (2), `GMAT_WEB_RUN_TIMEOUT` (300), `GMAT_WEB_MAX_SCRIPT_BYTES` (524288), `GMAT_WEB_RUNS` (carpeta de corridas, por defecto temp). Agregarlas con su uso. Si quedan más de 8 variables con matices, crear `docs/CONFIG.md` y enlazar desde el README en vez de duplicar.

## 4. Datos que `API.md` y `SISTEMA.md` afirman sin verificar
- Formato exacto de los eventos del WebSocket (`log`, `progress`, `done`, `error`): campos reales según `runner.py`. Hoy `progress` y `done` están sin detallar.
- Forma de la respuesta de `GET /api/schema` y `/api/schema/{type}` (campos de `FieldSchema` en `frontend/src/model/schema.ts`).
- Si `/ws/...` del proxy de Vite se usa realmente o solo `/api/ws/...`.

## 5. Dejar listo para fases siguientes
- Fase 4b (editores dedicados) y 5-12: al cerrar cada una, `sh docs/docs.sh stale` y actualizar `MAP.md`, `TAREAS.md`, `API.md`.
- Fase 9 (Docker): crear `DEPLOY.md` (solo lo no obvio: tarball de GMAT con sha256, `GMAT_HOME=/opt/gmat`, nginx, `.env`).
