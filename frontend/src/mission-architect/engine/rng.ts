export type Rng = () => number

/** Generador determinista (mulberry32) para poder reproducir una partida. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type RollResult = 'success' | 'partial' | 'fail'

/** Tirada de ingeniería: éxito si roll<p, parcial hasta 15 puntos por encima, fallo después. */
export function engineeringRoll(rng: Rng, p: number): { roll: number; result: RollResult } {
  const roll = rng()
  const result: RollResult = roll < p ? 'success' : roll < p + 0.15 ? 'partial' : 'fail'
  return { roll, result }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const pct = (v: number) => `${Math.round(v * 100)}%`

/** Dinero en millones con signo correcto: −$19M en lugar de $-19M. */
export const money = (m: number) => `${m < 0 ? '−' : ''}$${Math.abs(Math.round(m))}M`
