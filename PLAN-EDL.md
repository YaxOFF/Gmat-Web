# Plan: Mars entry, descent and landing (EDL)

Cinematic sequence of the rover landing on Mars, with the new models: capsule (`Aeroshell`),
descent stage (`SkyCrane`) and the Curiosity rover the game already uses. It runs in "Try Mars", before
driving the rover. All work goes on the `game/msl-edl` branch; never on `main`.

Source models: `D:\YaxonFolder\Github\RoverCuriosity\curiosity_rover.blend`. Notes on the models
(node names, materials, stacked position): `D:\YaxonFolder\Github\RoverCuriosity\SKYCRANE.md`.

## What exists today

- `mission-architect/three/Descent3D.tsx`: **lunar** descent of the main mission. Procedural lunar
  lander (`buildLander` in `spacecraft.ts`), 4 decisions and a final roll. Not touched.
- `mission-architect/ui/MarsTest.tsx`: Mars globe and "Drive at …" button that opens `Rover3D` with
  `world={MARS}`. Today the rover appears already on the ground, with no descent. The new sequence goes here.
- `three/curiosity.ts`: loads `public/models/curiosity_rover.glb` and builds the suspension. The GLB comes from the
  same `.blend` (nodes `Rocker_Izq`, `Rueda_DI`, …). Rover frame: front = +Z, up = +Y.
- No game scene has `scene.environment`. That is why `curiosity.ts` lowers `metalness` to 0.15.
  The SkyCrane and the capsule are almost all metal with a metal map: without an environment they look black.
- The game does not use `DRACOLoader`.
- `main` has uncommitted changes that are not part of this plan (`frontend/src/App.tsx`, `i18n/es.ts`,
  `results/View3D.tsx`, `frontend/src/game/`, `results/orbit3d.ts`). They travel in the working tree.

## Decisions made

