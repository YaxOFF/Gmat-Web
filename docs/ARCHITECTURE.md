<!-- fuente: backend/app, frontend/src/store.ts | rev: 1ee8d23 -->
# Architecture

## Decisions
- GMAT computes the physics. The frontend never propagates or converts; it asks the backend.
- The `.script` is the source of truth; the JSON model is derived with our own parser/serializer and is compatible with desktop GMAT.
- The FastAPI process does not import `gmatpy`. Every process with the engine is `spawn` and starts with `worker._init`.
- Every script goes through `sanitize` before running or validating: it rejects Python/MATLAB/System/functions/`#Include`, rewrites output paths, and comments out GUI viewers.
- Form schemas come from the engine and are cached on disk per version.

## Three ways to use the engine
| Way | Where | What for | If the engine crashes |
|---|---|---|---|
| Shared pool | `worker.submit` (`GMAT_WEB_WORKERS` processes) | short, safe tasks: version, list of types, state conversion | the pool stays broken until restart |
| Isolated process | `schema._isolated` (one per call) | what can bring the engine down: fields of a type, validating a script | returns `None` |
| Process per run | `runner.create` + `_supervise` | running scripts with timeout, cancellation and live log | `error` event with the exit code |

## Flow: running a script
`store.run` → `POST /api/runs` → `runner.create`: `prune` (deletes runs finished more than `GMAT_WEB_RUN_KEEP` ago), `sanitize` into a `run-*` folder, `_child` process (`LoadScript`, `RunScript`) → `_supervise` reads `gmat.log` every 0.2 s and stores events in `Run.events` → `WS /api/ws/runs/{id}` replays from the first event and keeps streaming live until `done`/`error` → console. Before running, `results.inject` adds hidden `ReportFile`s (`gmatweb_*.csv`) right before `BeginMissionSequence` and `_supervise` subtracts those lines from the ones GMAT cites; `GET /runs/{id}/results` reads them with `results.read`. `_supervise` also passes each line to `solver.SolverLog`, which emits `solver` events (Solver tab, `results/SolverPanel.tsx`, `store.solvers`). Several clients can watch the same run.

## Flow: validating without running
`store.validate` → `POST /api/script/validate` → `sanitize` into a `val-*` folder → `_isolated(worker.validate_script)` (only `LoadScript`) → the log is read and the error/warning level lines are returned.

## Flow: live validation
Every text change (`editText`, `loadText`, `setMission`) arms `checkLater` in `store.ts`: after 1.2 s without changes it requests `POST /api/script/validate` and stores `issues` (`model/issues.ts`: joins the GMAT message with the cited line, locates it in resource and field, and translates it if it is in `es.issues.known`). `issues` feeds the bar indicator, the Monaco markers, the notice next to the field (`Field.tsx`) and the mark in the resource tree.

## Flow: undo
The history is Monaco's. A change made from forms or trees enters the editor with `executeEdits` (`ScriptEditor.tsx`), so Undo reverts it just like typed text; loading another document (`doc.load`) uses `setValue` and resets the history.

## Flow: editing resources
Form/tree → `setMission` (changes the model immediately) → `POST /api/script/serialize` → text to the editor. Editing text → `editText` (400 ms debounce) → `POST /api/script/parse` → model. Parse and serialize are pure Python: they do not use the engine.

## Flow: schemas
`ResourceTree` requests `GET /api/schema` once; `ResourceForm` (with `Editors.tsx` for Spacecraft/ForceModel/Propagator) requests `GET /api/schema/{type}` the first time a type is opened. The backend answers from the disk cache or asks the engine (`engine_types` through the pool, `engine_fields` isolated) and stores it. `CommandForm` (per-command forms in `FORMS`, no backend calls except the line editor) and `ParamPicker` request `GET /api/parameters` the first time the picker is opened (`engine_parameters` isolated, same disk cache with key `parameters`).

## Conventions
- Config only through env (`config.py`), nothing hardcoded.
- UI text in `frontend/src/i18n/es.ts`.
- Styles: CSS modules + `light-dark()` tokens in `index.css`.
- Frontend linter: oxlint (not eslint).
- Backend tests with the real engine and `TestClient`; model file: `tests/test_tools.py`. Slow tests with `@pytest.mark.slow` (excluded by `addopts`; `pytest -m slow`). `app/batch.py` is a development tool: the API does not import it.
- Conventional Commits; one phase per session (`PLAN.md`).
