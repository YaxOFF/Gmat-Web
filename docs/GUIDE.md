<!-- fuente: frontend/src/i18n/es.ts, frontend/src/mission/commands.ts, backend/app/engine/sanitize.py, backend/app/samples.py, backend/app/batch.py, backend/tests/missions/make_reference.py, backend/tests/test_missions.py, dev.ps1 | rev: e76b7b9 -->
# Usage guide

How to use the simulator, how to add missions, what else you can do with it and where to look (web and original C++) when something fails.

Status: phases 0 to 8 finished. Docker (9) and E2E (10) remain. Details in `PLAN.md`.

## 1. What it is

A web interface for GMAT R2026a. The physics is computed by the real engine (`gmatpy`); the web only builds the script, runs it in a separate process and shows what GMAT wrote. That is why a result must be identical to desktop GMAT's, and if it is not, there is a bug in the web layer (section 7).

The working document is always a GMAT `.script`. The forms and trees are another view of the same text.

## 2. Starting

```powershell
$env:GMAT_HOME = 'C:\Users\Yaxon\Downloads\gmat-win-R2026a'
./dev.ps1
```

Open `http://localhost:5173`. The top right should say **GMAT R2026a ready**. If it says "Engine unavailable": `GMAT_HOME` is set wrong, or an old backend is using port 8000 (`netstat -ano | findstr ":8000 :5173"`).

Variables and limits (300 s timeout per run, 2 runs at a time, 512 kB script): table in `README.md`.

## 3. The screen

| Zone | What it does |
|---|---|
| Bar: **New, Open, Templates, Samples, Save, ↶ ↷, Validate, Run/Stop** | Open and Save use local `.script` files. Templates creates a complete mission from a few inputs. Samples lists the 162 scripts in `GMAT_HOME/samples`. ↶ ↷ undo and redo changes to the text and to the forms. Validate loads the script into the engine without running it. |
| Bar: **✓ No errors / ⚠ N errors** | Live validation: the engine checks the script every time you stop typing. Clicking the notice takes you to the first error. The error also shows up next to the field and with ⚠ in the resource tree. |
| Bar: **Commands** and **?** | Commands (Ctrl+K) searches any action, tab or resource. ? repeats the guided tour. |
| Left, **Resources** | Object tree (ships, hardware, propagators, burns, solvers, variables, outputs). Create, rename (updates references), clone, delete. |
| Left, **Mission** | Sequence tree. Add a command by category, drag, ↑/↓, comment out, delete. |
| Center, **Editor** | The script in Monaco. Editing here updates the trees (about 400 ms later) and vice versa. |
| Center, **Resource / Command** | Form of the selected element. Spacecraft, ForceModel and Propagator have their own editor; the rest use a generic one taken from the engine. |
| Center, **Results** | Charts of each XYPlot, tables of each ReportFile, status of each ship and 2D ground track. Exports PNG and CSV. |
| Center, **3D** | Trajectories with a time bar, follow ship and inertial camera. It draws the Moon and its path; **Center = Moon** shows the orbit around the Moon. |
| Center, **Solver** | Iterations of each Target/Optimize: table, convergence chart and a notice if it does not converge. |
| Bottom, **Console** | Live GMAT log. An error with a line number is clickable. |

Shortcuts: **Ctrl+S** save, **F5** run, **Ctrl+Z / Ctrl+Y** undo and redo, **Ctrl+K** command palette.

The text is saved only in the browser (draft): when you reload the page it comes back, with a notice in the console. New discards it.

On a tablet the left panel gets narrower. On mobile the app is viewer only: Editor, 3D, Results, Solver and console.

## 4. First mission

### Trip to the Moon in one minute
1. **Templates** → **Trip to the Moon**. Leave the default inputs or change the departure date, lunar orbit radius (2000 to 20000 km), days in orbit and inclination (28.7° to 60°). **Create mission**.
2. **Run** (F5). It takes about 3 s.
3. **Solver**: two runs. The first rotates the departure orbit until it points at the Moon; the second adjusts the TLI impulse and computes the LOI braking. With the default inputs: TLI = 3.1295 km/s, LOI = -0.6439 km/s.
4. **Results** → Distances chart: the distance to Earth goes up and the distance to the Moon drops to the requested radius.
5. **3D**: the ship leaves Earth and reaches the Moon. Change **Center** to **Moon** to see the lunar orbit.

