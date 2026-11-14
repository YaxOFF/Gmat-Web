# QA reutilizable

Pruebas de verificación por fase. Reusar y ampliar; no reinventar.

## Entorno
- `pytest` exige `GMAT_HOME`; sin él da ~26 errores de entorno:
  `export GMAT_HOME='C:\Users\Yaxon\Downloads\gmat-win-R2026a'`
- Si 8000/5173 están ocupados por procesos viejos (el backend viejo da 404 en rutas nuevas), levantar en otros puertos:
  - Backend: `cd backend; .venv/Scripts/python -m uvicorn app.main:app --port 8001`
  - Vite: `cd frontend; npx vite --config <ruta>/vite.qa.mjs` con este config (proxy a 8001, puerto 5175):
```js
import react from 'file:///D:/YaxonFolder/Github/Gmat-Web/frontend/node_modules/@vitejs/plugin-react/dist/index.js'
export default {
  root: 'D:/YaxonFolder/Github/Gmat-Web/frontend',
  plugins: [react()],
  server: { port: 5175, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8001', ws: true }, '/ws': { target: 'ws://127.0.0.1:8001', ws: true } } },
}
```
  - Al terminar, detener solo esos puertos (8001/5175).

## Automático
- `cd backend; .venv/Scripts/python -m pytest -q` -> fase 5a: 320 passed, 46 skipped, 1 xfailed; fase 5b: 322 passed, 46 skipped, 1 xfailed.
- `cd frontend; npm run lint` (oxlint limpio) y `npm run build` (solo aviso de chunk >500 kB).

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
m=call('/api/script/parse',{'script':t})          # claves: resources, sequence, raw
# el Maneuver comentado sale en m['sequence'][1]['children'] con disabled:true y args {burn,sats}
s=call('/api/script/serialize',m)['script']       # conserva "% Maneuver 'Apply TOI' ..."
call('/api/script/validate',{'script':s})         # {'ok':True,'errors':[]}
call('/api/runs',{'script':s})                    # {'runId':...}
```
- WebSocket `/ws/runs/{id}` desde Python da 403 por Origin: pasar header `Origin: http://localhost:5175` (o probar la corrida desde la UI).
- Comentar el Maneuver de Hohmann hace fallar la corrida (jacobiano singular): es física, no bug. Para una corrida OK, dejar los Maneuver habilitados (TOI.Element1=2.2408, GOI.Element1=1.4330).

## Navegador (Chrome MCP)
Ejemplos -> escribir "Hohmann" -> primer resultado -> pestaña Misión.
1. Árbol: Target anidado, hijos sangrados, fila EndTarget.
2. Propagate (pestaña Comando): Sincronizado, Hacia atrás, +Condición, ×; la "Línea de script" cambia.
3. Picker "…": buscar Altitude, cuerpo Earth, Usar -> `Sat.Earth.Altitude`; X con EarthMJ2000Eq -> `Sat.EarthMJ2000Eq.X`.
4. Arrastrar: el arrastre real no dispara HTML5 DnD; usar DragEvent sintéticos en la consola JS:
```js
window.__find=(t,k)=>[...document.querySelectorAll(k||'[role=tree] [role=treeitem]')].find(e=>e.textContent.trim().endsWith(t));
window.__dnd=async(src,dst,frac)=>{const dt=new DataTransfer();const w=()=>new Promise(r=>setTimeout(r,60));
const ev=(el,t,y)=>{const b=el.getBoundingClientRect();el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:b.left+10,clientY:y??b.top+b.height/2}))};
ev(src,'dragstart');await w();const b=dst.getBoundingClientRect();const y=b.top+b.height*frac;ev(dst,'dragover',y);await w();ev(dst,'drop',y);await w();ev(src,'dragend');await w();};
// frac<0.35 antes (bloque) / <0.5 antes (hoja); frac 0.7 sobre bloque = dentro; fila EndTarget: '[role=tree] [class*=end]'; hueco final: '[role=tree] [class*=tail]'
await window.__dnd(__find('Prop 1 Day'),__find('Prop to Perigee'),0.2)
```
   Casos: antes, después, dentro del Target, sobre EndTarget, hueco final; un Target no cae sobre sí mismo, un hijo ni su EndTarget.
