<!-- fuente: backend/app/engine, backend/app/script, backend/app/main.py, frontend/src/store.ts, frontend/src/model/refs.ts, frontend/src/resources, dev.ps1 | rev: ead1d00 -->
# Trampas

Leídas del código y comprobadas con el motor real donde dice "(verificado)".

## Motor y workers (`engine/worker.py`)
- **`gmatpy` solo en workers.** Singleton global por proceso. `tests/test_health.py` comprueba que no está en `sys.modules` del proceso API.
- **Un worker muerto rompe el pool para siempre.** `worker.submit` no recrea el pool: tras un `BrokenProcessPool`, `/api/health` responde `status: "error"` hasta reiniciar el backend. Por eso lo que puede tumbar el motor va por `schema._isolated`, no por `submit`.
- **El timeout de `submit` no mata la tarea.** Solo deja de esperarla; el worker sigue ocupado. `timeout=0` cuenta como "sin valor" y usa `TASK_TIMEOUT_S`.
- **Scripts sueltos que usan `TestClient` necesitan `if __name__ == "__main__":`.** Los workers son `spawn` y reimportan el script principal; sin la guarda el pool se rompe (verificado).
- **`api_startup_file.txt`.** Si falta en `GMAT_HOME/bin` se genera en `GMAT_WEB_CACHE` reemplazando todo `..` del `gmat_startup_file.txt` por `GMAT_HOME`. Escritura atómica; en Windows `os.replace` puede dar `PermissionError` y se ignora. Quedan temporales `api_startup_file.txt.<pid>` huérfanos en la caché [TODO: causa no confirmada].
- **Cada corrida escribe su propio `startup.txt`** en la carpeta de la corrida con `OUTPUT_PATH` apuntando ahí. `_isolated` y el pool usan el startup común: su `OUTPUT_PATH` es el de GMAT.
- **`cwd = GMAT_HOME/bin`** en corridas, validación, esquemas y `snapshot`: las rutas de entrada `../data/...` son relativas a `bin`.

## Corridas (`engine/runner.py`)
- **Nada se limpia.** El dict `runs`, la lista de eventos de cada corrida y las carpetas `run-*` de `GMAT_WEB_RUNS` quedan hasta reiniciar o borrar a mano (verificado: 203 carpetas locales). Solo las `val-*` de validar se borran. `stop_all` termina procesos, no borra carpetas.
- **Cancelar es una bandera.** `DELETE /runs/{id}` marca `cancelled`; `_supervise` lo ve en su siguiente vuelta (0.2 s), hace `terminate` y emite `error` "Corrida detenida". Si el proceso acaba antes, la corrida termina con `done`. `DELETE` sobre una corrida terminada responde `{ok:true}` sin efecto.
- **El timeout incluye cargar `gmatpy`.** `RUN_TIMEOUT_S` se mide desde que arranca el supervisor.
- **Códigos de salida:** 0 = `done`; 2 = `LoadScript` falló; 3 = `RunScript` falló; otro = caída del motor ("El motor terminó con código N").
- **`MAX_RUNS` cuenta corridas sin terminar.** Validar no cuenta y lanza un proceso propio por petición.
- **Nivel de log por texto (`classify`).** `**** ERROR ****` o `Exception` en cualquier parte = error; `warning` sin distinguir mayúsculas = warning; una línea citada (`"  57: ..."`) = error con `line`. Los textos de error traen la ruta temporal del script.
- **`done.results.files`** lista solo archivos del primer nivel de la carpeta, sin `HIDDEN` (`gmat.log`, `mission.script`, `startup.txt`, `GmatLog.txt`) ni `gmatweb_*`. `/files/{name}` sirve cualquier otro del primer nivel (incluye los `gmatweb_*`).

