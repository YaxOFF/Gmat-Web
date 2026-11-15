# PLAN — GAME: TRIP TO THE MOON

Game mode inside GMAT Web: the player takes a spacecraft from low Earth orbit to lunar
orbit by making the decisions themselves (when to burn, how much thrust, how much to brake), and the real GMAT
engine computes what happens. Aimed at students and curious people: you learn orbital mechanics by playing.
Key constraint, the same as the project's: the physics is computed by GMAT (`gmatpy`); the game never propagates,
computes maneuvers, or decides outcomes on its own.

This plan is separate from `PLAN.md` (the web port, phases 0-12) and takes priority over its phases 9
onward until Phase J4 is finished. It builds on what Phase 8 left: the "Trip to the Moon" template
(`frontend/src/templates.ts`), the Moon's position in the results, and the Moon-centered 3D view.

## Decisions made

| Topic | Decision |
|---|---|
| Game style | **Plan and execute**, in stages (like Kerbal's maneuver nodes). It is not frame-by-frame piloting: each decision is a GMAT run of 1-3 s. |
| How the state advances | The game state is **the list of the player's decisions**. Each "Try" or "Execute" builds the full script from the start up to the current stage and runs it entirely (the full mission takes ~3 s). The spacecraft state is not saved between stages: it is deterministic and simpler. |
| Backend | No new endpoints in J1-J4: `POST /api/runs`, the WebSocket and `GET /api/runs/{id}/results` are used. What the game needs to know (distances, eccentricity, maneuver epochs) is requested by the script itself with `Report`. |
| Outcome of each stage | GMAT decides it: the script reports `Nave.Luna.RMAG`, `Nave.Luna.ECC`, `Nave.Earth.RMAG`, etc. and stop conditions (impact = `Nave.Luna.RMAG` at the lunar radius; escape = maximum time). The frontend only compares those numbers with thresholds to say "captured", "flew past" or "impact". |
| GMAT help | At each stage, a button runs the variant with `Target` (the template's) and shows the engine's answer. It costs points. It is also the tutorial mode. |
| Score | Total ΔV spent compared with that of the GMAT solution, error in the radius and eccentricity of the final orbit, helps used and attempts. 1-3 stars. Best score in `localStorage`. |
| Where it lives | Same app, its own full-screen view ("Play" in the bar), lazy-loaded. Code in `frontend/src/game/`. It does not touch the editor or the forms. |
| 3D | Cesium, the same as in the 3D tab. The shared logic (reading the trajectory, placing the Moon) is pulled out of `results/View3D.tsx` into a shared module; it is not duplicated. |
| Graphic assets | Only what already comes in the repo or is drawn in code: Cesium's lunar texture `Assets/Textures/moonSmall.jpg`, spacecraft made of primitives or our own SVG. No downloads, no NASA logos or branding. |
| Bridge with the app | "View the script" opens in the Editor the mission the player built, as a normal `.script`. The game teaches and the tool is still there. |
| Language | Spanish, texts in `frontend/src/i18n/es.ts` (`es.game`). Scripts in ASCII. |
| Mobile | Tablet at minimum. Mobile: you can watch the replay, not play (same as the rest of the app). |
| Real time | Out of the base scope. The live engine session (instant preview) is Phase J5, optional. |

## Target formats (all phases follow them)

**Player decisions** (`frontend/src/game/luna.ts`):
```ts
type Decisions = {
  date: string        // departure date, "2026-03-20"
  raan: number        // orientation of the departure orbit plane (degrees)
  aop: number         // point of the orbit where the engine fires (degrees)
  tli: number         // translunar injection impulse, km/s
  mcc?: number        // midcourse correction, km/s (may be unused)
  loi?: number        // lunar orbit insertion braking, km/s (negative)
}
type Stage = 'salida' | 'tli' | 'correccion' | 'loi' | 'final'
```

**Game script:** `buildScript(decisions, hasta: Stage, opts?: { ayuda?: Stage })` returns an ASCII GMAT
script. Same resources as the lunar template (spacecraft, force models, propagators, `TLI`, `LOI`,
frames `TierraLunaRot` and `LunaInercial`). It reports into a `ReportFile` named `Juego`, one row per event:
`Evento` (number), `Nave.A1ModJulian`, `EarthMJ2000Eq` position, `Nave.Earth.RMAG`, `Nave.Luna.RMAG`,
`Nave.Luna.ECC`, `Nave.TierraLunaRot.RA`, `Nave.TierraLunaRot.DEC`. The rows before each `Maneuver` give
the epoch and location of the maneuver (GMAT does not publish that instant in the hidden reports).

**Outcome:** `readOutcome(results, hasta)` → `{ estado: 'ok' | 'impacto' | 'escape' | 'no_llega' | 'capturado', numeros: {...} }`,
only with numbers that GMAT wrote.

## Phases

One phase per session. Each phase leaves the app working.

### Phase J0 — Prepare ✅
This `PLAN-JUEGO.md` and the new section of `CLAUDE.md`.

### Phase J1 — The scene: make it look like a game
Goal: the automatic lunar mission (the template's) plays like a movie in its own view.
- `frontend/src/results/orbit3d.ts`: pull the shared parts out of `View3D.tsx` (`track`, colors, body radii, creation of the viewer without ion). `View3D.tsx` switches to using it without changing its behavior.
- `frontend/src/game/Scene.tsx`: full-screen Cesium viewer. Moon with texture (`moonSmall.jpg`), Earth with the usual globe, spacecraft with its own shape and a **trail** drawn as the clock advances (not the whole trajectory at once), **maneuver markers** with labels (TLI, LOI) and cameras: overview, follow spacecraft, Earth, Moon. The camera switches to the Moon on its own when getting close.
- `frontend/src/game/Game.tsx` + `Game.module.css`: "Play" screen (button in the bar, lazy in `App.tsx`), with Play/Pause, speed and Exit. In this phase it runs the lunar template with its default values and shows it.
- Maneuver epochs come from `Report` rows in the script (see Formats); test it here with the template.
- Texts in `es.game`.
- Verify: `npm run lint; npm run build`; in the browser, Play → the mission is shown from start to finish, the trail grows, the markers are where the trajectory changes, the lunar camera shows the capture orbit; normal 3D tab with no regression (Hohmann and lunar template); no console errors. Screenshots in `qa-capturas/juego-J1/`.
- If it doesn't fit: J1a (extract `orbit3d.ts` + scene with Moon, spacecraft and trail), J1b (markers, cameras, Play screen).

### Phase J2 — The game engine: decisions → GMAT → outcome
Goal: any combination of decisions gives a correct and explainable outcome, with no interface yet.
- `frontend/src/game/luna.ts`: `buildScript`, `readOutcome`, thresholds and the help variant per stage (the template's `Target` restricted to that stage). Reuses the resources of `templates.ts` (extract the common block instead of copying it).
- `backend/tests/tools/game_check.mjs` (model: `templates_check.mjs`): runs a table of scenarios against the API and checks the expected state:
  - decisions from the GMAT solution → `capturado`, with the numbers from `m7_viaje_luna`;
  - short TLI (3.0 km/s) → `no_llega`; too much TLI → flies past or `escape`;
  - AOP off by 30° → the encounter with the Moon fails;
  - LOI = 0 → flyby and `escape`; excessive LOI → `impacto`;
  - the help for each stage returns values with which the next stage comes out `ok`.
- `backend/tests/missions/m8_juego_luna.script`: the game script with the reference decisions, compared with desktop in `pytest -m slow tests/test_missions.py`.
- Measure the time of one run per stage (goal: under 3 s) and note it in the Log.
- Verify: `game_check.mjs` with no failures; `pytest -m slow tests/test_missions.py`; `npm run lint; npm run build`.

### Phase J3 — Play: stages, controls and preview
Goal: a person completes the mission making their own decisions.
- `frontend/src/game/store.ts` (Zustand): current stage, decisions, attempts, helps, last run and its outcome.
- `frontend/src/game/Hud.tsx`: stage goal in one sentence, ΔV spent, distance to the Earth and to the Moon, speed, mission time.
- `frontend/src/game/Controls.tsx`, one panel per stage:
  1. **Departure:** date and orientation of the orbit. Indicator of how far the apogee deviates from the Moon.
  2. **TLI burn:** ignition point and ΔV (sliders).
  3. **Correction:** optional small burn; it can be skipped.
  4. **LOI braking:** how much to brake at periselene.
- **Try** runs with the candidate value and draws the trajectory as a "ghost" without committing it; **Execute** locks it in and moves to the next stage. While it runs, the button shows a waiting state; a new run cancels the previous one (`DELETE /api/runs/{id}`) so as not to hit `GMAT_WEB_MAX_RUNS`.
- Outcome messages in plain language ("you fell short: the apogee reached 310 000 km and the Moon is at 384 000"), with GMAT's numbers.
- Failing does not end the game: you can retry the stage or go back to the previous one.
- **GMAT help** per stage: runs the variant with `Target`, shows the convergence and leaves the values set.
- Verify: in the browser, a full game without help up to `capturado`; one game with each type of failure (short, past, impact) with its message; one with help at every stage; no console errors; `npm run lint; npm run build`.
- If it doesn't fit: J3a (store, HUD, stages 1-2 with Try/Execute), J3b (stages 3-4, failures, help).

### Phase J4 — Score, tutorial and polish
Goal: it feels finished and you can show it to someone without explaining anything.
- Final screen: orbit achieved, ΔV used versus GMAT's, 1-3 stars, replay of the whole mission, "Play again" and "View the script" (loads the mission in the Editor with `loadText`).
- Best score in `localStorage` (`gmatweb.juego.luna`).
- Tutorial: the first time, short texts per stage that explain what the player decides and why (apogee, TLI, periselene, LOI).
- "Play: Trip to the Moon" card in the Templates dialog and an entry in the palette (Ctrl+K).
- Tablet with no horizontal scroll; keyboard and labels on all controls; contrast in light and dark (same script from `docs/QA.md`, Phase 8).
- Docs: "Play" section in `docs/GUIDE.md`, entries in `docs/MAP.md`, pitfalls in `docs/GOTCHAS.md`, procedures in `docs/QA.md`.
- Verify: full game in the browser from start to finish at 1280 px and at 768 px; consistent score (the GMAT solution gives 3 stars, a clumsy one gives fewer); `pytest`, `pytest -m slow`, lint and build green.

### Phase J5 (optional) — Live engine session
Goal: instant preview when moving a slider, without waiting for a run.
- Worker process that lives for the duration of the game, with the engine loaded and the spacecraft in memory; propagates in steps on request (model: `GMAT_HOME/api/Ex_R2020a_PropagationStep.py`) over its own WebSocket.
- Limit on simultaneous sessions, closing on inactivity and cleanup; "the FastAPI process never imports `gmatpy`" still holds.
- Decide beforehand whether it coexists with the deployment of Phase 9 of `PLAN.md` (memory per session on the VPS).
- Verify: the preview responds in under 200 ms and gives the same numbers as the full run.

### Phase J6 (optional) — More missions
Pull what is not lunar (stages, score, help) out of `game/luna.ts` into a mission definition and add another one: Hohmann to GEO as level 1, Mars with B-plane as the advanced level.

## Per-session protocol

1. Read **Progress** and take the first unchecked phase. Read only the files that phase touches.
2. Implement the full phase, nothing from later phases.
3. Verify: `cd backend; .venv/Scripts/python -m pytest` (and `-m slow` if the phase touches missions or results) · `cd frontend; npm run lint; npm run build` · start the app and go through in the browser what the phase requires, with no console errors. The game's numbers are always compared against GMAT (`backend/tests/tools/`, `tests/missions/`). Reuse the procedures from `docs/QA.md` and add only what is new at the end. If ports 8000/5173 are taken by old processes, use 8001/5175 as `docs/QA.md` indicates.
4. Check the phase in **Progress** and write 2-5 lines in the **Log**. Run `sh docs/docs.sh stale` and update what it lists.
5. Commit (Conventional Commits) + `git push`.
6. Tell the user they can do `/clear` and continue with the next phase.

## Progress

- [x] Phase J0 — Prepare
- [ ] Phase J1 — The scene: make it look like a game
- [ ] Phase J2 — The game engine: decisions → GMAT → outcome
- [ ] Phase J3 — Play: stages, controls and preview
- [ ] Phase J4 — Score, tutorial and polish
- [ ] Phase J5 (optional) — Live engine session
- [ ] Phase J6 (optional) — More missions

## Log

- **2026-11-14 · Phase J0** — Plan created after Phase 8 of `PLAN.md`. The user wants to use the simulator as a game and chose the trip to the Moon. Agreed style: plan and execute in stages with the current runs (1-3 s), visuals first, then interactivity; the live engine session stays optional (J5). Decided without asking, can be changed: the game lives in the same app as a "Play" view; the state is the list of decisions and each run redoes the mission from the start; no downloaded graphic assets (Cesium's lunar texture, spacecraft drawn in code); this plan goes before Docker (Phase 9 of `PLAN.md`). Verified: `moonSmall.jpg` comes in `node_modules/cesium/Build/Cesium/Assets/Textures`; the lunar template converges in 12 combinations and matches desktop (`m7`).
- **2026-11-15 · Trip to the Moon in Mission Architect (out of phase)** — At the user's request: Journey tab in the editor and, in the game, a successful launch continues with liftoff, atmosphere layers and the lunar template's trajectory run live by GMAT (~5 s, fits in the countdown; without the engine it uses `public/trajectories/moon_transfer.json`). Liftoff and ascent are illustrative. Demo: the final orbit is the template's with radius 2000/2500/4000 km depending on the chosen orbit, not the 50–100 km polar one from the catalog. Branch `game/moon-journey`.
