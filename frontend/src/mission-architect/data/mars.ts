import type { RoverSite } from '../three/world'

/** Sitios de prueba en Marte. lat/lon reales (USGS Gazetteer; Olympus corrido a la caldera); relieve en
 *  public/mars/sites/ (tools/mars/build_mars.py). h/ice son valores de juego: solo hay hielo donde lo hay de verdad. */
export interface MarsSite extends RoverSite { lat: number; lon: number; blurb: string }

export const MARS_SITES: MarsSite[] = [
  { id: 'korolev', name: 'Korolev', lat: 72.77, lon: 164.58, terrain: 'steep', h: 5, ice: 6, blurb: 'An 81 km crater filled with a permanent mound of water ice.' },
  { id: 'chasma_boreale', name: 'Chasma Boreale', lat: 82.54, lon: 312.36, terrain: 'rocky', h: 4, ice: 5, blurb: 'A canyon cut into the north polar ice cap, with layered ice walls.' },
  { id: 'arcadia', name: 'Arcadia Planitia', lat: 49.02, lon: 188.15, terrain: 'soft', h: 2.5, ice: 3, blurb: 'Flat plain with ice buried just below the surface. Relief ×10.' },
  { id: 'olympus', name: 'Olympus Mons caldera', lat: 18.56, lon: 226.69, terrain: 'very steep', h: 0, ice: 0, blurb: 'The summit of the tallest volcano in the Solar System, ~21 km high.' },
  { id: 'melas', name: 'Melas Chasma (Valles Marineris)', lat: -10.52, lon: 287.46, terrain: 'very steep', h: 0.5, ice: 0, blurb: 'Part of the largest canyon system known: walls over 6 km tall.' },
  { id: 'hellas', name: 'Hellas Planitia', lat: -42.43, lon: 70.5, terrain: 'rocky', h: 0.5, ice: 0, blurb: 'Floor of the deepest basin on Mars, more than 7 km below the datum.' },
]
