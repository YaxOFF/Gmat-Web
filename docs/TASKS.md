<!-- fuente: backend/app, frontend/src, backend/tests | rev: e76b7b9 -->
# Tasks

## Commands
They require `GMAT_HOME` (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`).
- Run everything: `./dev.ps1` (Windows) or `./dev.sh`. Backend `:8000`, frontend `:5173`. Ready when `GET http://127.0.0.1:8000/api/health` gives `status: "ok"`. Beforehand, confirm that both ports are free (`docs/GOTCHAS.md`, Development environment).
- Backend tests: `cd backend; .venv/Scripts/python -m pytest` (real engine, ~30 s). Expected: `351 passed, 45 skipped, 11 deselected, 1 xfailed` (~85 s) and a Starlette warning. The `slow` ones (web vs desktop: Hohmann, Yukon, Mars B-plane, batch and the 7 own missions) run separately: `pytest -m slow` (~70 s, `11 passed`).
- Sample batch: `cd backend; .venv/Scripts/python -m app.batch` (162 samples from root and subfolders, several minutes, 4 in parallel) rewrites `docs/COMPATIBILITY.md`. Run it after touching sanitize, results, solver or runner and check that the `ok` count does not drop (7c2: 77 of 88 in root, 118 of 162 in total).
- Frontend: `cd frontend; npm run lint; npm run build` (~2 s). Lint with no output; build warns about chunks larger than 500 kB (Monaco and Cesium, both lazy-loaded). There is no test runner in the frontend. Solvers: `pytest tests/test_solver.py` (Hohmann converges, low MaximumIterations does not converge, Yukon).
- Backend by hand: `cd backend; .venv/Scripts/python -m uvicorn app.main:app --port 8000`.

## New endpoint
1. If it touches the engine: module function in `backend/app/engine/worker.py` (runs inside the worker, uses `gmat`).
2. Route in `backend/app/main.py` with `await worker.submit(fn, ...)`. Validate every input that travels into a script.
3. Test in `backend/tests/` and row in `docs/API.md`.
4. Call in `frontend/src/store.ts`.

Model: `/api/convert/state` in `main.py` + `worker.convert_state` + `tests/test_tools.py`.
Verify: `cd backend; .venv/Scripts/python -m pytest tests/test_tools.py`.

## Supporting a new script command or syntax
1. `backend/app/script/parser.py` and `serializer.py`.
2. Round-trip in `backend/tests/test_script.py` (162 samples). If an exception remains, note it in `docs/ROUNDTRIP_EXCEPTIONS.md`.

Verify: `pytest tests/test_script.py`.

## New command form
1. `args` in `parser._args` (return `{}` if the syntax does not fit) + case in `test_command_args_and_disabled` or `test_solver_and_control_args`.
2. `toText` and type in `frontend/src/mission/commands.ts`; default in `newCommand`; entry in `MENU`.
3. Component in `FORMS` of `CommandForm.tsx`; text in `es.mission`.

Model: `PropagateForm`. Verify: `pytest tests/test_script.py` and `npm run lint; npm run build`.

## New mission template
1. Function that builds the script (ASCII) and entry in `TEMPLATES` of `frontend/src/templates.ts`, with `min`/`max` per input.
2. Title, description and labels in `es.templates.items`.
3. Test the default values and the extremes against the engine before fixing the limits (procedure in `docs/QA.md`, Phase 8).

Model: `luna` in `templates.ts`. Verify: `npm run lint; npm run build` and create it from Templates in the browser.

## New sanitize rule
`backend/app/engine/sanitize.py` and case in `backend/tests/test_sanitize.py` (does not need the engine).

## UI component or text
1. Text in `frontend/src/i18n/en.ts` (and the same key in `es.ts`), never literal in the JSX.
2. State in `store.ts`; styles in CSS modules next to the component.

Model: `frontend/src/resources/ResourceTree.tsx`.
Verify: `npm run lint; npm run build` and check in the browser with no console errors.

## Closing a phase
`PLAN.md` protocol: Progress, Log, commit + push. Then `sh docs/docs.sh stale` and update what it lists (almost always `MAP.md`, `TASKS.md`, `API.md`), with the new `rev` stamp, and `sh docs/docs.sh map`.

Phase 9 (Docker): create `docs/DEPLOY.md` with only the non-obvious (GMAT tarball with sha256, `GMAT_HOME=/opt/gmat`, nginx, `.env`).
