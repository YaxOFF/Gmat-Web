<!-- fuente: backend/app/engine, backend/app/script, backend/app/main.py, frontend/src/store.ts, frontend/src/model/refs.ts, frontend/src/resources, dev.ps1 | rev: 1ee8d23 -->
# Gotchas

Read from the code and checked with the real engine where it says "(verified)".

## Engine and workers (`engine/worker.py`)
- **`gmatpy` only in workers.** Global singleton per process. `tests/test_health.py` checks that it is not in `sys.modules` of the API process.
- **A dead worker breaks the pool forever.** `worker.submit` does not recreate the pool: after a `BrokenProcessPool`, `/api/health` responds `status: "error"` until the backend is restarted. That is why anything that can bring the engine down goes through `schema._isolated`, not through `submit`.
- **The `submit` timeout does not kill the task.** It only stops waiting for it; the worker stays busy. `timeout=0` counts as "no value" and uses `TASK_TIMEOUT_S`.
- **Standalone scripts that use `TestClient` need `if __name__ == "__main__":`.** Workers are `spawn` and reimport the main script; without the guard the pool breaks (verified).
- **`api_startup_file.txt`.** If it is missing from `GMAT_HOME/bin` it is generated in `GMAT_WEB_CACHE` by replacing every `..` in `gmat_startup_file.txt` with `GMAT_HOME`. Atomic write; on Windows `os.replace` can give `PermissionError` and it is ignored. Orphan `api_startup_file.txt.<pid>` temporaries remain in the cache [TODO: cause not confirmed].
- **Each run writes its own `startup.txt`** in the run folder with `OUTPUT_PATH` pointing there. `_isolated` and the pool use the common startup: its `OUTPUT_PATH` is GMAT's.
- **`cwd = GMAT_HOME/bin`** in runs, validation, schemas and `snapshot`: the `../data/...` input paths are relative to `bin`.

## Runs (`engine/runner.py`)
- **Cleanup by age (`runner.prune`).** At startup and on every `create`: runs finished more than `GMAT_WEB_RUN_KEEP` (3600 s) ago leave `runs` and their folder is deleted; `run-*`/`desk-*`/`val-*` folders in `GMAT_WEB_RUNS` that are not in `runs` are deleted if their mtime is past that limit. An unfinished run is never deleted. `run_desktop` deletes its `desk-*` when done. `/files/{name}` of a pruned run gives 404.
- **Cancelling is a flag.** `DELETE /runs/{id}` marks `cancelled`; `_supervise` sees it on its next loop (0.2 s), does `terminate` and emits `error` "Run stopped". If the process finishes first, the run ends with `done`. `DELETE` on a finished run responds `{ok:true}` with no effect.
- **The timeout includes loading `gmatpy`.** `RUN_TIMEOUT_S` is measured from when the supervisor starts.
- **Exit codes:** 0 = `done`; 2 = `LoadScript` failed; 3 = `RunScript` failed; other = engine crash ("The engine exited with code N").
- **`MAX_RUNS` counts unfinished runs.** Validating does not count and launches its own process per request.
- **Log level by text (`classify`).** `**** ERROR ****` or `Exception` anywhere = error; `warning` case-insensitive = warning; a quoted line (`"  57: ..."`) = error with `line`. Error texts carry the script's temporary path.
- **`done.results.files`** lists only files at the top level of the folder, without `HIDDEN` (`gmat.log`, `mission.script`, `startup.txt`, `GmatLog.txt`) or `gmatweb_*`. `/files/{name}` serves any other top-level file (including the `gmatweb_*` ones).

