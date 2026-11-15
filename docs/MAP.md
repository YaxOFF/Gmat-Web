<!-- fuente: backend/app, frontend/src, shared | rev: 1ee8d23 -->
# Mapa

## Entradas
- `backend/app/main.py`: todas las rutas HTTP/WS y el `lifespan` (arranca/para el pool de workers).
- `backend/app/config.py`: variables de entorno y límites.
- `backend/app/engine/worker.py`: pool de procesos con `gmatpy`; `submit(fn, ...)`.
- `frontend/src/main.tsx` y `App.tsx`: shell (barra, pestañas, consola).
- `frontend/src/store.ts`: estado Zustand único.
- `PLAN.md`: fases, decisiones, avance y bitácora del port web. `PLAN-JUEGO.md`: lo mismo para el juego "Viaje a la Luna" (plan activo).

## Conceptos → archivo
| Concepto | Dónde vive |
|---|---|
| Correr un script (proceso por corrida, log en vivo, timeout, cancelar, limpieza `prune`) | `backend/app/engine/runner.py`, ruta `/api/runs` y WS en `main.py` |
| Solvers en vivo (eventos `solver` por iteración de Target/Optimize, tolerancias de los Achieve) | `backend/app/engine/solver.py` (`SolverLog.feed`, `tolerances`), llamado desde `runner._supervise`; pestaña `frontend/src/results/SolverPanel.tsx` (reusa `XYChart`/`Table` de `Results.tsx`), tipos `SolverEvent`/`SolverRun` en `model/results.ts`, `store.solvers`; pruebas `tests/test_solver.py` |
| Resultados (ReportFile ocultos por nave/XYPlot, lectura, `/results`, `/files`) | `backend/app/engine/results.py` (`inject`, `read`), rutas en `main.py`; pestaña `frontend/src/results/Results.tsx` (uPlot, tabla, traza en tierra SVG), tipos `model/results.ts`, `store.results` |
| Vista 3D (Cesium: Tierra offline NaturalEarthII, trayectorias, reloj/timeline, seguir nave, cámara inercial) | `frontend/src/results/View3D.tsx` (pestaña `view3d`, lazy en `App.tsx`), `results/cesiumBase.ts`, copia de assets en `frontend/vite.config.ts` |
| Juego: despegue (Atlas V 541 y plataforma en GLB, fuego y humo por partículas; `?screen=launch` salta a la escena) | `frontend/src/mission-architect/three/Launch3D.tsx`, modelo `frontend/public/models/atlas_v_541.glb` (nodos `AtlasV541`, `LaunchPlatform`, `*_Nozzle`); nave del crucero tras el despegue: `frontend/public/models/msl.glb` |
| Seguridad de scripts (prohibidos, rutas de salida) | `backend/app/engine/sanitize.py` |
| Script ↔ modelo JSON | `backend/app/script/parser.py`, `serializer.py`; tipos en `frontend/src/model/mission.ts`, `shared/mission.schema.json` |
| Excepciones del round-trip | `docs/EXCEPCIONES_ROUNDTRIP.md`, `backend/tests/test_script.py` |
| Esquemas de campos desde el motor (caché, proceso aislado) | `backend/app/engine/schema.py`, `frontend/src/model/schema.ts`; forma en `docs/API.md` |
| Conversión de estado orbital y de época | `worker.convert_state`/`convert_epoch`, rutas `/api/convert/state`, `/api/convert/epoch`; `store.convert` |
| Variables de entorno y límites | `backend/app/config.py`; tabla en `README.md` |
| Validar script sin correrlo | `worker.validate_script`, ruta `/api/script/validate` |
| Árbol de recursos (crear/renombrar/clonar/borrar; diálogo `AskDialog`) | `frontend/src/resources/ResourceTree.tsx`, `frontend/src/model/refs.ts` |
| Formulario de recurso | `frontend/src/resources/ResourceForm.tsx` (marco), `Field.tsx` (un campo), `value.ts` (`show`) |
| Editores dedicados Spacecraft/ForceModel/Propagator | `frontend/src/resources/Editors.tsx`; prueba LEO modelo = script a mano en `backend/tests/test_leo.py` |
| Árbol de secuencia (agregar, arrastrar/soltar, ↑/↓, comentar, borrar) | `frontend/src/mission/MissionTree.tsx`; rutas y `newCommand`/`toText` en `mission/commands.ts` |
| Formularios de comando (Propagate, Maneuver, FiniteBurn, Report, Toggle, asignación, Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For) y editor de línea | `frontend/src/mission/CommandForm.tsx`; `args` en `parser._args` (`SOLVER_CALL`, `COND`, `_opts`); prueba Hohmann modelo = sample en `backend/tests/test_hohmann_model.py` |
| Comando comentado (`disabled`) | `parser.COMMENTABLE`/`DISABLED`, `serializer._seq`; espejo en `commands.ts` (`canDisable`) |
| Parámetros calculados del motor y selector | `schema.engine_parameters`, ruta `/api/parameters`; `frontend/src/mission/ParamPicker.tsx`, `store.fetchParameters` |
| Sincronía editor de script ↔ modelo | `store.ts` (`editText`, `setMission`, contador `seq`) |
| Editor Monaco + resaltado GMAT + marcadores de error (`store.logs` con línea) | `frontend/src/editor/ScriptEditor.tsx`, `gmat.ts` |
| Ejemplos de GMAT | `backend/app/samples.py` (lee `GMAT_HOME/samples`) |
| Lote de samples y comparación con escritorio | `backend/app/batch.py` (`python -m app.batch` regenera `docs/COMPATIBILIDAD.md`); `backend/tests/test_desktop.py` (`pytest -m slow`) |
| Misiones propias con referencia de escritorio | `backend/tests/missions/` (`m1..m6.script`, `reference.json`, `make_reference.py` la regenera); `backend/tests/test_missions.py` (`pytest -m slow`) |
| Plantillas de misión (Viaje a la Luna, LEO, Hohmann a GEO, traza) y su asistente | `frontend/src/templates.ts` (scripts y límites), `TemplateDialog` en `frontend/src/Dialogs.tsx`, textos `es.templates`; lunar verificada contra escritorio en `backend/tests/missions/m7_viaje_luna.script` |
| Paleta de comandos (Ctrl+K), recorrido guiado, atajos | `Palette` y `Tour` en `frontend/src/Dialogs.tsx`; atajos y lista de acciones en `App.tsx`; `store.tourSeen` |
| Validación en vivo y errores ubicados en recurso/campo | `store.checkLater`, `store.issues`; `frontend/src/model/issues.ts` (`toIssues`, `locate`, `clean`); se muestran en `IssueChip` (`App.tsx`), `Field.tsx`, `ResourceForm.tsx`, `ResourceTree.tsx`, `ScriptEditor.tsx` |
| Deshacer/rehacer (historial de Monaco, también para formularios) | `gmat.history`, efecto `rev`/`load` de `frontend/src/editor/ScriptEditor.tsx` |
| Borrador autoguardado | `store.ts` (`readDraft`, `useApp.subscribe`), clave `gmatweb.draft` |
| Luna en resultados y vista lunar del 3D | `results.LUNA_CS`/`LUNA_COLS` (backend), `track` y `Globe` con `center` en `frontend/src/results/View3D.tsx` |
| Responsive (tablet, móvil solo visor) | `@media` al final de `frontend/src/App.module.css` |
| Textos de UI | `frontend/src/i18n/es.ts` |
| Guía de uso, agregar misiones, diagnóstico web → C++ original | `docs/GUIA.md` |

Símbolos: `grep` en `docs/SYMBOLS.tsv` (generar con `sh docs/docs.sh map`).
