<!-- fuente: backend/app/engine, frontend/src/store.ts, frontend/src/model/refs.ts | rev: 078da86 -->
# Trampas

## `gmatpy` solo en workers
Singleton global por proceso. Si FastAPI lo importa, se mezcla estado entre peticiones. `tests/test_health.py` comprueba que `gmatpy` no está en `sys.modules`. Código: `engine/worker.py`.

## Algunos tipos tiran abajo el motor
Leer campos de solo lectura de ciertos tipos (ej. `NuclearPowerSystem`) mata el proceso. `schema._isolated` usa un pool de un proceso que se termina con `pool._processes` (API privada). Código: `engine/schema.py`.

## Las corridas usan `cwd = GMAT_HOME/bin`
Las rutas de entrada `../data/...` son relativas a `bin`. Las salidas se reescriben a la carpeta de la corrida (`sanitize` + `OUTPUT_PATH` de `startup.txt`). Código: `engine/runner.py`, `engine/sanitize.py`.

## `api_startup_file.txt`
Si falta en `GMAT_HOME/bin`, se genera en `backend/.cache/` de forma atómica (varios procesos lo leen a la vez; en Windows `os.replace` puede dar `PermissionError` y se ignora). Código: `worker.api_startup_file`.

## Caché de esquemas por versión
`backend/.cache/schema/<versión>.v2.json`. Si cambia la forma de lo que guarda `schema.py`, sube el sufijo `.v2`. Sin `GMAT_HOME` no arranca (a propósito).

## Nombres de tipo
`PropSetup` se publica como `Propagator`. Del factory de PARAMETER solo se exponen `Variable`, `String`, `Array`. FminconOptimizer, VF13ad y GroundStation no salen (el motor no los lista). Código: `schema.ALIASES`, `USER_PARAMETERS`.

## El parser nunca descarta líneas
Lo no entendido va a `raw`. Campos repetidos y copias `A = B` también. No se conservan `args` de comandos, comentarios en línea ni líneas en blanco. Hay 1 xfail conocido (`docs/EXCEPCIONES_ROUNDTRIP.md`).

## Sincronía script ↔ modelo
`store.ts` usa un contador `seq`: gana el último cambio y un parse fallido deja el último modelo bueno. Reescribir el script desde el modelo hace perder el undo de Monaco. Leer `editText` y `setMission` antes de tocar.

## Renombrar recursos
`refs.renameResource` reemplaza el nombre como token suelto: también toca strings entre comillas y líneas `raw`. Crear/renombrar/borrar usan `prompt`/`confirm` nativos.

## Conversión de estado
`/api/convert/state` solo usa `EarthMJ2000Eq`, sin CS ni época propios. Los elementos se interpolan en un script: solo identificadores y números finitos (validado en `main.py`).

## Samples
~70 de 88 samples raíz corren; faltan GmatFunction, Python, MarsGRAM y archivos de entrada. No es bug del port.

## Windows
Git avisa `LF` → `CRLF` al commitear. `dev.sh` solo se verificó con `sh -n`.
