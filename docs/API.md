<!-- fuente: backend/app/main.py, backend/app/engine/runner.py, backend/app/engine/schema.py, frontend/src/model/schema.ts | rev: 4d753f5 -->
# API (prefijo `/api`)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /health` | | `{status:"ok", version, build_date}` o `{status:"error", detail}` (siempre 200) |
| `GET /samples` | | lista `{id,name,folder,description}` |
| `GET /samples/{id}` | | `{id, text}`; 404 |
| `POST /runs` | `{script}` | `{runId}`; 400 `{detail, line}` si sanitize rechaza (`line` puede ser `null`); 429 si hay `MAX_RUNS` |
| `DELETE /runs/{id}` | | `{ok:true}`; 404 |
| `WS /ws/runs/{id}` | | eventos (abajo) |
| `POST /script/parse` | `{script}` | modelo `{resources, sequence, raw}`; 413 si excede `MAX_SCRIPT_BYTES` |
| `POST /script/serialize` | modelo | `{script}`; 422 |
| `POST /script/validate` | `{script}` | `{ok, errors:[{type?, level, text, line?}]}` (siempre 200) |
| `POST /convert/state` | `{fromType,toType,elements}` | `{type, elements}`; 422 |
| `POST /convert/epoch` | `{fromFormat,toFormat,epoch}` (formatos `A1/TAI/UTC/TT/TDB` + `ModJulian/Gregorian`) | `{format, epoch}`; 422 |
| `GET /schema` | | lista `{type, category, objectType}` |
| `GET /schema/{type}` | | `{type, fields}`; 404 si el tipo no es creable |
| `GET /parameters` | | lista `{name, dep, depDefault, unit}` (parámetros calculados del motor, caché como esquemas); 503 si el motor se cae |

| `GET /runs/{id}/results` | | `{ships:[{name, columns:{A1ModJulian, UTCGregorian, EarthMJ2000Eq.X…VZ, Earth.Latitude, Earth.Longitude, LunaMJ2000Eq.X/Y/Z (posición respecto a la Luna)}}] (sin las naves que nunca se propagan), reports:[{name, file, headers, rows}], xyplots:[{name, x:{name,data}, series:[{name,data}]}]}`; 404; 409 si no terminó. Máx. 200 000 filas por archivo |
| `GET /runs/{id}/files/{name}` | | el archivo (descarga); 404 si no es un nombre simple del primer nivel de la carpeta, es interno (`gmat.log`, `mission.script`, `startup.txt`, `GmatLog.txt`) o no existe; 409 si no terminó |
Límites y variables: `README.md`. Forma del modelo: `shared/mission.schema.json`.

## Eventos del WebSocket
Un JSON por mensaje. Al conectar se reenvían todos los eventos desde el inicio de la corrida. El servidor cierra tras `done` o `error`.

| `type` | Campos | Cuándo |
|---|---|---|
| `log` | `level` (`info`, `warning`, `error`), `text`, `line?` (línea del script que cita GMAT) | cada línea no vacía de `gmat.log` |
| `progress` | `elapsed` (segundos, 1 decimal) | una vez por segundo mientras corre |
| `solver` | `event`: `start` (`run`, `solver`, `kind` Target/Optimize, `algorithm`), `iteration` (`run`, `solver`, `iteration`, `evaluation?`, `variables[{name,value}]`, `goals[{name,desired,achieved,variance,tolerance,met?}]`, `constraints[{name,kind eq/ineq,value}]`, `cost?`, `state?`), `end` (`run`, `solver`, `kind`, `status` converged/failed/initial, `converged`, `iterations`, `message`), `silent` (`solver`, al inicio: tiene `ShowProgress = false` y no habrá iteraciones) | leído del progreso que GMAT escribe en `gmat.log` (`engine/solver.py`); la fila de una iteración sale al empezar la siguiente o al cerrar el solver |
| `done` | `results: {elapsed, files, available}` (`files` = archivos de salida sin los ocultos `gmatweb_*`; `available` = hay naves, ReportFile o XYPlot para `/results`) | el motor terminó con código 0 |
| `error` | `message` | corrida inexistente, cancelada, timeout o motor con código distinto de 0 |

Una corrida inexistente no da 404: el socket se acepta, llega un `error` y se cierra.

## Esquemas
`GET /schema`: `category` es la categoría del motor (`SPACECRAFT`, `FORMATION`, `HARDWARE`, `BURN`, `ODE_MODEL`, `PROP_SETUP`, `CALCULATED_POINT`, `COORDINATE_SYSTEM`, `SOLVER`, `SUBSCRIBER`, `EVENT_LOCATOR`, `FIELD_OF_VIEW`, `PARAMETER`); `objectType` es el `Gmat::ObjectType` numérico (Spacecraft = 101).

`GET /schema/{type}`: `fields` es una lista (o `null` si el tipo tumba el motor) de:

| Campo | Tipo | Nota |
|---|---|---|
| `name` | string | nombre exacto de GMAT |
| `type` | string | tipo de parámetro de GMAT: `Real`, `Integer`, `Boolean`, `String`, `Enumeration`, `Object`, `ObjectArray`, `StringArray`, `Rmatrix`, `Filename`, `Color`... |
| `readOnly` | bool | |
| `default` | number, bool, string o `null` | valor de un objeto recién creado; `null` si es de solo lectura |
| `enum?` | string[] | valores válidos |
| `unit?` | string | |
| `refType?` | number | `Gmat::ObjectType` del objeto referido; solo `Object`/`ObjectArray` |
| `stateType?` | string | solo elementos de estado de `Spacecraft`: representación a la que pertenece |

`GET /parameters`: `dep` es `""` (`Sat.ElapsedDays`), `"Origin"` (`Sat.Earth.Altitude`) o `"CoordinateSystem"` (`Sat.EarthMJ2000Eq.X`); `depDefault` es el que pone el motor (`Earth`, `EarthMJ2000Eq`, `EarthFixed`). El motor no dice el dueño (nave, tanque…): el selector ofrece todos los recursos.

Espejo en TypeScript: `frontend/src/model/schema.ts`.