The template uses two ships: `Sonda` does the test aiming and `Nave` does the real trip. The other templates (LEO orbit, Hohmann transfer to GEO, Satellite ground track) work the same way.

### With a GMAT sample

1. **Samples** → `Ex_HohmannTransfer`. It is the reference: it converges with TOI = 2.24028397735 and GOI = 1.432966302.
2. **Run**. The console shows the log; when it finishes, Results, 3D and Solver appear.
3. In **Resources** open the ship and change `SMA`. In **Mission** open a `Propagate` and change its stop condition. Look in **Editor** at how the text changed.
4. **Validate**, **Run** again and compare.
5. **Save** downloads the `.script`. That file opens the same way in desktop GMAT.

To start from scratch: **New**, create in Resources a `Spacecraft`, a `ForceModel`, a `Propagator` and a `ReportFile`, and in Mission add a `Propagate` and a `Report`.

## 5. What a script looks like

```
Create Spacecraft Sat;            % 1. resources: Create + fields
Sat.SMA = 7000;
Create ForceModel FM;
Create Propagator Prop;
Prop.FM = FM;
Create ReportFile R;
R.Filename = 'salida.txt';

BeginMissionSequence;             % 2. sequence: what happens, in order
Propagate Prop(Sat) {Sat.ElapsedDays = 1};
Report R Sat.A1ModJulian Sat.SMA Sat.Altitude;
```

Rules the web imposes or GMAT requires:

- **Without `BeginMissionSequence` there are no results.** The web inserts its hidden reports right before that line.
- **ASCII only.** GMAT rejects the whole script because of one accent, even if it is in a comment.
- **Outputs always go to the run folder.** Of `Filename`, `OutputFile`, `ReportFile` and `MatlabFile` only the file name is kept.
- **Forbidden on the server:** `GmatFunction`, `CallPythonFunction`/`Python.x`, `CallMatlabFunction`, `System`, `Save`, `#Include`. Do not use `System` or `Save` as a resource name: it is rejected all the same.
- **Desktop viewers are commented out automatically** (`OrbitView`, `GroundTrackPlot`, `OpenFramesInterface`). They are not needed: the 3D tab and the 2D ground track come from the hidden reports. Write them on a single line, without `...`.
- **`ShowProgress = false` on a solver** leaves the Solver tab empty.

Language reference (all fields and commands): `GMAT_HOME/docs/help/help.html` and `GMAT_UsersGuide.pdf`.

## 6. Adding a mission

There are three levels, depending on what you want it for.

### 6.1 Just using it

**Open** the `.script`, or paste it into the Editor. It does not touch the repo.

### 6.2 Making it show up in the Samples gallery

The gallery reads every `*.script` under `GMAT_HOME/samples`, with subfolders (`backend/app/samples.py`). Copy your file there, for example into `samples/Propias/`, and restart the backend (the list is kept in memory). The description shown is the first block of `%` comments in the file.

Input files (ephemerides, thrust histories) also go under `samples/` and are cited with a path relative to `samples` that contains `/`, like `'../samples/Propias/datos.thf'`. A path relative to the script's subfolder is not found.

To make it show up in **Templates** with its input wizard: `docs/TASKS.md`, "New mission template".

### 6.3 As a regression mission (compared against desktop)

It is used to guarantee that the web keeps giving GMAT's numbers. Model: `backend/tests/missions/m1_leo_drag.script`.

1. Create `backend/tests/missions/m7_<name>.script`. Harness requirements:
   - a `ReportFile` with `Filename = '<something>.txt'` (the first `Filename` in the file), `WriteHeaders = false` and `Precision = 16`;
   - a `Report` as the last report of the sequence: its last row is what gets compared;
   - ASCII only.
2. Generate the reference with gmatpy directly, without the web layer:
   ```sh
   cd backend
   .venv/Scripts/python tests/missions/make_reference.py
   ```
   It rewrites `reference.json` for all missions. Check the diff: the others must not change.