5. ↑/↓ con clic real (botones bajo el selector).
6. Agregar: elegir en el select (setter nativo de `value` + evento `change`) y clic en Agregar; con selección dentro de un bloque se anida. Probar Report, Toggle, GMAT, Stop, If/Else, While, For, BeginScript, BeginFiniteBurn.
7. Comentar/Habilitar un Maneuver: línea `% Maneuver ...;` en el Editor, `.cmd` tachado; botón deshabilitado en bloques y Else.
8. Borrar: primer clic "¿Borrar?", segundo borra.
9. Correr (botón verde), esperar ~10 s: consola "Mission run completed".
10. Fase 5b (formularios de solver/control): Target (select Solver = DC, SolveMode/ExitMode/ShowProgressWindow con opción vacía = se omite); Vary (editar Upper/MaxStep: cambia la línea y el Editor); Achieve (Tolerance + picker `…`); If (+Condición, conector `|`, operador `>`, × a la 1.ª: desaparece el conector); For con Variable creada (inicio/paso/fin -> `For Variable1 = 2:2:6;`); Validar -> "El motor cargó el script sin errores.".
11. Fase 5b CLAVE (Hohmann desde cero): Nuevo, en Recursos poner el select (setter nativo) y clic Crear para Spacecraft, ForceModel, Propagator, ImpulsiveBurn x2, DifferentialCorrector (Local/Earth/VNB son los valores por defecto). En Misión, con `__add` (select + Agregar, en JS) agregar en orden Propagate, Target, Vary, Maneuver, Propagate, Achieve, Vary, Maneuver, Achieve (se anidan en el Target; usan el primer DC/nave/burn). Editar: stop `Spacecraft1.Periapsis`/`Apoapsis` (vaciar el valor), Vary 2 `ImpulsiveBurn2.Element1`, Maneuver 2 burn ImpulsiveBurn2, Achieve 2 `Spacecraft1.ECC` = 0. Correr: ImpulsiveBurn1.Element1 = 2.24028397735, ImpulsiveBurn2.Element1 = 1.432966302 (idéntico al sample; el "≈2.2408" del plan es aproximado). Salida en la consola de la UI (no hay Report).
- Regresión: Ejemplos -> Correr; pestaña Recursos (lista, Crear Spacecraft, editor dedicado); editar script a mano y ver el árbol.
- Sin errores: `read_console_messages onlyErrors` (el rastreo empieza en la primera llamada; llamarlo antes de actuar); `scrollWidth <= innerWidth`.
- Trampas:
  - `resize_window` no cambia el viewport: capturar móvil con Chrome headless `--window-size=390,800 <url>`.
  - `confirm()`/`prompt()` nativos (Borrar/Renombrar de recursos, ResourceTree.tsx) congelan CDP; evitarlos o pulsar Enter en el diálogo.
  - Etiqueta y línea del comando se confirman al perder foco: pulsar Tab antes de comprobar.
  - Nuevo deja el árbol de Misión viejo (bug 4b) hasta que se edita el Editor; la pestaña Recursos sí se vacía. Basta teclear `% new` en el Editor.
  - Tras `Nuevo` la sesión de Chrome puede tener otra altura de viewport: los clics por coordenadas de filas del árbol cambian; medir con `getBoundingClientRect` o captura antes de clicar (un clic erróneo editó Upper de otro Vary).
  - `javascript_tool` bloquea con "[BLOCKED: Cookie/query string data]" si el valor devuelto incluye `document.body.innerText` muy largo o textarea con ciertos textos; devolver recortes o usar captura. El selector del Agregar es el primer `select`; los selects de condiciones de If son `select` posteriores (op1, conector, op2).
  - Clic en tab Editor + clic en el área + `ctrl+End` + captura permite leer el script (Monaco virtualiza líneas; no hay `window.monaco`).
  - Capturas: copiar a `qa-capturas/fase-<N>/` (ignorada por git).

