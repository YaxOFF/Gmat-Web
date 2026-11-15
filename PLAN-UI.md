# Plan: rediseño UI/UX minimalista y claro

Rama: `ui/redesign-light` (sale de `game/msl-edl`). No tocar `main`.

## Objetivo
La UI del juego **Mission Architect** (`frontend/src/mission-architect/`) pasa a un estilo claro y minimalista,
inspirado en la referencia "Welcome, Salung / Schedule": fondo gris cálido, tarjetas casi
blancas muy redondeadas, sombras suaves, mucho aire, tipografía limpia, botones píldora.
Colores de acento tomados del logo de la NASA (solo los colores: sin logo ni marca, ver
restricciones de `CLAUDE.md`).

## Lenguaje visual (tokens)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#ECEBE8` | fondo de página (gris cálido) |
| `--surface` | `#F7F6F4` | tarjetas |
| `--surface-2` | `#FFFFFF` | tarjeta interior / input / nota destacada |
| `--line` | `#E2E0DC` | bordes de 1px, divisores |
| `--text` | `#1A1A1A` | títulos y texto |
| `--text-muted` | `#8A8885` | subtítulos, estados ("Upcoming") |
| `--primary` | `#0B3D91` | azul NASA: botón principal, selección, barra lateral de tarjeta |
| `--primary-soft` | `#0B3D9114` | fondo de chip/selección |
| `--accent` | `#FC3D21` | rojo NASA: solo un dato clave por pantalla (alerta, indicador, CTA de riesgo) |
| `--ok` / `--warn` / `--error` | `#2E9E6A` / `#C98A12` / `#FC3D21` | estados |
| `--radius-lg` / `--radius` / `--radius-pill` | `24px` / `14px` / `999px` | tarjeta / control / botón |
| `--shadow` | `0 1px 2px #0000000a, 0 8px 24px #0000000d` | elevación única |
| `--sans` | `Inter`, system-ui | todo el texto (Google Fonts) |

Reglas:
- Una sola elevación (`--shadow`); los bordes de 1px separan, no las sombras apiladas.
- Botón principal: píldora azul sólida. Secundario: píldora blanca con borde. Icono: círculo blanco 40px.
- Tarjetas de lista: barra vertical de 3px a la izquierda (azul; rojo si es alerta), título + estado en gris.
- Navegación: barra tipo píldora flotante con iconos; el activo en círculo blanco.
- El rojo se usa poco: un acento por pantalla, como el naranja de la referencia.
- Sin mayúsculas forzadas, sin `clip-path` diagonales, sin halftone, sin skew.
- Las escenas 3D (Three/Cesium) conservan su fondo espacial oscuro; solo cambia el marco/HUD que las rodea, que pasa a tarjetas claras translúcidas (`backdrop-filter: blur`).

Alcance: solo el juego. El editor GMAT (`App.module.css`, `mission/`, `resources/`, `results/`) no se toca.

## Trabajo (en orden)
1. **Fuente** — Inter desde Google Fonts en `frontend/index.html`.
2. **Juego** — `mission-architect/styles.css` (910 líneas): remapear las variables de `.ma`
   (`--bg --panel --panel2 --line --text --dim --lime --pink --cyan…`) a los tokens nuevos
   para que todo cambie de golpe; luego limpiar por sección: botones (quitar cortes diagonales),
   topbar (pasos como píldoras), título, diálogo (globo como tarjeta blanca), hangar, mapeo,
   reporte, setup. Borrar reglas muertas (`.halftone`, skew).
3. **Colores fijos en TSX del juego** — `ui/Portrait.tsx`, `ui/Patch.tsx`, `three/Backdrop3D.tsx`,
   `three/HomeScene.tsx`, `three/CoreSample.tsx` y los `style={{}}` sueltos: pasar a `var(--…)` solo
   lo que es UI; el arte 3D y los retratos se dejan salvo que choquen con el fondo claro.
4. **Pulido UX** — espaciado consistente (múltiplos de 8), estados hover/focus/disabled visibles
   (`:focus-visible` azul), contraste AA del texto gris sobre `--bg`, layout sin scroll horizontal
   en 1280px y 390px.

## Verificación
- `cd frontend && npm run build` sin errores.
- Recorrido en Chrome (Claude in Chrome) del juego completo
  (título → historia → setup → órbita → hangar → aterrizaje → reporte). Captura de cada pantalla.
- Sin cambios de lógica ni de textos (`i18n`) salvo que el usuario lo pida.
- `sh docs/docs.sh stale` y actualizar lo que liste.

## Fuera de alcance
Editor GMAT, modo oscuro, nuevas pantallas, cambios de física/motor, rediseño del arte 3D y los retratos.
