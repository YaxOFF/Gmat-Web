<!-- fuente: frontend/src/i18n/es.ts, frontend/src/mission/commands.ts, backend/app/engine/sanitize.py, backend/app/samples.py, backend/app/batch.py, backend/tests/missions/make_reference.py, backend/tests/test_missions.py, dev.ps1 | rev: 1ee8d23 -->
# Guía de uso

Cómo usar el simulador, cómo agregar misiones, qué más se puede hacer con él y dónde mirar (web y C++ original) cuando algo falla.

Estado: fases 0 a 8 terminadas. Faltan Docker (9) y E2E (10). Detalle en `PLAN.md`.

## 1. Qué es

Una interfaz web para GMAT R2026a. La física la calcula el motor real (`gmatpy`); la web solo arma el script, lo corre en un proceso aparte y muestra lo que GMAT escribió. Por eso un resultado debe ser idéntico al de GMAT escritorio, y si no lo es hay un bug en la capa web (sección 7).

El documento de trabajo es siempre un `.script` de GMAT. Los formularios y árboles son otra vista del mismo texto.

## 2. Arrancar

```powershell
$env:GMAT_HOME = 'C:\Users\Yaxon\Downloads\gmat-win-R2026a'
./dev.ps1
```

Abre `http://localhost:5173`. Arriba a la derecha debe decir **GMAT R2026a listo**. Si dice "Motor no disponible": `GMAT_HOME` mal puesto, o un backend viejo ocupa el puerto 8000 (`netstat -ano | findstr ":8000 :5173"`).

Variables y límites (timeout de 300 s por corrida, 2 corridas a la vez, script de 512 kB): tabla en `README.md`.

## 3. La pantalla

| Zona | Qué hace |
|---|---|
| Barra: **Nuevo, Abrir, Plantillas, Ejemplos, Guardar, ↶ ↷, Validar, Correr/Detener** | Abrir y Guardar usan archivos `.script` locales. Plantillas crea una misión completa con unos pocos datos. Ejemplos lista los 162 scripts de `GMAT_HOME/samples`. ↶ ↷ deshacen y rehacen cambios del texto y de los formularios. Validar carga el script en el motor sin correrlo. |
| Barra: **✓ Sin errores / ⚠ N errores** | Validación en vivo: el motor revisa el script cada vez que dejas de escribir. Clic en el aviso lleva al primer error. El error también sale junto al campo y con ⚠ en el árbol de recursos. |
| Barra: **Comandos** y **?** | Comandos (Ctrl+K) busca cualquier acción, pestaña o recurso. ? repite el recorrido guiado. |
| Izquierda, **Recursos** | Árbol de objetos (naves, hardware, propagadores, maniobras, solvers, variables, salidas). Crear, renombrar (actualiza referencias), clonar, borrar. |
| Izquierda, **Misión** | Árbol de la secuencia. Agregar comando por categoría, arrastrar, ↑/↓, comentar, borrar. |
| Centro, **Editor** | El script en Monaco. Editar aquí actualiza los árboles (unos 400 ms después) y al revés. |
| Centro, **Recurso / Comando** | Formulario del elemento seleccionado. Spacecraft, ForceModel y Propagator tienen editor propio; el resto usa uno genérico sacado del motor. |
| Centro, **Resultados** | Gráficas de cada XYPlot, tablas de cada ReportFile, estado de cada nave y traza en tierra 2D. Exporta PNG y CSV. |
| Centro, **3D** | Trayectorias con barra de tiempo, seguir nave y cámara inercial. Dibuja la Luna y su recorrido; **Centro = Luna** muestra la órbita alrededor de la Luna. |
| Centro, **Solver** | Iteraciones de cada Target/Optimize: tabla, gráfica de convergencia y aviso si no converge. |
| Abajo, **Consola** | Log de GMAT en vivo. Un error con número de línea es clicable. |

