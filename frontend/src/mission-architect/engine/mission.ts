import { CRATER, CRATERS, CYCLES, LAUNCHER, ORBIT, PART, DSN_WINDOWS_PER_CYCLE, SPECIAL } from '../data/catalog'
import { CARD, CRITICAL_POOL, type CardEffect, type Level } from '../data/cards'
import type { Design, Layer } from '../data/types'
import { buildDeck, hasLayer, initialStress, type Stats } from './design'
import { knownFromQuality, layerPoints } from './observe'
import { clamp, engineeringRoll, type Rng, type RollResult } from './rng'

export interface ActiveCard { uid: number; id: string; age: number; resolved: boolean; tried: boolean }
export interface LogEntry { cycle: number; kind: 'info' | 'card' | 'good' | 'bad' | 'design'; text: string }

export interface Perm { genMul: number; batCapMul: number; qMul: number; dvMul: number; disabled: Layer[] }

export interface Mission {
  cycle: number // 1..CYCLES
  stress: number
  batteryPct: number
  storedGb: number
  generatedGb: number
  transmittedGb: number
  lostGb: number
  science: number
  dvLeft: number
  qBonus: number
  deck: string[]
  cards: ActiveCard[]
  perm: Perm
  quality: Record<string, Partial<Record<Layer, number>>>
  mapped: string[]
  nextUid: number
  log: LogEntry[]
  budgetLeftM: number
  forced: boolean
}

export interface Ctx { design: Design; stats: Stats }

export interface Mods {
  qMul: number; downMul: number; batCapMul: number; genMul: number
  safeMode: boolean; dataLoss: number; layerMul: Partial<Record<Layer, number>>; disabled: Layer[]
}

const clone = <T,>(v: T): T => structuredClone(v)

// ---------- Lanzamiento y crucero ----------

export interface LaunchEvent {
  kind: 'info' | 'roll'
  label: string
  p?: number
  roll?: number
  result?: RollResult
  text: string
}
export interface LaunchOutcome {
  events: LaunchEvent[]
  status: 'ok' | 'launch_failure' | 'lost'
  panel: RollResult
  loi: RollResult
}

export function runLaunch(ctx: Ctx, stress: number, rng: Rng): LaunchOutcome {
  const { stats, design } = ctx
  const L = LAUNCHER[design.launcherId]
  const events: LaunchEvent[] = []
  let panel: RollResult = 'success'
  let loi: RollResult = 'success'

  if (stats.massKg > stats.capacityKg) {
    events.push({ kind: 'info', label: 'Mass check', text: `Spacecraft ${Math.round(stats.massKg)} kg vs rocket capacity ${stats.capacityKg} kg. The rocket cannot lift it.` })
    return { events, status: 'launch_failure', panel, loi }
  }
  events.push({ kind: 'info', label: 'Mass check', text: `${Math.round(stats.massKg)} kg of ${stats.capacityKg} kg. Within capacity.` })

  const launch = engineeringRoll(rng, L.rel)
  events.push({ kind: 'roll', label: 'Launch', p: L.rel, roll: launch.roll, result: launch.result === 'success' ? 'success' : 'fail', text: `${L.name} reliability ${Math.round(L.rel * 100)}%.` })
  if (launch.result !== 'success') return { events, status: 'launch_failure', panel, loi }

  const panelPart = PART[design.partIds.find((id) => PART[id]?.group === 'panel') ?? '']
  const pp = clamp((panelPart?.rel ?? 0.9) * (1 - stress / 200), 0, 1)
  const dep = engineeringRoll(rng, pp)
  panel = dep.result
  events.push({ kind: 'roll', label: 'Solar array deployment', p: pp, roll: dep.roll, result: panel, text: `${panelPart?.name ?? 'Array'} reliability × stress penalty.` })

  const tank = PART[design.partIds.find((id) => PART[id]?.group === 'tank') ?? '']
  const lp = clamp((tank?.rel ?? 0.9) * (1 - stress / 200), 0, 1)
  const ins = engineeringRoll(rng, lp)
  loi = ins.result
  events.push({ kind: 'roll', label: INSERTION.label, p: lp, roll: ins.roll, result: loi, text: 'The engine must fire at exactly the right moment.' })
  return { events, status: loi === 'fail' ? 'lost' : 'ok', panel, loi }
}

