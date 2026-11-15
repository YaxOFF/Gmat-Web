# Plan: entrada, descenso y aterrizaje en Marte (EDL)

Secuencia cinemática del aterrizaje del rover en Marte, con los modelos nuevos: cápsula (`Aeroshell`),
etapa de descenso (`SkyCrane`) y el rover Curiosity que el juego ya usa. Corre en "Try Mars", antes de
manejar el rover. Todo el trabajo va en la rama `game/msl-edl`; nunca en `main`.

Modelos de origen: `D:\YaxonFolder\Github\RoverCuriosity\curiosity_rover.blend`. Notas de los modelos
(nombres de nodos, materiales, posición acoplada): `D:\YaxonFolder\Github\RoverCuriosity\SKYCRANE.md`.

## Lo que hay hoy

- `mission-architect/three/Descent3D.tsx`: descenso **lunar** de la misión principal. Módulo de
  alunizaje procedural (`buildLander` en `spacecraft.ts`), 4 decisiones y una tirada final. No se toca.
- `mission-architect/ui/MarsTest.tsx`: globo de Marte y botón "Drive at …" que abre `Rover3D` con
  `world={MARS}`. Hoy el rover aparece ya en el suelo, sin descenso. Aquí entra la secuencia nueva.
- `three/curiosity.ts`: carga `public/models/curiosity_rover.glb` y arma la suspensión. El GLB sale del
  mismo `.blend` (nodos `Rocker_Izq`, `Rueda_DI`, …). Marco del rover: frente = +Z, arriba = +Y.
- Ninguna escena del juego tiene `scene.environment`. Por eso `curiosity.ts` baja `metalness` a 0.15.
  El SkyCrane y la cápsula son casi todo metal con mapa de metal: sin entorno se ven negros.
- El juego no usa `DRACOLoader`.
- `main` tiene cambios sin commit que no son de este plan (`frontend/src/App.tsx`, `i18n/es.ts`,
  `results/View3D.tsx`, `frontend/src/game/`, `results/orbit3d.ts`). Viajan en el árbol de trabajo.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Rama | `game/msl-edl`, creada desde `main`. Los commits y el push van solo a esta rama. |
| Dónde corre | Solo en Marte: `MarsTest` → secuencia EDL → `Rover3D`. El descenso lunar queda igual. (Elegido por el usuario.) |
| Jugabilidad | Solo cinemática: sin decisiones, sin tirada y sin final de fallo. Botón para saltarla. (Elegido por el usuario.) |
| Tamaño del rover | No cambia. La cápsula ya está agrandada 1.65 veces en el `.blend` para que quepa el rover desplegado. |
| Rover | Se usa el `curiosity_rover.glb` que ya está en el juego, con `loadCuriosity()`. No se vuelve a exportar. |
| Archivos nuevos | `public/models/skycrane.glb` y `public/models/aeroshell.glb`, cada uno con su raíz en el origen. |
| Compresión | Texturas a 1024 px máximo y WebP. Sin Draco (el juego no carga el decodificador). Nunca `gltf-transform optimize`. |
| Posición acoplada | Constantes en código, en el marco del rover (origen de `gltf.scene` de `curiosity_rover.glb`): SkyCrane 2.17 m arriba, plano de separación de la cápsula 0.77 m arriba. Confirmadas en E1: el rover del juego mide lo mismo que el del `.blend` (2.78 × 2.22 × 3.95 m en x, y, z de Three.js) y su nodo `Curiosity` está en z = -0.035, igual que en Blender. |
| Propulsores | En Three.js el chorro de cada `Thruster_*` va por su **-Y local** (el -Z de Blender); `Nozzle_*` está en y = -0.63 dentro de él. |
| Interior de la cápsula | `MAT-aeroshell_interior` no se exporta (ninguna cara lo usa en el `.blend`). Por dentro se ve el material exterior, que es de doble cara. Revisado en E2: basta. |
| Enganche de cables | 3 puntos del rover como constantes en código (`ROVER_BRIDLE` en `edl.ts`: cubierta a y = 1.15 m, uno al frente y dos atrás; el GLB del rover no tiene esos nodos). Arriba se usan los nodos `Bridle_Anchor_1..3` del SkyCrane. |
| Animación | Toda en código (máquina de estados con tiempos), sin clips de Blender. Motivos en `SKYCRANE.md` §4. |
| Paracaídas | Geometría procedural en Three.js (casquete con franjas blancas y naranjas, líneas). No hay modelo. |
| Efectos | Llamas, plasma de entrada, polvo y humo se hacen en el juego con sprites o mallas simples. |
| Iluminación | La escena EDL define `scene.environment` (PMREM de `RoomEnvironment` o de un cielo marciano simple). `Rover3D` no cambia. |
| Escala del descenso | La altitud real (125 km → 0) se muestra en el HUD. La posición en pantalla va comprimida, como hace `Descent3D` con su escala logarítmica. Duración total cercana a 60 s. |
| Terreno | El mismo relieve real del sitio que usa `Rover3D` (`loadDem`, `demHeight`). El rover toca el suelo en el punto donde `Rover3D` empieza (`x = 0, z = -74, yaw = 0`), para que el cambio de escena no salte. |
| Textos | Como los hace hoy `mission-architect` (fase E3 revisa si van en `i18n` o en el componente y sigue esa forma). |
| Cambios ajenos | Los archivos sin commit que venían de `main` no se incluyen en commits de este plan: `git add` siempre por ruta. |