Atajos: **Ctrl+S** guardar, **F5** correr, **Ctrl+Z / Ctrl+Y** deshacer y rehacer, **Ctrl+K** paleta de comandos.

El texto se guarda solo en el navegador (borrador): al recargar la página vuelve, con un aviso en la consola. Nuevo lo descarta.

En tablet el panel izquierdo se angosta. En móvil la app es solo visor: Editor, 3D, Resultados, Solver y consola.

## 4. Primera misión

### Viaje a la Luna en un minuto
1. **Plantillas** → **Viaje a la Luna**. Deja los datos por defecto o cambia fecha de salida, radio de la órbita lunar (2000 a 20000 km), días en órbita e inclinación (28,7° a 60°). **Crear misión**.
2. **Correr** (F5). Tarda unos 3 s.
3. **Solver**: dos corridas. La primera gira la órbita de salida hasta apuntar a la Luna; la segunda ajusta el impulso TLI y calcula el frenado LOI. Con los datos por defecto: TLI = 3.1295 km/s, LOI = -0.6439 km/s.
4. **Resultados** → Gráfica Distancias: la distancia a la Tierra sube y la distancia a la Luna cae hasta el radio pedido.
5. **3D**: la nave sale de la Tierra y alcanza a la Luna. Cambia **Centro** a **Luna** para ver la órbita lunar.

La plantilla usa dos naves: `Sonda` hace el apuntado de prueba y `Nave` hace el viaje real. Las otras plantillas (Órbita LEO, Hohmann a GEO, Traza en tierra) funcionan igual.

### Con un ejemplo de GMAT

1. **Ejemplos** → `Ex_HohmannTransfer`. Es la referencia: converge con TOI = 2.24028397735 y GOI = 1.432966302.
2. **Correr**. La consola muestra el log; al terminar aparecen Resultados, 3D y Solver.
3. En **Recursos** abre la nave y cambia `SMA`. En **Misión** abre un `Propagate` y cambia su condición de parada. Mira en **Editor** cómo cambió el texto.
4. **Validar**, **Correr** otra vez y compara.
5. **Guardar** baja el `.script`. Ese archivo abre igual en GMAT escritorio.

Para empezar de cero: **Nuevo**, crea en Recursos un `Spacecraft`, un `ForceModel`, un `Propagator` y un `ReportFile`, y en Misión agrega un `Propagate` y un `Report`.

## 5. Cómo es un script

```
Create Spacecraft Sat;            % 1. recursos: Create + campos
Sat.SMA = 7000;
Create ForceModel FM;
Create Propagator Prop;
Prop.FM = FM;
Create ReportFile R;
R.Filename = 'salida.txt';

BeginMissionSequence;             % 2. secuencia: lo que pasa, en orden
Propagate Prop(Sat) {Sat.ElapsedDays = 1};
Report R Sat.A1ModJulian Sat.SMA Sat.Altitude;
```

Reglas que la web impone o que GMAT exige:

- **Sin `BeginMissionSequence` no hay resultados.** La web inserta sus reportes ocultos justo antes de esa línea.
- **Solo ASCII.** GMAT rechaza el script entero por una tilde, aunque esté en un comentario.
- **Las salidas van siempre a la carpeta de la corrida.** De `Filename`, `OutputFile`, `ReportFile` y `MatlabFile` solo se conserva el nombre del archivo.
- **Prohibido en el servidor:** `GmatFunction`, `CallPythonFunction`/`Python.x`, `CallMatlabFunction`, `System`, `Save`, `#Include`. No uses `System` ni `Save` como nombre de un recurso: se rechaza igual.
- **Los visores de escritorio se comentan solos** (`OrbitView`, `GroundTrackPlot`, `OpenFramesInterface`). No hacen falta: la pestaña 3D y la traza 2D salen de los reportes ocultos. Escríbelos en una sola línea, sin `...`.
- **`ShowProgress = false` en un solver** deja la pestaña Solver vacía.

Referencia del lenguaje (todos los campos y comandos): `GMAT_HOME/docs/help/help.html` y `GMAT_UsersGuide.pdf`.

