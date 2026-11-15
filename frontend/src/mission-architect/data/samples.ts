/**
 * Rocas que el rover puede perforar en Marte. Cada tipo se inspira en una roca real que perforó o analizó un rover
 * (nombres de los equipos de NASA/JPL). `value` y `bio` son valores de JUEGO; `look` define el modelo del núcleo
 * (three/CoreSample.tsx).
 */
export type RockKind = 'basalt' | 'olivine' | 'mudstone' | 'sulfate' | 'carbonate' | 'silica' | 'sulfur' | 'leopard' | 'hematite' | 'dust'

export type Pattern = 'vesicles' | 'grains' | 'layers' | 'veins' | 'nodules' | 'opal' | 'crystals' | 'spots' | 'powder'

export interface RockInfo {
  kind: RockKind
  name: string
  /** Caso real que inspira la roca. */
  real: string
  where: string
  /** Qué cuenta la roca, en una frase para principiantes. */
  story: string
  value: number // puntos base por núcleo
  bio: 0 | 1 | 2 | 3 // potencial de conservar rastros de vida: 0 nada … 3 posible biofirma
  look: { base: string; accent: string; dark: string; pattern: Pattern }
}

export const ROCKS: Record<RockKind, RockInfo> = {
  basalt: {
    kind: 'basalt', name: 'Altered basalt', real: '"Rochette" (cores Montdenier and Montagnac)', where: 'Jezero crater floor · Perseverance · 2021',
    story: 'Volcanic rock. Salts in its pores show water soaked it long after it cooled.',
    value: 30, bio: 0, look: { base: '#4a4440', accent: '#8a7a6a', dark: '#1e1b1a', pattern: 'vesicles' },
  },
  olivine: {
    kind: 'olivine', name: 'Olivine cumulate', real: 'Séítah rocks "Brac" and "Issole"', where: 'Jezero · Perseverance · 2021',
    story: 'Green olivine crystals that settled out of a thick lava. Water later turned some of them to carbonate.',
    value: 40, bio: 0, look: { base: '#4d4a35', accent: '#7f9a3c', dark: '#25261a', pattern: 'grains' },
  },
  mudstone: {
    kind: 'mudstone', name: 'Lake mudstone', real: '"John Klein", Curiosity\'s first drill hole', where: 'Yellowknife Bay, Gale · Curiosity · 2013',
    story: 'Fine mud with clay minerals, laid down in calm, drinkable lake water. The first proof that Mars was once habitable.',
    value: 70, bio: 2, look: { base: '#8a6a55', accent: '#b49a86', dark: '#5a4234', pattern: 'layers' },
  },
  sulfate: {
    kind: 'sulfate', name: 'Sulfate mudstone', real: '"Wildcat Ridge" (core "Hidden Harbor")', where: 'Jezero delta · Perseverance · 2022',
    story: 'Mud that dried out as the lake evaporated, leaving sulfate salts. Its organic molecules were the richest found so far.',
    value: 80, bio: 2, look: { base: '#a2806a', accent: '#efe3cf', dark: '#6e5242', pattern: 'veins' },
  },
  carbonate: {
    kind: 'carbonate', name: 'Carbonate rock', real: '"Comanche" outcrop', where: 'Columbia Hills, Gusev · Spirit · 2010',
    story: 'Carbonates dissolve in acid, so they mean the water here was gentle and not too acidic.',
    value: 60, bio: 1, look: { base: '#9a8a76', accent: '#d8cdb8', dark: '#625646', pattern: 'nodules' },
  },
  silica: {
    kind: 'silica', name: 'Opaline silica', real: 'Silica soil near "Home Plate"', where: 'Gusev · Spirit · 2007',
    story: 'Almost pure silica, churned up by Spirit\'s broken, dragging wheel. On Earth, hot springs like this are full of microbes.',
    value: 85, bio: 2, look: { base: '#d8d2c6', accent: '#ffffff', dark: '#a49c8e', pattern: 'opal' },
  },
  sulfur: {
    kind: 'sulfur', name: 'Pure sulfur crystals', real: 'The rock Curiosity cracked open by driving over it', where: 'Gediz Vallis channel, Gale · Curiosity · 2024',
    story: 'Yellow crystals of pure sulfur, something nobody expected on Mars. How they formed is still a mystery.',
    value: 65, bio: 1, look: { base: '#b9a66a', accent: '#ffe14a', dark: '#6d6238', pattern: 'crystals' },
  },
  leopard: {
    kind: 'leopard', name: '"Leopard spot" mudstone', real: '"Cheyava Falls" (core "Sapphire Canyon")', where: 'Neretva Vallis, Jezero · Perseverance · 2024',
    story: 'Red mudstone with tiny rings of iron phosphate and sulfide. On Earth, microbes make rings like these. NASA called it a potential biosignature.',
    value: 150, bio: 3, look: { base: '#9c4a34', accent: '#e9dcc4', dark: '#1c1414', pattern: 'spots' },
  },
  hematite: {
    kind: 'hematite', name: 'Hematite sandstone', real: '"Vera Rubin Ridge" (drill holes "Stoer" and "Highfield")', where: 'Mount Sharp, Gale · Curiosity · 2018',
    story: 'Sand cemented by iron oxide that rusted in groundwater. Opportunity found the same mineral as tiny "blueberries" at Meridiani.',
    value: 50, bio: 1, look: { base: '#7d3a28', accent: '#4a4a58', dark: '#3e1c14', pattern: 'nodules' },
  },
  dust: {
    kind: 'dust', name: 'Dust and sand', real: 'The red dust that covers most of Mars', where: 'Everywhere',
    story: 'Wind-blown fines. Nothing a lake left behind.',
    value: 5, bio: 0, look: { base: '#b0643c', accent: '#d08a5a', dark: '#7a3e22', pattern: 'powder' },
  },
}

/** Rocas de cada sitio (repetidas = más comunes) y la roca rara que aparece como "lectura anómala". */
export const SITE_ROCKS: Record<string, { mix: RockKind[]; rare: RockKind }> = {
  jezero: { mix: ['sulfate', 'mudstone', 'carbonate', 'basalt', 'olivine', 'basalt'], rare: 'leopard' },
  gale: { mix: ['mudstone', 'mudstone', 'sulfate', 'basalt', 'mudstone'], rare: 'sulfur' },
  gusev: { mix: ['basalt', 'carbonate', 'basalt', 'olivine'], rare: 'silica' },
  elysium: { mix: ['basalt', 'basalt', 'dust'], rare: 'basalt' },
  hellas: { mix: ['basalt', 'olivine', 'carbonate', 'basalt'], rare: 'carbonate' },
}
export const rocksAt = (siteId: string) => SITE_ROCKS[siteId] ?? { mix: ['basalt', 'basalt', 'olivine'] as RockKind[], rare: 'carbonate' as RockKind }
