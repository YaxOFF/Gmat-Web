import { ROCKS, type RockKind } from './samples'

/**
 * Laboratorio de la Tierra (Marte, fin de la campaña): los tubos llegan y se analizan con horas de laboratorio
 * limitadas. Valores de JUEGO inspirados en lo que midieron CheMin (Curiosity), PIXL y SHERLOC (Perseverance).
 */
export type Analysis = 'micro' | 'xrd' | 'organics' | 'age'

export const ANALYSES: { id: Analysis; name: string; tool: string; hours: number; what: string }[] = [
  { id: 'micro', name: 'Microscope', tool: 'Optical + electron microscope', hours: 1, what: 'Texture: grains, layers, veins, spots.' },
  { id: 'xrd', name: 'Mineral analysis', tool: 'X-ray diffraction (like CheMin)', hours: 2, what: 'Which minerals, and how much of each.' },
  { id: 'organics', name: 'Organics search', tool: 'Mass spectrometer (like SAM / SHERLOC)', hours: 2, what: 'Organic molecules, the chemistry of life.' },
  { id: 'age', name: 'Age dating', tool: 'Radiometric clock', hours: 2, what: 'How long ago the rock formed.' },
]
export const LAB_HOURS = 6

export const MICRO: Record<RockKind, string> = {
  basalt: 'Gas bubbles frozen in lava. Some are filled with white salt: water seeped in long after it cooled.',
  olivine: 'Interlocking green olivine crystals, a few rimmed by carbonate where water touched them.',
  mudstone: 'Millimetre laminations: mud that settled in still water, layer after layer.',
  sulfate: 'White calcium-sulfate veins cut across the mud: water flowed through its cracks later on.',
  carbonate: 'Rounded carbonate nodules that grew in place from gentle, non-acidic water.',
  silica: 'Glassy, porous opal with fine layers, like the sinter around hot springs on Earth.',
  sulfur: 'Sharp, bright yellow sulfur crystals that the weather has never touched.',
  leopard: 'Millimetre "leopard spots": pale cores with black rims, where iron was chemically reduced.',
  dust: 'Loose, rounded, wind-blown grains. No structure at all.',
}

export const MINERALS: Record<RockKind, [string, number][]> = {
  basalt: [['Plagioclase', 40], ['Pyroxene', 35], ['Olivine', 10], ['Iron oxides', 8], ['Salts in pores', 7]],
  olivine: [['Olivine', 60], ['Pyroxene', 20], ['Carbonate', 10], ['Plagioclase', 10]],
  mudstone: [['Clay (smectite)', 30], ['Plagioclase', 25], ['Amorphous', 20], ['Pyroxene', 15], ['Magnetite', 10]],
  sulfate: [['Calcium sulfate', 30], ['Clay', 20], ['Plagioclase', 20], ['Magnesium sulfate', 15], ['Amorphous', 15]],
  carbonate: [['Mg-Fe carbonate', 35], ['Olivine', 25], ['Pyroxene', 20], ['Silica', 10], ['Clay', 10]],
  silica: [['Opaline silica', 90], ['Titanium oxides', 5], ['Other', 5]],
  sulfur: [['Elemental sulfur', 70], ['Calcium sulfate', 15], ['Clay', 10], ['Other', 5]],
  leopard: [['Clay-rich mud', 45], ['Hematite (red)', 20], ['Calcium sulfate veins', 15], ['Vivianite (Fe phosphate)', 10], ['Greigite (Fe sulfide)', 10]],
  dust: [['Basaltic fines', 60], ['Iron oxides', 25], ['Amorphous', 10], ['Perchlorate', 5]],
}