## Formatos destino

### Nodos de los GLB (iguales que en Blender)

```
skycrane.glb
SkyCrane                     raíz, origen en el centro inferior de la nave
├─ SkyCrane_Body
├─ Bridle_Anchor_1..3        salida de los cables
└─ Thruster_{LF,LB,RF,RB}_{1,2}     pivote en el montaje; -Z local de Blender = dirección del chorro
   └─ Nozzle_{…}             aquí va la llama

aeroshell.glb
Aeroshell                    raíz, origen en el centro del plano de separación
├─ Aeroshell_Backshell       se separa hacia arriba
└─ Aeroshell_Heatshield      se separa hacia abajo
```

En Three.js el eje Z de Blender pasa a ser Y, y el -Y de Blender pasa a ser +Z.

### Etapas de la secuencia

| # | Etapa | Altitud en el HUD | Qué se ve |
|---|---|---|---|
| 1 | Entrada | 125 km → 11 km | Cápsula cerrada, escudo por delante, plasma naranja y estela |
| 2 | Paracaídas | 11 km, ~1450 km/h | Sale el paracaídas del cono superior; la cápsula se endereza y frena |
| 3 | Escudo térmico | 8 km, ~600 km/h | `Aeroshell_Heatshield` cae; se ve el rover bajo el SkyCrane |
| 4 | Carcasa trasera | 1.6 km, ~300 km/h | SkyCrane con el rover cae libre; la carcasa queda arriba con el paracaídas |
| 5 | Descenso propulsado | 1.6 km → 20 m | 8 llamas; desvío lateral para alejarse de la carcasa; frena |
| 6 | Sky crane | 20 m → 0, ~2.7 km/h | SkyCrane flota; 3 cables bajan el rover hasta 7.5 m |
| 7 | Contacto | 0 m | Las 6 ruedas apoyan con la suspensión; se cortan los cables |
| 8 | Vuelo de escape | — | SkyCrane se inclina, acelera y se estrella lejos con una nube de polvo |

La separación de la etapa de crucero (antes de la entrada) queda como opcional: fase E7.

## Fases

Cada fase deja `npm run lint` y `npm run build` en verde y la app funcionando.

### Fase E0 — Preparar ✅

Rama `game/msl-edl`, este plan y la sección de `CLAUDE.md`.

### Fase E1 — Exportar los modelos ✅

Resultado: `skycrane.glb` 817 KB, `aeroshell.glb` 905 KB (detalle en `tools/msl/README.md`).

Meta: `skycrane.glb` y `aeroshell.glb` en `frontend/public/models/`, comprobados.

- `tools/msl/export_edl.py`: script para Blender en modo consola (`blender --background <blend>
  --python tools/msl/export_edl.py -- <carpeta de salida>`). Exporta por separado la jerarquía `SkyCrane`
  y la jerarquía `Aeroshell`, cada una con su raíz llevada al origen solo durante el export (sin guardar
  el `.blend`). Opciones: GLB, `export_apply=False`, sin Draco, sin cámaras ni luces, sin animaciones.
- `tools/msl/README.md`: de dónde sale el `.blend`, comando completo, pasos de `gltf-transform`
  (`resize --width 1024 --height 1024`, luego `webp --quality 90`) y tamaños obtenidos.