## 6. Agregar una misión

Hay tres niveles, según para qué la quieras.

### 6.1 Solo usarla

**Abrir** el `.script`, o pegarlo en el Editor. No toca el repo.

### 6.2 Que salga en la galería de Ejemplos

La galería lee todos los `*.script` bajo `GMAT_HOME/samples`, con subcarpetas (`backend/app/samples.py`). Copia tu archivo ahí, por ejemplo en `samples/Propias/`, y reinicia el backend (la lista se guarda en memoria). La descripción que se muestra es el primer bloque de comentarios `%` del archivo.

Los archivos de entrada (efemérides, historiales de empuje) van también bajo `samples/` y se citan con ruta relativa a `samples` que contenga `/`, como `'../samples/Propias/datos.thf'`. Una ruta relativa a la subcarpeta del script no se encuentra.

Para que salga en **Plantillas** con su asistente de datos: `docs/TAREAS.md`, "Plantilla de misión nueva".

### 6.3 Como misión de regresión (comparada contra escritorio)

Sirve para garantizar que la web sigue dando los números de GMAT. Modelo: `backend/tests/missions/m1_leo_drag.script`.

1. Crea `backend/tests/missions/m7_<nombre>.script`. Requisitos del harness:
   - un `ReportFile` con `Filename = '<algo>.txt'` (el primer `Filename` del archivo), `WriteHeaders = false` y `Precision = 16`;
   - un `Report` como último reporte de la secuencia: su última fila es lo que se compara;
   - solo ASCII.
2. Genera la referencia con gmatpy directo, sin la capa web:
   ```sh
   cd backend
   .venv/Scripts/python tests/missions/make_reference.py
   ```
   Reescribe `reference.json` para todas las misiones. Revisa el diff: las otras no deben cambiar.
3. Compara la web contra esa referencia (tolerancia relativa 1e-8, mismos solvers y mismas iteraciones finales):
   ```sh
   .venv/Scripts/python -m pytest -m slow tests/test_missions.py
   ```
4. Una misión que debe fallar (como `m6_errors.script`) también vale: se comparan las líneas con error y los mensajes.

Las siete que ya hay cubren: LEO con arrastre, GEO con Target dentro de un For, transferencia lunar, finite burn hasta vaciar el tanque, Optimize con Yukon y restricciones, un script con errores y el viaje a la Luna completo de la plantilla (`m7`).

### 6.4 Implementar algo que la UI aún no tiene

Todo lo que el motor acepta ya corre desde el Editor. Lo que falta, si falta, es el formulario. Pasos y archivo modelo en `docs/TAREAS.md`:

| Quiero | Tarea en `TAREAS.md` |
|---|---|
| Un formulario para un comando (hoy cae al editor de línea) | "Formulario de comando nuevo" |
| Que el parser entienda una sintaxis | "Soportar un comando o sintaxis nueva del script" |
| Un editor dedicado para un recurso | Modelo: `frontend/src/resources/Editors.tsx` |
| Permitir o prohibir algo en los scripts | "Regla nueva de sanitize" |
| Un dato nuevo del motor en la UI | "Endpoint nuevo" |

Tras tocar `sanitize`, `results`, `solver` o `runner`, corre `python -m app.batch` y revisa que los `ok` no bajen de 118 de 162.

## 7. Cuando algo no funciona

### 7.1 Primero, decidir de quién es el fallo

Corre el mismo script sin la capa web. Dos formas:

- GMAT escritorio: `GMAT_HOME\bin\GMAT.exe`, o sin ventana `GmatConsole.exe mi.script` (desde `GMAT_HOME\bin`).
- Desde el repo: `batch.run_desktop(Path('mi.script'))` (gmatpy directo, sin sanitize ni reportes ocultos).

