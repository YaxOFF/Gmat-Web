# Reusable QA

Verification tests per phase. Reuse and extend; do not reinvent.

## Environment
- `pytest` requires `GMAT_HOME`; without it you get ~26 environment errors:
  `export GMAT_HOME='C:\Users\Yaxon\Downloads\gmat-win-R2026a'`
- If 8000/5173 are taken by old processes (the old backend gives 404 on new routes), start on other ports:
  - Backend: `cd backend; .venv/Scripts/python -m uvicorn app.main:app --port 8001`
  - Vite: `cd frontend; npx vite --config <path>/vite.qa.mjs` with this config (proxy to 8001, port 5175):
```js
import react from 'file:///D:/YaxonFolder/Github/Gmat-Web/frontend/node_modules/@vitejs/plugin-react/dist/index.js'
export default {
  root: 'D:/YaxonFolder/Github/Gmat-Web/frontend',
  plugins: [react()],
  server: { port: 5175, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8001', ws: true }, '/ws': { target: 'ws://127.0.0.1:8001', ws: true } } },
}
```
  - When done, stop only those ports (8001/5175).

## Automatic
- `cd backend; .venv/Scripts/python -m pytest -q` -> phase 5a: 320 passed, 46 skipped, 1 xfailed; phase 5b: 322 passed, 46 skipped, 1 xfailed.
- `cd frontend; npm run lint` (oxlint clean) and `npm run build` (only the chunk >500 kB warning).

## API (python, urllib)
```python
import json, urllib.request as u
B='http://localhost:8001'
def call(p,d=None):
    r=u.Request(B+p,data=json.dumps(d).encode() if d is not None else None,headers={'Content-Type':'application/json'})
    return json.load(u.urlopen(r))
call('/api/parameters')   # 315 items {name,dep,depDefault,unit}; X dep=CoordinateSystem, Altitude dep=Origin
t=call('/api/samples/Ex_HohmannTransfer.script')['text']
t=t.replace("   Maneuver 'Apply TOI' TOI(DefaultSC);","   % Maneuver 'Apply TOI' TOI(DefaultSC);")
m=call('/api/script/parse',{'script':t})          # keys: resources, sequence, raw
# the commented-out Maneuver shows up in m['sequence'][1]['children'] with disabled:true and args {burn,sats}
s=call('/api/script/serialize',m)['script']       # keeps "% Maneuver 'Apply TOI' ..."
call('/api/script/validate',{'script':s})         # {'ok':True,'errors':[]}
call('/api/runs',{'script':s})                    # {'runId':...}
```
- WebSocket `/ws/runs/{id}` from Python gives 403 because of Origin: pass the header `Origin: http://localhost:5175` (or test the run from the UI).
- Commenting out the Hohmann Maneuver makes the run fail (singular Jacobian): it is physics, not a bug. For an OK run, leave the Maneuvers enabled (TOI.Element1=2.2408, GOI.Element1=1.4330).

## Browser (Chrome MCP)
Ejemplos -> type "Hohmann" -> first result -> Misión tab.
1. Tree: nested Target, indented children, EndTarget row.
2. Propagate (Comando tab): Sincronizado, Hacia atrás, +Condición, ×; the "Línea de script" changes.
3. "…" picker: search Altitude, body Earth, Usar -> `Sat.Earth.Altitude`; X with EarthMJ2000Eq -> `Sat.EarthMJ2000Eq.X`.
4. Dragging: real dragging does not trigger HTML5 DnD; use synthetic DragEvents in the JS console:
```js
window.__find=(t,k)=>[...document.querySelectorAll(k||'[role=tree] [role=treeitem]')].find(e=>e.textContent.trim().endsWith(t));
window.__dnd=async(src,dst,frac)=>{const dt=new DataTransfer();const w=()=>new Promise(r=>setTimeout(r,60));
const ev=(el,t,y)=>{const b=el.getBoundingClientRect();el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:b.left+10,clientY:y??b.top+b.height/2}))};
ev(src,'dragstart');await w();const b=dst.getBoundingClientRect();const y=b.top+b.height*frac;ev(dst,'dragover',y);await w();ev(dst,'drop',y);await w();ev(src,'dragend');await w();};
// frac<0.35 before (block) / <0.5 before (leaf); frac 0.7 over a block = inside; EndTarget row: '[role=tree] [class*=end]'; final gap: '[role=tree] [class*=tail]'
await window.__dnd(__find('Prop 1 Day'),__find('Prop to Perigee'),0.2)
```
   Cases: before, after, inside the Target, over EndTarget, final gap; a Target does not drop onto itself, a child or its EndTarget.
