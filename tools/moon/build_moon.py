"""Genera los datos reales de la Luna del juego en frontend/public/moon/. Herramienta de desarrollo: se corre una vez.

    uv run --with rasterio --with pillow --with numpy tools/moon/build_moon.py
    uv run --with rasterio --with pillow --with numpy --with OpenEXR tools/moon/build_moon.py --regolith <carpeta textures>

Fuentes (dominio público, NASA): CGI Moon Kit de NASA SVS (https://svs.gsfc.nasa.gov/4720: color LROC y relieve LOLA
global) y el DEM polar LOLA de PGDA (https://pgda.gsfc.nasa.gov/products/90, Barker et al.). Las descargas quedan en
~/.cache/gmat-web-moon, fuera del repo.
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import transform
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "public" / "moon"
CACHE = Path.home() / ".cache" / "gmat-web-moon"
SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
SOURCES = {
    "color": SVS + "lroc_color_poles_4k.tif",
    "relief": SVS + "ldem_16.tif",
    # 80 m basta: cada cráter sale en una malla de 201 puntos (>= 136 m por punto en el más chico).
    "pole": "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF",
}
MOON_GEO = "+proj=longlat +R=1737400 +no_defs"
# Centro (lat, lon este) y diámetro en km: USGS Gazetteer of Planetary Nomenclature (planetarynames.wr.usgs.gov).
CRATERS = {
    "shackleton": (-89.67, 129.78, 20.92),
    "cabeus": (-85.33, -42.13, 100.58),
    "haworth": (-87.45, -5.17, 51.42),
    "gerlache": (-88.48, -88.34, 32.71),
    "faustini": (-87.18, 84.31, 42.48),
}
N = 201  # = vértices por lado de la malla de Rover3D (PlaneGeometry de 200 segmentos)
FIT = 120 / 92  # HALF / RIM de Rover3D: el borde real del cráter cae donde el juego pone su borde
POLE_MAP_DEG = 6  # mapa polar: 0..100 = ±6° desde el polo (igual que POLE_MAP_DEG en data/catalog.ts)


def fetch(name: str) -> Path:
    url = SOURCES[name]
    path = CACHE / url.rsplit("/", 1)[1]
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"descargando {url}", flush=True)
        urllib.request.urlretrieve(url, path.with_suffix(".part"))
        path.with_suffix(".part").rename(path)
    return path


def to8(a: np.ndarray) -> np.ndarray:
    lo, hi = np.nanpercentile(a, 0.5), np.nanpercentile(a, 99.5)
    return (np.clip((a - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)


def globe() -> None:
    with rasterio.open(fetch("color")) as ds:
        rgb = ds.read(out_shape=(3, 2048, 4096), resampling=Resampling.average)
    if rgb.dtype != np.uint8:
        rgb = (rgb / (65535 if rgb.max() > 255 else 255) * 255).astype(np.uint8)
    Image.fromarray(np.moveaxis(rgb, 0, -1)).save(OUT / "color.jpg", quality=85, optimize=True)
    with rasterio.open(fetch("relief")) as ds:
        km = ds.read(1, out_shape=(1024, 2048), resampling=Resampling.average).astype(np.float32)
    Image.fromarray(to8(km)).save(OUT / "height.png", optimize=True)
    print(f"globo: relieve {km.min():.2f}..{km.max():.2f} km")


def sample(ds, band: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Altura (m) en cada lat/lon, bilineal sobre la banda ya leída del DEM polar."""
    xs, ys = transform(MOON_GEO, ds.crs, lon.ravel().tolist(), lat.ravel().tolist())
    col, row = ~ds.transform * (np.array(xs), np.array(ys))
    c0, r0 = np.floor(col - 0.5).astype(int), np.floor(row - 0.5).astype(int)
    fc, fr = col - 0.5 - c0, row - 0.5 - r0
    h, w = band.shape
    c0, r0 = np.clip(c0, 0, w - 2), np.clip(r0, 0, h - 2)
    v = (band[r0, c0] * (1 - fc) * (1 - fr) + band[r0, c0 + 1] * fc * (1 - fr)
         + band[r0 + 1, c0] * (1 - fc) * fr + band[r0 + 1, c0 + 1] * fc * fr)
    return v.reshape(lat.shape)