// ---------- Creación de la misión ----------

export function createMission(ctx: Ctx, launch: LaunchOutcome, forced: boolean, iterations: number, rng: Rng): Mission {
  const { design, stats } = ctx
  const orbit = ORBIT[design.orbitId]
  const deckEntries = buildDeck(design, stats)
  const m: Mission = {
    cycle: 1,
    stress: initialStress(stats, forced, iterations),
    batteryPct: 100,
    storedGb: 0, generatedGb: 0, transmittedGb: 0, lostGb: 0, science: 0,
    dvLeft: stats.dvTankMs - orbit.dvInsertion,
    qBonus: 0,
    deck: deckEntries.map((e) => e.cardId),
    cards: [],
    perm: { genMul: 1, batCapMul: 1, qMul: 1, dvMul: 1, disabled: [] },
    quality: {}, mapped: [], nextUid: 1, log: [],
    budgetLeftM: stats.budgetLeftM,
    forced,
  }
  for (const e of deckEntries) {
    if (e.because !== 'Every spacecraft gets these') {
      m.log.push({ cycle: 0, kind: 'design', text: `Hangar: ${e.because} → the "${CARD[e.cardId].name}" card joined the ship's deck.` })
    }
  }
  if (iterations > 0) m.log.push({ cycle: 0, kind: 'design', text: `Design review: you iterated ${iterations}× (−$${iterations * 10}M, −${iterations * 10} stress).` })
  if (forced) {
    m.log.push({ cycle: 0, kind: 'bad', text: 'Design review: you forced the launch (+15 stress, 2 extra major cards).' })
    for (let i = 0; i < 2; i++) addCard(m, pickFromDeck(m, 'major', rng) ?? pickFromDeck(m, 'minor', rng))
  }
  if (launch.panel === 'partial') {
    addCard(m, 'panel_partial')
    m.log.push({ cycle: 0, kind: 'bad', text: 'Cruise: the solar array opened halfway.' })
  } else if (launch.panel === 'fail') {
    addCard(m, 'panel_failed')
    m.log.push({ cycle: 0, kind: 'bad', text: 'Cruise: the solar arrays failed to deploy.' })
  }
  if (launch.loi === 'partial') {
    m.qBonus -= 0.2
    m.dvLeft -= 100
    m.log.push({ cycle: 0, kind: 'bad', text: `${INSERTION.label}: partial burn. Higher orbit (−20% map quality) and 100 m/s of fuel spent correcting.` })
  }
  return m
}

function addCard(m: Mission, id: string | undefined) {
  if (!id) return
  m.cards.push({ uid: m.nextUid++, id, age: 0, resolved: false, tried: false })
}

function pickFromDeck(m: Mission, level: Level, rng: Rng): string | undefined {
  const idx = m.deck.map((id, i) => ({ id, i })).filter((e) => CARD[e.id].level === level)
  if (!idx.length) return undefined
  const pick = idx[Math.floor(rng() * idx.length)]
  m.deck.splice(pick.i, 1)
  return pick.id
}

// ---------- Modificadores ----------

export function aggMods(m: Mission): Mods {
  const mods: Mods = {
    qMul: m.perm.qMul, downMul: 1, batCapMul: m.perm.batCapMul, genMul: m.perm.genMul,
    safeMode: false, dataLoss: 0, layerMul: {}, disabled: [...m.perm.disabled],
  }
  for (const c of m.cards) {
    if (c.resolved) continue
    const e = CARD[c.id].effect
    mods.qMul *= e.qMul ?? 1
    mods.downMul *= e.downMul ?? 1
    mods.batCapMul *= e.batCapMul ?? 1
    mods.genMul *= e.genMul ?? 1
    mods.safeMode ||= !!e.safeMode
    mods.dataLoss = Math.max(mods.dataLoss, e.dataLoss ?? 0)
    for (const [l, v] of Object.entries(e.layerMul ?? {}) as [Layer, number][]) mods.layerMul[l] = (mods.layerMul[l] ?? 1) * v
  }
  return mods
}