## Resultados (`engine/results.py`)
- **Los reportes ocultos se inyectan como texto**, no con la API: `Construct('ReportFile')` + `SetField('Add')` no crea los parámetros ni los wrappers y `ScriptInterpreter.ValidateSubscriber` hace `RunScript` caer con access violation (verificado). Van justo antes de la primera línea `BeginMissionSequence`; sin ella no hay resultados.
- **Líneas corridas:** el script que corre tiene N líneas más; `_supervise` resta N a toda `line` desde `manifest["at"]`. Un error dentro de las líneas inyectadas apunta a una línea cercana del usuario.
- **Naves, XYPlot y ReportFile salen del texto** (`Create` y `X.Campo = ...` de una línea, como sanitize): un `Create` con `...` no cuenta. El ReportFile del usuario sin `Filename` se busca como `<nombre>.txt`.
- **`SolverIterations = Current`** en los ocultos: con `None` GMAT omite también la pasada final de un Target; con `Current` escribe solo la pasada final, sin iteraciones (verificado en Hohmann, Mars B-Plane, TargetFiniteBurn). No se recorta nada por tiempo: los tramos `BackProp` quedan tal cual.
- **Sin épocas de maniobra:** GMAT no publica el estado justo tras un `Maneuver` (no hay dos filas con la misma época).
- **XYPlot oculto no sigue `Toggle`** ni el `SolverIterations` del XYPlot. Lat/lon siempre respecto a la Tierra (ignora `CentralBody` del GroundTrackPlot).
- **ReportFile del usuario** (ancho fijo) se parte por 2+ espacios: una celda que llena su ancho exacto se pega a la vecina. Filas de `Report` con otras columnas salen con otro largo. Con `WriteHeaders = false` las cabeceras son los nombres del `Add` (de una sola línea) si cuadran con las columnas, si no `1..n`.

## Solvers (`engine/solver.py`)
- **Se leen del texto de progreso de GMAT en `gmat.log`** (formato de `DifferentialCorrector::GetProgressString` y `Yukonad::GetProgressString`); si una versión de GMAT cambia esos textos, no salen eventos `solver` (el log sigue igual). Con `ShowProgress = false` no hay eventos (verificado en el código, no probado).
- **La tolerancia no sale en el log:** viene del `Achieve` del script (`{Tolerance = x}`, default 0.1); si es una expresión va como texto y no hay `met`. `met` = `|Variance| <= Tolerance`, el mismo criterio del DC.
- **El cierre (`converged`/`did not converge`) no nombra al solver:** se asigna al último activo del mismo tipo. Optimizadores que no son Yukon (base `Optimizer`) no imprimen costo ni restricciones: solo variables.
- **Un Target en un bucle** da una corrida de solver por pasada; el frontend guarda las últimas 200.

## Saneo (`engine/sanitize.py`)
- **Trabaja línea por línea y no une `...`.** Un visor GUI con continuación queda a medias y el script no carga: `OV.Add = {Sat, ...` se comenta y la línea `Earth};` no (verificado). Un `Create` con continuación no se registra.
- **`FORBIDDEN` es por token, sensible a mayúsculas.** Rechaza `CallPythonFunction`, `CallMatlabFunction`, `CallGmatFunction`, `SystemCommand`, `System`, `PythonFunction`, `MatlabFunction`, `GmatFunction`, `Save`, `SaveMission`, `Python.x`, `#Include`. Ignora strings y comentarios. Falso positivo: un recurso o variable llamado `System` o `Save` (verificado). No mira tokens precedidos de `.` (`Obj.Save` pasa).
- **Solo se reescriben 4 campos de salida** (`Filename`, `OutputFile`, `ReportFile`, `MatlabFile`, sin distinguir mayúsculas), en cualquier objeto y también dentro de la secuencia. Se conserva solo el nombre del archivo: dos salidas con el mismo nombre en carpetas distintas chocan. Valor vacío = `output.txt`. [TODO: inventariar campos de salida del motor fuera de esta lista].
- **Las rutas de entrada no se tocan ni se validan.** `Filename` de `ThrustHistoryFile` y `FileInterface` se deja igual (`INPUT_TYPES`), y cualquier otro campo con ruta también: un script puede leer archivos fuera de la corrida.
- **Visores GUI** (`OpenFramesInterface`, `OpenFramesView`, `OrbitView`, `GroundTrackPlot`): se comenta toda línea que nombre uno, así que `Toggle OV RF On` pierde también `RF`.
- **Conserva el número de líneas**; convierte CRLF a LF.
- **El límite de tamaño vive aquí.** `/runs` responde 400 y `/script/validate` 200 con `ok:false`; solo `/script/parse` da 413. `/script/serialize` no tiene límite.

