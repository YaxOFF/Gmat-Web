<!-- fuente: backend/app, frontend/src, shared | rev: 4d753f5 -->
# Map

## Entry points
- `backend/app/main.py`: all HTTP/WS routes and the `lifespan` (starts/stops the worker pool).
- `backend/app/config.py`: environment variables and limits.
- `backend/app/engine/worker.py`: process pool with `gmatpy`; `submit(fn, ...)`.
- `frontend/src/main.tsx` and `App.tsx`: shell (bar, tabs, console).
- `frontend/src/store.ts`: single Zustand state.
- `PLAN.md`: phases, decisions, progress and log.

## Concepts → file
| Concept | Where it lives |
|---|---|
| Running a script (process per run, live log, timeout, cancel, `prune` cleanup) | `backend/app/engine/runner.py`, `/api/runs` route and WS in `main.py` |
| Live solvers (`solver` events per Target/Optimize iteration, Achieve tolerances) | `backend/app/engine/solver.py` (`SolverLog.feed`, `tolerances`), called from `runner._supervise`; tab `frontend/src/results/SolverPanel.tsx` (reuses `XYChart`/`Table` from `Results.tsx`), types `SolverEvent`/`SolverRun` in `model/results.ts`, `store.solvers`; tests `tests/test_solver.py` |
| Results (hidden ReportFiles per ship/XYPlot, reading, `/results`, `/files`) | `backend/app/engine/results.py` (`inject`, `read`), routes in `main.py`; tab `frontend/src/results/Results.tsx` (uPlot, table, SVG ground track), types `model/results.ts`, `store.results` |
| 3D view (Cesium: offline NaturalEarthII Earth, trajectories, clock/timeline, follow ship, inertial camera) | `frontend/src/results/View3D.tsx` (tab `view3d`, lazy in `App.tsx`), `results/cesiumBase.ts`, asset copy in `frontend/vite.config.ts` |
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
| UI text | `frontend/src/i18n/es.ts` |

Symbols: `grep` in `docs/SYMBOLS.tsv` (generate with `sh docs/docs.sh map`).
