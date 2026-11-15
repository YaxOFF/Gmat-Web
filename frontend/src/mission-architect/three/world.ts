import type { Crater } from '../data/types'

/** Dónde maneja el rover: DEM (`public/<dir>/<id>.bin|json`), cielo y suelo (diff/normal/orm en `public/<ground>`, × gain × tint).
 *  `rockTex`: textura triplanar de rocas (three/mars.ts). `scale` agranda el área jugable; `storms` = tormentas de polvo y afloramientos (Marte, three/mars.ts).
 *  `shadow` = hay sombra permanente (Luna): sin ella no hay línea de sombra, siempre carga y se perfora en cualquier lado. */
export interface World { dir: string; relief: string; ground: string; gain: number; scale: number; storms: boolean; rockTex?: string; sky?: number; tint: [number, number, number]; rock: number; shadow: boolean }
export const MOON: World = { dir: 'moon/craters', relief: 'Real LOLA relief', ground: 'moon/regolith/', gain: 1.8, scale: 1, storms: false, tint: [1, 1, 1], rock: 0x8a8277, shadow: true }
export const MARS: World = { dir: 'mars/sites', relief: 'Real HRSC+MOLA relief', ground: 'mars/regolith/', gain: 1, scale: 1.5, storms: true,
  sky: 0xbe968c, tint: [1, 1.06, 1.12], rock: 0xf0b898, rockTex: 'mars/rock/', shadow: false }
/** Lo que el rover usa del sitio: los cráteres lunares y los sitios de Marte. */
export type RoverSite = Pick<Crater, 'name' | 'terrain' | 'h' | 'ice'> & { id: string }
