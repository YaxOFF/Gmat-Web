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
- `cd backend; .venv/Scripts/python -m pytest -q` -> fase 5a: 320 passed, 46 skipped, 1 xfailed.
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
- Regresión: Ejemplos -> Correr; pestaña Recursos (lista, Crear Spacecraft, editor dedicado); editar script a mano y ver el árbol.
- Sin errores: `read_console_messages onlyErrors` (el rastreo empieza en la primera llamada; llamarlo antes de actuar); `scrollWidth <= innerWidth`.
- Trampas:
  - `resize_window` no cambia el viewport: capturar móvil con Chrome headless `--window-size=390,800 <url>`.
  - `confirm()`/`prompt()` nativos (Borrar/Renombrar de recursos, ResourceTree.tsx) congelan CDP; evitarlos o pulsar Enter en el diálogo.
  - Etiqueta y línea del comando se confirman al perder foco: pulsar Tab antes de comprobar.
  - Capturas: copiar a `qa-capturas/fase-<N>/` (ignorada por git).

## Por fase
- Fase 5a: parameters, parse/serialize de `% Cmd;`, árbol Misión, formulario Propagate, picker, drag, ↑/↓, agregar, comentar, borrar, corrida Hohmann, regresión de recursos.
