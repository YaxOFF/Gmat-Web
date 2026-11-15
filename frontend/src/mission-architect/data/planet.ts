import { CRATER, CRATERS, GLOSSARY, ORBITS, PART, SPECIAL } from './catalog'
import type { Crater, Layer, Orbit, Part } from './types'
import { LAYER_LABEL, UNIT } from '../engine/observe'
import { INSERTION, refreshBestSite } from '../engine/mission'
import { ROLES } from '../engine/roles'

/**
 * Planeta de la partida. Se elige en la portada y no cambia hasta volver a ella.
 * setPlanet() cambia en su lugar los catálogos compartidos (sitios, órbitas, nombres de piezas y capas), así el
 * motor y las pantallas siguen leyendo CRATERS/ORBIT/PART como siempre. PLANET tiene los textos del planeta activo.
 */
export type PlanetId = 'moon' | 'mars'

export interface Planet {
  id: PlanetId
  body: string // "the Moon" / "Mars" en frases: usar `the` aparte
  bodyName: string // "Moon" / "Mars"
  ship: string // orbitador
  episode: string
  region: string // dónde se mapea
  siteNoun: string // crater / site
  goal: string // qué se busca, corto
  hint: string // capa principal en el mapa
  /** Mapa 2D de Mapping y Site: imagen, recorte (polar = disco, equi = equirectangular) y rótulo. */
  map: { img: string; shape: 'disk' | 'rect'; label: string; x: number; y: number; w: number; h: number }
}

export const MOON_PLANET: Planet = {
  id: 'moon', body: 'the Moon', bodyName: 'Moon', ship: 'Selene', episode: 'Episode 1 · Water on the Moon',
  region: 'the south pole', siteNoun: 'crater', goal: 'find the ice', hint: 'hydrogen',
  map: { img: 'moon/southpole.png', shape: 'disk', label: 'SOUTH POLE · view from above', x: 0, y: 0, w: 100, h: 100 },
}

// Mapa de Marte: recorte equirectangular de mars/color.jpg (lon −180..180, lat 90..−90) de lon 55..195 °E y lat ±70°.
const LON0 = 55, LAT0 = 70, SPAN = 140
const equi = (lat: number, lon: number) => ({ lat, lon, x: ((lon - LON0) / SPAN) * 100, y: ((LAT0 - lat) / SPAN) * 100 })

export const MARS_PLANET: Planet = {
  id: 'mars', body: 'Mars', bodyName: 'Mars', ship: 'Ares', episode: 'Episode 2 · Stones of Mars',
  region: 'the old lakes and rivers of Mars', siteNoun: 'site', goal: 'find the rocks', hint: 'hydrated minerals',
  map: {
    img: 'mars/color.jpg', shape: 'rect', label: 'MARS · 55°E to 195°E · ±70°',
    x: (-(LON0 + 180) / SPAN) * 100, y: (-(90 - LAT0) / SPAN) * 100, w: (360 / SPAN) * 100, h: (180 / SPAN) * 100,
  },
}

/**
 * Sitios de Marte para la misión de rocas. Centros reales (USGS Gazetteer; Elysium = centro de la llanura).
 * h = minerales hidratados vistos desde órbita (arcillas, sulfatos, carbonatos), ice = hielo enterrado:
 * valores de JUEGO inspirados en lo que hallaron CRISM, Curiosity, Perseverance y Spirit. Relieve en public/mars/sites/.
 */
export const MARS_SITES: Crater[] = [
  { id: 'jezero', name: 'Jezero', h: 5.4, ice: 0.3, tempC: -63, terrain: 'rocky', risk: 2.2, slopeDeg: 12, ...equi(18.38, 77.58),
    blurb: 'An old lake with a river delta. Perseverance landed here in 2021.' },
  { id: 'gale', name: 'Gale', h: 4.4, ice: 0.2, tempC: -55, terrain: 'soft', risk: 1.2, slopeDeg: 6, ...equi(-5.37, 137.81),
    blurb: 'Curiosity\'s crater since 2012. Lake mud at the foot of Mount Sharp.' },
  { id: 'gusev', name: 'Gusev', h: 2.9, ice: 0.1, tempC: -60, terrain: 'rocky', risk: 1.8, slopeDeg: 9, ...equi(-14.57, 175.48),
    blurb: 'Spirit drove here (2004–2010) and found old hot-spring silica.' },
  { id: 'elysium', name: 'Elysium Planitia', h: 0.6, ice: 0.4, tempC: -58, terrain: 'soft', risk: 0.5, slopeDeg: 2, ...equi(2.99, 154.66),
    blurb: 'Flat and safe: InSight chose it to listen for marsquakes. Little to drill.' },
  { id: 'hellas', name: 'Hellas', h: 1.4, ice: 1.2, tempC: -40, terrain: 'rocky', risk: 3, slopeDeg: 15, ...equi(-42.43, 70.5),
    blurb: 'The deepest basin on Mars. Dusty, rocky, and a long way down.' },
]

