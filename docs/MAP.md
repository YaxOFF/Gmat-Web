<!-- fuente: backend/app, frontend/src, shared | rev: ead1d00 -->
# Mapa

## Entradas
- `backend/app/main.py`: todas las rutas HTTP/WS y el `lifespan` (arranca/para el pool de workers).
- `backend/app/config.py`: variables de entorno y límites.
- `backend/app/engine/worker.py`: pool de procesos con `gmatpy`; `submit(fn, ...)`.
- `frontend/src/main.tsx` y `App.tsx`: shell (barra, pestañas, consola).
- `frontend/src/store.ts`: estado Zustand único.
- `PLAN.md`: fases, decisiones, avance y bitácora.

## Conceptos → archivo
| Concepto | Dónde vive |
|---|---|
| Correr un script (proceso por corrida, log en vivo, timeout, cancelar) | `backend/app/engine/runner.py`, ruta `/api/runs` y WS en `main.py` |
| Solvers en vivo (eventos `solver` por iteración de Target/Optimize, tolerancias de los Achieve) | `backend/app/engine/solver.py` (`SolverLog.feed`, `tolerances`), llamado desde `runner._supervise`; pestaña `frontend/src/results/SolverPanel.tsx` (reusa `XYChart`/`Table` de `Results.tsx`), tipos `SolverEvent`/`SolverRun` en `model/results.ts`, `store.solvers`; pruebas `tests/test_solver.py` |
| Resultados (ReportFile ocultos por nave/XYPlot, lectura, `/results`, `/files`) | `backend/app/engine/results.py` (`inject`, `read`), rutas en `main.py`; pestaña `frontend/src/results/Results.tsx` (uPlot, tabla, traza en tierra SVG), tipos `model/results.ts`, `store.results` |
| Vista 3D (Cesium: Tierra offline NaturalEarthII, trayectorias, reloj/timeline, seguir nave, cámara inercial) | `frontend/src/results/View3D.tsx` (pestaña `view3d`, lazy en `App.tsx`), `results/cesiumBase.ts`, copia de assets en `frontend/vite.config.ts` |
| Seguridad de scripts (prohibidos, rutas de salida) | `backend/app/engine/sanitize.py` |
| Script ↔ modelo JSON | `backend/app/script/parser.py`, `serializer.py`; tipos en `frontend/src/model/mission.ts`, `shared/mission.schema.json` |
| Excepciones del round-trip | `docs/EXCEPCIONES_ROUNDTRIP.md`, `backend/tests/test_script.py` |
| Esquemas de campos desde el motor (caché, proceso aislado) | `backend/app/engine/schema.py`, `frontend/src/model/schema.ts`; forma en `docs/API.md` |
| Conversión de estado orbital y de época | `worker.convert_state`/`convert_epoch`, rutas `/api/convert/state`, `/api/convert/epoch`; `store.convert` |
| Variables de entorno y límites | `backend/app/config.py`; tabla en `README.md` |
| Validar script sin correrlo | `worker.validate_script`, ruta `/api/script/validate` |
| Árbol de recursos (crear/renombrar/clonar/borrar) | `frontend/src/resources/ResourceTree.tsx`, `frontend/src/model/refs.ts` |
| Formulario de recurso | `frontend/src/resources/ResourceForm.tsx` (marco), `Field.tsx` (un campo), `value.ts` (`show`) |
| Editores dedicados Spacecraft/ForceModel/Propagator | `frontend/src/resources/Editors.tsx`; prueba LEO modelo = script a mano en `backend/tests/test_leo.py` |
| Árbol de secuencia (agregar, arrastrar/soltar, ↑/↓, comentar, borrar) | `frontend/src/mission/MissionTree.tsx`; rutas y `newCommand`/`toText` en `mission/commands.ts` |
| Formularios de comando (Propagate, Maneuver, FiniteBurn, Report, Toggle, asignación, Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For) y editor de línea | `frontend/src/mission/CommandForm.tsx`; `args` en `parser._args` (`SOLVER_CALL`, `COND`, `_opts`); prueba Hohmann modelo = sample en `backend/tests/test_hohmann_model.py` |
| Comando comentado (`disabled`) | `parser.COMMENTABLE`/`DISABLED`, `serializer._seq`; espejo en `commands.ts` (`canDisable`) |
| Parámetros calculados del motor y selector | `schema.engine_parameters`, ruta `/api/parameters`; `frontend/src/mission/ParamPicker.tsx`, `store.fetchParameters` |
| Sincronía editor de script ↔ modelo | `store.ts` (`editText`, `setMission`, contador `seq`) |
| Editor Monaco + resaltado GMAT | `frontend/src/editor/ScriptEditor.tsx`, `gmat.ts` |
| Ejemplos de GMAT | `backend/app/samples.py` (lee `GMAT_HOME/samples`) |
| Textos de UI | `frontend/src/i18n/es.ts` |

Símbolos: `grep` en `docs/SYMBOLS.tsv` (generar con `sh docs/docs.sh map`).
