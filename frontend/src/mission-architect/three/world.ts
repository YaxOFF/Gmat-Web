import type { Crater } from '../data/types'
import { MarsRocks, MoonRocks, type RockFieldClass } from './rocks'

/** Dónde maneja el rover: DEM (`public/<dir>/<id>.bin|json`), cielo y suelo (diff/normal/orm en `public/<ground>`, × gain × tint).
 *  `shadow` = hay sombra permanente (Luna): sin ella no hay línea de sombra, siempre carga y se perfora en cualquier lado.
 *  `rocks` = clase del campo de rocas (hereda de RockField: mismo choque, aspecto propio).
 *  `science` = qué hace el rover, como en las misiones reales: 'ice' busca hielo de agua bajo el suelo (Luna, tipo
 *  VIPER: mapa de hidrógeno, escaneo de neutrones y taladro en el regolito); 'rocks' analiza rocas (Marte, tipo
 *  Curiosity: láser ChemCam y taladro sobre la roca).
 *  `scale` agranda el área jugable; `storms` = tormentas de polvo y afloramientos; `rockTex` = textura triplanar de
 *  rocas y afloramientos (Marte, three/mars.ts). */
export interface World {
  dir: string; relief: string; ground: string; gain: number; sky?: number; tint: [number, number, number]
  rocks: RockFieldClass; shadow: boolean; science: 'ice' | 'rocks'; scale: number; storms: boolean; rockTex?: string
}
export const MOON: World = { dir: 'moon/craters', relief: 'Real LOLA relief', ground: 'moon/regolith/', gain: 1.8, tint: [1, 1, 1], rocks: MoonRocks, shadow: true, science: 'ice', scale: 1, storms: false }
export const MARS: World = { dir: 'mars/sites', relief: 'Real HRSC+MOLA relief', ground: 'mars/regolith/', gain: 1,
  sky: 0xbe968c, tint: [1, 1.06, 1.12], rocks: MarsRocks, shadow: false, science: 'rocks', scale: 1.5, storms: true, rockTex: 'mars/rock/' }
/** Lo que el rover usa del sitio: los cráteres lunares y los sitios de Marte. */
export type RoverSite = Pick<Crater, 'name' | 'terrain' | 'h' | 'ice'> & { id: string }
