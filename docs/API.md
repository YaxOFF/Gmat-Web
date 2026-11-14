<!-- fuente: backend/app/main.py | rev: 078da86 -->
# API (prefijo `/api`)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /health` | | `{status, version, build_date}` o `{status:"error", detail}` |
| `GET /samples` | | lista `{id,name,folder,description}` |
| `GET /samples/{id}` | | `{id, text}`; 404 |
| `POST /runs` | `{script}` | `{runId}`; 400 `{detail,line}` si sanitize rechaza; 429 si hay `MAX_RUNS` |
| `DELETE /runs/{id}` | | `{ok}`; 404 |
| `WS /ws/runs/{id}` | | eventos `log{level,text,line?}`, `progress`, `done`, `error` |
| `POST /script/parse` | `{script}` | modelo; 413 si excede `MAX_SCRIPT_BYTES` |
| `POST /script/serialize` | modelo | `{script}`; 422 |
| `POST /script/validate` | `{script}` | `{ok, errors:[{level,text,line?}]}` |
| `POST /convert/state` | `{fromType,toType,elements}` | `{type, elements}`; 422 |
| `GET /schema` | | tipos `{type, category, objectType}` |
| `GET /schema/{type}` | | `{type, fields}`; 404 |

Aún no existen (plan): `GET /runs/{id}/results`, `GET /runs/{id}/files/{name}`.
Límites y variables: `backend/app/config.py` y `README.md`.