## Esquemas (`engine/schema.py`)
- **Algunos tipos tumban el motor** al leer sus campos (ej. `NuclearPowerSystem`). `_isolated` usa un proceso por llamada y lo mata con `pool._processes` (API privada). Timeout de `_isolated` = excepción sin capturar (500).
- **Un tipo que tumba el motor queda en caché como `null`** en disco. `GET /schema/{type}` responde 200 con `fields: null` y el frontend muestra error. Para reintentar hay que borrar el archivo de caché.
- **Caché:** `GMAT_WEB_CACHE/schema/<versión>.v2.json`, reescrito completo con cada tipo nuevo. Si cambia la forma de lo guardado, subir el sufijo `.v2`. La versión y la caché en memoria duran lo que el proceso (`schema.reset()` es para pruebas). `_lock` global: las consultas de esquema van en serie.
- **Nombres de tipo.** `PropSetup` se publica como `Propagator`. Del factory de PARAMETER solo salen `Variable`, `String`, `Array`. FminconOptimizer, VF13ad y GroundStation no salen (el motor no los lista). Hoy son 47 tipos.
- **`ENUM_CANDIDATES` solo cubre `Spacecraft.DisplayStateType`** y se filtra probando `SetField`. `main.STATE_TYPES` usa la lista sin filtrar.
- **`stateType` es la primera representación que usa el elemento.** `INC`, `RAAN`, `AOP`, `TA` y `SMA` salen como `Keplerian`; `RMAG`, `RA`, `DEC`, `VMAG` como `SphericalAZFPA` (verificado). `Editors.tsx` filtra por igualdad, así que en `ModifiedKeplerian` solo muestra `RadPer` y `RadApo`. Los cartesianos (`X`…`VZ`) no llevan `stateType`: el editor los trata como `Cartesian` a mano (`CART`).
- **`default` es `null` en campos de solo lectura** (leerlos puede tumbar el motor).

## Parser y serializer (`script/`)
- **Nunca descarta líneas:** lo no entendido va a `raw`. Qué va a `raw` y qué cambia de lugar: `docs/EXCEPCIONES_ROUNDTRIP.md` (Límites conocidos).
- **`raw` se escribe después de todos los recursos y antes de `BeginMissionSequence`.** También caen ahí los comentarios del final del script (verificado), un `Create` repetido y las asignaciones de un recurso cuyo `Create` no se entendió.
- **Sin `BeginMissionSequence` todo es zona de recursos:** los comandos van a `raw` y el serializer agrega la línea siempre.
- **Formato estable, no idéntico al original.** Prefijo `GMAT` en toda asignación, sangría de 3 espacios, línea en blanco tras cada recurso, comentarios del recurso juntos antes del `Create`. Los números salen con `repr`: `7100.` pasa a `7100.0`, `1.0e3` a `1000.0`; los enteros siguen enteros.
- **Campos en orden de script.** Un campo anidado `Sat.Tank.X` tiene clave `Tank.X`.
- **Valores:** identificador suelto que no es recurso = string (enum); cualquier otro token sin comillas (recurso, `Sat.X`, ruta) = `{ref}`. Valor con espacios fuera de `{}`/`[]` = no se entiende, va a `raw`.
- **Comandos:** `text` es el resto tal cual y es lo único que escribe el serializer. `args` es una vista derivada de `text` (`_args`) para Propagate, Maneuver, Begin/EndFiniteBurn, Report, Toggle, `GMAT`, Target/Optimize (`{solver, opts}`), Vary/Achieve/Minimize/NonlinearConstraint (`{solver, lhs, op?, rhs?, opts?}`), If/While (`conds` con `join` `&`/`|`) y For (`step` vacío = forma `inicio:fin`); valores de `opts` van como texto (pueden ser expresiones); sintaxis rara (`Prop(Sat, {stop})`, `'Covariance'`) da `{}` y el formulario cae al editor de línea. Los formularios reescriben `text` y `args` juntos (`commands.toText`). Bloques: `Target`, `Optimize`, `If`, `While`, `For`, `BeginScript`. `Else` es un hijo más. Un bloque sin cerrar se serializa con su `End...`; un `End...` sin pareja queda como comando suelto.
- **Comandos comentados:** en la secuencia, una línea `% Cmd ...;` con `Cmd` en `COMMENTABLE` es un comando con `disabled: true` (70 en los samples); se reescribe como `% Cmd ...;`. Bloques, `Else` y cierres no se pueden comentar (cambiaría la estructura): siguen siendo comentarios. Comentarios sin `;` final (`% Propagate to apoapsis`) siguen siendo comentarios.
- **`'` como transpuesta:** una comilla pegada a identificador, `)`, `]`, `.` o `'` no abre string.

