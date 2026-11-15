import {
  BUDGET_M, DSN_WINDOWS_PER_CYCLE, ITERATION_COST_M, LAUNCHER, ORBIT, PART,
  OPTIONAL_SINGLE, REQUIRED_SINGLE, GROUP_LABEL, MODE_BUDGET_M, ROVER_GROUPS, ROVER_REQUIRED,
} from '../data/catalog'
import { BASE_DECK, PLANET_DECK } from '../data/cards'
import type { Check, Design, Group, Layer, Part } from '../data/types'
import { money, pct } from './rng'
import { LAYER_LABEL } from './observe'

export interface Stats {
  parts: Part[]
  massKg: number
  capacityKg: number
  massMargin: number // (capacidad − masa) / capacidad
  genW: number
  demandW: number
  instrumentW: number
  powerMargin: number // el peor entre día y eclipse
  batteryWh: number
  storageGb: number
  downlinkGbCycle: number
  dataGbPerTarget: number
  dvTankMs: number
  dvNeededMs: number
  costM: number // piezas + lanzador + iteraciones
  budgetM: number // presupuesto total de la misión elegida
  budgetLeftM: number
  reserve: number // budgetLeft / BUDGET
  slotsUsed: number
  slotsMax: number
  layers: Layer[]
  lowRelCount: number
  errors: string[] // bloquean enviar a revisión
  checks: Check[]
}

export const has = (d: Design, id: string) => d.partIds.includes(id)

export function partsOf(d: Design): Part[] {
  return d.partIds.map((id) => PART[id]).filter((p): p is Part => !!p)
}

/** Añade/quita una pieza respetando "una sola por grupo" donde aplica. */
export function togglePart(d: Design, part: Part): Design {
  const present = d.partIds.includes(part.id)
  let ids = d.partIds.filter((id) => (present ? id !== part.id : true))
  if (!present) {
    const single = REQUIRED_SINGLE.includes(part.group) || OPTIONAL_SINGLE.includes(part.group)
    if (single) ids = ids.filter((id) => PART[id]?.group !== part.group)
    ids = [...ids, part.id]
  }
  return { ...d, partIds: ids }
}

