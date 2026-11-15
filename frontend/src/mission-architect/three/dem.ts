import { clamp, type Rng } from '../engine/rng'

/** Lado del terreno jugable de `Rover3D` (unidades = m) y su mitad, antes de × `world.scale`. */
export const SIZE = 240, HALF = SIZE / 2

/** Relieve real del cráter (LOLA, tools/moon/build_moon.py): n×n alturas en metros sobre una ventana de size_m. */
export interface Dem { n: number; size: number; vex: number; h: Float32Array }
const dems = new Map<string, Promise<Dem | null>>()
export function loadDem(dir: string, id: string): Promise<Dem | null> {
  const base = `${import.meta.env.BASE_URL}${dir}/${id}`
  if (!dems.has(base)) {
    const get = (ext: string) => fetch(base + ext).then((r) => (r.ok ? r : Promise.reject(new Error(r.statusText))))
    dems.set(base, Promise.all([get('.json').then((r) => r.json()), get('.bin').then((r) => r.arrayBuffer())])
      .then(([m, b]) => ({ n: m.n, size: m.size_m, vex: m.vex ?? 1, h: new Float32Array(b) }))
      .then((d) => (d.h.length === d.n * d.n ? d : null))
      .catch(() => null)) // sin datos: terreno procedural
  }
  return dems.get(base)!
}

/** Ruido de valor sembrado con varias octavas. */
export function noise(rng: Rng) {
  const N = 64, g = Float32Array.from({ length: N * N }, () => rng())
  const v = (x: number, y: number) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)]
  const s = (t: number) => t * t * (3 - 2 * t)
  const one = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi)
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * fx
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * fx
    return a + (b - a) * fy
  }
  return (x: number, y: number) => one(x / 22, y / 22) + one(x / 9, y / 9) * 0.4 + one(x / 3.5, y / 3.5) * 0.12
}

/** Altura (unidades) desde el DEM: escala uniforme (× vex del sitio), así las pendientes son las reales; el ruido solo da detalle fino. */
export function demHeight(dem: Dem, n: (x: number, y: number) => number, size = SIZE) {
  const k = (size / dem.size) * dem.vex, last = dem.n - 1, h = dem.h, half = size / 2
  return (x: number, z: number) => {
    const c = clamp(((x + half) / size) * last, 0, last - 1e-6), r = clamp(((z + half) / size) * last, 0, last - 1e-6)
    const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, i = r0 * dem.n + c0
    const m = (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + dem.n] * (1 - fc) + h[i + dem.n + 1] * fc) * fr
    return m * k + n(x + 500, z + 500) * 0.5
  }
}
