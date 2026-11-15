<!-- fuente: backend/app/main.py, backend/app/engine/runner.py, backend/app/engine/schema.py, frontend/src/model/schema.ts | rev: 1a95f8e -->
# API (prefix `/api`)

With `GMAT_WEB_STATIC` set (Docker), every non-`/api` path serves the frontend build (`StaticFiles(html=True)` mounted last in `main.py`).

| Method and path | Body | Response |
|---|---|---|
| `GET /health` | | `{status:"ok", version, build_date}` or `{status:"error", detail}` (always 200) |
| `GET /samples` | | list `{id,name,folder,description}` |
| `GET /samples/{id}` | | `{id, text}`; 404 |
| `POST /runs` | `{script}` | `{runId}`; 400 `{detail, line}` if sanitize rejects (`line` can be `null`); 429 if there are `MAX_RUNS` |
| `DELETE /runs/{id}` | | `{ok:true}`; 404 |
| `WS /ws/runs/{id}` | | events (below) |
| `POST /script/parse` | `{script}` | model `{resources, sequence, raw}`; 413 if it exceeds `MAX_SCRIPT_BYTES` |
| `POST /script/serialize` | model | `{script}`; 422 |
| `POST /script/validate` | `{script}` | `{ok, errors:[{type?, level, text, line?}]}` (always 200) |
| `POST /convert/state` | `{fromType,toType,elements}` | `{type, elements}`; 422 |
| `POST /convert/epoch` | `{fromFormat,toFormat,epoch}` (formats `A1/TAI/UTC/TT/TDB` + `ModJulian/Gregorian`) | `{format, epoch}`; 422 |
| `GET /schema` | | list `{type, category, objectType}` |
| `GET /schema/{type}` | | `{type, fields}`; 404 if the type is not creatable |
| `GET /parameters` | | list `{name, dep, depDefault, unit}` (engine calculated parameters, cached like schemas); 503 if the engine crashes |

| `GET /runs/{id}/results` | | `{ships:[{name, columns:{A1ModJulian, UTCGregorian, EarthMJ2000Eq.X…VZ, Earth.Latitude, Earth.Longitude, LunaMJ2000Eq.X/Y/Z (position relative to the Moon)}}] (without the ships that are never propagated), reports:[{name, file, headers, rows}], xyplots:[{name, x:{name,data}, series:[{name,data}]}]}`; 404; 409 if it has not finished. Max. 200 000 rows per file |
| `GET /runs/{id}/files/{name}` | | the file (download); 404 if it is not a simple name at the top level of the folder, is internal (`gmat.log`, `mission.script`, `startup.txt`, `GmatLog.txt`) or does not exist; 409 if it has not finished |
Limits and variables: `README.md`. Model shape: `shared/mission.schema.json`.

## WebSocket events
One JSON per message. On connect, all events since the start of the run are replayed. The server closes after `done` or `error`.

| `type` | Fields | When |
|---|---|---|
| `log` | `level` (`info`, `warning`, `error`), `text`, `line?` (script line that GMAT cites) | each non-empty line of `gmat.log` |
| `progress` | `elapsed` (seconds, 1 decimal) | once per second while running |
| `solver` | `event`: `start` (`run`, `solver`, `kind` Target/Optimize, `algorithm`), `iteration` (`run`, `solver`, `iteration`, `evaluation?`, `variables[{name,value}]`, `goals[{name,desired,achieved,variance,tolerance,met?}]`, `constraints[{name,kind eq/ineq,value}]`, `cost?`, `state?`), `end` (`run`, `solver`, `kind`, `status` converged/failed/initial, `converged`, `iterations`, `message`), `silent` (`solver`, at the start: it has `ShowProgress = false` and there will be no iterations) | read from the progress GMAT writes to `gmat.log` (`engine/solver.py`); an iteration's row is emitted when the next one starts or when the solver closes |
| `done` | `results: {elapsed, files, available}` (`files` = output files without the hidden `gmatweb_*` ones; `available` = there are ships, ReportFile or XYPlot for `/results`) | the engine finished with code 0 |
| `error` | `message` | nonexistent run, cancelled, timeout or engine with a code other than 0 |

A nonexistent run does not give 404: the socket is accepted, an `error` arrives and it closes.

## Schemas
`GET /schema`: `category` is the engine category (`SPACECRAFT`, `FORMATION`, `HARDWARE`, `BURN`, `ODE_MODEL`, `PROP_SETUP`, `CALCULATED_POINT`, `COORDINATE_SYSTEM`, `SOLVER`, `SUBSCRIBER`, `EVENT_LOCATOR`, `FIELD_OF_VIEW`, `PARAMETER`); `objectType` is the numeric `Gmat::ObjectType` (Spacecraft = 101).

`GET /schema/{type}`: `fields` is a list (or `null` if the type brings the engine down) of:

| Field | Type | Note |
|---|---|---|
| `name` | string | exact GMAT name |
| `type` | string | GMAT parameter type: `Real`, `Integer`, `Boolean`, `String`, `Enumeration`, `Object`, `ObjectArray`, `StringArray`, `Rmatrix`, `Filename`, `Color`... |
| `readOnly` | bool | |
| `default` | number, bool, string or `null` | value of a newly created object; `null` if it is read-only |
| `enum?` | string[] | valid values |
| `unit?` | string | |
| `refType?` | number | `Gmat::ObjectType` of the referenced object; only `Object`/`ObjectArray` |
| `stateType?` | string | only `Spacecraft` state elements: representation it belongs to |

`GET /parameters`: `dep` is `""` (`Sat.ElapsedDays`), `"Origin"` (`Sat.Earth.Altitude`) or `"CoordinateSystem"` (`Sat.EarthMJ2000Eq.X`); `depDefault` is the one the engine sets (`Earth`, `EarthMJ2000Eq`, `EarthFixed`). The engine does not say the owner (ship, tank…): the picker offers all resources.

TypeScript mirror: `frontend/src/model/schema.ts`.