## Results (`engine/results.py`)
- **Hidden reports are injected as text**, not through the API: `Construct('ReportFile')` + `SetField('Add')` does not create the parameters or the wrappers, and `ScriptInterpreter.ValidateSubscriber` makes `RunScript` crash with an access violation (verified). They go right before the first `BeginMissionSequence` line; without it there are no results.
- **Shifted lines:** the script that runs has N more lines; `_supervise` subtracts N from every `line` from `manifest["at"]` on. An error inside the injected lines points to a nearby user line.
- **Ships, XYPlot and ReportFile come from the text** (`Create` and `X.Field = ...`; lines with `...` are joined only for reading, the text does not change). A user ReportFile without `Filename` is looked up as `<name>.txt`.
- **`SolverIterations = Current`** in the hidden ones: with `None` GMAT also omits the final pass of a Target; with `Current` it writes only the final pass, without iterations (verified on Hohmann, Mars B-Plane, TargetFiniteBurn). Nothing is trimmed by time: `BackProp` segments stay as they are.
- **No maneuver epochs:** GMAT does not publish the state right after a `Maneuver` (there are no two rows with the same epoch).
- **The hidden XYPlot does not follow `Toggle`** nor the XYPlot's `SolverIterations`. Lat/lon always relative to Earth (ignores the GroundTrackPlot's `CentralBody`). That is why the lunar template does the coarse aiming with another ship (`Sonda`): if it used the same one and reset it (`Nave = NaveInicial`, like `Ex_GivenEpochGoToTheMoon`), the chart and the 3D would mix the test pass with the real trip.
- **Moon columns.** `inject` creates `gmatweb_LunaEq` (Moon origin, MJ2000Eq axes) and each ship report carries `<ship>.gmatweb_LunaEq.X/Y/Z`, which `read` publishes as `LunaMJ2000Eq.X/Y/Z`. The Moon's position is not requested from GMAT separately: the 3D gets it by subtracting the ship's two positions (`View3D.track`). That is 3 more injected lines per script (counted in `manifest["shift"]`).
- **A ship that is never propagated** (all its rows with the same epoch, e.g. a backup copy): `read` does not return it.
- **User ReportFile** (fixed width) is split on 2+ spaces: a cell that fills its exact width sticks to its neighbor. `Report` rows with other columns come out with a different length. With `WriteHeaders = false` the headers are the `Add` names if they match the columns, otherwise `1..n`.

## Solvers (`engine/solver.py`)
- **They are read from GMAT's progress text in `gmat.log`** (format of `DifferentialCorrector::GetProgressString` and `Yukonad::GetProgressString`); if a GMAT version changes those texts, no `solver` events come out (the log stays the same). With `ShowProgress = false` there are no iterations: `SolverLog.silent` lists those solvers (script field) and `_supervise` emits a `silent` `solver` event at the start; the frontend shows it as a warning in the console. fmincon prints `Control Sequence Pass N; Fmincon Pass` and constraints `Cn  Achieved: v` (without Desired), sometimes two sections on one line (format from the code, not tested: fmincon is not installed).
- **The tolerance is not in the log:** it comes from the script's `Achieve` (`{Tolerance = x}`, default 0.1); if it is an expression it goes as text and there is no `met`. `met` = `|Variance| <= Tolerance`, the same criterion as the DC.
- **The close (`converged`/`did not converge`/`Completed in N`) does not name the solver:** it is assigned to the last one of the same type that started (the innermost if nested; a repeated header without a close moves it to the end). VF13ad and others based on `Optimizer` do not print cost or constraints: only variables.
- **A Target in a loop** gives one solver run per pass; the frontend keeps the last 200.