function applyPerm(m: Mission, e: CardEffect) {
  m.perm.genMul *= e.genMul ?? 1
  m.perm.batCapMul *= e.batCapMul ?? 1
  m.perm.qMul *= e.qMul ?? 1
  m.perm.dvMul *= e.dvMul ?? 1
  if (e.dvMul) m.dvLeft *= e.dvMul
  if (e.disable && !m.perm.disabled.includes(e.disable)) m.perm.disabled.push(e.disable)
}

// ---------- Cartas ----------

export function drawLevels(stress: number, rng: Rng): Level[] {
  if (stress < 30) return ['minor']
  if (stress < 60) return [rng() < 0.5 ? 'minor' : 'major']
  if (stress < 85) return ['major', 'major']
  return ['major', 'major', 'critical']
}

/** Roba cartas al inicio del ciclo. Devuelve una copia nueva de la misión y lo robado. */
export function beginCycle(prev: Mission, rng: Rng): { m: Mission; drawn: string[] } {
  const m = clone(prev)
  const drawn: string[] = []
  for (const lvl of drawLevels(m.stress, rng)) {
    let id: string | undefined
    if (lvl === 'critical') id = CRITICAL_POOL[Math.floor(rng() * CRITICAL_POOL.length)]
    else id = pickFromDeck(m, lvl, rng) ?? pickFromDeck(m, lvl === 'major' ? 'minor' : 'major', rng)
    if (!id) continue
    drawn.push(id)
    const def = CARD[id]
    if (def.duration === 'perm') {
      applyPerm(m, def.effect)
      m.log.push({ cycle: m.cycle, kind: 'card', text: `Cycle ${m.cycle}: "${def.name}" (${def.source}) — ${def.text}` })
    } else {
      addCard(m, id)
      m.log.push({ cycle: m.cycle, kind: 'card', text: `Cycle ${m.cycle}: "${def.name}" (${def.source}) — ${def.text}` })
    }
  }
  if (!drawn.length) {
    m.stress = Math.max(0, m.stress - 3)
    m.log.push({ cycle: m.cycle, kind: 'good', text: `Cycle ${m.cycle}: the deck had nothing left to throw at you. (−3 stress)` })
  }
  return { m, drawn }
}

export function respondP(m: Mission, uid: number): number {
  const c = m.cards.find((x) => x.uid === uid)
  const r = c && CARD[c.id].response
  return r ? clamp(r.p * (1 - m.stress / 200), 0, 1) : 0
}

export function respond(prev: Mission, uid: number, rng: Rng): { m: Mission; success: boolean } {
  const m = clone(prev)
  const c = m.cards.find((x) => x.uid === uid)
  if (!c || c.tried || c.resolved) return { m, success: false }
  const def = CARD[c.id]
  c.tried = true
  const p = respondP(m, uid)
  const success = rng() < p
  if (success) {
    c.resolved = true
    m.stress = Math.max(0, m.stress - 5)
    m.log.push({ cycle: m.cycle, kind: 'good', text: `Cycle ${m.cycle}: ${def.response?.role} ran "${def.response?.label}" and fixed "${def.name}". (−5 stress)` })
  } else {
    m.stress = Math.min(100, m.stress + 5)
    m.log.push({ cycle: m.cycle, kind: 'bad', text: `Cycle ${m.cycle}: "${def.response?.label}" failed on "${def.name}". (+5 stress)` })
  }
  return { m, success }
}

// ---------- Ciclo de mapeo ----------

export interface CyclePlan { targets: string[]; calibrate: boolean; eclipseSave: boolean }

export interface CycleReport {
  cycle: number
  calibrated: boolean
  safeMode: boolean
  lowBattery: boolean
  targets: string[]
  revealed: { crater: string; layer: Layer; known: 'exact' | 'range' }[]
  sciencePts: number
  batteryMinPct: number
  generatedGb: number
  downlinkedGb: number
  lostGb: number
  quality: number
  exploded: string[]
}

export const ECLIPSE_SEASON_FROM = 3
export const eclipseMult = (cycle: number) => (cycle >= ECLIPSE_SEASON_FROM ? 1.35 : 1)

export function baseQuality(orbitRes: number): number {
  return Math.min(1, 0.45 + 0.35 * orbitRes)
}