/** Señal de orgánicos (0..1 para el medidor) y lo que dice el instrumento. */
export const ORGANICS: Record<RockKind, { level: number; text: string }> = {
  basalt: { level: 0.05, text: 'Nothing above the blank. Lava is a hard place to keep organics.' },
  olivine: { level: 0.1, text: 'A faint trace, a few parts per million. Probably from meteorites.' },
  mudstone: { level: 0.55, text: 'Small organic molecules, tens of parts per million, protected inside the clay. Like Curiosity found in Gale.' },
  sulfate: { level: 0.6, text: 'Aromatic organic molecules locked in the sulfate. The richest kind Perseverance reported.' },
  carbonate: { level: 0.3, text: 'Some organic carbon trapped in the carbonate as it grew.' },
  silica: { level: 0.5, text: 'Organics sealed in the silica layers. On Earth, hot-spring silica keeps microbe fossils.' },
  sulfur: { level: 0.2, text: 'A little organic carbon around the crystals. The sulfur itself is the mystery.' },
  leopard: { level: 0.95, text: 'Organic carbon right where the spots are, with iron phosphate and sulfide made by redox reactions. On Earth, microbes drive those reactions. A potential biosignature.' },
  dust: { level: 0.02, text: 'Nothing. Sunlight and perchlorate destroy organics at the surface.' },
}

export const AGE: Record<RockKind, { gyr: number | null; text: string }> = {
  basalt: { gyr: 3.0, text: 'Younger lava that flooded the crater after the lake.' },
  olivine: { gyr: 3.9, text: 'Very old: from when Mars still had a thick atmosphere.' },
  mudstone: { gyr: 3.6, text: 'Lake age: Mars was warm and wet enough for standing water.' },
  sulfate: { gyr: 3.5, text: 'From when the lakes were drying out and turning salty.' },
  carbonate: { gyr: 3.8, text: 'Formed in the oldest, gentlest water on the planet.' },
  silica: { gyr: 3.7, text: 'Volcanic heat and water together, almost 4 billion years ago.' },
  sulfur: { gyr: 3.1, text: 'Laid down late, by water moving through the channel.' },
  leopard: { gyr: 3.5, text: 'Lake mud from the age when life on Earth was already starting.' },
  dust: { gyr: null, text: 'No clock: the grains were mixed by wind just recently.' },
}

/** Puntos de cada análisis (lo que se aprende) y del anuncio final. */
export function analysisPoints(kind: RockKind, a: Analysis): number {
  const bio = ROCKS[kind].bio
  return a === 'micro' ? 10 : a === 'xrd' ? 15 : a === 'age' ? 10 : 5 + bio * 15
}

export interface LabResult { points: number; title: string; text: string; headline: RockKind; runs: number }

export function announce(kinds: RockKind[], headline: number, done: Set<string>): LabResult {
  const kind = kinds[headline], info = ROCKS[kind]
  const bestBio = Math.max(...kinds.map((k) => ROCKS[k].bio))
  const tested = done.has(`${headline}:organics`)
  let points = [...done].reduce((s, key) => { const [i, a] = key.split(':'); return s + analysisPoints(kinds[+i], a as Analysis) }, 0)
  const base = [0, 30, 80, 150][info.bio]
  let title: string, text: string
  if (info.bio >= 2 && tested) {
    points += base + 40
    title = info.bio === 3 ? 'POTENTIAL BIOSIGNATURE ANNOUNCED' : 'HABITABLE ROCK CONFIRMED'
    text = `Your headline: ${info.name}. The organics test backs it up. ${info.bio === 3 ? 'Scientists will argue about it for years, and that is exactly how science should work.' : 'Proof that this rock sat in water able to keep the chemistry of life.'}`
  } else if (info.bio >= 2) {
    points += Math.round(base * 0.5)
    title = 'BOLD CLAIM, THIN EVIDENCE'
    text = `Your headline: ${info.name}. A reporter asks how you know. Without the organics test, it is a guess. Half credit.`
  } else {
    points += base
    title = info.bio < bestBio ? 'THE WRONG TUBE ON STAGE' : 'SOLID GEOLOGY'
    text = info.bio < bestBio
      ? `Your headline: ${info.name}. Good science, but another tube held a better shot at signs of life.`
      : `Your headline: ${info.name}. No signs of life in these tubes, but every one tells how Mars lost its water.`
  }
  return { points, title, text, headline: kind, runs: done.size }
}
