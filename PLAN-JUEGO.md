# PLAN — JUEGO: VIAJE A LA LUNA

Modo de juego dentro de GMAT Web: el jugador lleva una nave de la órbita baja terrestre a la órbita
lunar tomando las decisiones él mismo (cuándo encender, cuánto impulso, cuánto frenar), y el motor real
de GMAT calcula qué pasa. Pensado para estudiantes y curiosos: se aprende mecánica orbital jugando.
Restricción clave, la misma del proyecto: la física la calcula GMAT (`gmatpy`); el juego nunca propaga,
ni calcula maniobras, ni decide resultados por su cuenta.

Este plan es aparte de `PLAN.md` (el port web, fases 0-12) y tiene prioridad sobre sus fases 9 en
adelante hasta terminar la Fase J4. Parte de lo que dejó la Fase 8: plantilla "Viaje a la Luna"
(`frontend/src/templates.ts`), posición de la Luna en los resultados y vista 3D centrada en la Luna.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Estilo de juego | **Planear y ejecutar**, por etapas (como los nodos de maniobra de Kerbal). No es pilotaje cuadro a cuadro: cada decisión es una corrida de GMAT de 1-3 s. |
| Cómo avanza el estado | El estado del juego es **la lista de decisiones del jugador**. Cada "Probar" o "Ejecutar" arma el script completo desde el inicio hasta la etapa actual y lo corre entero (la misión completa tarda ~3 s). No se guarda el estado de la nave entre etapas: es determinista y más simple. |
| Backend | Sin endpoints nuevos en J1-J4: se usan `POST /api/runs`, el WebSocket y `GET /api/runs/{id}/results`. Lo que el juego necesita saber (distancias, excentricidad, épocas de maniobra) lo pide el propio script con `Report`. |
| Resultado de cada etapa | Lo decide GMAT: el script reporta `Nave.Luna.RMAG`, `Nave.Luna.ECC`, `Nave.Earth.RMAG`, etc. y condiciones de parada (impacto = `Nave.Luna.RMAG` al radio lunar; escape = tiempo máximo). El frontend solo compara esos números con umbrales para decir "capturado", "pasó de largo" o "impacto". |
| Ayuda de GMAT | En cada etapa, un botón corre la variante con `Target` (la de la plantilla) y muestra la respuesta del motor. Cuesta puntos. Es también el modo tutorial. |
| Puntaje | ΔV total gastado comparado con el de la solución de GMAT, error del radio y de la excentricidad de la órbita final, ayudas usadas e intentos. Estrellas 1-3. Mejor marca en `localStorage`. |
| Dónde vive | Misma app, vista propia a pantalla completa ("Jugar" en la barra), cargada en lazy. Código en `frontend/src/game/`. No toca el editor ni los formularios. |
| 3D | Cesium, el mismo de la pestaña 3D. La lógica común (leer la trayectoria, ubicar la Luna) se saca de `results/View3D.tsx` a un módulo compartido; no se duplica. |
| Recursos gráficos | Solo lo que ya viene en el repo o se dibuja por código: textura lunar `Assets/Textures/moonSmall.jpg` de Cesium, nave con primitivas o un SVG propio. Sin descargas, sin logos ni marca de NASA. |
| Puente con la app | "Ver el script" abre en el Editor la misión que el jugador armó, como `.script` normal. El juego enseña y la herramienta sigue ahí. |
| Idioma | Español, textos en `frontend/src/i18n/es.ts` (`es.game`). Scripts en ASCII. |
| Móvil | Tablet como mínimo. Móvil: se puede mirar la repetición, no jugar (igual que el resto de la app). |
| Tiempo real | Fuera del alcance base. La sesión viva del motor (vista previa instantánea) es la Fase J5, opcional. |

## Formatos destino (todas las fases los respetan)