| Resultado | Dónde está el problema |
|---|---|
| Falla igual en escritorio | En el script o en GMAT. Lee el mensaje, busca en el manual y luego en el C++ (7.3). |
| Corre en escritorio y falla en la web | En la capa web. Mira la carpeta de la corrida (7.2). |
| Corre en ambos con números distintos | Bug del port. Agrega la misión a `tests/missions/` (6.3) para fijarlo. |
| Corre, pero un formulario o el árbol lo muestra mal | Parser o frontend. `docs/GOTCHAS.md`, secciones Parser y Árbol. |

### 7.2 La carpeta de la corrida

Cada corrida vive una hora en `%TEMP%\gmat-web-runs\run-*` (`GMAT_WEB_RUNS`):

- `mission.script`: lo que de verdad corrió, ya saneado y con los reportes ocultos. Compáralo con tu original: ahí se ve qué línea se comentó o qué ruta se reescribió.
- `gmat.log`: el log completo del motor.
- `startup.txt`: el startup file de esa corrida.
- `gmatweb_*.csv`: los reportes ocultos que alimentan Resultados y 3D.

Códigos de salida del motor: 2 = no cargó el script (`LoadScript`), 3 = falló al correr (`RunScript`), otro = el motor se cayó.

### 7.3 Mapa web → C++ original

Código fuente: `C:\Users\Yaxon\Downloads\GMAT-src` (tag R2026a). Busca ahí el texto exacto del mensaje de error con `Grep`: casi siempre da el archivo a la primera.

| Síntoma | Capa web | C++ original (`GMAT-src/`) |
|---|---|---|
| El script no carga, error de sintaxis | `engine/sanitize.py`, `mission.script` de la corrida | `src/base/interpreter/ScriptInterpreter.cpp`, `Interpreter.cpp`, `Validator.cpp` |
| Un campo no existe, tiene otro nombre o rechaza un valor | `engine/schema.py` (lo lee del motor) | la clase del objeto, en su `PARAMETER_TEXT` y `SetStringParameter`/`SetRealParameter`: `src/base/spacecraft/Spacecraft.cpp`, `forcemodel/ODEModel.cpp`, `propagator/PropSetup.cpp`, `burn/ImpulsiveBurn.cpp`; base común `foundation/GmatBase.cpp` |
| Un comando hace algo inesperado | `script/parser.py` (`_args`) solo para el formulario | `src/base/command/<Comando>.cpp` (106 archivos: `Propagate.cpp`, `Maneuver.cpp`, `Target.cpp`, `Vary.cpp`, `Achieve.cpp`); lista en `factory/CommandFactory.cpp` |
| El Propagate no para donde debe | nada | `src/base/stopcond/StopCondition.cpp`, `command/Propagate.cpp` |
| El solver no converge o la pestaña Solver sale vacía | `engine/solver.py` (lee el texto de progreso) | `src/base/solver/DifferentialCorrector.cpp` (`GetProgressString`), `Optimizer.cpp`; Yukon en `plugins/YukonOptimizerPlugin/src/base/solver/Yukonad.cpp` |
| Un parámetro (`Sat.Earth.Altitude`) no existe o no se puede reportar | `schema.engine_parameters`, `/api/parameters` | `src/base/parameter/` (`ParameterInfo.cpp` y la clase del parámetro) |
| Reporte o gráfica con datos raros o vacíos | `engine/results.py` (`inject`, `read`) | `src/base/subscriber/ReportFile.cpp`, `XyPlot.cpp` |
| "Falta archivo", ruta que no resuelve | `sanitize._in_path` | `src/gmatutil/util/FileUtil.cpp` (`GmatFileUtil::FindFile`), `FileManager.cpp` |
| Conversión de estado o de época distinta | `worker.convert_state`, `convert_epoch` | `src/gmatutil/util/StateConversionUtil.cpp`, `TimeSystemConverter.cpp` |
| El motor se cae o no arranca | `engine/worker.py`, `runner.py` | `src/base/executive/Moderator.cpp`, `Sandbox.cpp` |
| Un tipo o comando "no existe" | startup file (plugin comentado, sección 8) | `plugins/<Nombre>Plugin/` |
| Cómo se comportaba la GUI original | `frontend/src/resources`, `mission` | `src/gui/` (`spacecraft/`, `propagator/`, `burn/`, `solver/`, `mission/`, `subscriber/`) |
| Dudas de la API de Python | `engine/worker.py` | `swig/gmat_py.i`, `swig/gmat.i`; ejemplos en `GMAT_HOME/api/*.py` |