export function runCycle(prev: Mission, ctx: Ctx, plan: CyclePlan, _rng: Rng): { m: Mission; report: CycleReport } {
  const m = clone(prev)
  const { stats, design } = ctx
  const orbit = ORBIT[design.orbitId]
  const mods = aggMods(m)
  const targets = plan.calibrate ? [] : plan.targets.slice(0, 2)
  const log = (kind: LogEntry['kind'], text: string) => m.log.push({ cycle: m.cycle, kind, text })

  // Batería
  const em = eclipseMult(m.cycle)
  const demandEclipse = stats.demandW - (plan.eclipseSave ? stats.instrumentW : 0)
  const eclipseWh = (demandEclipse * orbit.eclipseMin * em) / 60
  const capWh = Math.max(1, stats.batteryWh * mods.batCapMul * 0.8)
  const dod = (eclipseWh / capWh) * 100
  const sunMin = Math.max(0, orbit.periodMin - orbit.eclipseMin * em)
  const surplusWh = (stats.genW * mods.genMul - stats.demandW) * (sunMin / 60)
  const orbitsPerCycle = 1440 / orbit.periodMin
  const net = surplusWh - eclipseWh
  const endPct = net >= 0 ? 100 : clamp(m.batteryPct + ((net * orbitsPerCycle) / capWh) * 100, 0, 100)
  const batteryMinPct = Math.max(0, Math.min(m.batteryPct, endPct) - dod)
  m.batteryPct = endPct
  const lowBattery = batteryMinPct < 20
  if (lowBattery) {
    m.stress = Math.min(100, m.stress + 3)
    log('bad', `Cycle ${m.cycle}: battery fell to ${Math.round(batteryMinPct)}% during eclipse. Ship entered safe mode. (+3 stress)`)
  }
  const safeMode = mods.safeMode || lowBattery

  // Combustible de mantenimiento
  m.dvLeft -= orbit.dvKeeping / CYCLES
  let q = 0
  if (m.dvLeft < 0) m.qBonus = Math.min(m.qBonus, -0.3)

  const revealed: CycleReport['revealed'] = []
  let sciencePts = 0
  let generated = 0

  if (plan.calibrate) {
    m.qBonus += 0.2
    log('info', `Cycle ${m.cycle}: calibration. No data this cycle, +20% quality from now on.`)
  } else if (safeMode) {
    log('bad', `Cycle ${m.cycle}: safe mode — no science this cycle.`)
  } else {
    q = baseQuality(orbit.res) * mods.qMul * (targets.length === 2 ? 0.65 : 1) * (plan.eclipseSave ? 0.8 : 1) + m.qBonus
    q = clamp(q, 0, 1)
    generated = stats.dataGbPerTarget * targets.length
    for (const t of targets) {
      const cr = CRATER[t]
      if (!m.mapped.includes(t)) m.mapped.push(t)
      const slot = (m.quality[t] ??= {})
      for (const p of stats.parts) {
        if (!p.layer || mods.disabled.includes(p.layer)) continue
        const ql = clamp(q * (mods.layerMul[p.layer] ?? 1) * p.rel, 0, 1)
        const before = knownFromQuality(slot[p.layer])
        if (slot[p.layer] === undefined || ql > (slot[p.layer] as number)) slot[p.layer] = ql
        const after = knownFromQuality(slot[p.layer])
        const delta = layerPoints(p.layer, after) - layerPoints(p.layer, before)
        if (delta > 0 && after !== 'none') {
          sciencePts += delta
          revealed.push({ crater: cr.name, layer: p.layer, known: after })
        }
      }
    }
    // Evento fijo del ciclo 4: punto ultrafrío en Cabeus (el radiómetro lo ve completo)
    if (m.cycle === 4 && hasLayer(stats, 'temperature') && targets.includes(SPECIAL.site)) {
      const slot = (m.quality[SPECIAL.site] ??= {})
      if ((slot.temperature ?? 0) < 0.95) slot.temperature = 0.95
    }
  }
  m.science += sciencePts

  // Datos: generar → guardar (con desborde) → bajar en ventanas DSN
  m.generatedGb += generated
  let stored = m.storedGb + generated
  let lost = 0
  if (stored > stats.storageGb) { lost += stored - stats.storageGb; stored = stats.storageGb }
  if (mods.dataLoss > 0) { const l = stored * mods.dataLoss; lost += l; stored -= l }
  const cap = stats.downlinkGbCycle * mods.downMul
  const down = Math.min(stored, cap)
  stored -= down
  m.storedGb = stored
  m.transmittedGb += down
  m.lostGb += lost
  if (lost > 0.01) log('bad', `Cycle ${m.cycle}: ${lost.toFixed(1)} Gb of data lost (recorder full or corrupted).`)

  // Envejecer cartas, limpiar las de un ciclo y explotar temporizadores
  const exploded: string[] = []
  for (const c of m.cards) {
    const def = CARD[c.id]
    if (c.resolved) continue
    c.age++
    if (def.timer && c.age >= def.timer && def.explode) {
      applyPerm(m, def.explode)
      m.stress = Math.min(100, m.stress + (def.explode.stress ?? 0))
      c.resolved = true
      exploded.push(def.name)
      log('bad', `Cycle ${m.cycle}: the "${def.name}" timer ran out. ${def.explode.text}`)
    }
  }
  m.cards = m.cards.filter((c) => !c.resolved && CARD[c.id].duration !== 'cycle')
  if (!safeMode && !exploded.length && !m.cards.length) m.stress = Math.max(0, m.stress - 3)

  m.cycle += 1
  return {
    m,
    report: {
      cycle: prev.cycle, calibrated: plan.calibrate, safeMode, lowBattery, targets, revealed, sciencePts,
      batteryMinPct, generatedGb: generated, downlinkedGb: down, lostGb: lost, quality: q, exploded,
    },
  }
}