- Comprobar con `npx @gltf-transform/cli inspect`:
  - nombres de nodos iguales a la tabla de arriba;
  - `SkyCrane_Body` y los propulsores llevan `COLOR_0` (oclusión horneada) y sus materiales una textura
    metallicRoughness; si `COLOR_0` no sale, anotar y decidir (hornear en la textura o quitar el nodo);
  - los 8 propulsores comparten una sola malla.
- Confirmar la posición acoplada contra el rover del juego: comparar la caja del `curiosity_rover.glb`
  del juego con la del rover del `.blend` (2.79 × 3.95 × 2.22 m). Si difiere, recalcular las dos
  constantes y anotarlas en Decisiones.
- Anotar en este plan el tamaño final de cada GLB.

Verificar: `inspect` de los dos archivos; cada GLB por debajo de 2 MB; los dos se ven bien en
`https://sandbox.babylonjs.com` o en la vista de la fase E2.

### Fase E2 — Módulo de carga y vista de prueba ✅

Meta: los tres modelos acoplados en una escena del juego, bien iluminados.

- `frontend/src/mission-architect/three/edl.ts` (modelo a imitar: `three/curiosity.ts`):
  - `loadEdl()`: carga los dos GLB con `GLTFLoader`, busca cada nodo por nombre y lanza un error claro
    si falta alguno; activa sombras; devuelve `{ root, skycrane, thrusters, nozzles, anchors, aeroshell,
    backshell, heatshield }`.
  - constantes de la posición acoplada y los 3 puntos de enganche en el rover;
  - `edlEnvironment(renderer)`: textura de entorno PMREM para `scene.environment`.
- Vista de prueba `?screen=edl` en `mission-architect/App.tsx` (junto a `?screen=mars`): rover +
  SkyCrane + cápsula acoplados, `OrbitControls`, y un control deslizante que separa escudo y carcasa.
- Comprobar que el metal no sale negro y que el `metalness` rebajado del rover se sigue viendo bien
  con entorno (si no, quitar el rebaje solo dentro de esta escena).

Verificar: `cd frontend; npm run lint; npm run build`; abrir `?screen=edl`, sin errores en consola, nada
atraviesa la pared de la cápsula al estar cerrada, las dos piezas se separan sin dejar huecos raros.

### Fase E3 — Escena y línea de tiempo: de la entrada a la carcasa trasera ✅

Meta: etapas 1 a 4 moviéndose, sin efectos todavía.

- Sacar `loadDem` y `demHeight` de `Rover3D.tsx` a `three/dem.ts` (solo mover y exportar; `Rover3D`
  importa desde ahí y se comporta igual).
- `frontend/src/mission-architect/three/Edl3D.tsx` (modelo: `Descent3D.tsx` para el montaje con
  `mountStage`, y `Rover3D.tsx` para cielo, niebla, luces y terreno de Marte). Props: `site`, `seed`,
  `onDone`.
- Línea de tiempo: lista de etapas con duración; una función por etapa que recibe el avance 0..1 y
  coloca los objetos. Sin librería de tweens: interpolación propia con suavizado.
- Etapas 1 a 4 con cuerpos rígidos: cápsula inclinada con el escudo por delante; se endereza; el escudo
  cae girando; SkyCrane con el rover sale por abajo de la carcasa. El rover y el SkyCrane están ocultos
  mientras la cápsula está cerrada (ahorra dibujado).
- Cámara por etapa (seguimiento lateral, nunca por debajo del terreno).
- HUD: altitud, velocidad y nombre de la etapa; reutilizar las clases `.ds-hud` de `styles.css`.
- `?screen=edl` pasa a abrir esta escena; la vista estática de E2 queda en `?screen=edl&static=1`.

Si no cabe en una sesión: E3a = `dem.ts` + escena, terreno, cielo y HUD con la cápsula bajando;
E3b = etapas 2 a 4 y cámaras.

Verificar: lint y build; `?screen=edl` recorre las 4 etapas sin errores de consola; `?screen=mars` →
"Drive" sigue igual que antes (el cambio de `dem.ts` no rompió nada).

### Fase E4 — Descenso propulsado, sky crane, contacto y escape ✅

Meta: etapas 5 a 8; la secuencia completa de principio a fin.

- Etapa 5: desvío lateral, frenado, propulsores orientados por código (rotar cada `Thruster_*` desde su
  pivote).
- Etapa 6: SkyCrane flota; el rover baja hasta 7.5 m. Cables: 3 `THREE.Line` (o cilindros finos) entre
  `Bridle_Anchor_n` y los puntos del rover, actualizados cada frame.