5. ↑/↓ with a real click (buttons under the selector).
6. Add: choose in the select (native `value` setter + `change` event) and click Agregar; with a selection inside a block it nests. Test Report, Toggle, GMAT, Stop, If/Else, While, For, BeginScript, BeginFiniteBurn.
7. Comment out/Enable a Maneuver: line `% Maneuver ...;` in the Editor, `.cmd` struck through; button disabled on blocks and Else.
8. Delete: first click "¿Borrar?", second one deletes.
9. Correr (green button), wait ~10 s: console "Mission run completed".
10. Phase 5b (solver/control forms): Target (select Solver = DC, SolveMode/ExitMode/ShowProgressWindow with empty option = omitted); Vary (edit Upper/MaxStep: the line and the Editor change); Achieve (Tolerance + `…` picker); If (+Condición, connector `|`, operator `>`, × on the 1st: the connector disappears); For with a created Variable (start/step/end -> `For Variable1 = 2:2:6;`); Validar -> "El motor cargó el script sin errores.".
11. Phase 5b KEY (Hohmann from scratch): Nuevo, in Recursos set the select (native setter) and click Crear for Spacecraft, ForceModel, Propagator, ImpulsiveBurn x2, DifferentialCorrector (Local/Earth/VNB are the default values). In Misión, with `__add` (select + Agregar, in JS) add in order Propagate, Target, Vary, Maneuver, Propagate, Achieve, Vary, Maneuver, Achieve (they nest in the Target; they use the first DC/ship/burn). Edit: stop `Spacecraft1.Periapsis`/`Apoapsis` (clear the value), Vary 2 `ImpulsiveBurn2.Element1`, Maneuver 2 burn ImpulsiveBurn2, Achieve 2 `Spacecraft1.ECC` = 0. Run: ImpulsiveBurn1.Element1 = 2.24028397735, ImpulsiveBurn2.Element1 = 1.432966302 (identical to the sample; the plan's "≈2.2408" is approximate). Output in the UI console (there is no Report).
- Regression: Ejemplos -> Correr; Recursos tab (list, Crear Spacecraft, dedicated editor); edit the script by hand and check the tree.
- No errors: `read_console_messages onlyErrors` (tracking starts on the first call; call it before acting); `scrollWidth <= innerWidth`.
- Gotchas:
  - `resize_window` does not change the viewport: capture mobile with headless Chrome `--window-size=390,800 <url>`.
  - Native `confirm()`/`prompt()` (resource Delete/Rename, ResourceTree.tsx) freeze CDP; avoid them or press Enter in the dialog.
  - The command's label and line are confirmed on blur: press Tab before checking.
  - Nuevo leaves the old Misión tree (bug 4b) until the Editor is edited; the Recursos tab does get cleared. Typing `% new` in the Editor is enough.
  - After `Nuevo` the Chrome session can have a different viewport height: clicks by coordinates on tree rows change; measure with `getBoundingClientRect` or a screenshot before clicking (a wrong click edited Upper of another Vary).
  - `javascript_tool` blocks with "[BLOCKED: Cookie/query string data]" if the returned value includes a very long `document.body.innerText` or a textarea with certain texts; return excerpts or use a screenshot. The Agregar selector is the first `select`; the If condition selects are later `select`s (op1, connector, op2).
  - Click on the Editor tab + click in the area + `ctrl+End` + screenshot lets you read the script (Monaco virtualizes lines; there is no `window.monaco`).
  - Screenshots: copy to `qa-capturas/fase-<N>/` (ignored by git).

## Per phase
- Phase 5a: parameters, parse/serialize of `% Cmd;`, Misión tree, Propagate form, picker, drag, ↑/↓, add, comment out, delete, Hohmann run, resource regression.
- Phase 5b: Target/Vary/Achieve/If/For forms, `parser._args`, new commands with the first resource, Hohmann built from scratch (TOI 2.24028397735, GOI 1.432966302), 5a regression (drag, comment out, delete).

### Phase 6a (Results)
- Numbers: add your own `ReportFile` to the script (`RFq.Add={DefaultSC.A1ModJulian,DefaultSC.EarthMJ2000Eq.X,...}`) and compare against `GET /api/runs/{id}/results` (`ships[].columns`, `reports[]`, `xyplots[]`): Hohmann gave a max. difference of 0 over 151 rows. With `WriteHeaders=false` the 1st data row is taken as the header (the table loses 1 row).
- `/files/..%2F..`, `a%2Fb`, `..%5C..`, `gmatweb_*.csv` -> 404. Run helper: POST `/api/runs` and poll `/results` (409 until finished).
- BackProp: `Propagate BackProp` with POSITIVE `ElapsedDays` never finishes (use negative). With `Propagate +0.5d; BackProp -0.3d` the ship data stays at 0..0.2 d (176 rows) while the raw ReportFile has 698: `_csv` trims wrongly.
- UI: Ejemplos -> Correr -> Resultados tab; the "Vista" select is driven with the native setter + `change` (values `gt:`/`sc:`/`rf:`/`xy:`). Download hook: override `HTMLAnchorElement.prototype.click` and read `a.download`/blob.
- When loading another sample, Resultados keeps the previous run's results until you run again; running clears it.

### Phase 6b (Cesium 3D view)
- Load a script through the UI without a dialog: `fetch('/api/samples/X.script')`, a `File` in `input[type=file]` (DataTransfer) + `change` event; Ejemplos: the search input is the first one that is NOT `type=file`.
- Network: `read_network_requests urlPattern:'https://'` -> 0 (everything comes from `/cesium/Assets`). The "Cesium ion" notice is only a local credit (ion-credit.png).
- Long: Hohmann with `ElapsedSecs = 432000` + `DefaultProp.MaxStep = 8; InitialStepSize = 8;` gives 56 948 rows; the 3D tab loads without error.
- `requestAnimationFrame` in the Chrome MCP window runs at ~1 fps (even without WebGL): it is no use for measuring fps. A `javascript_tool` >45 s gives a CDP timeout: split into steps.
- Editor/3D/Resultados tabs x6: 1 constant `.cesium-viewer`, sawtooth heap (no leak).
- The 3D tab starts paused: click ▶ (333,608 at 1568 px). `computer` 'scroll' clicks zoom Cesium.

### Phase 7a (Live solvers)
- API: WS helper (python `websockets`, `additional_headers={'Origin':'http://localhost:5175'}`, URL `/api/ws/runs/{id}`): print `type:'solver'` events. Hohmann: 12 iterations, last TOI 2.24028397735 / GOI 1.432966302, `end` converged. With `DC.MaximumIterations = 3;` before `BeginMissionSequence`: `end` failed, 3 iterations. `Ex_Yukon_AlgebraicOptimization`: kind Optimize, converged.
- UI: Solver tab; green/red notice (`role=status|alert`); yellow console line (color rgb(210,153,34)) "Aviso: el solver DC no convergio". Without Target/Optimize: empty message.
- Mobile without resize: on the page, `document.body.innerHTML=''` + `<iframe src="/" width=390>` same origin; load the script and click via `iframe.contentDocument`; capture with `computer`. Note: the scrollWidth of 717 at 390 px already exists on all tabs (app not responsive).
- Measure chart/table overlap: `getBoundingClientRect` of `[class*=_chart_]` vs its parent `[class*=_view_]`.

### Phase 7b (sample batch)
- `python -m app.batch --jobs 4` (~1 min) regenerates docs/COMPATIBILITY.md; make a copy beforehand (the file was not in git) and compare with `sed -E 's/\| [0-9.]+ \|/| T |/'` to ignore times. It left 64/8/0/0/1/15 stable; it leaves no orphan processes (an already open desktop GMAT.exe is the user's).
- Check whether a `plugin` really does not run: script with `sys.path.insert(0,'.')` and `python -I`, under `if __name__=='__main__'` (spawn), calling `batch.run_desktop(path)` and `await batch.run_web(text)`. In 7b: 8 of 9 "plugin" samples tested (MarsOrbit, Constellation, EclipseLocation, PlanetographicRegion, Covariance, StationContactLocator, IntrusionLocator, Inter_Spacecraft_Tracking) run ok through the web; Contact_Location_Station_Mask gives missing file (relative path).

### Phase 7c1 (QA backlog)
- Load a sample through the UI without a dialog: `__load(name, text?)` = `fetch('/api/samples/X.script')` + a `File` in `input[type=file]` + `change`; `__btn('Correr')` finds a button by text. Wait 15-20 s and read `document.body.innerText.slice(-500)`.
- Relative paths: Ex_Propagate_ThrustHistoryFile and Ex_Contact_Location_Station_Mask run from the UI ("Corrida terminada", 1 and 3 files).
- sanitize directly (`from app.engine.sanitize import sanitize; sanitize(text, Path('C:/run/out'))`): ReportFile/ContactLocator `../samples/x.txt` and absolute ones -> `C:/run/out/x.txt`; ThrustHistoryFile and TrackingFileSet without a Simulator stay as input (they do not write); with a Simulator, TrackingFileSet goes to the run. Note: ThrustHistoryFile with a nonexistent path outside samples is left as is (read-only).
- ShowProgress: `DC.ShowProgress = false;` before BeginMissionSequence -> line "Aviso: DC tiene ShowProgress = false..." in the console.
- Custom dialogs: Renombrar (name `1 bad name` and a repeated `GOI` disable the button with a message), Borrar TOI lists "Vary 'Vary TOI.V' / Maneuver 'Apply TOI'". Enter/Escape work.
- ForceModel: PrimaryBodies `{Earth, Luna}` adds GravityField.Luna.*; going back to `{Earth}` removes them from the script.
- Monaco markers: after Validar with `DefaultSC.Bogus = 3;` a squiggle appears (`.squiggly-error`); Ctrl+G + number to reach the line. Today it is NOT cleared when editing by hand (ScriptEditor.tsx only clears on an external setValue).
- Guardar: hook `HTMLAnchorElement.prototype.click` and `fetch(this.href)` to read the content; no `GMAT ` lines.
- Mobile: 390 px iframe still has scrollWidth 717 (pre-existing).

### Phase 7c2 (own missions)
- The missions in `backend/tests/missions/` do not show up in `/api/samples`. Serve them with CORS (`python` http.server on 127.0.0.1:8765, `os.chdir` to that folder, header `Access-Control-Allow-Origin: *`) and load with `__load(name, 'http://127.0.0.1:8765/<m>.script')` (variant of `__load` with second argument = URL; a `File` in `input[type=file]` + `change`).
- `__sel()` = the Results Vista select (options `gt:`/`sc:`/`rf:`); the solver runs selector is the select whose options start with `#N ·`. Note: the first select on the page is the Agregar one.
- Guardar: hook `HTMLAnchorElement.prototype.click` + `fetch(href)`; compare with the original normalizing spaces (`replace(/\s+/g,' ')`). Expected and semantically equal differences: quotes are lost in `HistoricWeatherSource/PredictedWeatherSource = 'X'`, `Create Variable A B;` is split into one line per variable, an end-of-line comment becomes its own line, `1e-8` -> `1e-08`.
- 7c2 numbers (all equal to `reference.json`): m1 X=-4177.282287801592; m2 SK.Element1 per run -3.21037154806e-05 / -3.55370228741e-05 / -5.29010330181e-06; m3 LOI -0.603883729799; m4 FuelMass 1.000000000009152; m5 TOI 2.41950136969, GOI 1.46455506119. None of the own missions has an XYPlot (Results only gt/sc/rf).
- m6: Validar and Correr give 2 squiggles (lines 8 and 13); typing clears them; Validar brings them back.
- The Solver's log Y axis shows "0" on several ticks (values < 0.001 rounded).

### Phase 8 (UX: templates, undo, live validation, responsive)
- Templates against the engine, without a browser: `API=http://127.0.0.1:8001 node --experimental-strip-types backend/tests/tools/templates_check.mjs [luna|leo|hohmann|track]`. It runs each template with its default values, with the minimum and the maximum of each input, and the lunar one also on 5 dates (2025 to 2030). It prints ships, rows and the last row of the report. Expected: 29 cases without `ERROR`, `NO VALIDA` or `INVALID`; lunar default `Nave.Luna.RMAG` 5003.08, TLI 3.129455786, LOI -0.6438904876; Hohmann 500 km TOI 2.369788305, GOI 1.446256485. A run that GMAT cuts halfway returns `/results` anyway: you can tell because the last row is the one from the first `Report` (it happened with LEO at 200 km: it reenters).
- Limits taken from that test: Moon with INC 20 does not converge (TLI 4.42, ECC 4422); LEO at 200 km reenters in less than 1 day.
- Lunar web vs desktop: `backend/tests/missions/m7_viaje_luna.script` (generated from the template) in `pytest -m slow tests/test_missions.py` -> 7 passed.
- Moon in results: `pytest tests/test_results.py::test_moon_columns_and_static_ship` compares `LunaMJ2000Eq.X` and the distance with your own ReportFile (`DefaultSC.LunaEq.X`, `DefaultSC.Luna.RMAG`) and checks that the Moon is 356-407 thousand km from Earth.
- Browser (helpers in the JS console): `__btn(text)`, `__set(el, value)` (native setter + `input`/`change`), `__log()` (lines of the app console), `__tab(text)`, `__w(ms)`. A `javascript_tool` longer than 45 s times out: launch Correr and read the log in another call.
  1. First visit (no `gmatweb.tour` in localStorage): the tour shows up, 6 steps with a frame; Terminar saves it and it does not show up again.
  2. Plantillas: 4 cards, the lunar one highlighted; radius 100 disables Crear and shows "Entre 2000 y 20000"; Crear misión loads `viaje_luna.script` (17 resources) and indicator "✓ Sin errores" after ~2 s.
  3. Correr: ~3 s; Solver with 2 runs (the 2nd converges in 37 iterations); Results with the Distancias chart; 3D with the Moon and, with Centro = Luna, the lunar orbit (the 2-option select `Earth`/`Luna`).
  4. Save by shortcut and read the text: override `HTMLAnchorElement.prototype.click` (stores `fetch(this.href)`) and dispatch `keydown` Ctrl+S on `window`.
  5. Undo: resource Nave, field `DryMass` 850 -> 900 (blur), ↶ leaves it at 850, ↷ at 900, Ctrl+Z on `window` 850 again.
  6. Validation next to the field: typing `abc` in `DryMass` shows "Debe ser un número…" without leaving the field; `-5` + blur shows after ~3 s the engine message in the field, the form box, ⚠ in the tree and "⚠ 1 error" in the bar (title with "Línea 18"); ↶ clears it.
  7. Palette: `keydown` Ctrl+K; 39 actions with the lunar one loaded; "orbita leo" (without accent) leaves "Plantilla: Órbita LEO"; "solver" + Enter opens the Solver tab.
  8. Draft: reloading the page restores the script and the first line of the console is "Se recuperó el borrador…".
  9. F5 (`keydown` on `window`) runs the Traza en tierra template; Hohmann from template gives TOI 2.36978830493, GOI 1.44625648474 and "DC convergió en 4 iteraciones".
  10. Regression: Ejemplos -> Ex_HohmannTransfer -> Correr: TOI 2.24028397735, GOI 1.432966302.
- Responsive without changing the window: a same-origin `<iframe src="/" width=768|390>` and measure the `scrollWidth` of the iframe's document. Result: 768 -> 768 (77 px bar, left panel visible); 390 -> 390 (no left panel, Editor/3D/Resultados/Solver tabs).
- Accessibility without Lighthouse (it could not be downloaded): a script on the page that goes through buttons (accessible name), fields (aria-label, label or title) and the contrast of each text against its background (canvas to normalize colors, threshold 4.5:1 or 3:1 for large text). Views: resource, command, Solver, Results and templates dialog, in dark and in light (`document.documentElement.dataset.theme = 'light'`). Result: 0 without a name, 0 without a label, 0 with low contrast. Careful when measuring: clear the canvas (`clearRect`) before each color, otherwise a transparent background returns the previous color.
- Closed 7c2 backlog item: `FM.Drag.HistoricWeatherSource = ConstantFluxAndGeoMag` without quotes loads the same as with quotes (`/api/script/validate` -> `ok: true` in both, with `AtmosphereModel` before).
