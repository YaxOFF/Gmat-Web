# PLAN — GMAT Web: port web del General Mission Analysis Tool

Port web de GMAT R2026a (NASA, Apache 2.0) para diseño de misiones espaciales: crear naves,
propagadores, maniobras y secuencias de misión, correrlas con el **motor real de GMAT** y ver los
resultados (3D, ground track, gráficas, reportes) en una interfaz moderna e intuitiva.
Restricción clave: los resultados deben ser idénticos a GMAT escritorio, porque el cálculo lo hace
GMAT mismo (`gmatpy`); la web no reimplementa física. Proyecto no oficial: sin logos ni marca de NASA.

Referencias locales:
- Instalación GMAT Windows (motor + `bin/gmatpy` + 162 `samples/*.script`): `C:\Users\Yaxon\Downloads\gmat-win-R2026a`
- Código fuente C++ R2026a (para consultar campos, defaults, comportamiento de la GUI original): `C:\Users\Yaxon\Downloads\GMAT-src`
  (`src/base` motor, `src/gui` GUI wxWidgets: `resource/`, `mission/`, `spacecraft/`, `propagator/`, `burn/`, `solver/`, `subscriber/`)
- Guía de la API: `gmat-win-R2026a/api/` y `docs/` de la instalación.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Motor | Backend **Python + FastAPI** que usa `gmatpy` (API oficial de GMAT). Probado: `gmatpy` R2026a carga y corre `Ex_HohmannTransfer.script` con Python 3.14 en Windows. |
| Aislamiento de corridas | `gmatpy` es un singleton global por proceso: cada corrida y cada consulta pesada va a un **proceso worker** (`multiprocessing`, spawn) con timeout. El proceso FastAPI nunca importa `gmatpy`. |
| Ubicación de GMAT | Variable `GMAT_HOME` (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`; Docker: `/opt/gmat`). Nada hardcodeado. |
| Fuente de verdad | El **script GMAT (`.script`)**. La app trabaja con un modelo JSON (recursos + secuencia) que se convierte a/desde script con un parser/serializer propio en Python, validado contra `gmatpy`. Abrir/guardar `.script` compatibles con GMAT escritorio. |
| Formularios | Generados desde metadatos que da el propio motor (`GetParameterCount/Text/Type`, valores por defecto de un objeto recién creado), cacheados en `/api/schema`. Editores a mano solo donde la UX lo pide (estado orbital de Spacecraft, stop conditions, Target/Optimize). |
| Frontend | **React + Vite + TypeScript**. 3D con **CesiumJS** (sin Cesium ion: imágenes offline/OSM), gráficas con **uPlot**, editor de scripts con **Monaco** + resaltado GMAT. Estado con Zustand. Estilos con CSS modules + tokens (tema claro/oscuro). |
| Comunicación | REST para modelo/esquemas; **WebSocket** para corridas (log en vivo, progreso de solvers, fin con resultados). |
| Resultados | El worker inyecta `ReportFile` ocultos por nave (época, X/Y/Z, VX/VY/VZ en EarthMJ2000Eq; lat/lon para ground track) y lee los `ReportFile`/`XYPlot` del usuario. Archivos de salida en carpeta temporal por corrida; nunca rutas del usuario. |
| Alcance v1 | Núcleo de diseño de misión: recursos (Spacecraft, tanques/thrusters, ForceModel/Propagator, ImpulsiveBurn/FiniteBurn, CoordinateSystem, solvers, variables/arrays, subscribers) + secuencia (Propagate, Maneuver, Begin/EndFiniteBurn, Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For, Report, Toggle, asignaciones) + vistas. Plugins (estimación, eventos, formaciones, CSALT) = fases opcionales. |
| Seguridad (VPS) | Los scripts pueden escribir archivos y llamar Python/MATLAB/sistema: el backend **rechaza** `CallPythonFunction`, `CallMatlabFunction`, `SystemCommand`/`System` y funciones externas, y **reescribe** toda ruta de salida (`Filename`, `OutputFile`…) a la carpeta temporal de la corrida. Límite de tiempo, de corridas simultáneas y de tamaño de script. Sin cuentas en v1. |
| Deploy | `docker-compose.yml`: `api` (Python 3.12 + `gmat-ubuntu-x64-R2026a.tar.gz` descargado en build con sha256 fijo) + `web` (nginx con el build de Vite, proxy `/api` y `/ws`). Todo por `.env` (skill `dockerizar-portainer`). También corre local con un comando. |
| Idioma UI | Español por defecto, textos en un solo archivo (`src/i18n/es.ts`) para poder agregar inglés. Nombres de campos GMAT se muestran tal cual + etiqueta legible. |
| Licencia | Código propio MIT; `NOTICE` con atribución a GMAT (Apache 2.0). No se copian assets ni íconos de la GUI de GMAT. |
| Git | Repo nuevo `D:\YaxonFolder\Github\Gmat-Web`, `origin` = `https://github.com/YaxOFF/Gmat-Web.git`, rama `main`. Commit + push al cerrar cada fase. |

## Formatos destino (todas las fases los respetan)

**Modelo de misión (JSON)** — `shared/mission.schema.json`, tipos TS espejo en `frontend/src/model/`:
```jsonc
{
  "resources": [ { "type": "Spacecraft", "name": "Sat", "fields": { "SMA": 7000, "DisplayStateType": "Keplerian" }, "comments": [] } ],
  "sequence":  [ { "cmd": "Propagate", "label": "Prop to Apoapsis", "text": "DefaultProp(Sat) {Sat.Apoapsis}", "args": { }, "children": [] } ],
  "raw": [ ]   // líneas que el parser no entiende: se preservan tal cual, nunca se pierden
}
```
- Campos con el nombre exacto de GMAT. Valores: número, string, bool, lista o referencia (`{"ref": "Sat"}`).
- `children` solo en comandos de bloque (Target, Optimize, If, While, For).

**API backend** (prefijo `/api`):
- `GET /health` → versión de GMAT, `GMAT_HOME`, workers libres.
- `GET /samples`, `GET /samples/{id}` → scripts de ejemplo de la instalación.
- `POST /script/parse` (texto → modelo), `POST /script/serialize` (modelo → texto), `POST /script/validate` (carga en worker, devuelve errores con línea).
- `GET /schema` (tipos creables), `GET /schema/{type}` (campos, tipo, default, enum, unidades).
- `POST /convert/state` (Cartesian ↔ Keplerian ↔ ModKeplerian ↔ Spherical… vía motor).
- `POST /runs` → `{runId}`; `WS /ws/runs/{runId}` → eventos `log`, `progress`, `solver`, `done{results}`, `error`.
- `GET /runs/{runId}/results`, `GET /runs/{runId}/files/{name}`.

## Fases

Una fase por sesión. Cada fase deja la app funcionando.

### Fase 0 — Preparar ✅
Repo nuevo, `origin`, este `PLAN.md` y `CLAUDE.md`.

### Fase 1 — Esqueleto backend + frontend
Meta: monorepo que arranca local con un comando y muestra el estado del motor.
- `backend/` (FastAPI, `pyproject.toml`, `uv` o `pip`): `app/main.py`, `app/config.py` (`GMAT_HOME`, límites), `app/engine/worker.py` (pool de procesos spawn que hacen `import gmatpy` con el `api_startup_file`), `GET /api/health` (versión GMAT vía worker).
- `frontend/` (Vite + React + TS): shell de la app — barra superior (Nuevo/Abrir/Guardar/Correr), panel izquierdo (Recursos / Misión en pestañas), área central con pestañas (Editor, 3D, Gráficas, Reportes), panel inferior (Consola). Tokens de diseño claro/oscuro. Indicador de estado del motor desde `/api/health`.
- `dev.ps1` / `dev.sh`: levanta backend y frontend (proxy Vite → `:8000`). `README.md` con requisitos.
- `.gitignore`, `NOTICE`, `LICENSE`.
- Verificar: `pytest backend` (health con motor real), `npm run build` + `npm run lint`, abrir la app y ver "GMAT R2026a listo".

### Fase 2 — Correr scripts (editor + consola)
Meta: pegar/abrir un `.script`, correrlo con el motor y ver el log en vivo.
- Backend: `POST /runs` + `WS /ws/runs/{id}`; worker carga el script, corre, captura log de GMAT (`gmat.UseLogFile`/MessageInterface) y lo emite; timeout y cancelación. Saneo de seguridad (comandos prohibidos, reescritura de rutas de salida) en `app/engine/sanitize.py` con pruebas.
- `GET /samples` desde `GMAT_HOME/samples` (nombre, carpeta, descripción del encabezado).
- Frontend: Monaco con lenguaje GMAT (keywords de `src/base` + tipos), abrir archivo local / galería de ejemplos / guardar `.script`, botón Correr/Detener, consola con niveles y errores clicables a la línea.
- Verificar: pytest corre `Ex_HohmannTransfer.script` y 5 samples más vía API; prueba de saneo (ruta absoluta reescrita, `SystemCommand` rechazado); en navegador correr un ejemplo y ver el log.

### Fase 3 — Modelo de misión: parser/serializer + esquemas
Meta: script ↔ modelo JSON sin pérdidas y metadatos de campos desde el motor.
- `backend/app/script/` parser (Create, asignaciones `Obj.Campo = …`, `GMAT` prefijo, arrays `[ ]`, `{ }`, comentarios `%`, continuaciones `...`, `BeginMissionSequence`, comandos con etiqueta `'Nombre'`, bloques anidados) y serializer con formato estable estilo GMAT.
- `shared/mission.schema.json` + tipos TS.
- `app/engine/schema.py`: para cada tipo creable, crear objeto en worker y leer parámetros (nombre, tipo, default, read-only, enum cuando el motor lo da); cache en disco por versión de GMAT. `GET /schema`, `GET /schema/{type}`.
- Verificar: prueba de ida y vuelta sobre **los 162 samples**: `serialize(parse(x))` carga en `gmatpy` con los mismos objetos y los mismos valores de campo que `x` (comparando vía motor). Lista de excepciones documentada si alguna no pasa. Si no cabe: 3a parser/serializer, 3b esquemas.

### Fase 4 — Árbol de recursos + formularios
Meta: crear y editar recursos sin escribir script.
- Árbol agrupado (Naves, Hardware, Propagadores, Maniobras, Sistemas de coordenadas, Solvers, Variables, Salidas) con crear / renombrar (actualiza referencias) / clonar / borrar (avisa referencias).
- Formulario genérico desde `/schema/{type}`: tipos number/string/bool/enum/referencia (combo con objetos del tipo correcto), unidades, ayuda.
- Editores dedicados: Spacecraft (estado orbital con cambio de representación vía `POST /convert/state`, época con formatos, masa/áreas, tanques/thrusters adjuntos), ForceModel (cuerpo central, gravedad grado/orden, terceros cuerpos, arrastre, SRP), Propagator (integrador, pasos, tolerancias).
- Sincronía editor de script ↔ modelo (editar en uno actualiza el otro; error de parseo no destruye el modelo). `POST /convert/state` y `POST /script/validate` en backend.
- Verificar: crear desde cero una misión LEO solo con formularios, correrla y obtener el mismo resultado que el script equivalente escrito a mano (prueba backend + recorrido en navegador).

### Fase 5 — Editor de secuencia de misión
Meta: armar la secuencia como árbol visual.
- Árbol de comandos con arrastrar/soltar, anidado en bloques, menú "agregar comando" por categoría, etiquetas, habilitar/comentar.
- Formularios: Propagate (propagador, naves, stop conditions con parámetro/valor, modo sincronizado, hacia atrás), Maneuver, Begin/EndFiniteBurn, Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint, If/While/For (condiciones), Report, Toggle, asignación (`GMAT x = expr`), Stop.
- Selector de parámetros (`Sat.Earth.Altitude`, `Sat.ElapsedDays`…) con búsqueda, desde los parámetros que da el motor.
- Verificar: reconstruir `Ex_HohmannTransfer` solo con la UI y que el script resultante corra igual que el sample (comparar resultados numéricos).

### Fase 6 — Resultados: 3D, ground track, gráficas, reportes
Meta: ver lo que GMAT calcula, mejor que en escritorio.
- Worker: `ReportFile` ocultos por nave + lectura de `ReportFile`/`XYPlot`/`OrbitView`/`GroundTrackPlot` del usuario; resultados en `GET /runs/{id}/results` (series en binario compacto o JSON por bloques).
- Cesium: Tierra (y cuerpo central si es otro: Luna/Marte con textura offline), trayectorias por nave con color, marcadores de maniobra, barra de tiempo con reproducción, cámara seguir nave, marcos inerciales vs fijos.
- Ground track 2D, XYPlot con uPlot (zoom, varias series, exportar PNG/CSV), tabla de ReportFile con exportar CSV.
- Verificar: Hohmann, un sample lunar y uno de ground track se ven correctos (comparar puntos con el `ReportFile` crudo); sin errores de consola; 60 fps razonables con 50k puntos.

### Fase 7 — Solvers en vivo y misiones complejas
Meta: Target/Optimize entendibles.
- Eventos `solver` por iteración (variables, objetivos, restricciones, convergencia) desde el worker; panel con tabla y gráfica de convergencia; avisos claros si no converge.
- Correr todos los samples del núcleo (sin plugins opcionales) en lote: tabla de estado en `docs/COMPATIBILIDAD.md`.
- Verificar: `Ex_HohmannTransfer`, un sample de Optimize (VF13ad o fmincon-free) y B-plane convergen igual que escritorio; lote de samples sin regresiones.

### Fase 8 — UX: intuitivo de verdad
Meta: que un estudiante arme su primera misión en 5 minutos.
- Plantillas/asistentes: "Órbita LEO", "Transferencia Hohmann a GEO", "Viaje a la Luna", "Ground track de un satélite"; recorrido guiado la primera vez.
- Deshacer/rehacer, autoguardado del borrador (localStorage, con aviso), atajos de teclado (Ctrl+S, F5 correr, Ctrl+Z), paleta de comandos (Ctrl+K).
- Validación en vivo con mensajes en español junto al campo; errores del motor mapeados a recurso/campo.
- Responsive (tablet como mínimo; móvil solo visor de resultados), accesibilidad (teclado, contraste, labels).
- Verificar: recorrido de las plantillas en navegador; sin scroll horizontal en 768 px; Lighthouse accesibilidad ≥ 90.

### Fase 9 — Docker y deploy en VPS
Meta: `docker compose up` y listo en Portainer.
- `backend/Dockerfile` (Python 3.12, descarga `gmat-ubuntu-x64-R2026a.tar.gz` con sha256 fijo, dependencias de sistema que pida `gmatpy`, usuario no root), `frontend/Dockerfile` (build Vite → nginx endurecido, proxy `/api` y `/ws`), `docker-compose.yml`, `.env.example` (puertos, límites, `GMAT_HOME`).
- Límites de producción: corridas simultáneas, timeout, tamaño de script, limpieza de carpetas temporales, rate limit simple por IP.
- Verificar: stack levantado en local con Docker, correr samples desde el navegador contra el contenedor; reinicio limpio.

### Fase 10 — Pruebas E2E y documentación
- Playwright: abrir ejemplo → correr → ver 3D/gráfica; crear misión con formularios; guardar/abrir `.script`.
- `docs/` (skill `documentar-proyecto`): arquitectura, cómo agregar un editor dedicado, compatibilidad.
- Verificar: `npx playwright test` en verde.

### Fase 11 (opcional) — Plugins
Por separado, cada uno su propia sesión: EventLocator (eclipses, contactos), Estimation (batch/EKF, estaciones, mediciones), Formation, Propagadores extra (SPK/TLE), CSALT.

### Fase 12 (opcional) — Multiusuario
Cuentas, misiones guardadas en servidor (PostgreSQL), compartir por enlace, cuotas por usuario.

## Protocolo por sesión

1. Leer **Avance** y tomar la primera fase sin marcar. Leer solo los archivos que esa fase toca.
2. Implementar la fase completa, nada de fases siguientes.
3. Verificar: `cd backend; pytest` · `cd frontend; npm run lint; npm run build` · levantar con `dev.ps1` y revisar en el navegador lo que pida la fase (consola sin errores).
4. Marcar la fase en **Avance** y escribir 2-5 líneas en **Bitácora**.
5. Commit (Conventional Commits) + `git push`.
6. Avisar al usuario que puede hacer `/clear` y continuar con la siguiente fase.

## Avance

- [x] Fase 0 — Preparar
- [ ] Fase 1 — Esqueleto backend + frontend
- [ ] Fase 2 — Correr scripts (editor + consola)
- [ ] Fase 3 — Modelo de misión: parser/serializer + esquemas
- [ ] Fase 4 — Árbol de recursos + formularios
- [ ] Fase 5 — Editor de secuencia de misión
- [ ] Fase 6 — Resultados: 3D, ground track, gráficas, reportes
- [ ] Fase 7 — Solvers en vivo y misiones complejas
- [ ] Fase 8 — UX: intuitivo de verdad
- [ ] Fase 9 — Docker y deploy en VPS
- [ ] Fase 10 — Pruebas E2E y documentación
- [ ] Fase 11 (opcional) — Plugins
- [ ] Fase 12 (opcional) — Multiusuario

## Bitácora

- **2026-11-14 · Fase 0** — Repo creado con `origin` a `YaxOFF/Gmat-Web`. Elegido backend Python + `gmatpy` (motor real) en lugar de WebAssembly o reescritura; frontend React + Vite + TS + Cesium; alcance v1 = núcleo de diseño de misión; deploy Docker/Portainer + local. Comprobado que `gmatpy` R2026a corre samples con Python 3.14 en Windows y que existe build Ubuntu R2026a para Docker. Código fuente C++ de referencia clonado en `C:\Users\Yaxon\Downloads\GMAT-src` (tag `R2026a`).
