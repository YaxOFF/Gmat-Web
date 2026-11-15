# Mars data

`build_mars.py` generates the real Mars data for the "Try Mars" test view in `frontend/public/mars/` (~3.6 MB). Run it once, or again if the sources, sites or sizes change:

```sh
uv run --with rasterio --with pillow --with numpy tools/mars/build_mars.py
```

The rover ground texture is not downloaded: pass the color image chosen by the team with `--regolith <image>`:

```sh
uv run --with rasterio --with pillow --with numpy tools/mars/build_mars.py --regolith "../Mars_Texture_4K_Layers/Textura uniforme de suelo marciano rojizo (1).png"
```

The rock texture (Poly Haven `rock_face_03`, CC0) is not downloaded either: pass its `textures` folder with `--rock <folder>` (needs `--with OpenEXR`):

```sh
uv run --with rasterio --with pillow --with numpy --with OpenEXR tools/mars/build_mars.py --rock ../rock_face_03_4k.blend/textures
```

The 11 GB DEM is never downloaded: it has overviews, so it is read by parts over HTTP (`/vsicurl`). Only the 128 color tiles (~6 MB) are cached in `~/.cache/gmat-web-mars`. A full run takes about a minute.

| Output | Source | Used by |
|---|---|---|
| `color.jpg` (4096×2048) | Viking MDIM2.1 colorized mosaic (USGS), NASA Trek WMTS tiles, zoom 3 | Globe in `ui/MarsTest.tsx` (`realMoon(mat, 'mars')` in `three/stage.ts`) |
| `height.png` (2048×1024) | HRSC+MOLA Blended DEM 200 m v2 (USGS, Fergason et al. 2018), overview | Globe bump map |
| `regolith/diff.jpg`, `normal.jpg` (native 1254²), `orm.jpg` (1024², R = AO, G = roughness 0.95 constant, no chroma subsampling) | "Textura uniforme de suelo marciano rojizo" (team's choice, color only). Normal and AO are derived from its luminance (dark = low), with wrap-around blurs so they still tile | Tiled rover ground in `three/Rover3D.tsx` (`world.ground`, `world.gain`, same hex-tiling as the Moon) |
| `rock/diff.jpg`, `normal.jpg` (2048²), `orm.jpg` (1024², R = AO derived from the displacement, G = real roughness) | Poly Haven `rock_face_03` (CC0) | Rocks and outcrops, triplanar in world space (`triplanarRock` in `three/mars.ts`, one copy every 6 m) |
| `sites/<id>.bin` (Float32 201×201, meters above the window minimum) + `<id>.json` | Same DEM, window read | Rover terrain in `three/Rover3D.tsx` with `world={MARS}` (`three/world.ts`) |

Each site is a square window in a local azimuthal equidistant projection centered on the site, so it is not distorted even near the pole. `SITES` sets the center (USGS Gazetteer; Olympus is moved from the volcano's center to the caldera), the window size in km, and `vex`, a vertical exaggeration written to the json and applied by `demHeight`: at the rover's scale (40–250 km in 240 units) Mars looks flat, more so the plains. Keep ids and lat/lon in sync with `data/mars.ts`. If a file is missing, the rover falls back to procedural terrain.
