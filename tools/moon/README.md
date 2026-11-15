# Moon data

`build_moon.py` generates the game's real Moon data in `frontend/public/moon/` (~6 MB, committed). Run it once, or again if the sources or sizes change:

```sh
uv run --with rasterio --with pillow --with numpy tools/moon/build_moon.py
```

The regolith textures are not downloaded: pass the `.blend`'s `textures` folder with `--regolith <folder>` (needs `--with OpenEXR` too).

It downloads ~300 MB to `~/.cache/gmat-web-moon` (outside the repo).

| Output | Source | Used by |
|---|---|---|
| `color.jpg` (4096×2048), `height.png` (2048×1024) | NASA SVS CGI Moon Kit: LROC color, LOLA relief | Globe in `three/Orbit3D.tsx` (`realMoon` in `three/stage.ts`) |
| `craters/<id>.bin` (Float32 201×201, meters above the window minimum) + `<id>.json` | LOLA `LDEM_80S_80MPP_ADJ` (PGDA) | Rover terrain in `three/Rover3D.tsx` |
| `southpole.png` (1024², ±6° from the pole, hillshade) | Same LDEM | Polar map in `ui/Mapping.tsx` |
| `regolith/diff.jpg`, `normal.jpg` (2048²), `orm.jpg` (1024², R = AO, G = roughness) | Poly Haven "moon_03" PBR material (CC0), from the local `.blend` textures | Tiled rover ground and rocks in `three/Rover3D.tsx` (`TILE`, `GAIN`) |

Each crater window is `diameter × 120/92` wide, so the real rim lands at the game's `RIM`. The scale is uniform, so slopes are the real ones. Crater centers and diameters come from the USGS Gazetteer (`CRATERS` in the script and in `data/catalog.ts`; keep them in sync). If a file is missing, each view falls back to its procedural version.
