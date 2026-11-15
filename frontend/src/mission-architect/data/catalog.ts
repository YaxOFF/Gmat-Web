import type { Crater, Design, Group, Launcher, Orbit, Part, MissionMode } from './types'

// Valores de JUEGO (balanceados a mano), inspirados en el catálogo del GDD.
// Los de órbita (periodo, Δv, eclipse) se sustituirán por los de GMAT cuando
// se genere orbits.json (ver context/Base-Gmat-Web.md).

export const BUDGET_M = 260 // presupuesto de la fase del orbitador, $M
export const ITERATION_COST_M = 10
export const MAX_ITERATIONS = 2
export const DSN_WINDOWS_PER_CYCLE = 2
export const CYCLES = 4

export const PARTS: Part[] = [
  // Bus
  { id: 'bus_small', name: 'Small bus', group: 'bus', massKg: 80, drawW: 15, costM: 25, rel: 0.95, slots: 4, note: 'Cheap and light. Fits up to 4 instruments.' },
  { id: 'bus_medium', name: 'Medium bus', group: 'bus', massKg: 140, drawW: 20, costM: 40, rel: 0.97, slots: 6, note: 'Sturdier. Fits up to 6 instruments.' },
  // Potencia
  { id: 'panel_gaas', name: 'GaAs solar array 400 W', group: 'panel', massKg: 25, drawW: 0, genW: 400, costM: 15, rel: 0.97, note: 'Efficient and reliable. Costs more.' },
  { id: 'panel_si', name: 'Silicon solar array 250 W', group: 'panel', massKg: 30, drawW: 0, genW: 250, costM: 6, rel: 0.88, cards: ['cell_degradation'], note: 'Cheap, but the cells degrade over time.' },
  { id: 'bat_1', name: 'Battery 1 kWh', group: 'battery', massKg: 8, drawW: 0, costM: 4, rel: 0.95, batteryWh: 1000, note: 'Powers the ship while the Moon blocks the Sun.' },
  { id: 'bat_2', name: 'Battery 2 kWh', group: 'battery', massKg: 15, drawW: 0, costM: 7, rel: 0.95, batteryWh: 2000, note: 'More margin in long eclipses.' },
  // Térmico
  { id: 'heaters', name: 'Battery heaters', group: 'thermal', massKg: 2, drawW: 30, costM: 1, rel: 0.98, note: 'Without them the battery gets cold and loses capacity.' },
  { id: 'radiator', name: 'Standard radiator', group: 'thermal', massKg: 6, drawW: 0, costM: 2, rel: 1, note: 'Gets rid of the heat the electronics make.' },
  { id: 'mli', name: 'Premium MLI blankets', group: 'thermal', massKg: 4, drawW: 0, costM: 3, rel: 1, note: 'Insulation. Removes the "Solar heating" card.' },
  // Comunicaciones
  { id: 'lga', name: 'Low-gain antenna', group: 'antenna', massKg: 3, drawW: 15, costM: 2, rel: 0.98, downlinkGb: 2, cards: ['weak_link'], note: 'Light and simple. Only 2 Gb per DSN window.' },
  { id: 'hga', name: 'High-gain antenna', group: 'antenna', massKg: 18, drawW: 40, costM: 10, rel: 0.94, downlinkGb: 10, cards: ['stuck_antenna'], note: '10 Gb per DSN window. Moving parts can jam.' },
  { id: 'relay', name: 'UHF relay radio', group: 'comms', massKg: 4, drawW: 10, costM: 5, rel: 0.96, note: 'Not needed yet. The rover will need it in Phase 2.' },
  // Datos
  { id: 'rec_64', name: 'Recorder 64 Gb', group: 'recorder', massKg: 3, drawW: 5, costM: 2, rel: 0.97, storageGb: 64, cards: ['corrupt_recorder'], note: 'Small buffer. Cheap memory can corrupt.' },
  { id: 'rec_256', name: 'Recorder 256 Gb', group: 'recorder', massKg: 5, drawW: 8, costM: 5, rel: 0.95, storageGb: 256, note: 'Big buffer while you wait for a DSN window.' },
  // Propulsión
  { id: 'tank_s', name: 'Tank S (1,000 m/s)', group: 'tank', massKg: 120, drawW: 10, costM: 20, rel: 0.95, dvMs: 1000, note: 'Enough for the higher orbits.' },
  { id: 'tank_l', name: 'Tank L (1,400 m/s)', group: 'tank', massKg: 220, drawW: 10, costM: 28, rel: 0.95, dvMs: 1400, note: 'Required to stay in the low orbit.' },
  // Aviónica
  { id: 'comp_hard', name: 'Radiation-hardened computer', group: 'computer', massKg: 8, drawW: 20, costM: 18, rel: 0.99, note: 'Space radiation barely bothers it.' },
  { id: 'comp_com', name: 'Commercial computer', group: 'computer', massKg: 2, drawW: 10, costM: 3, rel: 0.85, cards: ['seu'], note: 'Cheap, but radiation can flip its bits (SEU).' },
  { id: 'shield', name: 'Radiation shielding', group: 'shield', massKg: 12, drawW: 0, costM: 5, rel: 1, note: 'Without it (or a hardened computer) expect SEU glitches.' },
  // Instrumentos
  { id: 'neutron', name: 'Neutron spectrometer', group: 'instrument', massKg: 10, drawW: 15, costM: 20, rel: 0.96, layer: 'hydrogen', dataGb: 2, note: 'Finds hydrogen. Hydrogen hints at buried water ice.' },
  { id: 'camera', name: 'Context camera', group: 'instrument', massKg: 8, drawW: 10, costM: 8, rel: 0.97, layer: 'terrain', dataGb: 6, cards: ['optical_contamination'], note: 'Maps terrain. Needed to judge a landing site.' },
  { id: 'altimeter', name: 'Laser altimeter', group: 'instrument', massKg: 12, drawW: 25, costM: 15, rel: 0.95, layer: 'slope', dataGb: 4, note: 'Measures slopes precisely. Makes landings safer.' },
  { id: 'radiometer', name: 'Thermal radiometer', group: 'instrument', massKg: 9, drawW: 12, costM: 12, rel: 0.94, layer: 'temperature', dataGb: 2, note: 'Measures crater temperature. Tells if ice can survive.' },
  { id: 'radar', name: 'SAR radar', group: 'instrument', massKg: 60, drawW: 150, costM: 80, rel: 0.88, layer: 'buriedIce', dataGb: 15, cards: ['radar_overheat'], note: 'Sees buried ice. Heavy, hungry and expensive.' },
]