def craters(ds) -> None:
    (OUT / "craters").mkdir(exist_ok=True)
    for cid, (lat, lon, diam) in CRATERS.items():
        half = diam * 1000 * FIT / 2
        (cx,), (cy,) = transform(MOON_GEO, ds.crs, [lon], [lat])
        win = from_bounds(cx - half, cy - half, cx + half, cy + half, ds.transform)
        # Fila 0 = borde +y de la proyección; fila → z y columna → x en Rover3D (vista desde arriba, sin espejo).
        z = ds.read(1, window=win, out_shape=(N, N), resampling=Resampling.average).astype(np.float32)
        assert np.isfinite(z).all(), f"{cid}: huecos en el DEM"
        lo, hi = float(z.min()), float(z.max())
        (z - lo).astype("<f4").tofile(OUT / "craters" / f"{cid}.bin")
        meta = {"n": N, "size_m": round(2 * half), "min_m": round(lo, 1), "max_m": round(hi, 1), "lat": lat, "lon": lon,
                "diameter_km": diam, "source": "LOLA LDEM_80S_80MPP_ADJ (PGDA, Barker et al.)"}
        (OUT / "craters" / f"{cid}.json").write_text(json.dumps(meta) + "\n")
        print(f"{cid:>11}: ventana {2 * half / 1000:.1f} km, relieve {hi - lo:.0f} m ({lo:.0f}..{hi:.0f})")


def pole_map(ds, band: np.ndarray, size: int = 1024) -> None:
    # Misma convención que Orbit3D y el mapa SVG: dx = cos(lon), dy = sin(lon) con y hacia abajo (visto desde el sur).
    d = (np.arange(size) + 0.5) / size * 2 - 1
    dx, dy = np.meshgrid(d, d)
    lat = -90 + np.hypot(dx, dy) * POLE_MAP_DEG
    lon = np.degrees(np.arctan2(dy, dx))
    z = sample(ds, band, lat, lon)
    px = 2 * POLE_MAP_DEG / size * math.pi / 180 * 1737400  # metros por píxel (aprox.)
    gy, gx = np.gradient(z, px)
    az, alt = math.radians(315), math.radians(35)
    slope, aspect = np.arctan(np.hypot(gx, gy)), np.arctan2(-gx, gy)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    img = 0.7 * np.clip(shade, 0, 1) + 0.3 * (z - z.min()) / np.ptp(z)
    Image.fromarray((np.clip(img, 0, 1) ** 0.8 * 235 + 10).astype(np.uint8)).save(OUT / "southpole.png", optimize=True)
    print(f"mapa polar: {size}px, {px:.0f} m/px, relieve {np.ptp(z):.0f} m")


def exr(path: Path) -> np.ndarray:
    """EXR → float32 (h, w, c). Las capas de Poly Haven traen RGB o Y."""
    import OpenEXR  # solo para --regolith
    with OpenEXR.File(str(path)) as f:
        ch = f.channels()
        if "RGB" in ch:
            return ch["RGB"].pixels.astype(np.float32)
        names = [n for n in ("R", "G", "B", "Y") if n in ch]
        return np.stack([ch[n].pixels for n in names], -1).astype(np.float32)


def regolith(src: Path) -> None:
    """Material PBR "moon_03" de Poly Haven (CC0) → texturas web que se repiten en el suelo del rover."""
    out = OUT / "regolith"
    out.mkdir(parents=True, exist_ok=True)
    Image.open(src / "moon_03_diff_4k.jpg").convert("RGB").resize((2048, 2048), Image.LANCZOS).save(out / "diff.jpg", quality=85)
    nor = exr(src / "moon_03_nor_gl_4k.exr")[..., :3]
    nor = nor * 0.5 + 0.5 if nor.min() < 0 else nor  # algunos EXR guardan [-1,1], otros ya [0,1]
    Image.fromarray((np.clip(nor, 0, 1) * 255).astype(np.uint8)).resize((2048, 2048), Image.LANCZOS).save(out / "normal.jpg", quality=92)
    # three.js lee el AO del canal R y la rugosidad del G: se empacan en una sola imagen.
    ao = Image.open(src / "moon_03_ao_4k.jpg").convert("L").resize((1024, 1024), Image.LANCZOS)
    rough = exr(src / "moon_03_rough_4k.exr")[..., 0]
    rough = Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
    Image.merge("RGB", (ao, rough, Image.new("L", (1024, 1024)))).save(out / "orm.jpg", quality=90)
    for p in sorted(out.iterdir()):
        print(f"regolith: {p.name} {Image.open(p).size} {p.stat().st_size / 1e6:.1f} MB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) == 3 and sys.argv[1] == "--regolith":
        return regolith(Path(sys.argv[2]))
    globe()
    with rasterio.open(fetch("pole")) as ds:
        band = ds.read(1).astype(np.float32)
        craters(ds)
        pole_map(ds, band)
    total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"total {total / 1e6:.1f} MB en {OUT}")


if __name__ == "__main__":
    sys.exit(main())
