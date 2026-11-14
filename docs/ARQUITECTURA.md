<!-- fuente: backend/app, frontend/src/store.ts | rev: a31cbd8 -->
# Arquitectura

## Decisiones
- La física la calcula GMAT. El frontend nunca propaga ni convierte; pide al backend.
- El `.script` es la fuente de verdad; el modelo JSON se deriva con parser/serializer propios y es compatible con GMAT escritorio.
- El proceso FastAPI no importa `gmatpy`. Todo proceso con motor es `spawn` y arranca con `worker._init`.
- Todo script pasa por `sanitize` antes de correr o validar: rechaza Python/MATLAB/System/funciones/`#Include`, reescribe rutas de salida, comenta visores GUI.
- Los esquemas de formularios salen del motor y se cachean en disco por versión.

## Tres formas de usar el motor
| Forma | Dónde | Para qué | Si el motor se cae |
|---|---|---|---|
| Pool compartido | `worker.submit` (`GMAT_WEB_WORKERS` procesos) | tareas cortas y seguras: versión, lista de tipos, conversión de estado | el pool queda roto hasta reiniciar |
| Proceso aislado | `schema._isolated` (uno por llamada) | lo que puede tumbar el motor: campos de un tipo, validar un script | devuelve `None` |
| Proceso por corrida | `runner.create` + `_supervise` | correr scripts con timeout, cancelación y log en vivo | evento `error` con el código de salida |

## Flujo: correr un script
`store.run` → `POST /api/runs` → `runner.create`: `sanitize` a una carpeta `run-*`, proceso `_child` (`LoadScript`, `RunScript`) → `_supervise` lee `gmat.log` cada 0.2 s y guarda eventos en `Run.events` → `WS /api/ws/runs/{id}` reenvía desde el primer evento y sigue en vivo hasta `done`/`error` → consola. Varios clientes pueden ver la misma corrida.

## Flujo: validar sin correr
`store.validate` → `POST /api/script/validate` → `sanitize` a una carpeta `val-*` → `_isolated(worker.validate_script)` (solo `LoadScript`) → se lee el log y se devuelven las líneas de nivel error/warning.

## Flujo: editar recursos
Formulario/árbol → `setMission` (cambia el modelo ya) → `POST /api/script/serialize` → texto al editor. Editar texto → `editText` (debounce 400 ms) → `POST /api/script/parse` → modelo. Parse y serialize son Python puro: no usan el motor.

## Flujo: esquemas
`ResourceTree` pide `GET /api/schema` una vez; `ResourceForm` (con `Editors.tsx` para Spacecraft/ForceModel/Propagator) pide `GET /api/schema/{type}` la primera vez que se abre un tipo. El backend responde de la caché en disco o le pregunta al motor (`engine_types` por el pool, `engine_fields` aislado) y guarda. `CommandForm`/`ParamPicker` piden `GET /api/parameters` la primera vez que se abre el selector (`engine_parameters` aislado, misma caché en disco con clave `parameters`).

## Convenciones
- Config solo por env (`config.py`), nada hardcodeado.
- Textos de UI en `frontend/src/i18n/es.ts`.
- Estilos: CSS modules + tokens `light-dark()` en `index.css`.
- Linter frontend: oxlint (no eslint).
- Pruebas backend con motor real y `TestClient`; archivo modelo: `tests/test_tools.py`.
- Conventional Commits; una fase por sesión (`PLAN.md`).
