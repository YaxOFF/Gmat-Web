import type { Crater, Design, Group, Launcher, Orbit, Part } from './types'

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

export const PART: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]))

export const GROUP_LABEL: Record<Group, string> = {
  bus: 'Bus', panel: 'Solar power', battery: 'Battery', thermal: 'Thermal',
  antenna: 'Antenna', comms: 'Extra comms', recorder: 'Data recorder', tank: 'Propulsion',
  computer: 'Computer', shield: 'Shielding', instrument: 'Science instruments',
}

export const GROUP_ORDER: Group[] = [
  'bus', 'panel', 'battery', 'thermal', 'antenna', 'comms', 'recorder', 'tank', 'computer', 'shield', 'instrument',
]

/** Grupos donde solo cabe una pieza y es obligatoria. */
export const REQUIRED_SINGLE: Group[] = ['bus', 'panel', 'battery', 'antenna', 'recorder', 'tank', 'computer']
/** Grupos donde solo cabe una pieza, opcional. */
export const OPTIONAL_SINGLE: Group[] = ['shield', 'comms']

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

// Cabeus ≈ 5.6 % está inspirado en la medición de LCROSS; el resto son valores de juego.
export const CRATERS: Crater[] = [
  { id: 'shackleton', name: 'Shackleton', h: 1.2, ice: 1.0, tempC: -180, terrain: 'steep', risk: 3, slopeDeg: 22, x: 50, y: 48,
    blurb: 'Famous, right at the pole, steep walls.' },
  { id: 'cabeus', name: 'Cabeus', h: 5.6, ice: 5.0, tempC: -230, terrain: 'soft', risk: 1, slopeDeg: 6, x: 28, y: 70,
    blurb: 'Where LCROSS crashed in 2009. Smooth floor.' },
  { id: 'haworth', name: 'Haworth', h: 4.1, ice: 3.4, tempC: -210, terrain: 'rocky', risk: 3.5, slopeDeg: 14, x: 70, y: 66,
    blurb: 'Lots of hydrogen, but boulders everywhere.' },
  { id: 'gerlache', name: 'de Gerlache', h: 0.4, ice: 0.1, tempC: -170, terrain: 'soft', risk: 0.8, slopeDeg: 5, x: 36, y: 24,
    blurb: 'Easy and safe. Not much to find.' },
  { id: 'faustini', name: 'Faustini', h: 2.6, ice: 2.0, tempC: -220, terrain: 'very steep', risk: 4, slopeDeg: 31, x: 74, y: 30,
    blurb: 'Promising and brutal. Very steep walls.' },
]
export const CRATER: Record<string, Crater> = Object.fromEntries(CRATERS.map((c) => [c.id, c]))

export function defaultDesign(): Design {
  return { orbitId: 'polar_high', launcherId: 'medium', partIds: [] }
}

/** Plantilla de partida para el botón "Suggested starter". */
export const STARTER_PARTS = [
  'bus_medium', 'panel_gaas', 'bat_1', 'heaters', 'radiator', 'hga', 'rec_256', 'tank_s',
  'comp_hard', 'shield', 'neutron', 'camera',
]

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
