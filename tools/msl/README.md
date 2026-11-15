# MSL entry, descent and landing models

`export_edl.py` exports the sky crane and the aeroshell for the Mars landing sequence (`PLAN-EDL.md`)
into `frontend/public/models/`. The rover (`curiosity_rover.glb`) comes from the same `.blend` and is not
exported again.

Source: `curiosity_rover.blend` in the `RoverCuriosity` repo (model notes in its `SKYCRANE.md`). The
`.blend` is saved in the docked position; the script moves each root to the origin only for its export
and never saves the file.

## Commands

Blender 5.2 in console mode, then `gltf-transform` 4.5 (no Draco: the game does not load the decoder;
never run `optimize`, it merges and renames nodes the game looks up by name):

```sh
blender --background curiosity_rover.blend --python tools/msl/export_edl.py -- <tmp>
for f in skycrane aeroshell; do
  npx @gltf-transform/cli resize <tmp>/$f.glb <tmp>/$f.r.glb --width 1024 --height 1024
  npx @gltf-transform/cli webp <tmp>/$f.r.glb frontend/public/models/$f.glb --quality 90
done
```

The exporter warns "More than one shader node tex image used for a texture": the `orm` image feeds both
roughness and metallic through separate nodes. It is harmless.

## Result

| File | Size | Raw export | Content |
|---|---|---|---|
| `skycrane.glb` | 817 KB | 4.6 MB | 4372 triangles, 6 materials, 17 textures (512 px, already under 1024) |
| `aeroshell.glb` | 905 KB | 6.9 MB | 2208 triangles, 2 materials, 6 textures (1024 px) |

Checked with `npx @gltf-transform/cli inspect`:

- Node names match Blender (`SkyCrane`, `SkyCrane_Body`, `Bridle_Anchor_1..3`, `Thruster_{LF,LB,RF,RB}_{1,2}`,
  `Nozzle_*`; `Aeroshell`, `Aeroshell_Backshell`, `Aeroshell_Heatshield`). Roots at the origin.
- `SkyCrane_Body` and the thrusters carry `COLOR_0` (baked AO); all materials have a
  `metallicRoughnessTexture`. The 8 thrusters share one mesh (`SkyCrane_Thruster`).
- In Three.js the jet of each thruster points along its local **-Y** (Blender -Z); `Nozzle_*` sits at
  y = -0.63 in it.
- The aeroshell has no `occlusionTexture` (AO is in the R channel of `orm`, not wired in Blender), and
  `MAT-aeroshell_interior` is not exported: no face uses it in the `.blend`. The inside of each piece
  shows the outer material, which is double-sided.
