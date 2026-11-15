"""Genera los datos reales de Marte de la vista de prueba en frontend/public/mars/. Herramienta de desarrollo: se corre una vez.

    uv run --with rasterio --with pillow --with numpy tools/mars/build_mars.py
    uv run --with rasterio --with pillow --with numpy tools/mars/build_mars.py --regolith <imagen de suelo>
    uv run --with rasterio --with pillow --with numpy --with OpenEXR tools/mars/build_mars.py --rock <carpeta textures de rock_face_03>

Fuentes (dominio público, NASA/USGS):
- Color: mosaico Viking MDIM2.1 colorizado (USGS), servido en teselas WMTS por NASA Trek (trek.nasa.gov).
- Relieve: HRSC+MOLA Blended DEM Global 200 m v2 (Fergason, Hare y Laura 2018, USGS Astrogeology). Son 11 GB, pero
  trae overviews: se lee por partes con /vsicurl, sin descargarlo.
Solo las teselas quedan en ~/.cache/gmat-web-mars, fuera del repo.
"""
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.warp import transform
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "public" / "mars"
CACHE = Path.home() / ".cache" / "gmat-web-mars"
TREK = "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm"
DEM = "/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif"
R = 3396190
# Centro (lat, lon este) de USGS Gazetteer of Planetary Nomenclature; ventana (km) y exageración vertical a mano:
# a la escala del rover (ventanas de 40-250 km en 240 unidades) Marte se ve plano, por eso vex > 1; más en las llanuras.
SITES = {
    "korolev": (72.77, 164.58, 106, 3),  # cráter de 81 km lleno de hielo
    "chasma_boreale": (82.54, 312.36, 250, 3),  # cañón en el casquete polar norte
    "arcadia": (49.02, 188.15, 40, 10),  # llanura con hielo enterrado a latitud media
    "olympus": (18.56, 226.69, 100, 2),  # caldera de Olympus Mons (el Gazetteer da el centro del volcán: corrido a la caldera)
    "melas": (-10.52, 287.46, 150, 2),  # Melas Chasma, en Valles Marineris
    "hellas": (-42.43, 70.50, 100, 3),  # piso de Hellas, la cuenca más profunda
    # Misión de rocas (planeta Marte en el juego): sitios reales de rovers. Ventana centrada donde manejó el rover.
    "jezero": (18.44, 77.45, 60, 3),  # Jezero: delta del antiguo lago, aterrizaje de Perseverance (2021)
    "gale": (-4.72, 137.40, 50, 2),  # Gale: llanura de Curiosity al pie del monte Sharp (2012)
    "gusev": (-14.57, 175.48, 40, 6),  # Gusev: Columbia Hills, donde Spirit halló sílice y carbonatos
    "elysium": (4.50, 135.62, 30, 12),  # Elysium Planitia: la llanura lisa de InSight (2018)
}
N = 201  # = vértices por lado de la malla de Rover3D


def to8(a: np.ndarray) -> np.ndarray:
    lo, hi = np.nanpercentile(a, 0.5), np.nanpercentile(a, 99.5)
    return (np.nan_to_num(np.clip((a - lo) / (hi - lo), 0, 1)) * 255).astype(np.uint8)


def tile(z: int, row: int, col: int) -> Image.Image:
    path = CACHE / f"trek{z}" / f"{row}_{col}.jpg"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(f"{TREK}/{z}/{row}/{col}.jpg", timeout=60) as r:
            path.write_bytes(r.read())
    return Image.open(io.BytesIO(path.read_bytes())).convert("RGB")


def globe(ds) -> None:
    z, cols, rows = 3, 16, 8  # zoom 3 = 16×8 teselas de 256 px, lon −180..180 desde arriba a la izquierda
    img = Image.new("RGB", (cols * 256, rows * 256))
    for r in range(rows):
        for c in range(cols):
            img.paste(tile(z, r, c), (c * 256, r * 256))
    img.save(OUT / "color.jpg", quality=85, optimize=True)
    m = ds.read(1, out_shape=(1024, 2048), resampling=Resampling.average, masked=True).astype(np.float32).filled(np.nan)
    Image.fromarray(to8(m)).save(OUT / "height.png", optimize=True)
    print(f"globo: color {img.size}, relieve {np.nanmin(m):.0f}..{np.nanmax(m):.0f} m")


