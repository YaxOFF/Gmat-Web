import type { Crater } from '../data/types'
import { MarsRocks, MoonRocks, type RockFieldClass } from './rocks'

/** Dónde maneja el rover: DEM (`public/<dir>/<id>.bin|json`), cielo y suelo (diff/normal/orm en `public/<ground>`, × gain × tint).
 *  `shadow` = hay sombra permanente (Luna): sin ella no hay línea de sombra, siempre carga y se perfora en cualquier lado.
 *  `rocks` = clase del campo de rocas (hereda de RockField: mismo choque, aspecto propio).
 *  `science` = qué se busca: hielo en la sombra (Luna) o rocas de agua antigua antes de la tormenta de polvo (Marte). */
export interface World { dir: string; relief: string; ground: string; gain: number; sky?: number; tint: [number, number, number]; rocks: RockFieldClass; shadow: boolean; science: 'ice' | 'rocks' }
export const MOON: World = { dir: 'moon/craters', relief: 'Real LOLA relief', ground: 'moon/regolith/', gain: 1.8, tint: [1, 1, 1], rocks: MoonRocks, shadow: true, science: 'ice' }
export const MARS: World = { dir: 'mars/sites', relief: 'Real HRSC+MOLA relief', ground: 'mars/regolith/', gain: 1,
  sky: 0xc9a27c, tint: [1, 1.06, 1.12], rocks: MarsRocks, shadow: false, science: 'rocks' }
/** Lo que el rover usa del sitio: los cráteres lunares y los sitios de Marte. */
export type RoverSite = Pick<Crater, 'name' | 'terrain' | 'h' | 'ice'> & { id: string }