## Por fase
- Fase 5a: parameters, parse/serialize de `% Cmd;`, árbol Misión, formulario Propagate, picker, drag, ↑/↓, agregar, comentar, borrar, corrida Hohmann, regresión de recursos.
- Fase 5b: Target/Vary/Achieve/If/For formularios, `parser._args`, comandos nuevos con el primer recurso, Hohmann armado desde cero (TOI 2.24028397735, GOI 1.432966302), regresión 5a (drag, comentar, borrar).

### Fase 6a (Resultados)
- Números: añadir al script un `ReportFile` propio (`RFq.Add={DefaultSC.A1ModJulian,DefaultSC.EarthMJ2000Eq.X,...}`) y comparar contra `GET /api/runs/{id}/results` (`ships[].columns`, `reports[]`, `xyplots[]`): Hohmann dio diferencia máx. 0 en 151 filas. Con `WriteHeaders=false` la 1.ª fila de datos se toma como cabecera (tabla pierde 1 fila).
- `/files/..%2F..`, `a%2Fb`, `..%5C..`, `gmatweb_*.csv` -> 404. Ayudante de corrida: POST `/api/runs` y sondear `/results` (409 hasta terminar).
- BackProp: `Propagate BackProp` con `ElapsedDays` POSITIVO nunca termina (usar negativo). Con `Propagate +0.5d; BackProp -0.3d` los datos de nave quedan 0..0.2 d (176 filas) mientras el ReportFile crudo tiene 698: `_csv` recorta mal.
- UI: Ejemplos -> Correr -> pestaña Resultados; el select "Vista" se maneja con setter nativo + `change` (valores `gt:`/`sc:`/`rf:`/`xy:`). Ctrl hook de descargas: sobrescribir `HTMLAnchorElement.prototype.click` y leer `a.download`/blob.
- Al cargar otro ejemplo, Resultados conserva los de la corrida anterior hasta correr de nuevo; al correr se vacía.

### Fase 6b (Vista 3D Cesium)
- Cargar un script por UI sin diálogo: `fetch('/api/samples/X.script')`, `File` en `input[type=file]` (DataTransfer) + evento `change`; Ejemplos: el input de búsqueda es el primero que NO es `type=file`.
- Red: `read_network_requests urlPattern:'https://'` -> 0 (todo sale de `/cesium/Assets`). Aviso "Cesium ion" es solo un crédito local (ion-credit.png).
- Largo: Hohmann con `ElapsedSecs = 432000` + `DefaultProp.MaxStep = 8; InitialStepSize = 8;` da 56 948 filas; la pestaña 3D carga sin error.
- `requestAnimationFrame` en la ventana de Chrome MCP va a ~1 fps (incluso sin WebGL): no sirve para medir fps. Un `javascript_tool` >45 s da timeout de CDP: partir en pasos.
- Pestañas Editor/3D/Resultados x6: 1 `.cesium-viewer` constante, heap en diente de sierra (sin fuga).
- La pestaña 3D arranca en pausa: clic en ▶ (333,608 en 1568 px). Los clics 'scroll' de `computer` hacen zoom de Cesium.

