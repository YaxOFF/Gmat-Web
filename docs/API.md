<!-- fuente: backend/app/main.py, backend/app/engine/runner.py, backend/app/engine/schema.py, frontend/src/model/schema.ts | rev: a31cbd8 -->
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

Aún no existen (plan): `GET /runs/{id}/results`, `GET /runs/{id}/files/{name}`.
Límites y variables: `README.md`. Forma del modelo: `shared/mission.schema.json`.

## Eventos del WebSocket
Un JSON por mensaje. Al conectar se reenvían todos los eventos desde el inicio de la corrida. El servidor cierra tras `done` o `error`.

| `type` | Campos | Cuándo |
|---|---|---|
| `log` | `level` (`info`, `warning`, `error`), `text`, `line?` (línea del script que cita GMAT) | cada línea no vacía de `gmat.log` |
| `progress` | `elapsed` (segundos, 1 decimal) | una vez por segundo mientras corre |
| `done` | `results: {elapsed, files}` (`files` = nombres de archivos de salida) | el motor terminó con código 0 |
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

Espejo en TypeScript: `frontend/src/model/schema.ts`.