export function computeStats(d: Design, iterations = 0): Stats {
  const parts = partsOf(d)
  const orbit = ORBIT[d.orbitId]
  const launcher = LAUNCHER[d.launcherId]
  const sum = (f: (p: Part) => number) => parts.reduce((a, p) => a + f(p), 0)

  const bus = parts.find((p) => p.group === 'bus')
  const panel = parts.find((p) => p.group === 'panel')
  const battery = parts.find((p) => p.group === 'battery')
  const antenna = parts.find((p) => p.group === 'antenna')
  const recorder = parts.find((p) => p.group === 'recorder')
  const tank = parts.find((p) => p.group === 'tank')
  const instruments = parts.filter((p) => p.group === 'instrument')

  const massKg = sum((p) => p.massKg)
  const capacityKg = launcher.capacityKg
  const massMargin = (capacityKg - massKg) / capacityKg

  const cellFactor = has(d, 'panel_si') ? 0.95 : 1 // degradación media del silicio
  const genW = (panel?.genW ?? 0) * cellFactor
  const demandW = sum((p) => p.drawW)
  const instrumentW = instruments.reduce((a, p) => a + p.drawW, 0)

  const batteryWh = battery?.batteryWh ?? 0
  const eclipseWh = (demandW * orbit.eclipseMin) / 60
  const usableWh = batteryWh * 0.8
  const sunMargin = genW > 0 ? (genW - demandW) / genW : -1
  const batMargin = usableWh > 0 ? (usableWh - eclipseWh) / usableWh : -1
  const powerMargin = Math.min(sunMargin, batMargin)

  const costM = sum((p) => p.costM) + launcher.costM + iterations * ITERATION_COST_M
  const budgetM = BUDGET_M + MODE_BUDGET_M[d.mode ?? 'B']
  const budgetLeftM = budgetM - costM
  const reserve = budgetLeftM / budgetM

  const dvTankMs = tank?.dvMs ?? 0
  const dvNeededMs = orbit.dvInsertion + orbit.dvKeeping
  const downlinkGbCycle = (antenna?.downlinkGb ?? 0) * DSN_WINDOWS_PER_CYCLE
  const dataGbPerTarget = instruments.reduce((a, p) => a + (p.dataGb ?? 0), 0)
  const layers = instruments.map((p) => p.layer!).filter(Boolean)
  const slotsUsed = instruments.length
  const slotsMax = bus?.slots ?? 0
  const lowRelCount = parts.filter((p) => p.rel < 0.9).length

  // Errores duros: el diseño no se puede ni revisar.
  const errors: string[] = []
  for (const g of REQUIRED_SINGLE) {
    if (!parts.some((p) => p.group === g)) errors.push(`Missing: ${GROUP_LABEL[g].toLowerCase()}.`)
  }
  if ((d.mode ?? 'B') !== 'A') {
    for (const g of ROVER_REQUIRED) if (!parts.some((p) => p.group === g)) errors.push(`Mission ${d.mode ?? 'B'} needs a rover part: ${GROUP_LABEL[g]}.`)
  } else if (parts.some((p) => ROVER_GROUPS.includes(p.group))) errors.push('Mission A is orbiter only: remove the Rover Bay parts.')
  if (d.mode === 'C' && !has(d, 'drill_deep')) errors.push('Mission C needs the deep drill (1 m).')
  if (d.mode === 'C' && !has(d, 'radar')) errors.push(`Mission C needs the ${PART.radar.name} to see what is buried under the surface.`)
  if (slotsUsed > slotsMax && bus) errors.push(`The ${bus.name.toLowerCase()} only has ${slotsMax} instrument slots.`)
  if (has(d, 'radar') && (!has(d, 'panel_gaas') || !has(d, 'bat_2')))
    errors.push('The radar draws 150 W: it needs the GaAs array AND the 2 kWh battery.')
  if (tank && dvTankMs < dvNeededMs)
    errors.push(`${orbit.name} orbit needs ${dvNeededMs} m/s (insertion + keeping). Your tank gives ${dvTankMs}.`)

  const checks: Check[] = [
    {
      id: 'mass', label: 'Mass margin', value: `${pct(massMargin)} (${Math.round(massKg)} / ${capacityKg} kg)`,
      status: massMargin < 0 ? 'fail' : massMargin < 0.1 ? 'warn' : 'ok',
      why: 'The rocket can only lift so much. Reviewers want at least 10% spare, because mass always grows.',
    },
    {
      id: 'power', label: 'Power margin', value: pct(powerMargin),
      status: powerMargin < 0 ? 'fail' : powerMargin < 0.15 ? 'warn' : 'ok',
      why: `During eclipse (${orbit.eclipseMin} min per orbit) there is no Sun, so the battery must carry everything. Reviewers want 15% spare in the worst case.`,
    },
    {
      id: 'budget', label: 'Budget reserve', value: `${money(budgetLeftM)} left (${pct(reserve)})`,
      status: reserve < 0 ? 'fail' : reserve < 0.1 ? 'warn' : 'ok',
      why: 'Surprises cost money. Real programs hold back at least 10%.',
    },
    {
      id: 'science', label: 'Science traceability', value: layers.includes('hydrogen') ? `${PART.neutron.name} on board` : `No ${PART.neutron.name.toLowerCase()}`,
      status: layers.includes('hydrogen') ? (layers.includes('terrain') ? 'ok' : 'warn') : 'fail',
      why: `The whole mission is about ${LAYER_LABEL.hydrogen.toLowerCase()}, and only the ${PART.neutron.name.toLowerCase()} can map it. Without a camera you cannot judge landing terrain.`,
    },
    {
      id: 'data', label: 'Data vs downlink', value: `${dataGbPerTarget} Gb/target · ${downlinkGbCycle} Gb/cycle down`,
      status: dataGbPerTarget > downlinkGbCycle ? 'warn' : 'ok',
      why: 'Data you cannot send home is data you never get. A full recorder starts losing files.',
    },
  ]

  return {
    budgetM, parts, massKg, capacityKg, massMargin, genW, demandW, instrumentW, powerMargin, batteryWh,
    storageGb: recorder?.storageGb ?? 0, downlinkGbCycle, dataGbPerTarget, dvTankMs, dvNeededMs,
    costM, budgetLeftM, reserve, slotsUsed, slotsMax, layers, lowRelCount, errors, checks,
  }
}

