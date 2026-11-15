import type { Crater } from '../data/types'

/** Dónde maneja el rover: DEM (`public/<dir>/<id>.bin|json`), cielo y suelo (diff/normal/orm en `public/<ground>`, × gain × tint).
 *  `shadow` = hay sombra permanente (Luna): sin ella no hay línea de sombra, siempre carga y se perfora en cualquier lado. */
export interface World { dir: string; relief: string; ground: string; gain: number; sky?: number; tint: [number, number, number]; rock: number; shadow: boolean }
export const MOON: World = { dir: 'moon/craters', relief: 'Real LOLA relief', ground: 'moon/regolith/', gain: 1.8, tint: [1, 1, 1], rock: 0x8a8277, shadow: true }
export const MARS: World = { dir: 'mars/sites', relief: 'Real HRSC+MOLA relief', ground: 'mars/regolith/', gain: 1,
  sky: 0xc9a27c, tint: [1, 1.06, 1.12], rock: 0x8a4a2e, shadow: false }
/** Lo que el rover usa del sitio: los cráteres lunares y los sitios de Marte. */
export type RoverSite = Pick<Crater, 'name' | 'terrain' | 'h' | 'ice'> & { id: string }