// Rover Bay: módulo de aterrizaje + rover "Buscador" (misiones B y C). No consumen energía del orbitador.
PARTS.push(
  { id: 'lander', name: 'Lander + rover chassis', group: 'lander', massKg: 420, drawW: 0, costM: 45, rel: 0.95, note: 'Carries Buscador down to the crater rim. Required for missions B and C.' },
  { id: 'rbat_3', name: 'Rover battery 3 kWh', group: 'rbattery', massKg: 20, drawW: 0, costM: 6, rel: 0.95, batteryWh: 3000, note: 'Light, but heaters eat it fast in the dark. Short sorties only.' },
  { id: 'rbat_6', name: 'Rover battery 6 kWh', group: 'rbattery', massKg: 38, drawW: 0, costM: 11, rel: 0.95, batteryWh: 6000, note: 'Enough to go deep into the shadow and come back.' },
  { id: 'wheels_std', name: 'Standard wheels', group: 'wheels', massKg: 12, drawW: 0, costM: 3, rel: 0.93, note: 'Cheap. Rocks hurt them and soft regolith can trap them (50% to break free).' },
  { id: 'wheels_mesh', name: 'Mesh wheels + active suspension', group: 'wheels', massKg: 18, drawW: 0, costM: 8, rel: 0.97, note: 'Half the damage from rocks, and it can "walk" out of soft ground (85%).' },
  { id: 'drill_std', name: 'Drill (up to 1 m)', group: 'drill', massKg: 10, drawW: 0, costM: 6, rel: 0.94, note: 'Depths of 25 cm, 50 cm and 1 m.' },
  { id: 'drill_deep', name: 'Deep drill (up to 2 m)', group: 'drill', massKg: 22, drawW: 0, costM: 14, rel: 0.9, note: 'Adds a 2 m depth: the richest ice, but jams more. Required for mission C.' },
  { id: 'mass_spec', name: 'Mass spectrometer', group: 'rtools', massKg: 7, drawW: 0, costM: 12, rel: 0.95, note: 'Without it a core can only show "hydrogen", never confirmed water.' },
  { id: 'autonav', name: 'Autonomous navigation', group: 'rtools', massKg: 3, drawW: 0, costM: 9, rel: 0.96, note: 'Drive at full speed between relay passes. Without it the rover crawls when out of contact.' },
)