## Sincronía script ↔ modelo (`store.ts`)
- **Contador `seq`:** gana el último cambio, venga del texto o del modelo. `editText` ignora el eco del editor comparando el texto.
- **`setMission` es optimista.** Cambia el modelo y luego pide el texto. Si `serialize` falla, el modelo queda adelantado al texto y la siguiente edición del texto lo pisa.
- **Reescribir el texto sube `doc.rev`** y `ScriptEditor` hace `setValue`: se pierde el undo de Monaco y el cursor.
- **Correr y validar usan `doc.text`,** no el modelo; ambos vacían la consola (máximo 5000 líneas).
- **`parseError` casi nunca aparece:** el parser no rechaza scripts; solo 413 o fallo de red. Con error queda el último modelo bueno.
- **El modelo va ~400 ms detrás del texto** (debounce).
- **Sin reintentos.** `schemas[tipo] = 'error'` dura hasta recargar la página. Si falla `fetchTypes`, todo el árbol cae en "other" y solo se puede crear `Spacecraft`.
- **WebSocket cerrado sin `done`/`error`** = mensaje de conexión perdida. `stop` solo manda el `DELETE`; el fin llega por el WebSocket.

## Árbol y formulario (`resources/`, `model/refs.ts`)
- **Crear `Array` desde el árbol da `Create Array Array1;` sin dimensiones y GMAT no lo carga** (verificado).
- **Nombres:** el árbol exige `^[A-Za-z]\w*$`; el parser también acepta `_` inicial.
- **Renombrar** reemplaza el nombre como token suelto en valores `{ref}`, texto de comandos (incluye strings entre comillas dentro del comando), `endText` y líneas `raw`. No toca etiquetas, comentarios ni valores string.
- **Borrar no limpia referencias:** solo las lista en el `confirm`. Clonar pierde los comentarios. Crear/renombrar/borrar usan `prompt`/`alert`/`confirm` nativos.
- **Grupos del árbol:** `EVENT_LOCATOR`, `FIELD_OF_VIEW` y los tipos que el motor no lista caen en "other".
- **Controles del formulario:** `Boolean` = casilla; campo con `enum` = lista; resto = texto, con sugerencias si trae `refType`. No se muestran los de solo lectura. Texto vacío o ↺ quita el campo del script (vuelve al default).
- **Listas y matrices:** todo tipo con `Array`, `Rvector`, `Rmatrix` o `Unsigned` se parte por espacios y comas en una lista plana. Una `Rmatrix` pierde sus filas.
- **Campos que el motor no lista** (`GravityField.<cuerpo>.Degree/Order/PotentialFile`, `Drag.AtmosphereModel`, pasos del integrador del Propagator: `InitialStepSize`, `Accuracy`, `MinStep`, `MaxStep`, `MaxStepAttempts`, `StopIfAccuracyIsViolated`) los define `Editors.tsx` a mano (`syn`) con los defaults de GMAT; listas de cuerpos, atmósferas, integradores y formatos de época también son fijas. El esquema de `Propagator` solo trae `FM` y `Type`; el de ForceModel no trae `GravityField.*` (verificado).
- **Arrastre:** GMAT escribe `FM.Drag = None` sin arrastre y `FM.Drag.AtmosphereModel = X` con él; el editor quita `Drag` y todo `Drag.*` al cambiar de modelo. Igual con `SRP`: GMAT rechaza `SRP.Flux`/`SRP.SRPModel`/`SRP.Nominal_Sun` con `SRP = Off` (verificado), así que cambiar SRP quita todo `SRP.*` (`tests/test_leo.py`).
- **Select con `enum` cuyo valor es un recurso** guarda `{ref}` (si fuera string el serializer lo pondría entre comillas). El Propagator usa eso para `FM` (lista de ForceModel del modelo).
- **`patch` de `Editors.tsx` borra y reescribe la clave:** lo cambiado pasa al final del recurso, así `DisplayStateType` queda antes de los elementos y `DateFormat` antes de `Epoch`.
- **Cambiar `DisplayStateType`** convierte con el motor los elementos de la representación actual (o sus defaults), quita esos y escribe los nuevos; elementos de otras representaciones quedan donde estaban.
- **Campo `Object` con un nombre que no es recurso** (ej. `Earth`) se guarda como string; si no es identificador (`Sat.X`) sale entre comillas.

