<!-- fuente: backend/app, frontend/src/store.ts | rev: 078da86 -->
# Arquitectura

## Decisiones
- La física la calcula GMAT. El frontend nunca propaga ni convierte; pide al backend.
- El `.script` es la fuente de verdad; el modelo JSON se deriva con parser/serializer propios y es compatible con GMAT escritorio.
- El proceso FastAPI no importa `gmatpy`. Dos usos del motor: pool compartido (`worker.submit`, tareas cortas) y un proceso spawn por corrida (`runner.py`, con timeout, cancelación y log en vivo).
- Todo script pasa por `sanitize` antes de correr o validar: rechaza Python/MATLAB/System/funciones/`#Include`, reescribe rutas de salida, comenta visores GUI.
- Los esquemas de formularios salen del motor y se cachean en disco por versión.

## Flujo: correr un script
`store.run` → `POST /api/runs` (`sanitize` a carpeta temporal) → `runner._child` (proceso spawn: `LoadScript`, `RunScript`) → `_supervise` lee `gmat.log` y emite eventos → `WS /api/ws/runs/{id}` reenvía desde el inicio y luego en vivo → consola.

## Flujo: editar recursos
Formulario/árbol → `setMission` → `POST /api/script/serialize` → texto al editor. Editar texto → `editText` (debounce ~400 ms) → `POST /api/script/parse` → modelo.

## Convenciones
- Config solo por env (`config.py`), nada hardcodeado.
- Textos de UI en `frontend/src/i18n/es.ts`.
- Estilos: CSS modules + tokens `light-dark()` en `index.css`.
- Linter frontend: oxlint (no eslint).
- Pruebas backend con motor real y `TestClient`; archivo modelo: `tests/test_tools.py`.
- Conventional Commits; una fase por sesión (`PLAN.md`).