const MARS_LAYERS: Partial<Record<Layer, string>> = { hydrogen: 'Hydrated minerals', temperature: 'Night temperature' }

const MARS_ORBITS: Record<string, Partial<Orbit>> = {
  polar_low: { name: 'Low polar', altitude: '250 km', relay: 'Short but frequent (12/day)', note: 'Like MRO: the sharpest maps, but the thin air drags it down. Needs the big tank.' },
  polar_high: { name: 'High polar', altitude: '400 km', relay: 'Medium (11/day)', note: 'Like Mars Odyssey: the balanced choice and a good rover relay.' },
  polar_ellip: { name: 'Elliptical', altitude: '300 × 10,000 km', relay: 'Long passes (3/day)', note: 'Like Mars Express: cheap in fuel, long relay passes, blurrier maps.' },
}

const MARS_PARTS: Record<string, Partial<Part>> = {
  bat_1: { note: 'Powers the ship while Mars blocks the Sun.' },
  neutron: { name: 'Mineral spectrometer', note: 'Like CRISM on MRO: sees clays, sulfates and carbonates, minerals made in water.' },
  radiometer: { name: 'Thermal imager', note: 'Like THEMIS: solid rock stays warm at night, dust cools fast. Finds bare bedrock.' },
  radar: { name: 'SHARAD-type radar', note: 'Sees buried ice and layers under the dust. Heavy, hungry and expensive.' },
  relay: { note: 'Not needed for the orbiter. The rover will use it to send its cores home.' },
  lander: { note: 'Sky-crane descent stage that lowers Buscador to the surface. Required for missions B and C.' },
  rbat_3: { name: 'Rover battery 3 kWh', note: 'Light. Solar panels recharge it, but a dust storm will drain it fast.' },
  rbat_6: { note: 'Enough margin to keep working when dust dims the Sun.' },
  wheels_std: { note: 'Cheap. Sharp rocks tear them (Curiosity\'s wheels got holes) and sand can trap them.' },
  mass_spec: { name: 'Organics spectrometer', note: 'Like SHERLOC: without it a core shows minerals, never organic molecules.' },
}

const MARS_GLOSSARY: Record<string, string> = {
  eclipse: 'Time Mars blocks the Sun. Solar panels make no power, so the battery carries the ship.',
  hydrogen: 'Clays, sulfates and carbonates only form with water. They point to rocks that may keep traces of old life.',
}

const MARS_ROLES: Record<string, { main?: [string, string]; secret?: [string, string] }> = {
  Science: { main: ['Seal a Habitable Rock', 'At least one core from a rock that sat in water (needs the organics spectrometer).'], secret: ['Complete Map', 'Map all 5 candidate sites from orbit.'] },
  Comms: { secret: ['Live Broadcast', 'Downlink a good core during a live relay pass.'] },
}

// Copias de la Luna para poder volver a ella.
const MOON = {
  craters: [...CRATERS],
  layers: { ...LAYER_LABEL },
  orbits: ORBITS.map((o) => ({ ...o })),
  parts: Object.fromEntries(Object.keys(MARS_PARTS).map((id) => [id, { name: PART[id].name, note: PART[id].note }])),
  glossary: { ...GLOSSARY },
  unit: UNIT.h,
  special: SPECIAL.site,
  insertion: INSERTION.label,
  roles: ROLES.map((r) => ({ main: r.main, secret: r.secret })),
}

export const PLANET: Planet = { ...MOON_PLANET }

export function setPlanet(id: PlanetId) {
  const mars = id === 'mars'
  Object.assign(PLANET, mars ? MARS_PLANET : MOON_PLANET)
  CRATERS.splice(0, CRATERS.length, ...(mars ? MARS_SITES : MOON.craters))
  for (const k of Object.keys(CRATER)) delete CRATER[k]
  for (const c of CRATERS) CRATER[c.id] = c
  Object.assign(LAYER_LABEL, MOON.layers, mars ? MARS_LAYERS : {})
  ORBITS.forEach((o, i) => Object.assign(o, MOON.orbits[i], mars ? MARS_ORBITS[o.id] : {}))
  for (const [pid, moon] of Object.entries(MOON.parts)) Object.assign(PART[pid], moon, mars ? MARS_PARTS[pid] : {})
  Object.assign(GLOSSARY, MOON.glossary, mars ? MARS_GLOSSARY : {})
  UNIT.h = mars ? '% hydrated' : MOON.unit
  SPECIAL.site = mars ? 'jezero' : MOON.special
  INSERTION.label = mars ? 'Mars orbit insertion' : MOON.insertion
  ROLES.forEach((r, i) => Object.assign(r, MOON.roles[i], mars ? MARS_ROLES[r.id] : {}))
  refreshBestSite()
}