3. Compare the web against that reference (relative tolerance 1e-8, same solvers and same final iterations):
   ```sh
   .venv/Scripts/python -m pytest -m slow tests/test_missions.py
   ```
4. A mission that must fail (like `m6_errors.script`) also counts: the error lines and the messages are compared.

The seven that already exist cover: LEO with drag, GEO with a Target inside a For, lunar transfer, finite burn until the tank is empty, Optimize with Yukon and constraints, a script with errors and the template's complete trip to the Moon (`m7`).

### 6.4 Implementing something the UI does not have yet

Everything the engine accepts already runs from the Editor. What is missing, if anything, is the form. Steps and model file in `docs/TASKS.md`:

| I want | Task in `TASKS.md` |
|---|---|
| A form for a command (today it falls back to the line editor) | "New command form" |
| The parser to understand a syntax | "Supporting a new script command or syntax" |
| A dedicated editor for a resource | Model: `frontend/src/resources/Editors.tsx` |
| To allow or forbid something in scripts | "New sanitize rule" |
| A new piece of engine data in the UI | "New endpoint" |

After touching `sanitize`, `results`, `solver` or `runner`, run `python -m app.batch` and check that the `ok` count does not drop below 118 of 162.

## 7. When something does not work

### 7.1 First, decide whose fault it is

Run the same script without the web layer. Two ways:

- Desktop GMAT: `GMAT_HOME\bin\GMAT.exe`, or without a window `GmatConsole.exe mi.script` (from `GMAT_HOME\bin`).
- From the repo: `batch.run_desktop(Path('mi.script'))` (gmatpy directly, without sanitize or hidden reports).

| Result | Where the problem is |
|---|---|
| It fails the same way on desktop | In the script or in GMAT. Read the message, search the manual and then the C++ (7.3). |
| It runs on desktop and fails on the web | In the web layer. Look at the run folder (7.2). |
| It runs on both with different numbers | Port bug. Add the mission to `tests/missions/` (6.3) to pin it down. |
| It runs, but a form or the tree shows it wrong | Parser or frontend. `docs/GOTCHAS.md`, Parser and Tree sections. |

### 7.2 The run folder

Each run lives for one hour in `%TEMP%\gmat-web-runs\run-*` (`GMAT_WEB_RUNS`):

- `mission.script`: what really ran, already sanitized and with the hidden reports. Compare it with your original: there you can see which line was commented out or which path was rewritten.
- `gmat.log`: the full engine log.
- `startup.txt`: that run's startup file.
- `gmatweb_*.csv`: the hidden reports that feed Results and 3D.

Engine exit codes: 2 = it did not load the script (`LoadScript`), 3 = it failed while running (`RunScript`), other = the engine crashed.

### 7.3 Web → original C++ map

Source code: `C:\Users\Yaxon\Downloads\GMAT-src` (tag R2026a). Search there for the exact text of the error message with `Grep`: it almost always gives you the file on the first try.