- Etapa 7: el rover apoya con `rig.update(...)` sobre el relieve real, para que las ruedas y la
  suspensión queden como en `Rover3D`. Los cables se sueltan y desaparecen.
- Etapa 8: SkyCrane se inclina unos 45°, acelera, sale del cuadro y cae lejos.
- Al terminar llama `onDone()`.

Verificar: lint y build; la secuencia completa corre sin errores; el rover queda en `x = 0, z = -74`
apoyado en el suelo, sin flotar ni hundirse.

### Fase E5 — Efectos

Meta: que se vea como la referencia.

- Plasma y estela en la entrada (malla aditiva delante del escudo + partículas), que se apagan al frenar.
- Paracaídas procedural con franjas blancas y naranjas, líneas hasta el cono superior de la carcasa,
  inflado animado y un balanceo leve.
- Llamas en los 8 `Nozzle_*` (azuladas), con luz puntual compartida, no una por tobera.
- Polvo al acercarse al suelo y nube en el choque lejano del SkyCrane.
- Sombras: ajustar la cámara de sombra del sol a la zona de contacto.
- Todo material y textura creado aquí se libera al desmontar (`mountStage` ya recorre la escena;
  comprobar las texturas de sprites).

Verificar: lint y build; revisión visual etapa por etapa contra la tabla; sin errores de consola.

### Fase E6 — Integración en "Try Mars"

Meta: el jugador ve la secuencia antes de manejar.

- `ui/MarsTest.tsx`: "Drive at …" abre `Edl3D` con el sitio elegido; al terminar (`onDone`) o al pulsar
  "Saltar" abre `Rover3D` como hoy.
- Que el corte no salte: misma posición, rumbo, cielo, niebla y luz del sol que `Rover3D` en su primer
  frame.
- Texto del botón y de las etapas donde vayan los demás textos de `mission-architect`.
- Los modelos se cargan una sola vez (promesa en caché) y `Rover3D` no vuelve a descargar el rover si
  ya está en memoria.

Verificar: lint y build; en el navegador: título → Try Mars → elegir 2 sitios distintos → Drive: corre la
secuencia, salta bien con el botón, y el rover se maneja igual que antes.

### Fase E7 — Pulido, rendimiento y documentación

- Medir en un equipo modesto o en móvil: bajar partículas o sombras si hace falta.
- Pantalla de carga mientras bajan los GLB.
- `docs/MAP.md`: fila nueva para la secuencia EDL (archivos, modelos, `tools/msl`). Correr
  `sh docs/docs.sh stale` y actualizar lo que liste.
- Actualizar `SKYCRANE.md` en el repo de los modelos: marcar los pendientes que este plan resolvió.
- (Opcional) Separación de la etapa de crucero al inicio, con `public/models/msl.glb`.
- (Opcional) Pose plegada del rover dentro de la cápsula y clips `deploy_wheels` / `raise_mast` desde
  Blender; permitiría bajar la cápsula a 1.3 veces el tamaño real.
- (Opcional) Sonido: motores, viento, contacto.

Verificar: lint y build; `sh docs/docs.sh stale` sin pendientes.

## Protocolo por sesión

1. Confirmar la rama: `git branch --show-current` debe decir `game/msl-edl`. Si no, `git switch game/msl-edl`.
2. Leer **Avance** y tomar la primera fase sin marcar. Leer solo los archivos que esa fase toca.
3. Implementar la fase completa, nada de fases siguientes.
4. Verificar: `cd frontend; npm run lint; npm run build`, y en el navegador (`npm run dev`, puerto 5173)
   la URL que indique la fase, con la consola sin errores.
5. Marcar la fase en **Avance** y escribir 2-5 líneas en **Bitácora**.
6. Commit (Conventional Commits) con `git add` por ruta, sin incluir los cambios ajenos que venían de
   `main`. `git push -u origin game/msl-edl`. Nunca hacer push ni merge a `main`.
7. Avisar al usuario que puede hacer `/clear` y continuar con la siguiente fase.

## Avance

- [x] Fase E0 — Preparar
- [x] Fase E1 — Exportar los modelos
- [x] Fase E2 — Módulo de carga y vista de prueba
- [x] Fase E3 — Escena y línea de tiempo: de la entrada a la carcasa trasera
- [x] Fase E4 — Descenso propulsado, sky crane, contacto y escape
- [x] Fase E5 — Efectos
- [ ] Fase E6 — Integración en "Try Mars"
- [ ] Fase E7 — Pulido, rendimiento y documentación