export const PART: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]))

export const GROUP_LABEL: Record<Group, string> = {
  bus: 'Bus', panel: 'Solar power', battery: 'Battery', thermal: 'Thermal',
  antenna: 'Antenna', comms: 'Extra comms', recorder: 'Data recorder', tank: 'Propulsion',
  computer: 'Computer', shield: 'Shielding', instrument: 'Science instruments',
  lander: 'Rover Bay · Lander', rbattery: 'Rover Bay · Battery', wheels: 'Rover Bay · Wheels', drill: 'Rover Bay · Drill', rtools: 'Rover Bay · Tools',
}

export const GROUP_ORDER: Group[] = [
  'bus', 'panel', 'battery', 'thermal', 'antenna', 'comms', 'recorder', 'tank', 'computer', 'shield', 'instrument',
  'lander', 'rbattery', 'wheels', 'drill', 'rtools',
]
export const ROVER_GROUPS: Group[] = ['lander', 'rbattery', 'wheels', 'drill', 'rtools']
export const ROVER_REQUIRED: Group[] = ['lander', 'rbattery', 'wheels', 'drill']
/** Presupuesto extra por misión: el rover y el radar no caben en el del orbitador. */
export const MODE_BUDGET_M: Record<MissionMode, number> = { A: 0, B: 110, C: 200 }
export const MODE_MULT: Record<MissionMode, number> = { A: 1, B: 2, C: 3 }

/** Grupos donde solo cabe una pieza y es obligatoria. */
export const REQUIRED_SINGLE: Group[] = ['bus', 'panel', 'battery', 'antenna', 'recorder', 'tank', 'computer']
/** Grupos donde solo cabe una pieza, opcional. */
export const OPTIONAL_SINGLE: Group[] = ['shield', 'comms', 'lander', 'rbattery', 'wheels', 'drill']

export const ORBITS: Orbit[] = [
  { id: 'polar_low', name: 'Low polar', altitude: '50 km', periodMin: 113, res: 1.5, eclipseMin: 47, dvInsertion: 900, dvKeeping: 300,
    relay: 'Short but frequent (6/day)', note: 'Sharpest maps, but the orbit decays and eats fuel. Needs the big tank.' },
  { id: 'polar_high', name: 'High polar', altitude: '100 km', periodMin: 118, res: 1.0, eclipseMin: 45, dvInsertion: 850, dvKeeping: 100,
    relay: 'Medium (5/day)', note: 'The balanced choice. Good maps, moderate fuel.' },
  { id: 'polar_ellip', name: 'Elliptical polar', altitude: '100 × 3,000 km', periodMin: 282, res: 0.7, eclipseMin: 30, dvInsertion: 600, dvKeeping: 50,
    relay: 'Long passes over the south pole (1/day)', note: 'Cheapest in fuel and great for relaying a rover later, but blurrier maps.' },
]
export const ORBIT: Record<string, Orbit> = Object.fromEntries(ORBITS.map((o) => [o.id, o]))

export const LAUNCHERS: Launcher[] = [
  { id: 'light', name: 'Light launcher', capacityKg: 500, costM: 40, rel: 0.95 },
  { id: 'medium', name: 'Medium launcher', capacityKg: 1500, costM: 70, rel: 0.97 },
  { id: 'heavy', name: 'Heavy launcher', capacityKg: 4000, costM: 120, rel: 0.98 },
]
export const LAUNCHER: Record<string, Launcher> = Object.fromEntries(LAUNCHERS.map((l) => [l.id, l]))

/** Mapa polar 0..100 = ±POLE_MAP_DEG desde el polo sur (lo comparten Mapping, Orbit3D y tools/moon/build_moon.py). */
export const POLE_MAP_DEG = 6
/** lat/lon reales → posición en el mapa polar, visto desde el sur: x = cos(lon), y = sin(lon) con y hacia abajo. */
const polar = (lat: number, lon: number) => {
  const r = ((90 + lat) / POLE_MAP_DEG) * 50, a = (lon * Math.PI) / 180
  return { lat, lon, x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) }
}