| Symptom | Web layer | Original C++ (`GMAT-src/`) |
|---|---|---|
| The script does not load, syntax error | `engine/sanitize.py`, the run's `mission.script` | `src/base/interpreter/ScriptInterpreter.cpp`, `Interpreter.cpp`, `Validator.cpp` |
| A field does not exist, has another name or rejects a value | `engine/schema.py` (reads it from the engine) | the object's class, in its `PARAMETER_TEXT` and `SetStringParameter`/`SetRealParameter`: `src/base/spacecraft/Spacecraft.cpp`, `forcemodel/ODEModel.cpp`, `propagator/PropSetup.cpp`, `burn/ImpulsiveBurn.cpp`; common base `foundation/GmatBase.cpp` |
| A command does something unexpected | `script/parser.py` (`_args`) only for the form | `src/base/command/<Command>.cpp` (106 files: `Propagate.cpp`, `Maneuver.cpp`, `Target.cpp`, `Vary.cpp`, `Achieve.cpp`); list in `factory/CommandFactory.cpp` |
| The Propagate does not stop where it should | nothing | `src/base/stopcond/StopCondition.cpp`, `command/Propagate.cpp` |
| The solver does not converge or the Solver tab is empty | `engine/solver.py` (reads the progress text) | `src/base/solver/DifferentialCorrector.cpp` (`GetProgressString`), `Optimizer.cpp`; Yukon in `plugins/YukonOptimizerPlugin/src/base/solver/Yukonad.cpp` |
| A parameter (`Sat.Earth.Altitude`) does not exist or cannot be reported | `schema.engine_parameters`, `/api/parameters` | `src/base/parameter/` (`ParameterInfo.cpp` and the parameter's class) |
| Report or chart with odd or empty data | `engine/results.py` (`inject`, `read`) | `src/base/subscriber/ReportFile.cpp`, `XyPlot.cpp` |
| "Missing file", a path that does not resolve | `sanitize._in_path` | `src/gmatutil/util/FileUtil.cpp` (`GmatFileUtil::FindFile`), `FileManager.cpp` |
| Different state or epoch conversion | `worker.convert_state`, `convert_epoch` | `src/gmatutil/util/StateConversionUtil.cpp`, `TimeSystemConverter.cpp` |
| The engine crashes or does not start | `engine/worker.py`, `runner.py` | `src/base/executive/Moderator.cpp`, `Sandbox.cpp` |
| A type or command "does not exist" | startup file (commented-out plugin, section 8) | `plugins/<Name>Plugin/` |
| How the original GUI behaved | `frontend/src/resources`, `mission` | `src/gui/` (`spacecraft/`, `propagator/`, `burn/`, `solver/`, `mission/`, `subscriber/`) |
| Questions about the Python API | `engine/worker.py` | `swig/gmat_py.i`, `swig/gmat.i`; examples in `GMAT_HOME/api/*.py` |

Documents in the installation (`GMAT_HOME/docs`): `GMATMathSpec.pdf` for the equations, `GMAT-Architectural-Specification.pdf` for the engine's structure, `GMAT_API_UsersGuide.pdf` for `gmatpy`.

### 7.4 Frequent failures

| What you see | Cause |
|---|---|
| "Script rejected" with a line | A `sanitize` security rule (section 5). |
| `Non-ASCII character` | An accent or symbol in the script. |
| `Jacchia-Roberts ... below 100 km` | The satellite reentered because of drag: raise the altitude or lower `DragArea`. |
| `Hardware Exception` in a finite burn | The tank crossed zero: lower `MaxStep` or stop before `FuelMass = 0`. |
| `Create Array A;` does not load | Dimensions are missing: `Create Array A[3,3];`. |
| Empty results | `BeginMissionSequence` is missing. |
| Run stopped at 300 s | `GMAT_WEB_RUN_TIMEOUT`. Estimation runs take up to 190 s. |
| 429 when running | There are already 2 runs (`GMAT_WEB_MAX_RUNS`). |
| "Engine unavailable" after an odd error | A worker died and the pool is not recreated: restart the backend. |
| New routes give 404 | Old backend on port 8000. |

Full list of gotchas: `docs/GOTCHAS.md`.

## 8. What you can do with this

### 8.1 Already works today (118 of 162 samples run)

Open the indicated sample in **Samples** and use it as a base.

| Mission type | Sample |
|---|---|
| Transfers with Target | `Ex_HohmannTransfer`, `Ex_GEOTransfer`, `Tut_SimpleOrbitTransfer` |
| Moon | `Ex_LunarTransfer`, `Ex_GivenEpochGoToTheMoon`, `Ex_DoubleLunarSwingby`, `Ex_LCROSSTrajectory` |
| Mars and interplanetary | `Ex_MarsBPlane`, `Tut_Mars_B_Plane_Targeting`, `Ex_MarsOrbit`, `Ex_Yukon_MarsLaunchWindowAnalysis` |
| Libration points | `Ex_L2Design`, `Ex_LibrationPointStationKeeping_ESM` |
| Orbit maintenance | `Ex_LEOStationKeeping`, `Ex_LunarOrbitStationKeeping` |
| Finite and electric thrust | `Ex_FiniteBurn`, `Tut_Target_Finite_Burn_to_Raise_Apogee`, `Ex_ElectricPropulsion`, `Ex_ThrusterWithMultipleTanks` |
| Optimization | `Ex_Yukon_AlgebraicOptimization` (Yukon only; VF13ad and SNOPT are not installed) |
| Force and attitude models | `Ex_ForceModels`, `Ex_HighFidelitySRP`, `Ex_Attitude_*`, `Ex_Integrators` |
| Eclipses and station contacts | `Ex_EclipseLocation`, `Ex_StationContactLocator`, `Ex_Contact_Location_Station_Mask` |
| Constellations and formations | `Ex_ConstellationScript`, `Ex_SafetyEllipse` |
| Ephemerides (TLE, OEM, SPICE, STK) | `Ex_TLE_Propagation`, `Ex_OEMPropagation`, `Ex_SPICEOrbitAndAttitudePropagation`, `Ex_STKEphemOutput` |
| Orbit determination | `Tut_Simulate_DSN_Range_and_Doppler_Data`, `Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data`, `Navigation/Ex_Estimate_*` |
| Logic and math in the script | `Ex_ControlFlow`, `Ex_MathInScript`, `Ex_NewMathFunctions` |

These run, but the UI only shows the generic parts: estimation and events have no views of their own. Their outputs are read as a ReportFile or downloaded as a raw file.

Status of each sample: `docs/COMPATIBILITY.md`.

### 8.2 Does not work, and why

- **Plugins commented out in the startup file** (28 samples): VF13ad, SNOPT, CSALT (optimal control), MarsGRAM, ExternalForceModel. VF13ad, SNOPT, CSALT and MarsGRAM are proprietary libraries that the public distribution does not include. To enable one you do have: uncomment its `PLUGIN` line in `GMAT_HOME/bin/gmat_startup_file.txt`, restart the backend and delete `backend/.cache/schema/` so its types appear.
- **GmatFunction, Python, MATLAB, `#Include`** (12 samples): forbidden on purpose, because they execute code on the server. For local-only use they could be allowed by relaxing `FORBIDDEN` in `sanitize.py`; never on a VPS.
- **Limits of the views:** the 3D only centers on Earth or the Moon (not on Mars or other bodies) and its auxiliary spheres have no texture; there are no maneuver markers; the ground track is always relative to Earth; the ship editor's conversions only use `EarthMJ2000Eq`.

### 8.3 To get more out of it

Ordered from least to most effort.

1. **Use the API without the interface.** `POST /api/runs` with a script, then `GET /api/runs/{id}/results` returns trajectories and reports as JSON (`docs/API.md`). With that, a Python script can do sweeps: vary inclination, mass or launch date, launch N runs (at most `GMAT_WEB_MAX_RUNS` at a time) and plot the result. It is the fastest way to do parametric or Monte Carlo studies.
2. **Your own mission bank.** Each mission in `tests/missions/` stays verified against desktop forever (6.3). It works as course material with guaranteed results.
3. **Teaching.** The `Tut_*` follow the tutorials in the GMAT manual; the Solver tab teaches a Target's convergence better than desktop does.
4. **More templates:** each one is about 60 lines in `templates.ts` (`docs/TASKS.md`). Candidates: Mars with B-plane, GEO station-keeping, finite burn.
5. **Phase 9:** Docker and VPS, to use it from any computer without installing GMAT.
6. **Phase 11, per-plugin views:** timeline of eclipses and contacts (EventLocator), estimation residuals, formations. The engine already computes them; showing them is what is missing.
7. **3D improvements:** a central body other than Earth, the Moon, maneuver markers, sensor cones.
8. **Phase 12:** accounts, missions saved on the server and sharing by link.

## 9. Where everything is

| I need | Read |
|---|---|
| System pieces and front/back contract | `docs/SYSTEM.md` |
| Which file a concept lives in | `docs/MAP.md` |
| Steps to implement something | `docs/TASKS.md` |
| Engine, parser and sync gotchas | `docs/GOTCHAS.md` |
| API routes and events | `docs/API.md` |
| Which samples run | `docs/COMPATIBILITY.md` |
| Phases, decisions and log | `PLAN.md` (web port), `PLAN-JUEGO.md` (Trip to the Moon game) |
