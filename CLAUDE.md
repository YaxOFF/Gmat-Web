# GMAT Web

Port web de NASA GMAT R2026a: backend FastAPI sobre `gmatpy` (motor real) + frontend React/Vite/TS/Cesium.

## Al empezar cada sesión

1. Leer `PLAN.md` → **Avance** y tomar la primera fase sin marcar.
2. Seguir el **Protocolo por sesión** de `PLAN.md`: una sola fase, verificarla, actualizar Avance y Bitácora, commit + push.
3. Leer solo los archivos que la fase toca. Las **Decisiones tomadas** de `PLAN.md` mandan.

## Restricciones duras

- La física la calcula GMAT (`gmatpy`). Nunca reimplementar propagación, maniobras ni conversiones en el frontend.
- El proceso FastAPI nunca importa `gmatpy`: todo pasa por procesos worker (el motor es un singleton global).
- Ruta de GMAT solo por `GMAT_HOME` (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`). Código C++ de referencia: `C:\Users\Yaxon\Downloads\GMAT-src`.
- Todo script pasa por `sanitize` antes de correr: sin llamadas a Python/MATLAB/sistema, rutas de salida reescritas a la carpeta temporal de la corrida.
- Abrir/guardar `.script` debe seguir siendo compatible con GMAT escritorio; el parser nunca descarta líneas (van a `raw`).
- Sin logos ni marca de NASA; atribución a GMAT (Apache 2.0) en `NOTICE`.
- Textos de UI en `frontend/src/i18n/es.ts`.