| Topic | Decision |
|---|---|
| Branch | `game/msl-edl`, created from `main`. Commits and push go only to this branch. |
| Where it runs | Only on Mars: `MarsTest` → EDL sequence → `Rover3D`. The lunar descent stays the same. (Chosen by the user.) |
| Gameplay | Cinematic only: no decisions, no roll and no failure ending. Button to skip it. (Chosen by the user.) |
| Rover size | Unchanged. The capsule is already scaled up 1.65 times in the `.blend` so the deployed rover fits. |
| Rover | The `curiosity_rover.glb` already in the game is used, with `loadCuriosity()`. It is not re-exported. |
| New files | `public/models/skycrane.glb` and `public/models/aeroshell.glb`, each with its root at the origin. |
| Compression | Textures at 1024 px maximum and WebP. No Draco (the game does not load the decoder). Never `gltf-transform optimize`. |
| Stacked position | Constants in code, in the rover frame (origin of `gltf.scene` of `curiosity_rover.glb`): SkyCrane 2.17 m up, capsule separation plane 0.77 m up. Confirmed in E1: the game rover measures the same as the one in the `.blend` (2.78 × 2.22 × 3.95 m in Three.js x, y, z) and its `Curiosity` node is at z = -0.035, same as in Blender. |
| Thrusters | In Three.js the plume of each `Thruster_*` goes along its **local -Y** (Blender's -Z); `Nozzle_*` is at y = -0.63 inside it. |
| Capsule interior | `MAT-aeroshell_interior` is not exported (no face uses it in the `.blend`). From inside you see the exterior material, which is double-sided. Reviewed in E2: it is enough. |
| Cable attachment | 3 rover points as constants in code (`ROVER_BRIDLE` in `edl.ts`: deck at y = 1.15 m, one at the front and two at the back; the rover GLB does not have those nodes). At the top the SkyCrane `Bridle_Anchor_1..3` nodes are used. |
| Animation | All in code (state machine with timings), no Blender clips. Reasons in `SKYCRANE.md` §4. |
| Parachute | Procedural geometry in Three.js (canopy with white and orange stripes, lines). There is no model. |
| Effects | Flames, entry plasma, dust and smoke are made in the game with sprites or simple meshes. |
| Lighting | The EDL scene defines `scene.environment` (PMREM from `RoomEnvironment` or from a simple Martian sky). `Rover3D` does not change. |
| Descent scale | The real altitude (125 km → 0) is shown in the HUD. The on-screen position is compressed, like `Descent3D` does with its logarithmic scale. Total duration close to 60 s. |
| Terrain | The same real site relief that `Rover3D` uses (`loadDem`, `demHeight`). The rover touches the ground at the point where `Rover3D` starts (`x = 0, z = -74, yaw = 0`), so the scene change does not jump. |
| Texts | As `mission-architect` does them today (phase E3 checks whether they go in `i18n` or in the component and follows that form). |
| Unrelated changes | The uncommitted files that came from `main` are not included in this plan's commits: always `git add` by path. |

## Target formats

### GLB nodes (same as in Blender)

```
skycrane.glb
SkyCrane                     root, origin at the bottom center of the craft
├─ SkyCrane_Body
├─ Bridle_Anchor_1..3        where the cables leave
└─ Thruster_{LF,LB,RF,RB}_{1,2}     pivot at the mount; Blender local -Z = jet direction
   └─ Nozzle_{…}             the flame goes here

aeroshell.glb
Aeroshell                    root, origin at the center of the separation plane
├─ Aeroshell_Backshell       separates upward
└─ Aeroshell_Heatshield      separates downward
```

In Three.js Blender's Z axis becomes Y, and Blender's -Y becomes +Z.

### Sequence stages

| # | Stage | HUD altitude | What is seen |
|---|---|---|---|
| 1 | Entry | 125 km → 11 km | Closed capsule, heat shield in front, orange plasma and trail |
| 2 | Parachute | 11 km, ~1450 km/h | The parachute comes out of the top cone; the capsule straightens up and slows down |
| 3 | Heat shield | 8 km, ~600 km/h | `Aeroshell_Heatshield` falls; the rover is seen under the SkyCrane |
| 4 | Backshell | 1.6 km, ~300 km/h | SkyCrane with the rover falls free; the backshell stays above with the parachute |
| 5 | Powered descent | 1.6 km → 20 m | 8 flames; lateral divert to move away from the backshell; slows down |
| 6 | Sky crane | 20 m → 0, ~2.7 km/h | SkyCrane hovers; 3 cables lower the rover down to 7.5 m |
| 7 | Touchdown | 0 m | The 6 wheels settle with the suspension; the cables are cut |
| 8 | Flyaway | — | SkyCrane tilts, accelerates and crashes far away with a dust cloud |

Cruise stage separation (before entry) stays optional: phase E7.

## Phases

Each phase leaves `npm run lint` and `npm run build` green and the app working.

### Phase E0 — Prepare ✅

Branch `game/msl-edl`, this plan and the `CLAUDE.md` section.

### Phase E1 — Export the models ✅

Result: `skycrane.glb` 817 KB, `aeroshell.glb` 905 KB (details in `tools/msl/README.md`).

Goal: `skycrane.glb` and `aeroshell.glb` in `frontend/public/models/`, checked.

- `tools/msl/export_edl.py`: script for Blender in console mode (`blender --background <blend>
  --python tools/msl/export_edl.py -- <output folder>`). Exports the `SkyCrane` hierarchy
  and the `Aeroshell` hierarchy separately, each with its root moved to the origin only during the export (without saving
  the `.blend`). Options: GLB, `export_apply=False`, no Draco, no cameras or lights, no animations.
- `tools/msl/README.md`: where the `.blend` comes from, full command, `gltf-transform` steps
  (`resize --width 1024 --height 1024`, then `webp --quality 90`) and resulting sizes.
- Check with `npx @gltf-transform/cli inspect`:
  - node names equal to the table above;
  - `SkyCrane_Body` and the thrusters carry `COLOR_0` (baked occlusion) and their materials a
    metallicRoughness texture; if `COLOR_0` does not come out, note it and decide (bake into the texture or remove the node);
  - the 8 thrusters share a single mesh.
- Confirm the stacked position against the game rover: compare the box of the game's `curiosity_rover.glb`
  with that of the rover in the `.blend` (2.79 × 3.95 × 2.22 m). If it differs, recalculate the two
  constants and note them in Decisions.
- Note in this plan the final size of each GLB.

Verify: `inspect` of both files; each GLB under 2 MB; both look right in
`https://sandbox.babylonjs.com` or in the phase E2 view.

### Phase E2 — Loader module and test view ✅

Goal: the three models stacked in a game scene, well lit.

- `frontend/src/mission-architect/three/edl.ts` (model to imitate: `three/curiosity.ts`):
  - `loadEdl()`: loads the two GLBs with `GLTFLoader`, finds each node by name and throws a clear error
    if any is missing; enables shadows; returns `{ root, skycrane, thrusters, nozzles, anchors, aeroshell,
    backshell, heatshield }`.
  - constants for the stacked position and the 3 attachment points on the rover;
  - `edlEnvironment(renderer)`: PMREM environment texture for `scene.environment`.
- Test view `?screen=edl` in `mission-architect/App.tsx` (next to `?screen=mars`): rover +
  SkyCrane + capsule stacked, `OrbitControls`, and a slider that separates heat shield and backshell.
- Check that the metal does not come out black and that the rover's lowered `metalness` still looks right
  with an environment (if not, remove the lowering only inside this scene).

Verify: `cd frontend; npm run lint; npm run build`; open `?screen=edl`, no console errors, nothing
goes through the capsule wall when it is closed, the two pieces separate without leaving odd gaps.

### Phase E3 — Scene and timeline: from entry to backshell ✅

Goal: stages 1 to 4 moving, no effects yet.

- Move `loadDem` and `demHeight` from `Rover3D.tsx` to `three/dem.ts` (only move and export; `Rover3D`
  imports from there and behaves the same).
- `frontend/src/mission-architect/three/Edl3D.tsx` (model: `Descent3D.tsx` for mounting with
  `mountStage`, and `Rover3D.tsx` for Mars sky, fog, lights and terrain). Props: `site`, `seed`,
  `onDone`.
- Timeline: list of stages with duration; one function per stage that receives the progress 0..1 and
  places the objects. No tween library: custom interpolation with easing.
- Stages 1 to 4 with rigid bodies: tilted capsule with the heat shield in front; it straightens up; the heat shield
  falls spinning; SkyCrane with the rover comes out the bottom of the backshell. The rover and the SkyCrane are hidden
  while the capsule is closed (saves drawing).
- Camera per stage (side tracking, never below the terrain).
- HUD: altitude, speed and stage name; reuse the `.ds-hud` classes from `styles.css`.
- `?screen=edl` now opens this scene; the static E2 view stays at `?screen=edl&static=1`.

If it does not fit in one session: E3a = `dem.ts` + scene, terrain, sky and HUD with the capsule descending;
E3b = stages 2 to 4 and cameras.

Verify: lint and build; `?screen=edl` goes through the 4 stages without console errors; `?screen=mars` →
"Drive" stays the same as before (the `dem.ts` change did not break anything).

### Phase E4 — Powered descent, sky crane, touchdown and flyaway ✅

Goal: stages 5 to 8; the complete sequence from start to end.

- Stage 5: lateral divert, braking, thrusters oriented by code (rotate each `Thruster_*` from its
  pivot).
- Stage 6: SkyCrane hovers; the rover is lowered down to 7.5 m. Cables: 3 `THREE.Line` (or thin cylinders) between
  `Bridle_Anchor_n` and the rover points, updated every frame.
- Stage 7: the rover settles with `rig.update(...)` on the real relief, so the wheels and the
  suspension end up as in `Rover3D`. The cables are released and disappear.
- Stage 8: SkyCrane tilts about 45°, accelerates, leaves the frame and falls far away.
- When finished it calls `onDone()`.

Verify: lint and build; the complete sequence runs without errors; the rover ends at `x = 0, z = -74`
resting on the ground, without floating or sinking.

### Phase E5 — Effects

Goal: make it look like the reference.

- Plasma and trail during entry (additive mesh in front of the heat shield + particles), which fade out when braking.
- Procedural parachute with white and orange stripes, lines up to the backshell's top cone,
  animated inflation and a slight sway.
- Flames on the 8 `Nozzle_*` (bluish), with a shared point light, not one per nozzle.
- Dust when approaching the ground and a cloud at the SkyCrane's distant crash.
- Shadows: fit the sun's shadow camera to the touchdown area.
- Every material and texture created here is released on unmount (`mountStage` already walks the scene;
  check the sprite textures).

Verify: lint and build; visual review stage by stage against the table; no console errors.

### Phase E6 — Integration into "Try Mars"

Goal: the player sees the sequence before driving.

- `ui/MarsTest.tsx`: "Drive at …" opens `Edl3D` with the chosen site; when finished (`onDone`) or when pressing
  "Skip" it opens `Rover3D` as today.
- Make the cut not jump: same position, heading, sky, fog and sunlight as `Rover3D` in its first
  frame.
- Button and stage text wherever the other `mission-architect` texts go.
- The models are loaded only once (cached promise) and `Rover3D` does not download the rover again if
  it is already in memory.

Verify: lint and build; in the browser: title → Try Mars → choose 2 different sites → Drive: the
sequence runs, skips correctly with the button, and the rover drives the same as before.

### Phase E7 — Polish, performance and documentation ✅

- Measure on a modest machine or on mobile: reduce particles or shadows if needed.
- Loading screen while the GLBs download.
- `docs/MAP.md`: new row for the EDL sequence (files, models, `tools/msl`). Run
  `sh docs/docs.sh stale` and update whatever it lists.
- Update `SKYCRANE.md` in the models repo: mark the pending items this plan resolved.
- (Optional) Cruise stage separation at the start, with `public/models/msl.glb`.
- (Optional) Folded rover pose inside the capsule and `deploy_wheels` / `raise_mast` clips from
  Blender; it would allow reducing the capsule to 1.3 times the real size.
- (Optional) Sound: engines, wind, touchdown.

Verify: lint and build; `sh docs/docs.sh stale` with nothing pending.

## Per-session protocol

1. Confirm the branch: `git branch --show-current` must say `game/msl-edl`. If not, `git switch game/msl-edl`.
2. Read **Progress** and take the first unchecked phase. Read only the files that phase touches.
3. Implement the complete phase, nothing from later phases.
4. Verify: `cd frontend; npm run lint; npm run build`, and in the browser (`npm run dev`, port 5173)
   the URL the phase indicates, with the console free of errors.
5. Check off the phase in **Progress** and write 2-5 lines in **Log**.
6. Commit (Conventional Commits) with `git add` by path, without including the unrelated changes that came from
   `main`. `git push -u origin game/msl-edl`. Never push or merge to `main`.
7. Tell the user they can run `/clear` and continue with the next phase.

## Progress

- [x] Phase E0 — Prepare
- [x] Phase E1 — Export the models
- [x] Phase E2 — Loader module and test view
- [x] Phase E3 — Scene and timeline: from entry to backshell
- [x] Phase E4 — Powered descent, sky crane, touchdown and flyaway
- [x] Phase E5 — Effects
- [x] Phase E6 — Integration into "Try Mars"
- [x] Phase E7 — Polish, performance and documentation

## Log

- **2026-11-15 · Phase E0** — Branch `game/msl-edl` created from `main` (`e1d57d9`). Plan written after reading
  `Descent3D.tsx`, `MarsTest.tsx`, `curiosity.ts`, `stage.ts` and `Rover3D.tsx`. Decided with the user:
  only on Mars and cinematic only. No push yet. Known pending item: `main` had uncommitted changes
  that are not part of this plan; they remain in the working tree and were not included in the commit.
- **2026-11-15 · Phase E1** — `tools/msl/export_edl.py` + `README.md`. Blender 5.2 exported with
  `export_vertex_color="ACTIVE"` so that `COLOR_0` comes out; then `gltf-transform` 4.5 resize + webp 90.
  Nodes, `COLOR_0`, metallicRoughness and the thrusters' shared mesh checked with `inspect` and
  by reading the GLB JSON. Stacked position confirmed with no changes. Findings noted in Decisions:
  plume along local -Y and capsule without interior material. Visual review is left for the E2 view.
- **2026-11-15 · Phase E2** — `three/edl.ts` (`loadEdl`, `edlEnvironment` with `RoomEnvironment`, stacking
  constants and `ROVER_BRIDLE`) and `three/EdlStatic.tsx` at `?screen=edl`. With an environment the metal no longer comes out black and the
  rover with lowered `metalness` looks right: removing the lowering was not needed. Closed capsule with no intersections; heat shield and
  backshell separate cleanly. The unrelated changes from `main` (`src/App.tsx` declares `game` twice) break lint and
  build: to verify, they were set aside with `git stash -u` by path and restored afterwards.
- **2026-11-15 · Phase E3** — `three/dem.ts` (`loadDem`, `demHeight`, `noise`, `SIZE`/`HALF` were moved; `Rover3D` imports
  from there and `untileMaterial` was exported). `three/Edl3D.tsx`: same relief and seed as `Rover3D`, timeline
  of 4 stages (32 s), real on-screen height below 100 m and logarithmic above, sky that darkens with altitude and fog
  thinner higher up (with `Rover3D`'s fog the ground was not visible). Texts in English inside the component, like `Descent3D`.
  `?screen=edl` runs the sequence in a loop (`&site=<id>`); `&static=1` opens the E2 view. To verify, the unrelated changes were
  set aside again with `git stash -u` by path. Reviewed in Chrome: 4 stages, `?screen=mars` → Drive the same.
- **2026-11-15 · Phase E4** — Stages 5 to 8 in `Edl3D.tsx` (64.5 s in total). Stages 1-4 descend shifted 40 m in +X and the
  powered divert brings the stack over `LAND`; the backshell is released into the scene and drifts. The rover goes in its own group:
  while hanging, `rig.update` settles it on an imaginary flat surface that in the last 0.4 m becomes the real relief (`meshHeight`
  of the same mesh as `Rover3D`), so the wheels touch down without a jump. Cables with one `LineSegments`; the thrusters rotate
  from their pivot to compensate for the tilt. Flyaway: it tilts ~45°, flies toward -X and is hidden when it touches the ground
  (the dust is left for E5). The camera ends where `Rover3D`'s camera starts. Reviewed in Chrome, no console errors.
- **2026-11-15 · Phase E5** — Effects in `Edl3D.tsx`, reusing `puffs`/`puffTexture` from `Launch3D.tsx` (now exported; `puffs`
  accepts ground height and bounce center, `Launch3D` unchanged). Plasma: additive cap measured from the heat shield + trail; procedural
  parachute (gores, lines, inflation with bounce, vertical with sway) hung from the backshell; 8 flames with shared geometry and material
  and a single `PointLight` (orange during entry, bluish afterwards); dust below 25 m and a cloud at the crash. The flyaway
  now goes toward +Z and somewhat toward -X so the crash is visible in the final frame. The sun follows the stack/rover with a ±35 m shadow.
  Reviewed in Chrome (with a temporary start at t=44 s for the ending, already removed); `?screen=launch` unchanged.
- **2026-11-15 · Phase E6** — `MarsTest`: "Land and drive at …" opens `Edl3D`; when finished or with "Skip landing ▶" it switches to `Rover3D`.
  `cachedGlb` in `curiosity.ts`: each GLB is downloaded once and each scene receives a `clone()` (`loadCuriosity` and `loadEdl`
  use it). So the cut does not jump, `Rover3D` exports `siteDeposits`/`siteRocks` and `Edl3D` consumes the rng the same way: same rocks and
  same hydrogen tint; ground and rocks without environment light and the environment is turned off during the flyaway; the camera ends
  exactly at `Rover3D`'s initial chase view, which now starts already at that point. On Mars `Rover3D` does not place the lunar
  lander. Reviewed in Chrome: Arcadia (skip) and Korolev (complete sequence); `?rover=cabeus` unchanged, no errors.
- **2026-11-15 · Phase E7** — Loading screen `.edl-loading` in `Edl3D` until the first frame (or "LOAD FAILED"); `MarsTest`
  preloads the 3 GLBs with `cachedGlb` while the site is being chosen. Performance not measured: in automated Chrome even an empty
  page runs at 1.5 fps (the window is throttled), so there is no valid figure; particles and shadows stay as they were. Pending:
  measure on a modest machine. `docs/`: EDL row in `MAP.md`, `loadDem` in `dem.ts`, UI texts now in `i18n/en.ts`; stamps
  up to date. `SKYCRANE.md` (models repo) with the pending items resolved. Optional items (cruise, folded pose, sound) were not done.
