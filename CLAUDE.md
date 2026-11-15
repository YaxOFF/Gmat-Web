# GMAT Web

Port web de NASA GMAT R2026a: backend FastAPI sobre `gmatpy` (motor real) + frontend React/Vite/TS/Cesium.

## Contexto del proyecto (antes de explorar código)

Lee `docs/SYSTEM.md`: piezas (frontend, backend, motor GMAT) y qué toca cada tipo de cambio.

Para ubicar algo, en este orden:
1. `Grep` de la palabra clave dentro de `docs/`. Conceptos en `MAP.md`, símbolos en `SYMBOLS.tsv` (no leerlo entero).
2. `docs/TASKS.md` si vas a implementar: archivos, orden, archivo modelo y comando de verificación.
3. `docs/GOTCHAS.md` antes de tocar el motor, el parser o la sincronía script ↔ modelo.
4. Solo si falla: grep en el repo y agrega la entrada faltante a `docs/MAP.md`.

Con el archivo ubicado, `Grep` del símbolo y `Read` con `offset`. Al terminar un cambio corre `sh docs/docs.sh stale` y actualiza lo que liste.

## Al empezar cada sesión

En la rama `game/msl-edl` manda `PLAN-EDL.md` (aterrizaje del rover en Marte, fases E0-E7): leer su **Avance**, seguir su **Protocolo por sesión** y no tocar `main`. En las demás ramas:

Hay dos planes. El activo es `PLAN-JUEGO.md` (juego "Viaje a la Luna", fases J0-J6); `PLAN.md` (port web) sigue en su Fase 9 cuando el juego llegue a J4 o el usuario lo pida.

1. Leer `PLAN-JUEGO.md` → **Avance** y tomar la primera fase sin marcar.
2. Seguir su **Protocolo por sesión**: una sola fase, verificarla, actualizar Avance y Bitácora, commit + push.
3. Leer solo los archivos que la fase toca. Mandan las **Decisiones tomadas** de `PLAN-JUEGO.md` y, en lo que no cubre, las de `PLAN.md`.

## Restricciones duras

- La física la calcula GMAT (`gmatpy`). Nunca reimplementar propagación, maniobras ni conversiones en el frontend.
- El proceso FastAPI nunca importa `gmatpy`: todo pasa por procesos worker (el motor es un singleton global).
- Ruta de GMAT solo por `GMAT_HOME` (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`). Código C++ de referencia: `C:\Users\Yaxon\Downloads\GMAT-src`.
- Todo script pasa por `sanitize` antes de correr: sin llamadas a Python/MATLAB/sistema, rutas de salida reescritas a la carpeta temporal de la corrida.
- Abrir/guardar `.script` debe seguir siendo compatible con GMAT escritorio; el parser nunca descarta líneas (van a `raw`).
- Sin logos ni marca de NASA; atribución a GMAT (Apache 2.0) en `NOTICE`.
- Textos de UI en `frontend/src/i18n/es.ts`.
