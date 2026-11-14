<!-- fuente: backend/app, frontend/src, shared | rev: a31cbd8 -->
# Mapa

## Entradas
- `backend/app/main.py`: todas las rutas HTTP/WS y el `lifespan` (arranca/para el pool de workers).
- `backend/app/config.py`: variables de entorno y límites.
- `backend/app/engine/worker.py`: pool de procesos con `gmatpy`; `submit(fn, ...)`.
- `frontend/src/main.tsx` y `App.tsx`: shell (barra, pestañas, consola).
- `frontend/src/store.ts`: estado Zustand único.
- `PLAN.md`: fases, decisiones, avance y bitácora.

## Conceptos → archivo
| Concepto | Dónde vive |
|---|---|
| Correr un script (proceso por corrida, log en vivo, timeout, cancelar) | `backend/app/engine/runner.py`, ruta `/api/runs` y WS en `main.py` |
| Seguridad de scripts (prohibidos, rutas de salida) | `backend/app/engine/sanitize.py` |
| Script ↔ modelo JSON | `backend/app/script/parser.py`, `serializer.py`; tipos en `frontend/src/model/mission.ts`, `shared/mission.schema.json` |
| Excepciones del round-trip | `docs/EXCEPCIONES_ROUNDTRIP.md`, `backend/tests/test_script.py` |
| Esquemas de campos desde el motor (caché, proceso aislado) | `backend/app/engine/schema.py`, `frontend/src/model/schema.ts`; forma en `docs/API.md` |
| Conversión de estado orbital | `worker.convert_state`, ruta `/api/convert/state` |
| Variables de entorno y límites | `backend/app/config.py`; tabla en `README.md` |
| Validar script sin correrlo | `worker.validate_script`, ruta `/api/script/validate` |
| Árbol de recursos (crear/renombrar/clonar/borrar) | `frontend/src/resources/ResourceTree.tsx`, `frontend/src/model/refs.ts` |
| Formulario de recurso | `frontend/src/resources/ResourceForm.tsx` |
| Sincronía editor de script ↔ modelo | `store.ts` (`editText`, `setMission`, contador `seq`) |
| Editor Monaco + resaltado GMAT | `frontend/src/editor/ScriptEditor.tsx`, `gmat.ts` |
| Ejemplos de GMAT | `backend/app/samples.py` (lee `GMAT_HOME/samples`) |
| Textos de UI | `frontend/src/i18n/es.ts` |

Símbolos: `grep` en `docs/SYMBOLS.tsv` (generar con `sh docs/docs.sh map`).
