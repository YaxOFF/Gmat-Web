# PLAN — GMAT Web: web port of the General Mission Analysis Tool

Web port of GMAT R2026a (NASA, Apache 2.0) for space mission design: create spacecraft,
propagators, maneuvers and mission sequences, run them with the **real GMAT engine** and see the
results (3D, ground track, plots, reports) in a modern, intuitive interface.
Key constraint: results must be identical to desktop GMAT, because the computation is done by
GMAT itself (`gmatpy`); the web app does not reimplement physics. Unofficial project: no NASA logos or branding.

Local references:
- GMAT Windows install (engine + `bin/gmatpy` + 162 `samples/*.script`): `C:\Users\Yaxon\Downloads\gmat-win-R2026a`
- R2026a C++ source code (to look up fields, defaults, behavior of the original GUI): `C:\Users\Yaxon\Downloads\GMAT-src`
  (`src/base` engine, `src/gui` wxWidgets GUI: `resource/`, `mission/`, `spacecraft/`, `propagator/`, `burn/`, `solver/`, `subscriber/`)
- API guide: `gmat-win-R2026a/api/` and `docs/` in the install.

## Decisions made

| Topic | Decision |
|---|---|
| Engine | **Python + FastAPI** backend that uses `gmatpy` (official GMAT API). Tested: `gmatpy` R2026a loads and runs `Ex_HohmannTransfer.script` with Python 3.14 on Windows. |
| Run isolation | `gmatpy` is a global per-process singleton: every run and every heavy query goes to a **worker process** (`multiprocessing`, spawn) with a timeout. The FastAPI process never imports `gmatpy`. |
| GMAT location | `GMAT_HOME` variable (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`; Docker: `/opt/gmat`). Nothing hardcoded. |
| Source of truth | The **GMAT script (`.script`)**. The app works with a JSON model (resources + sequence) that is converted to/from script with our own Python parser/serializer, validated against `gmatpy`. Open/save `.script` files compatible with desktop GMAT. |
| Forms | Generated from metadata provided by the engine itself (`GetParameterCount/Text/Type`, default values of a freshly created object), cached in `/api/schema`. Hand-written editors only where the UX calls for it (Spacecraft orbital state, stop conditions, Target/Optimize). |
| Frontend | **React + Vite + TypeScript**. 3D with **CesiumJS** (no Cesium ion: offline/OSM imagery), plots with **uPlot**, script editor with **Monaco** + GMAT highlighting. State with Zustand. Styles with CSS modules + tokens (light/dark theme). |
| Communication | REST for model/schemas; **WebSocket** for runs (live log, solver progress, end with results). |
| Results | The worker injects hidden `ReportFile`s per spacecraft (epoch, X/Y/Z, VX/VY/VZ in EarthMJ2000Eq; lat/lon for ground track) and reads the user's `ReportFile`/`XYPlot`. Output files in a temporary folder per run; never user paths. |
| v1 scope | Mission design core: resources (Spacecraft, tanks/thrusters, ForceModel/Propagator, ImpulsiveBurn/FiniteBurn, CoordinateSystem, solvers, variables/arrays, subscribers) + sequence (Propagate, Maneuver, Begin/EndFiniteBurn, Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For, Report, Toggle, assignments) + views. Plugins (estimation, events, formations, CSALT) = optional phases. |
| Security (VPS) | Scripts can write files and call Python/MATLAB/the system: the backend **rejects** `CallPythonFunction`, `CallMatlabFunction`, `SystemCommand`/`System` and external functions, and **rewrites** every output path (`Filename`, `OutputFile`…) to the run's temporary folder. Limits on time, concurrent runs and script size. No accounts in v1. |
| Deploy | `docker-compose.yml`: `api` (Python 3.12 + `gmat-ubuntu-x64-R2026a.tar.gz` downloaded at build time with a pinned sha256) + `web` (nginx with the Vite build, proxy `/api` and `/ws`). Everything via `.env` (skill `dockerizar-portainer`). Also runs locally with one command. |
| UI language | Spanish by default, strings in a single file (`src/i18n/es.ts`) so English can be added. GMAT field names are shown as-is + a readable label. |
| License | Own code MIT; `NOTICE` with attribution to GMAT (Apache 2.0). No assets or icons are copied from the GMAT GUI. |
| Git | New repo `D:\YaxonFolder\Github\Gmat-Web`, `origin` = `https://github.com/YaxOFF/Gmat-Web.git`, branch `main`. Commit + push when closing each phase. |

## Target formats (all phases follow them)

**Mission model (JSON)** — `shared/mission.schema.json`, mirror TS types in `frontend/src/model/`:
```jsonc
{
  "resources": [ { "type": "Spacecraft", "name": "Sat", "fields": { "SMA": 7000, "DisplayStateType": "Keplerian" }, "comments": [] } ],
  "sequence":  [ { "cmd": "Propagate", "label": "Prop to Apoapsis", "text": "DefaultProp(Sat) {Sat.Apoapsis}", "args": { }, "children": [] } ],
  "raw": [ ]   // lines the parser does not understand: kept as they are, never lost
}
```
- Fields with the exact GMAT name. Values: number, string, bool, list or reference (`{"ref": "Sat"}`).
- `children` only in block commands (Target, Optimize, If, While, For).

**Backend API** (prefix `/api`):
- `GET /health` → GMAT version, `GMAT_HOME`, free workers.
- `GET /samples`, `GET /samples/{id}` → sample scripts from the install.
- `POST /script/parse` (text → model), `POST /script/serialize` (model → text), `POST /script/validate` (loads in worker, returns errors with line).
- `GET /schema` (creatable types), `GET /schema/{type}` (fields, type, default, enum, units).
- `POST /convert/state` (Cartesian ↔ Keplerian ↔ ModKeplerian ↔ Spherical… via the engine).
- `POST /runs` → `{runId}`; `WS /ws/runs/{runId}` → events `log`, `progress`, `solver`, `done{results}`, `error`.
- `GET /runs/{runId}/results`, `GET /runs/{runId}/files/{name}`.

## Phases

One phase per session. Each phase leaves the app working.

### Phase 0 — Prepare ✅
New repo, `origin`, this `PLAN.md` and `CLAUDE.md`.

### Phase 1 — Backend + frontend skeleton
Goal: monorepo that starts locally with one command and shows the engine status.
- `backend/` (FastAPI, `pyproject.toml`, `uv` or `pip`): `app/main.py`, `app/config.py` (`GMAT_HOME`, limits), `app/engine/worker.py` (pool of spawn processes that do `import gmatpy` with the `api_startup_file`), `GET /api/health` (GMAT version via worker).
- `frontend/` (Vite + React + TS): app shell — top bar (New/Open/Save/Run), left panel (Resources / Mission in tabs), central area with tabs (Editor, 3D, Plots, Reports), bottom panel (Console). Light/dark design tokens. Engine status indicator from `/api/health`.
- `dev.ps1` / `dev.sh`: starts backend and frontend (Vite proxy → `:8000`). `README.md` with requirements.
- `.gitignore`, `NOTICE`, `LICENSE`.
- Verify: `pytest backend` (health with the real engine), `npm run build` + `npm run lint`, open the app and see "GMAT R2026a ready".

### Phase 2 — Run scripts (editor + console)
Goal: paste/open a `.script`, run it with the engine and see the log live.
- Backend: `POST /runs` + `WS /ws/runs/{id}`; worker loads the script, runs it, captures the GMAT log (`gmat.UseLogFile`/MessageInterface) and emits it; timeout and cancellation. Security sanitizing (forbidden commands, output path rewriting) in `app/engine/sanitize.py` with tests.
- `GET /samples` from `GMAT_HOME/samples` (name, folder, description from the header).
- Frontend: Monaco with a GMAT language (keywords from `src/base` + types), open local file / samples gallery / save `.script`, Run/Stop button, console with levels and errors clickable to the line.
- Verify: pytest runs `Ex_HohmannTransfer.script` and 5 more samples via the API; sanitize test (absolute path rewritten, `SystemCommand` rejected); in the browser run a sample and see the log.

### Phase 3 — Mission model: parser/serializer + schemas
Goal: lossless script ↔ JSON model and field metadata from the engine.
- `backend/app/script/` parser (Create, assignments `Obj.Campo = …`, `GMAT` prefix, arrays `[ ]`, `{ }`, `%` comments, `...` continuations, `BeginMissionSequence`, commands with label `'Nombre'`, nested blocks) and serializer with a stable GMAT-style format.
- `shared/mission.schema.json` + TS types.
- `app/engine/schema.py`: for each creatable type, create an object in the worker and read its parameters (name, type, default, read-only, enum when the engine provides it); disk cache per GMAT version. `GET /schema`, `GET /schema/{type}`.
- Verify: round-trip test over **the 162 samples**: `serialize(parse(x))` loads in `gmatpy` with the same objects and the same field values as `x` (compared via the engine). Documented list of exceptions if any fail. If it doesn't fit: 3a parser/serializer, 3b schemas.

### Phase 4 — Resource tree + forms
Goal: create and edit resources without writing script. Split in two:
- **4a**: `POST /convert/state` and `POST /script/validate`; `GET /schema` with category and `objectType` per type; grouped tree (create/rename with refs/clone/delete with warning); generic form; script ↔ model sync; Validate button.
- **4b**: dedicated editors (Spacecraft with representation change via `/convert/state`, epoch, mass/areas, tanks/thrusters; ForceModel; Propagator) + LEO verification (backend test + browser walkthrough).

Original detail:
- Grouped tree (Spacecraft, Hardware, Propagators, Maneuvers, Coordinate systems, Solvers, Variables, Outputs) with create / rename (updates references) / clone / delete (warns about references).
- Generic form from `/schema/{type}`: types number/string/bool/enum/reference (combo with objects of the correct type), units, help.
- Dedicated editors: Spacecraft (orbital state with representation change via `POST /convert/state`, epoch with formats, mass/areas, attached tanks/thrusters), ForceModel (central body, gravity degree/order, third bodies, drag, SRP), Propagator (integrator, steps, tolerances).
- Script editor ↔ model sync (editing one updates the other; a parse error does not destroy the model). `POST /convert/state` and `POST /script/validate` in the backend.
- Verify: create a LEO mission from scratch using only forms, run it and get the same result as the equivalent hand-written script (backend test + browser walkthrough).

### Phase 5 — Mission sequence editor
Goal: build the sequence as a visual tree. Split in two:
- **5a**: command tree (Mission tab) nested in blocks, drag/drop and ↑/↓, "add command" menu by category, label, delete, enable/comment out (`% Cmd ...;` recognized by the parser as `disabled`); command `args` in the parser (Propagate, Maneuver, Begin/EndFiniteBurn, Report, Toggle, assignment); forms for those commands + Stop; line editor for the rest; `GET /api/parameters` (cached) and parameter picker with search.
- **5b**: Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For (conditions) forms + verification: rebuild `Ex_HohmannTransfer` using only the UI and compare numerical results with the sample.

Original detail:
- Command tree with drag/drop, nested in blocks, "add command" menu by category, labels, enable/comment out.
- Forms: Propagate (propagator, spacecraft, stop conditions with parameter/value, synchronized mode, backwards), Maneuver, Begin/EndFiniteBurn, Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For (conditions), Report, Toggle, assignment (`GMAT x = expr`), Stop.
- Parameter picker (`Sat.Earth.Altitude`, `Sat.ElapsedDays`…) with search, from the parameters provided by the engine.
- Verify: rebuild `Ex_HohmannTransfer` using only the UI and check that the resulting script runs the same as the sample (compare numerical results).

### Phase 6 — Results: 3D, ground track, plots, reports
Goal: see what GMAT computes, better than on desktop. Split in two:
- **6a**: worker data + `GET /runs/{id}/results` and `/files`, Results tab with XYPlot (uPlot), ReportFile table and 2D ground track.
- **6b**: 3D view with Cesium (trajectories, time bar, camera, frames) + lunar sample + performance with 50k points.

Original detail:
- Worker: hidden `ReportFile`s per spacecraft + reading the user's `ReportFile`/`XYPlot`/`OrbitView`/`GroundTrackPlot`; results in `GET /runs/{id}/results` (series in compact binary or chunked JSON).
- Cesium: Earth (and central body if different: Moon/Mars with offline texture), trajectories per spacecraft with color, maneuver markers, time bar with playback, camera follows spacecraft, inertial vs fixed frames.
- 2D ground track, XYPlot with uPlot (zoom, multiple series, export PNG/CSV), ReportFile table with CSV export.
- Verify: Hohmann, a lunar sample and a ground track sample look correct (compare points with the raw `ReportFile`); no console errors; reasonable 60 fps with 50k points.

### Phase 7 — Live solvers and complex missions
Goal: understandable Target/Optimize. Split in two:
- **7a**: `solver` events from the worker + Solver tab (table, plot, warning if it doesn't converge).
- **7b**: batch of core samples with a table in `docs/COMPATIBILITY.md`; Optimize and B-plane compared with desktop.

Original detail:
- `solver` events per iteration (variables, goals, constraints, convergence) from the worker; panel with table and convergence plot; clear warnings if it doesn't converge.
- Run all core samples (without optional plugins) in batch: status table in `docs/COMPATIBILITY.md`.
- Verify: `Ex_HohmannTransfer`, an Optimize sample (VF13ad or fmincon-free) and B-plane converge the same as desktop; samples batch without regressions.

### Phase 7c1 — Fix QA leftovers
Goal: close the failures QA logged in the Log before polishing the UX.
- **Backend fixes:**
  - Relative input paths: set the engine's working directory (`GmatWorkingDirectory` or equivalent) so that `../samples/SupportFiles/...` resolves as on desktop. Cases: Ex_Propagate_ThrustHistoryFile and Ex_Contact_Location_Station_Mask.
  - `sanitize` rewrites `TrackingFileSet.FileName` even when it is an input (`.gmd` read by the estimator), and that is why Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data fails. Input must be told apart from output without allowing writes outside the run folder. One option: if the file already exists in samples, treat it as a read-only input.
  - Clean up the `run-*`/`desk-*` folders and the `runs` dict (Phase 2).
  - The timeout cutoff must not depend on `pool._processes` (Phase 3b).
  - Empty `DateFormat` enum (Phase 3b).
- **Model/serializer fixes:**
  - Removing a primary body must not leave `GravityField.*` fields (Phase 4b).
  - Edited lines must not carry the `GMAT ` prefix (Phase 4b).
  - An XYPlot's `Add` must be read even if it spans several lines (Phase 6a).
- **Frontend fixes:**
  - New must clear the document and the Mission tree (Phases 4b and 5b).
  - Rename and delete in the resource tree with our own dialog instead of native `prompt/confirm`.
  - Validation error markers in Monaco (Phase 2).
  - Remove the "Cesium ion" credit from the 3D view (Phase 6b).
- **Solver (7a):**
  - Optimizers other than Yukon must show cost and constraints if GMAT prints them.
  - Correctly assign the closing of nested solvers.
  - With `ShowProgress=false`, warn that there will be no events.
- Verify: pytest + `pytest -m slow` + `python -m app.batch` without regressions; Ex_Propagate_ThrustHistoryFile, Ex_Contact_Location_Station_Mask and Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data run.

### Phase 7c2 — Test more missions
Goal: see the behavior with many more missions before polishing the UX.
- **More missions:**
  - Extend `app.batch` to the samples in subfolders of `GMAT_HOME/samples`, not just the 88 at the root.
  - Add 5-8 of our own missions in `backend/tests/missions/`: LEO with drag, GEO with station-keeping (Target in a While/For loop), lunar transfer, finite burn with a tank that empties, Optimize with NonlinearConstraint and a script with deliberate errors. Each with reference values taken from `batch.run_desktop` (gmatpy directly).
  - Test at least 5 missions end to end in the browser: open, edit with forms, run, Solver, Results (XYPlot, table, 2D, 3D) and save `.script` to reopen it. One of them with several solver runs, to test the picker.
  - Update `docs/COMPATIBILITY.md` with the new counts.
- **QA leftover from 7c1:** Monaco error markers must be cleared when editing by hand (today they are only cleared when the text is reloaded; `ScriptEditor.tsx`).
- Verify: pytest + `pytest -m slow` + `python -m app.batch` without regressions. Our own missions must match desktop. QA must walk through the 5 missions in the browser.

### Phase 8 — UX: truly intuitive
Goal: a student builds their first mission in 5 minutes.
- Templates/wizards: "LEO Orbit", "Hohmann Transfer to GEO", "Trip to the Moon", "Ground track of a satellite"; guided tour the first time.
- Undo/redo, draft autosave (localStorage, with notice), keyboard shortcuts (Ctrl+S, F5 run, Ctrl+Z), command palette (Ctrl+K).
- Live validation with messages in Spanish next to the field; engine errors mapped to resource/field.
- Responsive (tablet at minimum; mobile only as results viewer), accessibility (keyboard, contrast, labels).
- QA leftovers from 7c2: the Solver's logarithmic Y axis labels values below 0.001 as "0"; Save removes the quotes from `FM.Drag.HistoricWeatherSource = 'ConstantFluxAndGeoMag'` (confirm whether desktop GMAT accepts it or keep them); our own missions have no XYPlot (add one to some mission so QA covers it).
- Verify: walkthrough of the templates in the browser; no horizontal scroll at 768 px; Lighthouse accessibility ≥ 90.
- Done with a focus on "Trip to the Moon" (user request): that template is the first in the wizard, the 3D view draws the Moon and has a view centered on it, and it stays as regression mission `m7`.

### Phase 9 — Docker and VPS deploy
Goal: `docker compose up` and ready in Portainer.
- Leftovers from Phase 8: run Lighthouse (accessibility ≥ 90) against the build served by nginx; decide whether live validation (one engine process per typing pause) needs a per-IP limit in production.
- `backend/Dockerfile` (Python 3.12, downloads `gmat-ubuntu-x64-R2026a.tar.gz` with a pinned sha256, system dependencies required by `gmatpy`, non-root user), `frontend/Dockerfile` (Vite build → hardened nginx, proxy `/api` and `/ws`), `docker-compose.yml`, `.env.example` (ports, limits, `GMAT_HOME`).
- Production limits: concurrent runs, timeout, script size, temporary folder cleanup, simple per-IP rate limit.
- Verify: stack running locally with Docker, run samples from the browser against the container; clean restart.

### Phase 10 — E2E tests and documentation
- Playwright: open sample → run → see 3D/plot; create mission with forms; save/open `.script`.
- `docs/` (skill `documentar-proyecto`): architecture, how to add a dedicated editor, compatibility.
- Verify: `npx playwright test` green.

### Phase 11 (optional) — Plugins
Separately, each in its own session: EventLocator (eclipses, contacts), Estimation (batch/EKF, stations, measurements), Formation, extra propagators (SPK/TLE), CSALT.

### Phase 12 (optional) — Multi-user
Accounts, missions saved on the server (PostgreSQL), share by link, per-user quotas.

## Per-session protocol

1. Read **Progress** and take the first unchecked phase. Read only the files that phase touches.
2. Implement the complete phase, nothing from later phases.
3. Verify: `cd backend; pytest` · `cd frontend; npm run lint; npm run build` · start with `dev.ps1` and check in the browser whatever the phase requires (console without errors).
   **Between phases (mandatory, done by the `qa-fase` agent (`~/.claude/agents/qa-fase.md`), separate from the programmer, launched by the lead; it only reads and tests, does not edit code, and reports failures with steps and screenshots):** (a) functional validation: pytest + lint + build green and the new feature actually exercised (API or UI), comparing against GMAT (`gmatpy`) when there are numbers; (b) visual test in the browser (Chrome): walk through the new flow, desktop and mobile screenshots, console without errors, no horizontal scroll; (c) quick regression of earlier phases (open sample, run script, tree/forms); (d) result and summarized screenshots in the Log; the key screenshots stay in `qa-capturas/fase-N/` (outside git) and the lead shows them to the user. Without this the phase is not checked. QA starts by reading `docs/QA.md` (tests already done and how), reuses those procedures instead of creating new ones and at the end adds only what is new.
4. Check the phase in **Progress** and write 2-5 lines in the **Log**.
5. Commit (Conventional Commits) + `git push`.
6. Tell the user they can run `/clear` and continue with the next phase.

## Progress

- [x] Phase 0 — Prepare
- [x] Phase 1 — Backend + frontend skeleton
- [x] Phase 2 — Run scripts (editor + console)
- [x] Phase 3a — Mission model: parser/serializer
- [x] Phase 3b — Field schemas from the engine (/api/schema)
- [x] Phase 4a — Resource tree + generic form + sync
- [x] Phase 4b — Dedicated editors (Spacecraft, ForceModel, Propagator) + LEO test
- [x] Phase 5a — Sequence tree, basic forms and parameter picker
- [x] Phase 5b — Target/Optimize/If/While/For forms + rebuild Hohmann with the UI
- [x] Phase 6a — Results: engine data, plots, tables and 2D ground track
- [x] Phase 6b — Results: 3D view with Cesium
- [x] Phase 7a — Live solvers: per-iteration events + Solver tab
- [x] Phase 7b — Core samples batch + docs/COMPATIBILITY.md + B-plane/Optimize vs desktop
- [x] Phase 7c1 — Fix QA leftovers
- [x] Phase 7c2 — Test more missions
- [x] Phase 8 — UX: truly intuitive
- [ ] Phase 9 — Docker and VPS deploy
- [ ] Phase 10 — E2E tests and documentation
- [ ] Phase 11 (optional) — Plugins
- [ ] Phase 12 (optional) — Multi-user

## Log

- **2026-11-14 · Phase 0** — Repo created with `origin` pointing to `YaxOFF/Gmat-Web`. Chose a Python + `gmatpy` backend (real engine) instead of WebAssembly or a rewrite; frontend React + Vite + TS + Cesium; v1 scope = mission design core; Docker/Portainer + local deploy. Confirmed that `gmatpy` R2026a runs samples with Python 3.14 on Windows and that an Ubuntu R2026a build exists for Docker. Reference C++ source code cloned into `C:\Users\Yaxon\Downloads\GMAT-src` (tag `R2026a`).
- **2026-11-14 · Phase 1** — FastAPI backend with `ProcessPoolExecutor` (spawn) whose initializer imports `gmatpy`; `GET /api/health` returns the version via worker (`{status:"error"}` if the engine fails). If `GMAT_HOME/bin/api_startup_file.txt` is missing, an equivalent one is generated in `backend/.cache/`. Limits via env: `GMAT_WEB_WORKERS=2`, `GMAT_WEB_TASK_TIMEOUT=60`. Frontend Vite 8 + TS 7 + oxlint (instead of eslint), Zustand, `light-dark()` tokens, strings in `es.ts`. Verified: pytest, lint, build, health through the proxy, shell visible without console errors. Pending: `GMAT_HOME` must be defined (pytest and `dev.ps1` fail without it, on purpose); `dev.sh` only checked with `sh -n`.
- **2026-11-14 · Phase 2** — Each run is its own spawn process (`engine/runner.py`, cwd `GMAT_HOME/bin`); log via `WS /api/ws/runs/{id}` (log with level and line, progress, done, error); cancel with `DELETE /api/runs/{id}`; timeout and `MAX_RUNS` (429). `sanitize.py` rejects CallPython/Matlab/GmatFunction, System*, Save, `#Include`; rewrites output paths to the run folder; comments out GUI viewers without moving lines. Fixed a race when writing `api_startup_file`. Frontend: Monaco (lazy), samples, open/save, console with clickable errors. ~70 of 88 root samples run clean (missing GmatFunction, Python, MarsGRAM, input files). Pending: clean up run folders and the `runs` dict; in Docker the GMAT install is read-only; error markers in Monaco; full visual review of the UI (only loading without console errors was checked).
- **2026-11-14 · Phase 3a** — Parser/serializer in `backend/app/script/` with a stable GMAT-style format; nothing is lost (anything not understood, repeated fields, `A = B` copies go to `raw`). `POST /api/script/parse` and `/serialize`; `shared/mission.schema.json` + `frontend/src/model/mission.ts`. `worker.snapshot(path)` loads a script without running it and returns the canonical text of objects and commands. Round trip: 162 samples textually OK; comparison via the engine 115 equal, 1 xfail (copy `SimSatCopy = SimSat` between fields), 46 skip (sanitize or the original does not load). Detail in `docs/ROUNDTRIP_EXCEPTIONS.md`. Phase 3 split: 3b (`/api/schema` schemas) pending; command `args` not filled in; inline comments and blank lines are not preserved.
- **2026-11-14 · Phase 3b** — `engine/schema.py`: 47 creatable types taken from the engine (`GetListOfViewableItems` per category; PropSetup is published as "Propagator"; from PARAMETER only Variable/String/Array). Each type is created in its own spawn process (some crash the engine when reading read-only fields, which come out with default null). Per field: name, type, readOnly, default, enum, unit, refType. Spacecraft adds state elements from `GetStateElementLabels`; `DisplayStateType` enum filtered with `SetField`. Cache in `backend/.cache/schema/<versión>.json`. `GET /api/schema`, `/api/schema/{type}` (404 if it does not exist). Pending: FminconOptimizer, VF13ad and GroundStation do not show up (the engine does not list them); empty `DateFormat` enum; the timeout cutoff uses `pool._processes` (private API).
- **2026-11-14 · Phase 4a** — Phase 4 split into 4a/4b. Backend: `POST /api/convert/state` (Spacecraft in worker) and `POST /api/script/validate` (sanitize + isolated LoadScript, errors with line); `/api/schema` adds `category` and `objectType` (cache `*.v2.json`). Frontend: `resources/ResourceTree.tsx` (create/rename with refs/clone/delete with warning) and generic `ResourceForm.tsx`; script↔model sync with a `seq` counter (if parsing fails the last good model is kept); Validate button. Verified: pytest 315 passed, lint and build OK. **Not verified in the browser** (visual review pending). Risks: rename also touches strings and `raw`; create/rename/delete use native `prompt/confirm`; convert only EarthMJ2000Eq; Monaco loses undo when the script is rewritten; no frontend tests for `refs.ts`.
- **2026-11-14 · Phase 4b** — Dedicated editors in `resources/Editors.tsx` (Spacecraft: orbital state with representation change via `/convert/state`, epoch with `POST /api/convert/epoch`, mass/areas, tanks/thrusters; ForceModel: gravity degree/order, point masses, atmosphere, SRP; Propagator: integrator, steps, FM as a select of ForceModels). The other types still use the generic form (`Field.tsx` extracted). `test_leo.py`: a LEO built only as a model gives the same ReportFile as the hand-written script. QA (separate agent) rejected once: SRP Off left `SRP.*` lines that GMAT rejects; fixed (SRP Off removes its subfields) with a new test. Final QA APPROVES: pytest 318 passed, lint and build OK, conversions match the engine, SRP Off run OK. Pending: mobile layout not responsive (scrollWidth 695 vs 386, goes to Phase 8); New button does not clear the document; rename/delete still use native `prompt/confirm` (not tested by QA); removing a primary body leaves `GravityField.*` fields; the serializer adds the `GMAT ` prefix to edited lines; `/convert/state` only EarthMJ2000Eq; the engine schema does not include GravityField/Drag/integrator steps (defined by hand); not checked whether NRLMSISE00/MSISE86 exist in this version.
- **2026-11-14 · Phase 5a** — Phase 5 split into 5a/5b. `frontend/src/mission/`: sequence tree with nested blocks, drag/drop (before, after, inside a block, final gap; a block does not go inside itself), ↑/↓, add menu by category, label, delete with a second click, comment out/enable (`% Cmd ...;` is read back as `disabled`, `COMMENTABLE` list duplicated in `parser.py` and `commands.ts`). `args` is a view that `parser._args` extracts from `text` (Propagate, Maneuver, Begin/EndFiniteBurn, Report, Toggle, assignment); the serializer still writes only `text`. Propagate form with a parameter picker from `GET /api/parameters` (315 parameters, isolated process, same cache as /api/schema); the other commands use the line editor. QA (separate agent) APPROVES: pytest 320 passed, lint and build OK; edited Hohmann runs and converges (TOI 2.2403, GOI 1.4330). QA procedures in `docs/QA.md` for reuse. Pending: drag only tested with synthetic events; label and line are committed on blur; native `confirm()/prompt()` in the resource tree; index-based selection may shift if the script is edited by hand; mobile (Phase 8).
- **2026-11-14 · Phase 5b** — `parser._args` understands Target/Optimize (`{solver, opts}`), Vary/Achieve/Minimize/NonlinearConstraint (`{solver, lhs, op?, rhs?, opts?}`), If/While (`conds` joined with `&`/`|`) and For (empty `step` = `inicio:fin`). There are forms for all of them in `FORMS` (`mission/CommandForm.tsx`), with solver selects filtered by `DC_TYPES`/`OPT_TYPES` (fixed list). Empty options are omitted. `newCommand` uses the first existing resource of each type. `test_hohmann_model.py` rebuilds Hohmann from a model and gives the same numbers as the sample. QA APPROVES: pytest 322 passed, lint and build OK; Hohmann built from scratch using only the menu and forms gives TOI=2.24028397735 and GOI=1.432966302, identical to the sample. Pending: Optimize/Minimize/NonlinearConstraint and Else/While only tested by pytest; ElseIf does not exist in GMAT; the free value rejects `, ; { } % & |` (use the script line); 4b bug: New leaves the old Mission tree until the Editor is edited.
- **2026-11-14 · Phase 6a** — Phase 6 split into 6a/6b. `engine/results.py`: the runner inserts hidden ReportFiles (`gmatweb_*.csv`, `SolverIterations = Current`) per spacecraft and per XYPlot before `BeginMissionSequence`. With `Current`, GMAT writes only the final pass, so nothing is trimmed and BackProp is kept. `None` does not work because it omits the Target's converged pass. The user's ReportFiles respect `WriteHeaders`. Added `GET /runs/{id}/results` (409 if not finished) and `/files/{name}` (only simple names, no internal ones); the `done` event carries `available`. Building the subscribers with `Construct` crashes RunScript (noted in GOTCHAS). Frontend: the Results tab replaces Plots/Reports, with uPlot XYPlot (zoom, PNG/CSV), a 500-row table (the CSV has all of them) and a 2D ground track in SVG. It is cleared when running or switching documents. QA APPROVES, with one round of fixes (trimmed BackProp, WriteHeaders, stale results): pytest 333 passed, lint and build OK. In Hohmann, /results matches a hand-made ReportFile exactly and /files rejects traversal. Pending: no maneuver epochs; the hidden XYPlot does not follow Toggle; lat/lon always relative to Earth; `Add` is only read on one line; the ground track has no degree labels; Results on mobile untested (Phase 8).
- **2026-11-14 · Phase 6b** — 3D view in `results/View3D.tsx`, lazy-loaded (4.2 MB chunk, 1.1 MB gzip), with Cesium 1.147 without ion: empty token and local NaturalEarthII base. `vite.config.ts` copies the assets to `public/cesium` (in .gitignore; copied when `npm run dev` starts; delete it if cesium is updated) with `CESIUM_BASE_URL=/cesium/`. Trajectories go in a single SimplePolylineGeometry Primitive in ICRF, and per frame only its modelMatrix changes. The spacecraft uses an INERTIAL SampledPositionProperty (linear); the time is the UTCGregorian of the 1st row + A1 seconds. There is follow spacecraft and inertial camera (postUpdate + computeIcrfToFixedMatrix). QA APPROVES: lint and build OK, pytest 333 passed. Hohmann comes out to scale (apogee ~6.5 R⊕) and Ex_LunarTransfer is framed. 57k points load in ~0.5 s. There are no external requests or console errors, and the viewer does not leak when switching tabs. Pending: fps not measured (Chrome MCP throttles rAF), double click on spacecraft untested, the Moon is not drawn and everything is centered on Earth, no maneuver markers, the "Cesium ion" credit appears even though it is not used, mobile untested.
- **2026-11-14 · Phase 7a** — Phase 7 split into 7a/7b. `engine/solver.py` (`SolverLog`) reads the progress text that GMAT already writes to `gmat.log` (DifferentialCorrector and Yukon formats taken from GMAT-src). With that the runner emits `solver` events over the WS: `start`, one `iteration` per nominal pass (variables, goals with tolerance and `met`, constraints, cost) and `end` with converged, failed or initial. There are no new hidden ReportFiles and `results.py` stays with `SolverIterations=Current`. The tolerance comes from the script's Achieve (default 0.1). Central "Solver" tab (`results/SolverPanel.tsx`) with run picker, green or red notice, uPlot plot (log of \|Desired − Achieved\| for DC, cost and constraints for Optimize) and table. If it does not converge a yellow line appears in the console. QA rejected once (the plot covered the table, and it showed "1 iteraciones"); fixed with `.view:has(> .chart){flex:none}` and `.tableWrap` with min-height 200px. QA APPROVES: pytest 336 passed, lint and build OK. Hohmann gives 12 iterations with TOI 2.24028397735 / GOI 1.432966302, same as GMAT. With `MaximumIterations=3` it comes out failed and Yukon converges. No overlap at 951 and 700 px height, and no console errors. Pending: optimizers other than Yukon only print variables; with nested solvers, the closing is assigned to the last active one of the same type; with ShowProgress=false there are no events; the picker with several runs was not tested; mobile not responsive (Phase 8).
- **2026-11-14 · Phase 7b** — `app/batch.py` (`python -m app.batch --jobs 4`, ~1 min) runs the 88 root samples along the same path as the web app (runner.create = sanitize + inject) and rewrites `docs/COMPATIBILITY.md`. A sample is marked "plugin" only if its library has its PLUGIN line commented out in the worker's startup file (`disabled_plugins`, `PLUGIN_MARKS`). "Desktop" is `batch.run_desktop`: gmatpy directly with the original script. `tests/test_desktop.py` and `tests/test_batch.py` are `slow` (outside the normal pytest) and compare Hohmann, Yukon and MarsBPlane with desktop (rel 1e-9). QA rejected once because "plugin" hid Formation, EventLocator and Estimation samples that do run. Now fixed, QA APPROVES: pytest 339 passed, slow 3 passed. Batch: 74 ok, 8 rejected (GmatFunction, Python, #Include), 3 plugin (ExternalForceModel ×2, MarsGRAM), 2 missing file (relative path) and 1 error (Tut_Orbit_Estimation: sanitize rewrites an input `TrackingFileSet.FileName`). The last two move to Phase 7c, which the user added: fix QA leftovers and test more missions. VF13ad and fmincon are not installed, so Optimize was only tested with Yukon.
- **2026-11-14 · Phase 7c1** — Phase 7c split into 7c1/7c2. Closes the QA leftovers from phases 2, 3b, 4b, 5b, 6a, 6b and 7a, each backend or model fix with its pytest test. Relative input paths are resolved in `sanitize._in_path` (absolute from `GMAT_HOME/samples`, read-only) instead of changing the working directory; `TrackingFileSet.FileName` is an output only if the script has a `Simulator`. `runner.prune` deletes runs and `run-*`/`desk-*`/`val-*` folders after 1 h (`GMAT_WEB_RUN_KEEP`); `schema._isolated` uses `Process` + `Pipe` instead of `pool._processes`. Frontend: New clears everything, own `AskDialog` dialog for rename/delete, markers in Monaco, 3D without the ion credit, ForceModel deletes `GravityField.<cuerpo>.*`. Batch: 77 ok (previously 74), no regressions. QA approved (pytest 350/45/1, ThrustHistoryFile and Station_Mask from the UI, output paths always in the run, Hohmann/Solver/Results regression OK). Pending: Monaco markers are not cleared when editing by hand (moves to 7c2); a ThrustHistoryFile or TrackingFileSet without a Simulator can read an absolute server path (review in Phase 9); fmincon untested (not installed). The 6 own missions for 7c2 are already written in a separate worktree, to be integrated.
- **2026-11-14 · Phase 7c2** — 6 own missions in `backend/tests/missions/` (LEO with JacchiaRoberts drag, GEO with Target inside For, lunar transfer, finite burn until FuelMass=1, Optimize Yukon with 2 NonlinearConstraint, script with errors on lines 8 and 13), written by an agent in parallel in a worktree. `make_reference.py` generates `reference.json` with `batch.run_desktop` (now accepts `out=`). `test_missions.py` (slow) runs them through runner + sanitize and they match desktop (rel 1e-8). `app.batch` now also walks the samples subfolders: 118 ok of 162 (root 77/88, unchanged), 28 plugin, 12 rejected, 4 with a missing file due to paths relative to their subfolder (documented limit), 0 errors. Monaco clears the markers on typing. GOTCHAS: non-ASCII characters, stop on FuelMass with a large MaxStep, `Luna.Periapsis`. QA approved: m1-m5 open, are edited with forms, run, Solver (m2 with a picker of 3 runs) and reopen with the numbers from reference.json; m6 marks its errors; Hohmann regression OK. Minor leftovers, moved to Phase 8: Solver log axis with "0" labels, quotes lost in HistoricWeatherSource and missions without XYPlot.
- **2026-11-14 · Phase 8** — Done and tested by the lead session, without agents (user request), with a focus on "Trip to the Moon". Templates with a wizard in `frontend/src/templates.ts` + `Dialogs.tsx`: Trip to the Moon (185 km LEO, coarse targeting with a `Sonda` spacecraft, fine targeting of RAAN/AOP/TLI, LOI insertion; inputs: date, lunar radius, days, inclination), LEO Orbit, Hohmann to GEO and Ground track. Backend: the hidden reports carry the spacecraft position relative to the Moon (`LunaMJ2000Eq.X/Y/Z`) and `read` omits spacecraft that are never propagated; with that the 3D view draws the Moon and its path and has `Centro = Luna`. Also: guided tour the first time, undo/redo (Monaco history, includes forms), draft in localStorage, shortcuts Ctrl+S / F5 / Ctrl+Z / Ctrl+K, command palette, live validation (indicator in the bar, message next to the field, ⚠ in the tree, common GMAT messages in Spanish), tablet and mobile as viewer only, contrast of Run/Stop in dark mode. 7c2 leftovers closed: Solver log axis in scientific notation, XYPlot in `m1`, and GMAT accepts `HistoricWeatherSource` without quotes (no need to keep them). Verified: 29 template cases against the engine (default, minimums, maximums and 5 lunar dates from 2025 to 2030) converge; `m7_viaje_luna` web = desktop (rel 1e-8; TLI 3.129455786, LOI -0.6438904876); pytest 351 passed, slow 11 passed; batch 118 ok of 162 (root 77/88), no status changes; lint and build OK; in the browser the 4 templates run, undo, validation, palette, draft and tour work, no console errors, no horizontal scroll at 768 and 390 px, and Hohmann regression with TOI 2.24028397735 / GOI 1.432966302. Limits: Lighthouse could not be run (download blocked); instead an in-page script found 0 unnamed buttons, 0 unlabeled fields and 0 texts below 4.5:1 in light and dark (procedure in `docs/QA.md`). Sequence errors are not marked in the Mission tree (only bar and Editor); the 3D view does not center on other bodies or mark maneuvers; there are no real mobile screenshots (measured with an iframe).