### Fase 7a (Solvers en vivo)
- API: ayudante WS (python `websockets`, `additional_headers={'Origin':'http://localhost:5175'}`, URL `/api/ws/runs/{id}`): imprimir eventos `type:'solver'`. Hohmann: 12 iteraciones, ultima TOI 2.24028397735 / GOI 1.432966302, `end` converged. Con `DC.MaximumIterations = 3;` antes de `BeginMissionSequence`: `end` failed, 3 iteraciones. `Ex_Yukon_AlgebraicOptimization`: kind Optimize, converged.
- UI: pestana Solver; aviso verde/rojo (`role=status|alert`); linea de consola amarilla (color rgb(210,153,34)) "Aviso: el solver DC no convergio". Sin Target/Optimize: mensaje vacio.
- Movil sin resize: en la pagina, `document.body.innerHTML=''` + `<iframe src="/" width=390>` mismo origen; cargar script y clics via `iframe.contentDocument`; capturar con `computer`. Ojo: el scrollWidth de 717 a 390 px ya existe en todas las pestanas (app no responsiva).
- Medir solapamiento grafica/tabla: `getBoundingClientRect` de `[class*=_chart_]` vs su padre `[class*=_view_]`.

### Fase 7b (lote de samples)
- `python -m app.batch --jobs 4` (~1 min) regenera docs/COMPATIBILIDAD.md; sacar copia antes (el archivo no estaba en git) y comparar con `sed -E 's/\| [0-9.]+ \|/| T |/'` para ignorar tiempos. Dejó 64/8/0/0/1/15 estable; no deja procesos huérfanos (GMAT.exe de escritorio ya abierto es del usuario).
- Ver si un `plugin` de verdad no corre: script con `sys.path.insert(0,'.')` y `python -I`, bajo `if __name__=='__main__'` (spawn), llamando `batch.run_desktop(path)` y `await batch.run_web(texto)`. En 7b: 8 de 9 samples "plugin" probados (MarsOrbit, Constellation, EclipseLocation, PlanetographicRegion, Covariance, StationContactLocator, IntrusionLocator, Inter_Spacecraft_Tracking) corren ok por la web; Contact_Location_Station_Mask da falta archivo (ruta relativa).

### Fase 7c1 (pendientes de QA)
- Cargar sample por UI sin diálogo: `__load(nombre, texto?)` = `fetch('/api/samples/X.script')` + `File` en `input[type=file]` + `change`; `__btn('Correr')` busca botón por texto. Esperar 15-20 s y leer `document.body.innerText.slice(-500)`.
- Rutas relativas: Ex_Propagate_ThrustHistoryFile y Ex_Contact_Location_Station_Mask corren desde la UI ("Corrida terminada", 1 y 3 archivos).
- sanitize directo (`from app.engine.sanitize import sanitize; sanitize(texto, Path('C:/run/out'))`): ReportFile/ContactLocator `../samples/x.txt` y absolutas -> `C:/run/out/x.txt`; ThrustHistoryFile y TrackingFileSet sin Simulator quedan como entrada (no escriben); con Simulator, TrackingFileSet va a la corrida. Ojo: ThrustHistoryFile con ruta inexistente fuera de samples se deja tal cual (solo lectura).
- ShowProgress: `DC.ShowProgress = false;` antes de BeginMissionSequence -> línea "Aviso: DC tiene ShowProgress = false..." en consola.
- Diálogos propios: Renombrar (nombre `1 bad name` y `GOI` repetido deshabilitan el botón con mensaje), Borrar TOI lista "Vary 'Vary TOI.V' / Maneuver 'Apply TOI'". Enter/Escape funcionan.
- ForceModel: PrimaryBodies `{Earth, Luna}` agrega GravityField.Luna.*; volver a `{Earth}` los quita del script.
- Marcadores Monaco: tras Validar con `DefaultSC.Bogus = 3;` aparece squiggle (`.squiggly-error`); Ctrl+G + número para llegar a la línea. Hoy NO se limpia al editar a mano (ScriptEditor.tsx solo limpia en setValue externo).
- Guardar: hook `HTMLAnchorElement.prototype.click` y `fetch(this.href)` para leer el contenido; sin líneas `GMAT `.
- Móvil: iframe 390 px sigue con scrollWidth 717 (preexistente).