def site(ds, sid: str, lat: float, lon: float, km: float, vex: float) -> None:
    half = km * 1000 / 2
    d = np.linspace(-half, half, N)
    gx, gy = np.meshgrid(d, -d)  # fila 0 = norte; columna → este (vista desde arriba, sin espejo)
    lon180 = (lon + 180) % 360 - 180
    aeqd = f"+proj=aeqd +lat_0={lat} +lon_0={lon180} +R={R} +no_defs"
    lo, la = (np.array(v) for v in transform(aeqd, ds.crs, gx.ravel().tolist(), gy.ravel().tolist()))
    pad = 3 * ds.res[0]
    win = from_bounds(lo.min() - pad, la.min() - pad, lo.max() + pad, la.max() + pad, ds.transform).round_offsets().round_lengths()
    # Leer a ~media separación de la malla: GDAL usa el overview que alcance, sin bajar los 11 GB.
    f = max(1, int(2 * half / (N - 1) / 2 / (ds.res[1] * math.pi / 180 * R)))
    shape = (max(2, math.ceil(win.height / f)), max(2, math.ceil(win.width / f)))
    band = ds.read(1, window=win, out_shape=shape, resampling=Resampling.average, masked=True)
    assert not np.ma.is_masked(band), f"{sid}: huecos en el DEM"
    band = band.data.astype(np.float32)
    tf = ds.window_transform(win) * Affine.scale(win.width / shape[1], win.height / shape[0])
    col, row = ~tf * (lo, la)
    c0, r0 = np.floor(col - 0.5).astype(int), np.floor(row - 0.5).astype(int)
    fc, fr = col - 0.5 - c0, row - 0.5 - r0
    c0, r0 = np.clip(c0, 0, shape[1] - 2), np.clip(r0, 0, shape[0] - 2)
    z = (band[r0, c0] * (1 - fc) * (1 - fr) + band[r0, c0 + 1] * fc * (1 - fr)
         + band[r0 + 1, c0] * (1 - fc) * fr + band[r0 + 1, c0 + 1] * fc * fr).reshape(N, N)
    zmin, zmax = float(z.min()), float(z.max())
    (z - zmin).astype("<f4").tofile(OUT / "sites" / f"{sid}.bin")
    meta = {"n": N, "size_m": round(2 * half), "min_m": round(zmin, 1), "max_m": round(zmax, 1), "lat": lat, "lon": lon,
            "vex": vex, "source": "HRSC+MOLA Blended DEM 200 m v2 (USGS, Fergason et al. 2018)"}
    (OUT / "sites" / f"{sid}.json").write_text(json.dumps(meta) + "\n")
    print(f"{sid:>15}: ventana {km} km, leído {shape[1]}x{shape[0]} (1/{f}), relieve {zmax - zmin:.0f} m ({zmin:.0f}..{zmax:.0f})")


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussiana por FFT: envuelve en los bordes, así lo derivado se sigue repitiendo sin costura."""
    fy, fx = np.fft.fftfreq(a.shape[0])[:, None], np.fft.fftfreq(a.shape[1])[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (math.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))))


def regolith(img: Path) -> None:
    """Textura de suelo elegida por el equipo (solo color) → diff/normal/orm del suelo del rover, igual que la Luna.
    Normal y AO salen de la luminancia: lo oscuro se toma como hondo (aproximación, no relieve medido)."""
    out = OUT / "regolith"
    out.mkdir(parents=True, exist_ok=True)
    rgb = Image.open(img).convert("RGB")
    rgb.save(out / "diff.jpg", quality=88)  # tamaño nativo: agrandarla no agrega detalle (WebGL2 repite texturas no potencia de 2)
    h = np.asarray(rgb.convert("L"), np.float32) / 255
    h = blur(h - blur(h, 24), 0.8)  # sin el tono de gran escala y sin ruido de píxel: solo el relieve fino
    h /= h.std()
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2  # hacia abajo en la imagen
    k = 0.35 / np.hypot(dx, dy).mean()  # pendiente media ~19°: se nota sin verse plástico
    n = np.stack([-dx * k, dy * k, np.ones_like(h)], -1)  # convención GL (+Y arriba), la que lee three.js
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(out / "normal.jpg", quality=92)
    cavity = np.clip((blur(h, 6) - h) / 3, 0, 1)  # más bajo que su entorno = grieta
    ao = Image.fromarray(((1 - cavity * 0.45) * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
    # three.js lee el AO del canal R y la rugosidad del G. Sin mapa de rugosidad: polvo mate constante (0.95).
    Image.merge("RGB", (ao, Image.new("L", ao.size, 242), Image.new("L", ao.size))).save(out / "orm.jpg", quality=90, subsampling=0)  # sin 4:2:0: los canales no se mezclan
    assert n[..., 2].min() > 0 and abs(float(n[..., 0].mean())) < 0.02, "normal mal armada"
    print(f"regolith: normal z media {n[..., 2].mean():.2f}, AO {np.asarray(ao).min()}..{np.asarray(ao).max()}")
    for p in sorted(out.iterdir()):
        print(f"regolith: {p.name} {Image.open(p).size} {p.stat().st_size / 1e6:.1f} MB")


def exr(path: Path) -> np.ndarray:
    """EXR → float32 (h, w, c). Las capas de Poly Haven traen RGB o Y (igual que tools/moon/build_moon.py)."""
    import OpenEXR  # solo para --rock
    with OpenEXR.File(str(path)) as f:
        ch = f.channels()
        if "RGB" in ch:
            return ch["RGB"].pixels.astype(np.float32)
        names = [n for n in ("R", "G", "B", "Y") if n in ch]
        return np.stack([ch[n].pixels for n in names], -1).astype(np.float32)


def rock(src: Path) -> None:
    """Material "rock_face_03" de Poly Haven (CC0) → diff/normal/orm de las rocas y afloramientos (triplanar en Rover3D)."""
    out = OUT / "rock"
    out.mkdir(parents=True, exist_ok=True)
    Image.open(src / "rock_face_03_diff_4k.jpg").convert("RGB").resize((2048, 2048), Image.LANCZOS).save(out / "diff.jpg", quality=85)
    nor = exr(src / "rock_face_03_nor_gl_4k.exr")[..., :3]
    nor = nor * 0.5 + 0.5 if nor.min() < 0 else nor  # algunos EXR guardan [-1,1], otros ya [0,1]
    Image.fromarray((np.clip(nor, 0, 1) * 255).astype(np.uint8)).resize((2048, 2048), Image.LANCZOS).save(out / "normal.jpg", quality=92)
    # No trae AO: sale del desplazamiento (más bajo que su entorno = grieta). La rugosidad es la real.
    h = np.asarray(Image.open(src / "rock_face_03_disp_4k.png").resize((1024, 1024), Image.LANCZOS), np.float32)
    h = (h - h.mean()) / h.std()
    ao = Image.fromarray(((1 - np.clip((blur(h, 6) - h) / 3, 0, 1) * 0.55) * 255).astype(np.uint8))
    rough = exr(src / "rock_face_03_rough_4k.exr")[..., 0]
    rough = Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
    Image.merge("RGB", (ao, rough, Image.new("L", ao.size))).save(out / "orm.jpg", quality=90, subsampling=0)  # R = AO, G = rugosidad
    for p in sorted(out.iterdir()):
        print(f"rock: {p.name} {Image.open(p).size} {p.stat().st_size / 1e6:.1f} MB")


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "--regolith":
        return regolith(Path(sys.argv[2]))
    if len(sys.argv) == 3 and sys.argv[1] == "--rock":
        return rock(Path(sys.argv[2]))
    # --sites a,b: solo esos sitios (sin rehacer el globo ni los demás).
    only = sys.argv[2].split(",") if len(sys.argv) == 3 and sys.argv[1] == "--sites" else None
    (OUT / "sites").mkdir(parents=True, exist_ok=True)
    with rasterio.open(DEM) as ds:
        if only is None:
            globe(ds)
        for sid, args in SITES.items():
            if only is None or sid in only:
                site(ds, sid, *args)
    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"total {total / 1e6:.1f} MB en {OUT}")


if __name__ == "__main__":
    sys.exit(main())