// ---------- Sitio de aterrizaje y final ----------

export const siteScore = (id: string) => {
  const c = CRATER[id]
  return c.h * (1 - 0.12 * c.risk)
}
const best = () => CRATERS.reduce((a, c) => (siteScore(c.id) > siteScore(a.id) ? c : a)).id
export let BEST_SITE = best()
/** Lo llama setPlanet (data/planet.ts) al cambiar la lista de sitios. */
export function refreshBestSite() { BEST_SITE = best() }
/** Nombre de la inserción en órbita (lo cambia el planeta); launchLines y Launch3D comparan con endsWith('orbit insertion'). */
export const INSERTION = { label: 'Lunar orbit insertion' }

export type EndingId = 'launch_failure' | 'lost' | 'lead' | 'bold' | 'poor'

export function siteTier(id: string): 'lead' | 'bold' | 'poor' {
  const r = siteScore(id) / siteScore(BEST_SITE)
  return r >= 0.95 ? 'lead' : r >= 0.4 ? 'bold' : 'poor'
}

export interface ScoreBreakdown {
  science: number
  budget: number
  stress: number
  site: number
  informed: number
  total: number
  rank: string
  transmitFraction: number
}

export const RANKS: [number, string][] = [
  [700, 'JPL Legend'], [500, 'Principal Investigator'], [300, 'Mission Engineer'], [150, 'Junior Engineer'], [0, 'Intern'],
]

export function scoreMission(m: Mission, siteId: string | null): ScoreBreakdown {
  const tf = m.generatedGb > 0 ? clamp(m.transmittedGb / m.generatedGb, 0, 1) : 0
  const science = Math.round(m.science * tf)
  const budget = Math.max(0, Math.round(m.budgetLeftM)) * 2
  const stress = Math.round(100 - m.stress)
  const tier = siteId ? siteTier(siteId) : 'poor'
  const site = siteId ? { lead: 300, bold: 150, poor: 40 }[tier] : 0
  const informed = siteId && (m.quality[siteId]?.hydrogen ?? 0) >= 0.4 ? 25 : 0
  const total = science + budget + stress + site + informed
  const rank = RANKS.find(([min]) => total >= min)![1]
  return { science, budget, stress, site, informed, total, rank, transmitFraction: tf }
}

export function failureScore(stats: Stats): ScoreBreakdown {
  const budget = Math.max(0, Math.round(stats.budgetLeftM)) * 2
  return { science: 0, budget, stress: 0, site: 0, informed: 0, total: budget, rank: 'Intern', transmitFraction: 0 }
}

export { DSN_WINDOWS_PER_CYCLE }
