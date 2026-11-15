import type { Crater, Layer } from '../data/types'

export type Known = 'exact' | 'range' | 'none'

export interface Obs {
  known: Known
  text: string
}

export const knownFromQuality = (q: number | undefined): Known =>
  q === undefined ? 'none' : q >= 0.75 ? 'exact' : q >= 0.4 ? 'range' : 'none'

const f1 = (n: number) => n.toFixed(1)

/** Lo que el jugador ve de un cráter según la mejor calidad con que se midió esa capa. */
export function observe(c: Crater, layer: Layer, q: number | undefined): Obs {
  const known = knownFromQuality(q)
  if (known === 'none') return { known, text: '?' }
  const w = (1.2 - (q ?? 0)) * 1.5 // ancho del rango
  switch (layer) {
    case 'hydrogen':
      return known === 'exact'
        ? { known, text: `${f1(c.h)} wt%` }
        : { known, text: `${f1(Math.max(0, c.h - w))}–${f1(c.h + w)} wt%` }
    case 'terrain':
      return known === 'exact'
        ? { known, text: c.terrain }
        : { known, text: c.risk < 2 ? 'easy to moderate' : 'hazardous' }
    case 'slope':
      return known === 'exact'
        ? { known, text: `${c.slopeDeg}°` }
        : { known, text: `${Math.max(0, Math.round(c.slopeDeg - w * 4))}–${Math.round(c.slopeDeg + w * 4)}°` }
    case 'temperature':
      return known === 'exact'
        ? { known, text: `${c.tempC} °C` }
        : { known, text: `${Math.round(c.tempC - w * 12)} to ${Math.round(c.tempC + w * 12)} °C` }
    case 'buriedIce':
      return known === 'exact'
        ? { known, text: `${f1(c.ice)} wt%` }
        : { known, text: `${f1(Math.max(0, c.ice - w))}–${f1(c.ice + w)} wt%` }
  }
}

export const LAYER_LABEL: Record<Layer, string> = {
  hydrogen: 'Hydrogen',
  terrain: 'Terrain',
  slope: 'Slopes',
  temperature: 'Temperature',
  buriedIce: 'Buried ice (radar)',
}

/** Puntos de ciencia por capa y nivel de certeza. */
export function layerPoints(layer: Layer, known: Known): number {
  if (known === 'none') return 0
  const full = layer === 'buriedIce' ? 20 : layer === 'slope' ? 10 : 12
  return known === 'exact' ? full : full / 2
}