// Posiciones: centros reales (USGS Gazetteer). Cabeus ≈ 5.6 % está inspirado en la medición de LCROSS; el resto
// (hidrógeno, temperatura, riesgo) son valores de juego.
export const CRATERS: Crater[] = [
  { id: 'shackleton', name: 'Shackleton', h: 1.2, ice: 1.0, tempC: -180, terrain: 'steep', risk: 3, slopeDeg: 22, ...polar(-89.67, 129.78),
    blurb: 'Famous, right at the pole, steep walls.' },
  { id: 'cabeus', name: 'Cabeus', h: 5.6, ice: 5.0, tempC: -230, terrain: 'soft', risk: 1, slopeDeg: 6, ...polar(-85.33, -42.13),
    blurb: 'Where LCROSS crashed in 2009. Smooth floor.' },
  { id: 'haworth', name: 'Haworth', h: 4.1, ice: 3.4, tempC: -210, terrain: 'rocky', risk: 3.5, slopeDeg: 14, ...polar(-87.45, -5.17),
    blurb: 'Lots of hydrogen, but boulders everywhere.' },
  { id: 'gerlache', name: 'de Gerlache', h: 0.4, ice: 0.1, tempC: -170, terrain: 'soft', risk: 0.8, slopeDeg: 5, ...polar(-88.48, -88.34),
    blurb: 'Easy and safe. Not much to find.' },
  { id: 'faustini', name: 'Faustini', h: 2.6, ice: 2.0, tempC: -220, terrain: 'very steep', risk: 4, slopeDeg: 31, ...polar(-87.18, 84.31),
    blurb: 'Promising and brutal. Very steep walls.' },
]
export const CRATER: Record<string, Crater> = Object.fromEntries(CRATERS.map((c) => [c.id, c]))
/** Sitio del evento del ciclo 4 (la Luna: punto ultrafrío en Cabeus). data/planet.ts lo cambia con el planeta. */
export const SPECIAL = { site: 'cabeus' }

export function defaultDesign(): Design {
  return { mode: 'B', orbitId: 'polar_high', launcherId: 'medium', partIds: [] }
}

/** Plantilla de partida para el botón "Suggested starter". */
export const STARTER_PARTS = [
  'bus_medium', 'panel_gaas', 'bat_1', 'heaters', 'radiator', 'hga', 'rec_256', 'tank_s',
  'comp_hard', 'shield', 'neutron', 'camera',
]

/** Diseño sugerido que pasa la revisión para la misión y la órbita elegidas. */
export function starterFor(mode: MissionMode, orbitId = 'polar_high'): string[] {
  let ids = [...STARTER_PARTS]
  if (orbitId === 'polar_low') ids = ids.map((id) => (id === 'tank_s' ? 'tank_l' : id)) // la órbita baja pide 1,200 m/s
  if (mode === 'C') ids = ids.map((id) => (id === 'bat_1' ? 'bat_2' : id)) // el radar (150 W) necesita 2 kWh en el eclipse
  if (mode === 'A') return ids
  const rover = ['lander', 'rbat_6', 'wheels_std', 'mass_spec']
  return mode === 'B' ? [...ids, ...rover, 'drill_std'] : [...ids, ...rover, 'drill_deep', 'radar']
}

export const GLOSSARY: Record<string, string> = {
  eclipse: 'Time the Moon blocks the Sun. Solar panels make no power, so the battery carries the ship.',
  dv: 'Delta-v: the "fuel budget" measured as how much your speed can change, in metres per second.',
  downlink: 'Sending data from the spacecraft down to Earth through NASA\'s Deep Space Network (DSN).',
  margin: 'Spare capacity. Real missions keep margin because things always go wrong.',
  stress: 'How close the ship is to a bad day. Higher stress means more and worse trouble cards.',
  hydrogen: 'Hydrogen hiding in the soil is a strong hint of water ice.',
  deck: 'Every weak design choice adds a trouble card. In flight the ship draws from this deck.',
  seu: 'Single-event upset: a radiation particle flips a bit in the computer.',
}