/** Mazo de la nave: lo que el propio diseño metió. */
export interface DeckEntry { cardId: string; because: string }

export function buildDeck(d: Design, stats: Stats): DeckEntry[] {
  const deck: DeckEntry[] = BASE_DECK
    .filter((id) => !(id === 'solar_heating' && has(d, 'mli')))
    .map((cardId) => ({ cardId, because: 'Every spacecraft gets these' }))
  for (const p of stats.parts) for (const c of p.cards ?? []) deck.push({ cardId: c, because: `You chose the ${p.name}` })
  if (!has(d, 'heaters')) deck.push({ cardId: 'cold_battery', because: 'You skipped the battery heaters' })
  const hasSeu = deck.some((e) => e.cardId === 'seu')
  if (!has(d, 'shield') && !hasSeu) deck.push({ cardId: 'seu', because: 'You skipped the radiation shielding' })
  if (stats.powerMargin < 0.3) deck.push({ cardId: 'battery_overheat', because: 'Your power margin is thin' })
  for (const cardId of PLANET_DECK) deck.push({ cardId, because: 'Mars itself: weather, dust and distance' })
  return deck
}

export function initialStress(stats: Stats, forced: boolean, iterations: number): number {
  let s = 10
  if (stats.massMargin < 0.1) s += 10
  if (stats.powerMargin < 0.15) s += 10
  s += stats.lowRelCount * 5
  if (forced) s += 15
  s -= iterations * 10
  return Math.max(0, s)
}

// ---------- Revisión CML 4 ----------

export interface ReviewItem {
  id: string
  reviewer: 'brooks' | 'tomas' | 'priya'
  label: string
  pass: boolean
  say: string
}

export function reviewDesign(stats: Stats): ReviewItem[] {
  const c = Object.fromEntries(stats.checks.map((k) => [k.id, k]))
  const ok = (id: string, strict = true) => (strict ? c[id].status === 'ok' : c[id].status !== 'fail')
  return [
    { id: 'mass', reviewer: 'brooks', label: 'Mass margin ≥ 10%', pass: ok('mass'),
      say: ok('mass') ? `Mass margin is ${c.mass.value}. Comfortable.` : `Mass margin is ${c.mass.value}. ${c.mass.why}` },
    { id: 'power', reviewer: 'tomas', label: 'Power margin ≥ 15%', pass: ok('power'),
      say: ok('power') ? `Power margin ${c.power.value}. The battery survives the eclipse.` : `Power margin ${c.power.value}. ${c.power.why}` },
    { id: 'budget', reviewer: 'priya', label: 'Budget reserve ≥ 10%', pass: ok('budget'),
      say: ok('budget') ? `Reserve is ${c.budget.value}. Healthy.` : `Reserve is ${c.budget.value}. ${c.budget.why}` },
    { id: 'science', reviewer: 'priya', label: 'Science traceability', pass: ok('science', true) || c.science.status === 'warn',
      say: c.science.status === 'fail' ? `${c.science.value}. ${c.science.why}` : c.science.status === 'warn' ? `The ${PART.neutron.name.toLowerCase()} is there, but with no camera you will be picking a landing site half-blind. I will allow it.` : 'The instruments answer the science question.' },
  ]
}

export const reviewPassed = (items: ReviewItem[]) => items.every((i) => i.pass)

export function hasLayer(stats: Stats, l: Layer): boolean {
  return stats.layers.includes(l)
}

export type { Group }