**Decisiones del jugador** (`frontend/src/game/luna.ts`):
```ts
type Decisions = {
  date: string        // fecha de salida, "2026-03-20"
  raan: number        // orientación del plano de la órbita de salida (grados)
  aop: number         // punto de la órbita donde se enciende el motor (grados)
  tli: number         // impulso de inyección translunar, km/s
  mcc?: number        // corrección a mitad de camino, km/s (puede no usarse)
  loi?: number        // frenado de inserción lunar, km/s (negativo)
}
type Stage = 'salida' | 'tli' | 'correccion' | 'loi' | 'final'
```

**Script del juego:** `buildScript(decisions, hasta: Stage, opts?: { ayuda?: Stage })` devuelve un script
GMAT ASCII. Mismos recursos que la plantilla lunar (naves, modelos de fuerza, propagadores, `TLI`, `LOI`,
marcos `TierraLunaRot` y `LunaInercial`). Reporta en un `ReportFile` llamado `Juego`, una fila por evento:
`Evento` (número), `Nave.A1ModJulian`, posición `EarthMJ2000Eq`, `Nave.Earth.RMAG`, `Nave.Luna.RMAG`,
`Nave.Luna.ECC`, `Nave.TierraLunaRot.RA`, `Nave.TierraLunaRot.DEC`. Las filas antes de cada `Maneuver` dan
la época y el lugar de la maniobra (GMAT no publica ese instante en los reportes ocultos).

**Resultado:** `readOutcome(results, hasta)` → `{ estado: 'ok' | 'impacto' | 'escape' | 'no_llega' | 'capturado', numeros: {...} }`,
solo con números que escribió GMAT.

## Fases

Una fase por sesión. Cada fase deja la app funcionando.

### Fase J0 — Preparar ✅
Este `PLAN-JUEGO.md` y la sección nueva de `CLAUDE.md`.

### Fase J1 — La escena: que se vea como juego
Meta: la misión lunar automática (la de la plantilla) se reproduce como una película en una vista propia.
- `frontend/src/results/orbit3d.ts`: sacar de `View3D.tsx` lo común (`track`, colores, radios de los cuerpos, creación del visor sin ion). `View3D.tsx` pasa a usarlo sin cambiar su comportamiento.
- `frontend/src/game/Scene.tsx`: visor Cesium a pantalla completa. Luna con textura (`moonSmall.jpg`), Tierra con el globo de siempre, nave con forma propia y **estela** que se dibuja según avanza el reloj (no la trayectoria entera de golpe), **marcadores de maniobra** con etiqueta (TLI, LOI) y cámaras: vista general, seguir nave, Tierra, Luna. La cámara pasa sola a la Luna al acercarse.
- `frontend/src/game/Game.tsx` + `Game.module.css`: pantalla "Jugar" (botón en la barra, lazy en `App.tsx`), con Reproducir/Pausa, velocidad y Salir. En esta fase corre la plantilla lunar con sus valores por defecto y la muestra.
- Las épocas de maniobra salen de filas `Report` del script (ver Formatos); probarlo aquí con la plantilla.
- Textos en `es.game`.
- Verificar: `npm run lint; npm run build`; en navegador, Jugar → la misión se ve de principio a fin, la estela crece, los marcadores están donde cambia la trayectoria, la cámara lunar muestra la órbita de captura; pestaña 3D normal sin regresión (Hohmann y plantilla lunar); sin errores de consola. Capturas en `qa-capturas/juego-J1/`.
- Si no cabe: J1a (extraer `orbit3d.ts` + escena con Luna, nave y estela), J1b (marcadores, cámaras, pantalla Jugar).