## Sanitizing (`engine/sanitize.py`)
- **It works line by line and does not join `...`.** A GUI viewer with a continuation is left half done and the script does not load: `OV.Add = {Sat, ...` is commented out and the line `Earth};` is not (verified). A `Create` with a continuation is not registered.
- **`FORBIDDEN` is per token, case-sensitive.** It rejects `CallPythonFunction`, `CallMatlabFunction`, `CallGmatFunction`, `SystemCommand`, `System`, `PythonFunction`, `MatlabFunction`, `GmatFunction`, `Save`, `SaveMission`, `Python.x`, `#Include`. It ignores strings and comments. False positive: a resource or variable named `System` or `Save` (verified). It does not look at tokens preceded by `.` (`Obj.Save` passes).
- **Only 4 output fields are rewritten** (`Filename`, `OutputFile`, `ReportFile`, `MatlabFile`, case-insensitive), in any object and also inside the sequence. Only the file name is kept: two outputs with the same name in different folders collide. Empty value = `output.txt`. [TODO: inventory engine output fields outside this list].
- **Input paths (`_in_path`).** Every field that is not an output (and `Filename` of `INPUT_TYPES`: `ThrustHistoryFile`, `FileInterface`, and `TrackingFileSet` if the script has no `Simulator`) with a relative path that contains `/` or `\` and exists from `GMAT_HOME/samples` becomes absolute; if it does not exist it is left as is. They are not validated: a script can read files outside the run (never write). `TrackingFileSet.FileName` with a `Simulator` in the script is an output (the Simulator writes the `.gmd`).
- **GUI viewers** (`OpenFramesInterface`, `OpenFramesView`, `OrbitView`, `GroundTrackPlot`): every line that names one is commented out, so `Toggle OV RF On` also loses `RF`.
- **It preserves the number of lines**; converts CRLF to LF.
- **The size limit lives here.** `/runs` responds 400 and `/script/validate` 200 with `ok:false`; only `/script/parse` gives 413. `/script/serialize` has no limit.

## Schemas (`engine/schema.py`)
- **Some types bring the engine down** when reading their fields (e.g. `NuclearPowerSystem`). `_isolated` launches a spawn `Process` per call with a `Pipe`; if the child dies it gives `None`, if it exceeds `TASK_TIMEOUT_S` it kills it and raises `TimeoutError` (not caught in the routes: 500). An engine exception arrives as `RuntimeError` with the text.
- **A type that brings the engine down stays cached as `null`** on disk. `GET /schema/{type}` responds 200 with `fields: null` and the frontend shows an error. To retry you have to delete the cache file.
- **Cache:** `GMAT_WEB_CACHE/schema/<version>.v3.json`, fully rewritten with each new type. If the shape of what is stored changes, bump the `.v3` suffix. The version and the in-memory cache last as long as the process (`schema.reset()` is for tests). Global `_lock`: schema queries run serially.
- **Type names.** `PropSetup` is published as `Propagator`. From the PARAMETER factory only `Variable`, `String`, `Array` come out. FminconOptimizer, VF13ad and GroundStation do not come out (the engine does not list them). Today there are 47 types.
- **`ENUM_CANDIDATES` covers `Spacecraft.DisplayStateType` and `Spacecraft.DateFormat`** (the engine gives an empty enum) and is filtered by trying `SetField`. `main.STATE_TYPES` uses the unfiltered list.
- **`stateType` is the first representation that uses the element.** `INC`, `RAAN`, `AOP`, `TA` and `SMA` come out as `Keplerian`; `RMAG`, `RA`, `DEC`, `VMAG` as `SphericalAZFPA` (verified). `Editors.tsx` filters by equality, so in `ModifiedKeplerian` it only shows `RadPer` and `RadApo`. The Cartesian ones (`X`…`VZ`) have no `stateType`: the editor treats them as `Cartesian` by hand (`CART`).
- **`default` is `null` in read-only fields** (reading them can bring the engine down).

## Parser and serializer (`script/`)
- **It never discards lines:** what is not understood goes to `raw`. What goes to `raw` and what changes place: `docs/ROUNDTRIP_EXCEPTIONS.md` (Known limits).
- **`raw` is written after all resources and before `BeginMissionSequence`.** Comments at the end of the script also land there (verified), as do a repeated `Create` and the assignments of a resource whose `Create` was not understood.
- **Without `BeginMissionSequence` everything is the resource zone:** commands go to `raw` and the serializer always adds the line.
- **Stable format, not identical to the original.** Assignments without the `GMAT` prefix (resources and `GMAT` commands without a label; with a label it is kept), 3-space indentation, blank line after each resource, the resource's comments together before the `Create`. Numbers come out with `repr`: `7100.` becomes `7100.0`, `1.0e3` becomes `1000.0`; integers stay integers.
- **Fields in script order.** A nested field `Sat.Tank.X` has key `Tank.X`.
- **Values:** a bare identifier that is not a resource = string (enum); any other unquoted token (resource, `Sat.X`, path) = `{ref}`. A value with spaces outside `{}`/`[]` = not understood, goes to `raw`.
- **Commands:** `text` is the rest as is and is the only thing the serializer writes. `args` is a view derived from `text` (`_args`) for Propagate, Maneuver, Begin/EndFiniteBurn, Report, Toggle, `GMAT`, Target/Optimize (`{solver, opts}`), Vary/Achieve/Minimize/NonlinearConstraint (`{solver, lhs, op?, rhs?, opts?}`), If/While (`conds` with `join` `&`/`|`) and For (empty `step` = `start:end` form); `opts` values go as text (they can be expressions); odd syntax (`Prop(Sat, {stop})`, `'Covariance'`) gives `{}` and the form falls back to the line editor. Forms rewrite `text` and `args` together (`commands.toText`). Blocks: `Target`, `Optimize`, `If`, `While`, `For`, `BeginScript`. `Else` is just another child. An unclosed block is serialized with its `End...`; an unpaired `End...` stays as a standalone command.
- **Commented-out commands:** in the sequence, a `% Cmd ...;` line with `Cmd` in `COMMENTABLE` is a command with `disabled: true` (70 in the samples); it is rewritten as `% Cmd ...;`. Blocks, `Else` and closers cannot be commented out (it would change the structure): they remain comments. Comments without a trailing `;` (`% Propagate to apoapsis`) remain comments.
- **`'` as transpose:** a quote attached to an identifier, `)`, `]`, `.` or `'` does not open a string.

## Script ↔ model sync (`store.ts`)
- **`seq` counter:** the last change wins, whether it comes from the text or the model. `editText` ignores the editor's echo by comparing the text.
- **`setMission` is optimistic.** It changes the model and then requests the text. If `serialize` fails, the model stays ahead of the text and the next text edit overwrites it.
- **Rewriting the text bumps `doc.rev`.** If `doc.load` also changed (New, Open, Sample, Template), `ScriptEditor` does `setValue` and the undo history starts from scratch. If not (form or tree), the text enters with `executeEdits` between two `pushUndoStop`s: it is one more step in Monaco's history, which is the app's only undo. The edit replaces the whole document, so the cursor jumps.
- **Undo/Redo** (`gmat.history`): buttons and Ctrl+Z/Ctrl+Y outside fields call Monaco even if the Editor tab is hidden (it stays mounted). Inside a form field Ctrl+Z is the browser's. It does not undo the selection or the document name.
- **Live validation (`checkLater`).** 1.2 s after the last change it launches a `POST /api/script/validate` (one engine process at a time, ~0.7 s). Empty document = not validated (`checked: null`). Old responses are discarded with `cseq`. It also validates while a run is in progress. If the backend does not respond, the indicator keeps the last state.
- **`issues` only locates lines in the resource zone** (`Obj.Field = ...` or `Create`). An error in the sequence shows up in the indicator and in Monaco, not in the Mission tree. Translation is by patterns (`es.issues.known`); the rest is shown in English, just as GMAT writes it.
- **Draft (`gmatweb.draft` in localStorage).** It is saved 0.5 s after each change and restored when the page loads, with a notice in the console. New (empty text) deletes it. There is one per browser: two tabs overwrite each other. Without localStorage there is no draft and no error.
- **Global shortcuts** (`App.tsx`) in the capture phase: Ctrl+S, F5, Ctrl+K. Without capture, Monaco keeps Ctrl+K (chord) and the browser keeps Ctrl+S and F5. F5 no longer reloads the page (Ctrl+R does).
- **Running and validating use `doc.text`,** not the model; both clear the console (maximum 5000 lines).
- **`parseError` almost never appears:** the parser does not reject scripts; only 413 or a network failure. On error the last good model remains.
- **The model lags ~400 ms behind the text** (debounce). Exception: `loadText('')` (Nuevo) clears the model instantly.
- **Monaco markers** come from `store.logs` with `line` (run) and from `store.issues` (validation; it wins over the log on the same line). They are cleared with every edit and come back when the live validation finishes.
- **No retries.** `schemas[type] = 'error'` lasts until the page is reloaded. If `fetchTypes` fails, the whole tree falls into "other" and only `Spacecraft` can be created.
- **WebSocket closed without `done`/`error`** = connection lost message. `stop` only sends the `DELETE`; the end arrives through the WebSocket.

## Tree and form (`resources/`, `model/refs.ts`)
- **Creating an `Array` from the tree gives `Create Array Array1;` without dimensions and GMAT does not load it** (verified).
- **Names:** the tree requires `^[A-Za-z]\w*$`; the parser also accepts a leading `_`.
- **Renaming** replaces the name as a standalone token in `{ref}` values, command text (including quoted strings inside the command), `endText` and `raw` lines. It does not touch labels, comments or string values.
- **Deleting does not clean up references:** it only lists them in the dialog. Cloning loses the comments. Rename/delete use their own `<dialog>` (`AskDialog` in `ResourceTree.tsx`); rename validates in the field.
- **Removing a body from `PrimaryBodies`** removes its `GravityField.<body>.*` (`tidy` of `Field`, in `ForceModelEditor`). Editing the text by hand does not do it.
- **Tree groups:** `EVENT_LOCATOR`, `FIELD_OF_VIEW` and the types the engine does not list fall into "other".
- **Form controls:** `Boolean` = checkbox; field with `enum` = list; the rest = text, with suggestions if it has `refType`. Read-only ones are not shown. Empty text or ↺ removes the field from the script (back to the default).
- **Lists and matrices:** every type with `Array`, `Rvector`, `Rmatrix` or `Unsigned` is split on spaces and commas into a flat list. An `Rmatrix` loses its rows.
- **Fields the engine does not list** (`GravityField.<body>.Degree/Order/PotentialFile`, `Drag.AtmosphereModel`, Propagator integrator steps: `InitialStepSize`, `Accuracy`, `MinStep`, `MaxStep`, `MaxStepAttempts`, `StopIfAccuracyIsViolated`) are defined by hand in `Editors.tsx` (`syn`) with GMAT's defaults; lists of bodies, atmospheres, integrators and epoch formats are also fixed. The `Propagator` schema only has `FM` and `Type`; the ForceModel one has no `GravityField.*` (verified).
- **Drag:** GMAT writes `FM.Drag = None` without drag and `FM.Drag.AtmosphereModel = X` with it; the editor removes `Drag` and every `Drag.*` when the model changes. Same with `SRP`: GMAT rejects `SRP.Flux`/`SRP.SRPModel`/`SRP.Nominal_Sun` with `SRP = Off` (verified), so changing SRP removes every `SRP.*` (`tests/test_leo.py`).
- **A select with `enum` whose value is a resource** stores `{ref}` (if it were a string the serializer would put it in quotes). The Propagator uses that for `FM` (list of the model's ForceModels).
- **`patch` in `Editors.tsx` deletes and rewrites the key:** what changed moves to the end of the resource, so `DisplayStateType` stays before the elements and `DateFormat` before `Epoch`.
- **Changing `DisplayStateType`** converts with the engine the elements of the current representation (or their defaults), removes those and writes the new ones; elements of other representations stay where they were.
- **An `Object` field with a name that is not a resource** (e.g. `Earth`) is stored as a string; if it is not an identifier (`Sat.X`) it comes out in quotes.

## Sequence (`mission/`)
- **The selected command is a path of indices** (`selectedCmd`). If the script changes from the editor, the path can point to another command; move/add/delete updates it.
- **Adding** inserts inside the selected block (at the end) or after the selected command. Dropping on a block: top third = before, the rest = first child; on the `End…` row = last child; on the final gap = at the end of the root.
- **Line editor:** parses `BeginMissionSequence;
<line>;` with `/api/script/parse` and rejects if it does not come out as a single command or if it goes from block to non-block.
- **New commands** use the first resource of the type (or GMAT default names like `DefaultSC`, `DC`): they may not load until those resources are created.
- **`/api/parameters`** goes through `_isolated` because `Construct` leaves objects in the worker's configuration. If the engine crashes it is not cached (it retries on the next call); in the frontend `'error'` lasts until reload.

## State conversion
`/api/convert/state` only uses `EarthMJ2000Eq`, without its own CS or epoch (the Spacecraft editor does not send its `CoordinateSystem`). `/api/convert/epoch` changes `DateFormat` on an engine Spacecraft, which rewrites `Epoch` (verified); the epoch goes in quotes into the script: only `[\w :.-]`, max. 40. The elements are interpolated into a script: only identifiers and finite numbers (validated in `main.py`).

## Development environment
- **`dev.ps1` does not warn if the ports are taken** (verified). With an old backend on `:8000`, uvicorn fails with `[Errno 10048]`, Vite moves up to `:5174` and the proxy talks to the old backend: `/api/health` gives `ok` and the new routes give 404. Check with `netstat -ano | findstr ":8000 :5173"`.
- **Expected warnings:** pytest shows `StarletteDeprecationWarning` (httpx); `npm run build` warns about a chunk larger than 500 kB (Monaco).
- **Samples:** 77 of 88 root samples and 118 of 162 in total (with subfolders) run (table in `docs/COMPATIBILITY.md`, `python -m app.batch`). Root: 8 rejected by sanitize and 3 commented-out plugins (MarsGRAM, ExternalForceModel). Subfolders: 25 commented-out plugins (VF13ad, SNOPT, CSALT), 4 rejected (`#Include`, `MatlabFunction`, `GmatFunction`) and 4 `missing file` because of paths relative to the subfolder (sanitize resolves from `GMAT_HOME/samples`). The batch only marks as `plugin` what the active startup leaves commented out. It is not a bug in the port.
- **Relative input paths are looked up in the script's folder** (`GmatFileUtil::FindFile`), which on the web is the run: that is why sanitize makes absolute the ones that exist from `GMAT_HOME/samples` (verified: `Ex_Propagate_ThrustHistoryFile`, `Ex_Contact_Location_Station_Mask`, `Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data` run).
- **Non-ASCII characters:** GMAT rejects the whole script with any non-ASCII character, even inside a comment (`Non-ASCII character`, `LoadScript` fails, code 2 in `run_desktop`). The missions in `tests/missions/` have no accents.
- **Stop on `Tank.FuelMass` with a large `MaxStep`:** the step crosses zero, the tank ends up with negative mass and the run gives `Hardware Exception` (`RunScript` fails, code 3). Use a small `MaxStep` or stop before 0 (`tests/missions/m4_finite_burn.script`).
- **`Sat.Luna.Periapsis` cannot be reported** (it is not a parameter with a body dependency): use `Sat.Luna.RadPer`.
- **Windows:** Git warns `LF` → `CRLF` when committing. `dev.sh` was only verified with `sh -n`.