## Bitácora

- **2026-11-15 · Fase E0** — Rama `game/msl-edl` creada desde `main` (`e1d57d9`). Plan escrito tras leer
  `Descent3D.tsx`, `MarsTest.tsx`, `curiosity.ts`, `stage.ts` y `Rover3D.tsx`. Decidido con el usuario:
  solo en Marte y solo cinemática. Sin push todavía. Pendiente conocido: `main` traía cambios sin commit
  que no son de este plan; siguen en el árbol de trabajo y no se incluyeron en el commit.
- **2026-11-15 · Fase E1** — `tools/msl/export_edl.py` + `README.md`. Blender 5.2 exportó con
  `export_vertex_color="ACTIVE"` para que salga `COLOR_0`; luego `gltf-transform` 4.5 resize + webp 90.
  Nodos, `COLOR_0`, metallicRoughness y malla compartida de propulsores comprobados con `inspect` y
  leyendo el JSON del GLB. Posición acoplada confirmada sin cambios. Hallazgos anotados en Decisiones:
  chorro por -Y local y cápsula sin material interior. Revisión visual queda para la vista de E2.
- **2026-11-15 · Fase E2** — `three/edl.ts` (`loadEdl`, `edlEnvironment` con `RoomEnvironment`, constantes de
  acople y `ROVER_BRIDLE`) y `three/EdlStatic.tsx` en `?screen=edl`. Con entorno el metal ya no sale negro y el
  rover con `metalness` rebajado se ve bien: no hizo falta quitar el rebaje. Cápsula cerrada sin cruces; escudo y
  carcasa se separan limpios. Los cambios ajenos de `main` (`src/App.tsx` declara `game` dos veces) rompen lint y
  build: para verificar se apartaron con `git stash -u` por ruta y se devolvieron después.
- **2026-11-15 · Fase E3** — `three/dem.ts` (se movieron `loadDem`, `demHeight`, `noise`, `SIZE`/`HALF`; `Rover3D` importa
  de ahí y `untileMaterial` quedó exportado). `three/Edl3D.tsx`: mismo relieve y semilla que `Rover3D`, línea de tiempo
  de 4 etapas (32 s), altura en pantalla real bajo 100 m y logarítmica arriba, cielo que oscurece con la altitud y niebla
  más rala arriba (con la de `Rover3D` el suelo no se veía). Textos en inglés dentro del componente, como `Descent3D`.
  `?screen=edl` corre la secuencia en bucle (`&site=<id>`); `&static=1` abre la vista de E2. Para verificar se volvieron
  a apartar los cambios ajenos con `git stash -u` por ruta. Revisado en Chrome: 4 etapas, `?screen=mars` → Drive igual.
- **2026-11-15 · Fase E4** — Etapas 5 a 8 en `Edl3D.tsx` (64.5 s en total). Las etapas 1-4 bajan corridas 40 m en +X y el
  desvío propulsado trae la pila sobre `LAND`; la carcasa se suelta a la escena y deriva. El rover va en su propio grupo:
  colgado, `rig.update` lo apoya sobre un llano imaginario que en los últimos 0.4 m se vuelve el relieve real (`meshHeight`
  de la misma malla que `Rover3D`), así las ruedas tocan sin salto. Cables con un `LineSegments`; los propulsores giran
  desde su pivote para compensar la inclinación. Escape: se inclina ~45°, vuela hacia -X y se oculta al tocar el suelo
  (el polvo queda para E5). La cámara termina donde arranca la de `Rover3D`. Revisado en Chrome, sin errores de consola.
- **2026-11-15 · Fase E5** — Efectos en `Edl3D.tsx`, reusando `puffs`/`puffTexture` de `Launch3D.tsx` (ahora exportados; `puffs`
  acepta altura del suelo y centro del rebote, `Launch3D` igual). Plasma: casquete aditivo medido del escudo + estela; paracaídas
  procedural (gajos, líneas, inflado con rebote, vertical con balanceo) colgado de la carcasa; 8 llamas con geometría y material
  compartidos y una sola `PointLight` (naranja en la entrada, azulada después); polvo bajo 25 m y nube en el choque. El escape
  ahora va hacia +Z y algo de -X para que el choque se vea en el cuadro final. El sol sigue a la pila/rover con sombra de ±35 m.
  Revisado en Chrome (con un arranque temporal en t=44 s para el final, ya quitado); `?screen=launch` sin cambios.
