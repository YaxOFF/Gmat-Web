<!-- fuente: backend/app, frontend/src, shared | rev: 1ee8d23 -->
# Map

## Entry points
- `backend/app/main.py`: all HTTP/WS routes and the `lifespan` (starts/stops the worker pool).
- `backend/app/config.py`: environment variables and limits.
- `backend/app/engine/worker.py`: process pool with `gmatpy`; `submit(fn, ...)`.
- `frontend/src/main.tsx` and `App.tsx`: shell (bar, tabs, console).
- `frontend/src/store.ts`: single Zustand state.
- `PLAN.md`: phases, decisions, progress and log of the web port. `PLAN-JUEGO.md`: the same for the "Viaje a la Luna" game (active plan).

## Concepts → file
| Concept | Where it lives |
|---|---|
| Running a script (process per run, live log, timeout, cancel, `prune` cleanup) | `backend/app/engine/runner.py`, `/api/runs` route and WS in `main.py` |
| Live solvers (`solver` events per Target/Optimize iteration, Achieve tolerances) | `backend/app/engine/solver.py` (`SolverLog.feed`, `tolerances`), called from `runner._supervise`; tab `frontend/src/results/SolverPanel.tsx` (reuses `XYChart`/`Table` from `Results.tsx`), types `SolverEvent`/`SolverRun` in `model/results.ts`, `store.solvers`; tests `tests/test_solver.py` |
| Results (hidden ReportFiles per ship/XYPlot, reading, `/results`, `/files`) | `backend/app/engine/results.py` (`inject`, `read`), routes in `main.py`; tab `frontend/src/results/Results.tsx` (uPlot, table, SVG ground track), types `model/results.ts`, `store.results` |
| 3D view (Cesium: offline NaturalEarthII Earth, trajectories, clock/timeline, follow ship, inertial camera) | `frontend/src/results/View3D.tsx` (tab `view3d`, lazy in `App.tsx`), `results/cesiumBase.ts`, asset copy in `frontend/vite.config.ts` |
| Game: launch (Atlas V 541 and pad in GLB, particle fire and smoke; `?screen=launch` jumps to the scene) | `frontend/src/mission-architect/three/Launch3D.tsx`, model `frontend/public/models/atlas_v_541.glb` (nodes `AtlasV541`, `LaunchPlatform`, `*_Nozzle`); cruise craft after launch: `frontend/public/models/msl.glb` |
| Script security (forbidden, output paths) | `backend/app/engine/sanitize.py` |
| Script ↔ JSON model | `backend/app/script/parser.py`, `serializer.py`; types in `frontend/src/model/mission.ts`, `shared/mission.schema.json` |
| Round-trip exceptions | `docs/ROUNDTRIP_EXCEPTIONS.md`, `backend/tests/test_script.py` |
| Field schemas from the engine (cache, isolated process) | `backend/app/engine/schema.py`, `frontend/src/model/schema.ts`; shape in `docs/API.md` |
| Orbital state and epoch conversion | `worker.convert_state`/`convert_epoch`, routes `/api/convert/state`, `/api/convert/epoch`; `store.convert` |
| Environment variables and limits | `backend/app/config.py`; table in `README.md` |
| Validating a script without running it | `worker.validate_script`, route `/api/script/validate` |
| Resource tree (create/rename/clone/delete; `AskDialog` dialog) | `frontend/src/resources/ResourceTree.tsx`, `frontend/src/model/refs.ts` |
| Resource form | `frontend/src/resources/ResourceForm.tsx` (frame), `Field.tsx` (one field), `value.ts` (`show`) |
| Dedicated Spacecraft/ForceModel/Propagator editors | `frontend/src/resources/Editors.tsx`; LEO model test = hand-written script in `backend/tests/test_leo.py` |
| Sequence tree (add, drag/drop, ↑/↓, comment out, delete) | `frontend/src/mission/MissionTree.tsx`; paths and `newCommand`/`toText` in `mission/commands.ts` |
| Command forms (Propagate, Maneuver, FiniteBurn, Report, Toggle, assignment, Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For) and line editor | `frontend/src/mission/CommandForm.tsx`; `args` in `parser._args` (`SOLVER_CALL`, `COND`, `_opts`); Hohmann model test = sample in `backend/tests/test_hohmann_model.py` |
| Commented-out command (`disabled`) | `parser.COMMENTABLE`/`DISABLED`, `serializer._seq`; mirror in `commands.ts` (`canDisable`) |
| Engine calculated parameters and picker | `schema.engine_parameters`, route `/api/parameters`; `frontend/src/mission/ParamPicker.tsx`, `store.fetchParameters` |
| Script editor ↔ model sync | `store.ts` (`editText`, `setMission`, `seq` counter) |
| Monaco editor + GMAT highlighting + error markers (`store.logs` with line) | `frontend/src/editor/ScriptEditor.tsx`, `gmat.ts` |
| GMAT samples | `backend/app/samples.py` (reads `GMAT_HOME/samples`) |
| Sample batch and comparison with desktop | `backend/app/batch.py` (`python -m app.batch` regenerates `docs/COMPATIBILITY.md`); `backend/tests/test_desktop.py` (`pytest -m slow`) |
| Own missions with desktop reference | `backend/tests/missions/` (`m1..m6.script`, `reference.json`, `make_reference.py` regenerates it); `backend/tests/test_missions.py` (`pytest -m slow`) |
| Mission templates (Viaje a la Luna, LEO, Hohmann to GEO, ground track) and their wizard | `frontend/src/templates.ts` (scripts and limits), `TemplateDialog` in `frontend/src/Dialogs.tsx`, text `es.templates`; lunar one verified against desktop in `backend/tests/missions/m7_viaje_luna.script` |
| Command palette (Ctrl+K), guided tour, shortcuts | `Palette` and `Tour` in `frontend/src/Dialogs.tsx`; shortcuts and action list in `App.tsx`; `store.tourSeen` |
| Live validation and errors located in resource/field | `store.checkLater`, `store.issues`; `frontend/src/model/issues.ts` (`toIssues`, `locate`, `clean`); shown in `IssueChip` (`App.tsx`), `Field.tsx`, `ResourceForm.tsx`, `ResourceTree.tsx`, `ScriptEditor.tsx` |
| Undo/redo (Monaco history, also for forms) | `gmat.history`, `rev`/`load` effect of `frontend/src/editor/ScriptEditor.tsx` |
| Autosaved draft | `store.ts` (`readDraft`, `useApp.subscribe`), key `gmatweb.draft` |
| Moon in results and lunar view of the 3D | `results.LUNA_CS`/`LUNA_COLS` (backend), `track` and `Globe` with `center` in `frontend/src/results/View3D.tsx` |
| Responsive (tablet, mobile viewer only) | `@media` at the end of `frontend/src/App.module.css` |
| UI text | `frontend/src/i18n/es.ts` |
| Usage guide, adding missions, web → original C++ diagnosis | `docs/GUIDE.md` |
| Real Moon data (globe, polar map, crater relief) and how to regenerate it | `tools/moon/build_moon.py`, `tools/moon/README.md`; output in `frontend/public/moon/`; used by `realMoon` (`mission-architect/three/stage.ts`), `Rover3D.tsx` (`loadDem`, `demHeight`), `ui/Mapping.tsx`; crater lat/lon in `mission-architect/data/catalog.ts` (`POLE_MAP_DEG`) |
| Mars test view ("Try Mars" on the title: real globe + free rover on real sites) and its data | `mission-architect/ui/MarsTest.tsx`, sites `data/mars.ts`, rover world (`World`, `MOON`, `MARS`: DEM folder, ground textures `ground`/`gain`, sky) in `three/world.ts`; data from `tools/mars/build_mars.py` (`tools/mars/README.md`) into `frontend/public/mars/` |
| Rover drive: terrain beyond the playable area, permanent shadow, rock collisions, drilling | `mission-architect/three/Rover3D.tsx` (outer terrain ring, `permanentShadow`, `drillGround`, drill cam POV); rocks in `three/rocks.ts` (base `RockField`: placement, visible `pts`, `hits`, `bump`, `top`; `MoonRocks`/`MarsRocks` only change the look; chosen by `World.rocks`); Curiosity rig (suspension, arm IK `armRig`, `foot`, `drillPoint`/`drillContact`) in `three/curiosity.ts`; x-ray drill cutaway in `three/xray.ts` (`makeXray`); overlay `.rv-xray*` in `mission-architect/styles.css` |

Symbols: `grep` in `docs/SYMBOLS.tsv` (generate with `sh docs/docs.sh map`).