### Fase J2 — El motor del juego: decisiones → GMAT → resultado
Meta: cualquier combinación de decisiones da un resultado correcto y explicable, sin interfaz todavía.
- `frontend/src/game/luna.ts`: `buildScript`, `readOutcome`, umbrales y la variante de ayuda por etapa (el `Target` de la plantilla acotado a esa etapa). Reutiliza los recursos de `templates.ts` (extraer el bloque común en vez de copiarlo).
- `backend/tests/tools/game_check.mjs` (modelo: `templates_check.mjs`): corre contra la API una tabla de escenarios y comprueba el estado esperado:
  - decisiones de la solución de GMAT → `capturado`, con los números de `m7_viaje_luna`;
  - TLI corto (3.0 km/s) → `no_llega`; TLI de más → pasa de largo o `escape`;
  - AOP desviado 30° → falla el encuentro con la Luna;
  - LOI = 0 → sobrevuelo y `escape`; LOI excesivo → `impacto`;
  - la ayuda de cada etapa devuelve valores con los que la etapa siguiente sale `ok`.
- `backend/tests/missions/m8_juego_luna.script`: el script del juego con las decisiones de referencia, comparado con escritorio en `pytest -m slow tests/test_missions.py`.
- Medir el tiempo de una corrida por etapa (meta: menos de 3 s) y anotar en Bitácora.
- Verificar: `game_check.mjs` sin fallos; `pytest -m slow tests/test_missions.py`; `npm run lint; npm run build`.

### Fase J3 — Jugar: etapas, controles y vista previa
Meta: una persona completa la misión tomando sus propias decisiones.
- `frontend/src/game/store.ts` (Zustand): etapa actual, decisiones, intentos, ayudas, última corrida y su resultado.
- `frontend/src/game/Hud.tsx`: objetivo de la etapa en una frase, ΔV gastado, distancia a la Tierra y a la Luna, velocidad, tiempo de misión.
- `frontend/src/game/Controls.tsx`, un panel por etapa:
  1. **Salida:** fecha y orientación de la órbita. Indicador de cuánto se desvía el apogeo de la Luna.
  2. **Impulso TLI:** punto de encendido y ΔV (deslizadores).
  3. **Corrección:** impulso pequeño opcional; se puede saltar.
  4. **Frenado LOI:** cuánto frenar en el periselenio.
- **Probar** corre con el valor candidato y dibuja la trayectoria como "fantasma" sin comprometerla; **Ejecutar** la fija y pasa de etapa. Mientras corre, el botón muestra espera; una corrida nueva cancela la anterior (`DELETE /api/runs/{id}`) para no topar `GMAT_WEB_MAX_RUNS`.
- Mensajes de resultado en claro ("te quedaste corto: el apogeo llegó a 310 000 km y la Luna está a 384 000"), con los números de GMAT.
- Fallar no termina el juego: se puede reintentar la etapa o volver a la anterior.
- **Ayuda de GMAT** por etapa: corre la variante con `Target`, enseña la convergencia y deja los valores puestos.
- Verificar: en navegador, partida completa sin ayuda hasta `capturado`; una partida con cada tipo de fallo (corto, de largo, impacto) con su mensaje; una con ayuda en todas las etapas; sin errores de consola; `npm run lint; npm run build`.
- Si no cabe: J3a (store, HUD, etapas 1-2 con Probar/Ejecutar), J3b (etapas 3-4, fallos, ayuda).

### Fase J4 — Puntaje, tutorial y pulido
Meta: se siente terminado y se puede enseñar a alguien sin explicarle nada.
- Pantalla final: órbita lograda, ΔV usado contra el de GMAT, estrellas 1-3, repetición de toda la misión, "Jugar de nuevo" y "Ver el script" (carga la misión en el Editor con `loadText`).
- Mejor marca en `localStorage` (`gmatweb.juego.luna`).
- Tutorial: la primera vez, textos cortos por etapa que explican qué decide el jugador y por qué (apogeo, TLI, periselenio, LOI).
- Tarjeta "Jugar: Viaje a la Luna" en el diálogo de Plantillas y entrada en la paleta (Ctrl+K).
- Tablet sin scroll horizontal; teclado y etiquetas en todos los controles; contraste en claro y oscuro (mismo script de `docs/QA.md`, Fase 8).
- Docs: sección "Jugar" en `docs/GUIDE.md`, entradas en `docs/MAP.md`, trampas en `docs/GOTCHAS.md`, procedimientos en `docs/QA.md`.
- Verificar: partida completa en navegador de principio a fin a 1280 px y a 768 px; puntaje coherente (la solución de GMAT da 3 estrellas, una torpe da menos); `pytest`, `pytest -m slow`, lint y build en verde.