## Secuencia (`mission/`)
- **El comando seleccionado es una ruta de índices** (`selectedCmd`). Si el script cambia desde el editor, la ruta puede apuntar a otro comando; mover/agregar/borrar la actualiza.
- **Agregar** inserta dentro del bloque seleccionado (al final) o después del comando seleccionado. Soltar sobre un bloque: tercio superior = antes, resto = primer hijo; sobre la fila `End…` = último hijo; sobre el hueco final = al final de la raíz.
- **Editor de línea:** analiza `BeginMissionSequence;
<línea>;` con `/api/script/parse` y rechaza si no sale un solo comando o si pasa de bloque a no bloque.
- **Comandos nuevos** usan el primer recurso del tipo (o nombres por defecto de GMAT como `DefaultSC`, `DC`): pueden no cargar hasta crear esos recursos.
- **`/api/parameters`** va por `_isolated` porque `Construct` deja objetos en la configuración del worker. Si el motor se cae no se guarda en caché (reintenta en la próxima llamada); en el frontend `'error'` dura hasta recargar.

## Conversión de estado
`/api/convert/state` solo usa `EarthMJ2000Eq`, sin CS ni época propios (el editor de Spacecraft no manda su `CoordinateSystem`). `/api/convert/epoch` cambia `DateFormat` en un Spacecraft del motor, que reescribe `Epoch` (verificado); la época va entre comillas al script: solo `[\w :.-]`, máx. 40. Los elementos se interpolan en un script: solo identificadores y números finitos (validado en `main.py`).

## Entorno de desarrollo
- **`dev.ps1` no avisa si los puertos están ocupados** (verificado). Con un backend viejo en `:8000`, uvicorn falla con `[Errno 10048]`, Vite sube a `:5174` y el proxy habla con el backend viejo: `/api/health` da `ok` y las rutas nuevas dan 404. Revisar con `netstat -ano | findstr ":8000 :5173"`.
- **Avisos esperados:** pytest muestra `StarletteDeprecationWarning` (httpx); `npm run build` avisa de un chunk mayor a 500 kB (Monaco).
- **Samples:** 74 de 88 samples raíz corren (tabla en `docs/COMPATIBILIDAD.md`, `python -m app.batch`); 8 rechazados por sanitize, 3 usan plugins comentados en el startup file (MarsGRAM, ExternalForceModel), 2 no encuentran su archivo de entrada y 1 falla porque sanitize reescribe `TrackingFileSet.FileName`. El lote solo marca `plugin` lo que el startup activo deja comentado. No es bug del port.
- **`TrackingFileSet.FileName` es entrada y salida.** Sanitize lo reescribe siempre (el Simulator escribe ahí), así que un BatchEstimator que lee un `.gmd` existente falla (verificado: `Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data`).
- **Rutas de entrada relativas se buscan en la carpeta del script** (`GmatFileUtil::FindFile`: script, luego bin solo si se pide). En la web es la carpeta de la corrida: `Ex_Propagate_ThrustHistoryFile` (`Thrust_Sim.thf`) y `Ex_Contact_Location_Station_Mask` (`ElevationMaskFileName`) fallan con `'../samples/SupportFiles/...'`; en escritorio corren (verificado con el primero).
- **Windows:** Git avisa `LF` → `CRLF` al commitear. `dev.sh` solo se verificó con `sh -n`.