## Templates, tour and views (`templates.ts`, `Dialogs.tsx`, `View3D.tsx`)
- **Templates only build text.** `build(values)` returns an ASCII script; the only calculation is `altitude + 6378.1363` for the semi-major axis. The limits of each input (`min`/`max`) are the ones tested against the engine: Moon with an inclination below 28.7° does not converge (the orbit does not reach the lunar declination) and LEO below 300 km reenters in days and GMAT cuts the run (`Jacchia-Roberts ... below 100 km`).
- **Lunar template = `backend/tests/missions/m7_viaje_luna.script`** with the default values (plus `WriteHeaders = false` and `Precision = 16`). If the template changes, that file and `reference.json` have to be regenerated; nothing checks it automatically.
- **Lunar view of the 3D (`Center = Moon`).** No globe; the scene does not rotate (Cesium's `FIXED` frame used as lunar inertial) and it only frames the points less than 30 000 km from the Moon. Changing the center rebuilds the viewer (`key`). The auxiliary Earth and Moon are smooth spheres, without texture.
- **Tour:** it only shows up the first time (`gmatweb.tour` in localStorage) and with the `?` button. Each step finds its zone by `data-tour`; if the zone is hidden (mobile) the step shows up without a frame.
- **Mobile (≤ 640 px) is viewer only:** no left panel and no Resource/Command tabs. Tablet (≤ 900 px): 220 px panel and bar in two rows.
- **Lighthouse was not run** (the environment did not allow downloading it). Accessibility was measured with a script on the page: button names, field labels and contrast ≥ 4.5:1 in light and dark (`docs/QA.md`, Phase 8).