### Fase J5 (opcional) — Sesión viva del motor
Meta: vista previa instantánea al mover un deslizador, sin esperar una corrida.
- Proceso worker que vive lo que dura la partida, con el motor cargado y la nave en memoria; propaga por pasos a pedido (modelo: `GMAT_HOME/api/Ex_R2020a_PropagationStep.py`) por un WebSocket propio.
- Límite de sesiones simultáneas, cierre por inactividad y limpieza; sigue valiendo "el proceso FastAPI nunca importa `gmatpy`".
- Decidir antes si convive con el despliegue de la Fase 9 de `PLAN.md` (memoria por sesión en el VPS).
- Verificar: la vista previa responde en menos de 200 ms y da los mismos números que la corrida completa.

### Fase J6 (opcional) — Más misiones
Sacar de `game/luna.ts` lo que no es lunar (etapas, puntaje, ayuda) a una definición de misión y agregar otra: Hohmann a GEO como nivel 1, Marte con B-plane como nivel avanzado.

## Protocolo por sesión

1. Leer **Avance** y tomar la primera fase sin marcar. Leer solo los archivos que esa fase toca.
2. Implementar la fase completa, nada de fases siguientes.
3. Verificar: `cd backend; .venv/Scripts/python -m pytest` (y `-m slow` si la fase toca misiones o resultados) · `cd frontend; npm run lint; npm run build` · levantar la app y recorrer en el navegador lo que pida la fase, con la consola sin errores. Los números del juego se comparan siempre contra GMAT (`backend/tests/tools/`, `tests/missions/`). Reusar los procedimientos de `docs/QA.md` y agregar al final solo lo nuevo. Si los puertos 8000/5173 están ocupados por procesos viejos, usar 8001/5175 como indica `docs/QA.md`.
4. Marcar la fase en **Avance** y escribir 2-5 líneas en **Bitácora**. Correr `sh docs/docs.sh stale` y actualizar lo que liste.
5. Commit (Conventional Commits) + `git push`.
6. Avisar al usuario que puede hacer `/clear` y continuar con la siguiente fase.

## Avance

- [x] Fase J0 — Preparar
- [ ] Fase J1 — La escena: que se vea como juego
- [ ] Fase J2 — El motor del juego: decisiones → GMAT → resultado
- [ ] Fase J3 — Jugar: etapas, controles y vista previa
- [ ] Fase J4 — Puntaje, tutorial y pulido
- [ ] Fase J5 (opcional) — Sesión viva del motor
- [ ] Fase J6 (opcional) — Más misiones

## Bitácora

- **2026-11-14 · Fase J0** — Plan creado tras la Fase 8 de `PLAN.md`. El usuario quiere usar el simulador como juego y eligió el viaje a la Luna. Estilo acordado: planear y ejecutar por etapas con las corridas actuales (1-3 s), primero lo visual, luego la interactividad; sesión viva del motor queda opcional (J5). Decidido sin preguntar, se puede cambiar: el juego vive en la misma app como vista "Jugar"; el estado es la lista de decisiones y cada corrida rehace la misión desde el inicio; sin recursos gráficos descargados (textura lunar de Cesium, nave dibujada por código); este plan va antes que Docker (Fase 9 de `PLAN.md`). Comprobado: `moonSmall.jpg` viene en `node_modules/cesium/Build/Cesium/Assets/Textures`; la plantilla lunar converge en 12 combinaciones y coincide con escritorio (`m7`).