Documentos de la instalación (`GMAT_HOME/docs`): `GMATMathSpec.pdf` para las ecuaciones, `GMAT-Architectural-Specification.pdf` para la estructura del motor, `GMAT_API_UsersGuide.pdf` para `gmatpy`.

### 7.4 Fallos frecuentes

| Qué ves | Causa |
|---|---|
| "Script rechazado" con línea | Regla de seguridad de `sanitize` (sección 5). |
| `Non-ASCII character` | Una tilde o símbolo en el script. |
| `Jacchia-Roberts ... below 100 km` | El satélite reentró por arrastre: sube la altitud o baja `DragArea`. |
| `Hardware Exception` en un finite burn | El tanque cruzó cero: baja `MaxStep` o para antes de `FuelMass = 0`. |
| `Create Array A;` no carga | Faltan dimensiones: `Create Array A[3,3];`. |
| Resultados vacíos | Falta `BeginMissionSequence`. |
| Corrida detenida a los 300 s | `GMAT_WEB_RUN_TIMEOUT`. Las de estimación tardan hasta 190 s. |
| 429 al correr | Ya hay 2 corridas (`GMAT_WEB_MAX_RUNS`). |
| "Motor no disponible" tras un error raro | Un worker murió y el pool no se recrea: reinicia el backend. |
| Rutas nuevas dan 404 | Backend viejo en el puerto 8000. |

Lista completa de trampas: `docs/GOTCHAS.md`.

## 8. Qué se puede hacer con esto

### 8.1 Ya funciona hoy (118 de 162 samples corren)

Abre el sample indicado en **Ejemplos** y úsalo de base.

| Tipo de misión | Sample |
|---|---|
| Transferencias con Target | `Ex_HohmannTransfer`, `Ex_GEOTransfer`, `Tut_SimpleOrbitTransfer` |
| Luna | `Ex_LunarTransfer`, `Ex_GivenEpochGoToTheMoon`, `Ex_DoubleLunarSwingby`, `Ex_LCROSSTrajectory` |
| Marte e interplanetario | `Ex_MarsBPlane`, `Tut_Mars_B_Plane_Targeting`, `Ex_MarsOrbit`, `Ex_Yukon_MarsLaunchWindowAnalysis` |
| Puntos de libración | `Ex_L2Design`, `Ex_LibrationPointStationKeeping_ESM` |
| Mantenimiento de órbita | `Ex_LEOStationKeeping`, `Ex_LunarOrbitStationKeeping` |
| Empuje finito y eléctrico | `Ex_FiniteBurn`, `Tut_Target_Finite_Burn_to_Raise_Apogee`, `Ex_ElectricPropulsion`, `Ex_ThrusterWithMultipleTanks` |
| Optimización | `Ex_Yukon_AlgebraicOptimization` (solo Yukon; VF13ad y SNOPT no están instalados) |
| Modelos de fuerza y actitud | `Ex_ForceModels`, `Ex_HighFidelitySRP`, `Ex_Attitude_*`, `Ex_Integrators` |
| Eclipses y contactos con estación | `Ex_EclipseLocation`, `Ex_StationContactLocator`, `Ex_Contact_Location_Station_Mask` |
| Constelaciones y formaciones | `Ex_ConstellationScript`, `Ex_SafetyEllipse` |
| Efemérides (TLE, OEM, SPICE, STK) | `Ex_TLE_Propagation`, `Ex_OEMPropagation`, `Ex_SPICEOrbitAndAttitudePropagation`, `Ex_STKEphemOutput` |
| Determinación de órbita | `Tut_Simulate_DSN_Range_and_Doppler_Data`, `Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data`, `Navigation/Ex_Estimate_*` |
| Lógica y matemáticas en el script | `Ex_ControlFlow`, `Ex_MathInScript`, `Ex_NewMathFunctions` |

Estos corren, pero la UI muestra solo lo genérico: estimación y eventos no tienen vistas propias. Sus salidas se leen como ReportFile o se bajan como archivo crudo.

Estado de cada sample: `docs/COMPATIBILIDAD.md`.

### 8.2 No funciona, y por qué

- **Plugins comentados en el startup file** (28 samples): VF13ad, SNOPT, CSALT (control óptimo), MarsGRAM, ExternalForceModel. VF13ad, SNOPT, CSALT y MarsGRAM son librerías propietarias que la distribución pública no trae. Para activar uno que sí tengas: descomenta su línea `PLUGIN` en `GMAT_HOME/bin/gmat_startup_file.txt`, reinicia el backend y borra `backend/.cache/schema/` para que sus tipos aparezcan.
- **GmatFunction, Python, MATLAB, `#Include`** (12 samples): prohibidos a propósito, porque ejecutan código en el servidor. En un uso solo local se podrían permitir relajando `FORBIDDEN` en `sanitize.py`; nunca en un VPS.
- **Límites de las vistas:** el 3D solo centra en la Tierra o la Luna (no en Marte u otros cuerpos) y sus esferas auxiliares no tienen textura; no hay marcadores de maniobra; la traza en tierra es siempre respecto a la Tierra; las conversiones del editor de nave solo usan `EarthMJ2000Eq`.

### 8.3 Para sacarle más provecho

Ordenado de menor a mayor esfuerzo.

1. **Usar la API sin la interfaz.** `POST /api/runs` con un script, luego `GET /api/runs/{id}/results` devuelve trayectorias y reportes en JSON (`docs/API.md`). Con eso un script de Python puede hacer barridos: variar inclinación, masa o fecha de lanzamiento, lanzar N corridas (máximo `GMAT_WEB_MAX_RUNS` a la vez) y graficar el resultado. Es la forma más rápida de hacer estudios paramétricos o Monte Carlo.
2. **Banco de misiones propio.** Cada misión en `tests/missions/` queda verificada contra escritorio para siempre (6.3). Sirve como material de curso con resultados garantizados.
3. **Docencia.** Los `Tut_*` siguen los tutoriales del manual de GMAT; la pestaña Solver enseña la convergencia de un Target mejor que el escritorio.
4. **Más plantillas:** cada una son unas 60 líneas en `templates.ts` (`docs/TAREAS.md`). Candidatas: Marte con B-plane, station-keeping GEO, finite burn.
5. **Fase 9:** Docker y VPS, para usarlo desde cualquier equipo sin instalar GMAT.
6. **Fase 11, vistas por plugin:** línea de tiempo de eclipses y contactos (EventLocator), residuos de estimación, formaciones. El motor ya los calcula; falta mostrarlos.
7. **Mejoras del 3D:** cuerpo central distinto de la Tierra, la Luna, marcadores de maniobra, conos de sensor.
8. **Fase 12:** cuentas, misiones guardadas en servidor y compartir por enlace.

## 9. Dónde está cada cosa

| Necesito | Leer |
|---|---|
| Piezas del sistema y contrato front/back | `docs/SISTEMA.md` |
| En qué archivo vive un concepto | `docs/MAP.md` |
| Pasos para implementar algo | `docs/TAREAS.md` |
| Trampas del motor, parser y sincronía | `docs/GOTCHAS.md` |
| Rutas y eventos de la API | `docs/API.md` |
| Qué samples corren | `docs/COMPATIBILIDAD.md` |
| Fases, decisiones y bitácora | `PLAN.md` (port web), `PLAN-JUEGO.md` (juego Viaje a la Luna) |
