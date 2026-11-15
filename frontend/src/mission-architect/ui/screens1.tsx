import { CHARS } from '../data/chars'
import { Orbit3D } from '../three/Orbit3D'
import { Ship3D } from '../three/Ship3D'
import { useMemo, useState } from 'react'
import { CARD } from '../data/cards'
import {
  GROUP_LABEL, GROUP_ORDER, ROVER_GROUPS, LAUNCHERS, ORBITS, PARTS, ITERATION_COST_M, MAX_ITERATIONS, starterFor,
} from '../data/catalog'
import type { Design, Group, Part } from '../data/types'
import { buildDeck, computeStats, reviewDesign, reviewPassed, togglePart } from '../engine/design'
import { reviewLines } from '../story/scripts'
import { Dialogue } from './Dialogue'
import { Meter, Term, statusIcon } from './Hud'
import { pct } from '../engine/rng'

// ---------- Título ----------

export function Title({ onStart }: { onStart: () => void }) {
  return (
    <div className="title-screen">
      <div className="halftone" />
      <img className="title-moon" src={`${import.meta.env.BASE_URL}moon/southpole.png`} alt="" />
      <div className="title-inner">
        <div className="kicker">A space mission design game</div>
        <h1>MISSION<br /><b>ARCHITECT</b></h1>
        <p className="tag">Episode 1 · Water on the Moon</p>
        <p className="sub">There may be frozen water hiding in the darkest craters of the Moon. You have a budget, a rocket and one shot. Design the spacecraft, fly it, and find the ice.</p>
        <ol className="how">
          {['Design', 'Launch', 'Map', 'Land', 'Explore'].map((t, i) => <li key={t}><span>0{i + 1}</span>{t}</li>)}
        </ol>
        <button className="btn big" onClick={onStart}>START MISSION ▶</button>
        <p className="hint">Solo or a team of 4 · about 25 minutes · real orbit physics from NASA GMAT</p>
      </div>
    </div>
  )
}

// ---------- Órbita ----------

export function OrbitPick({ design, onPick, onInspect }: { design: Design; onPick: (orbitId: string) => void; onInspect: (orbitId: string) => void }) {
  const [sel, setSel] = useState(design.orbitId)
  const dots = (n: number, good: boolean) => <span className={`dots ${good ? 'good' : 'cost'}`}>{'●'.repeat(n)}<i>{'●'.repeat(3 - n)}</i></span>
  const INFO: Record<string, { best: string; maps: number; fuel: number; dark: number; talk: number; plain: string }> = {
    polar_low: { best: 'The sharpest maps', maps: 3, fuel: 3, dark: 3, talk: 3,
      plain: 'Flying low gives you crisp maps, but the Moon\'s lumpy gravity keeps pulling Selene down. You will burn a lot of fuel to stay up, so you need the big tank.' },
    polar_high: { best: 'A safe, balanced first mission', maps: 2, fuel: 2, dark: 2, talk: 2,
      plain: 'A little higher, a lot calmer. Good maps, moderate fuel, and regular contact with a rover later. The easiest choice if this is your first time.' },
    polar_ellip: { best: 'Saving fuel and helping a rover', maps: 1, fuel: 1, dark: 1, talk: 2,
      plain: 'Swoops low over the south pole and far away elsewhere. Very cheap on fuel and great for long rover chats, but the maps are blurrier.' },
  }
  const o = ORBITS.find((x) => x.id === sel)!
  const info = INFO[sel]
  return (
    <div className="page orbit2">
      <h2>Choose the orbit</h2>
      <p className="lead">Where Selene circles the Moon. Every orbit is a trade: there is no perfect one.</p>
      <div className="orbit-layout">
        <div className="orbit-stage big">
          <span className="tagline">{o.name} orbit · drag to rotate · scroll to zoom</span>
          <Orbit3D orbitId={sel} partIds={design.partIds} />
        </div>
        <div className="orbit-list">
          {ORBITS.map((x) => {
            const k = INFO[x.id]
            return (
              <button key={x.id} className={`pick orbit-pick ${sel === x.id ? 'sel' : ''}`} aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
                {x.id === 'polar_high' && <em className="tag2">Good first pick</em>}
                <b>{x.name}</b>
                <span className="q2">Best for: {k.best}</span>
                <div className="orbit-rows">
                  <span>Map detail</span>{dots(k.maps, true)}
                  <span><Term k="dv">Fuel</Term> it eats</span>{dots(k.fuel, false)}
                  <span><Term k="eclipse">Time in shadow</Term></span>{dots(k.dark, false)}
                  <span>Rover contact</span>{dots(k.talk, true)}
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="orbit-explain">
        <b>What this means:</b> {info.plain}
        <span className="hint"> Altitude {o.altitude} · one lap every {o.periodMin} min · {o.eclipseMin} min in shadow per lap.</span>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={() => onInspect(sel)} title="Opens a real GMAT script of this orbit in the workspace and runs it">See the real physics in GMAT ↗</button>
        <button className="btn big" onClick={() => onPick(sel)}>Use this orbit → build the spacecraft</button>
      </div>
    </div>
  )
}

// ---------- Hangar ----------

export function Hangar({ design, setDesign, iterations, onSubmit }: {
  design: Design
  setDesign: (d: Design) => void
  iterations: number
  onSubmit: () => void
}) {
  const stats = useMemo(() => computeStats(design, iterations), [design, iterations])
  const deck = useMemo(() => buildDeck(design, stats), [design, stats])
  const [group, setGroup] = useState<Group>('bus')
  const groups = GROUP_ORDER.filter((g) => design.mode !== 'A' || !ROVER_GROUPS.includes(g))
  const parts = PARTS.filter((p) => p.group === group)
  const cls = (s: 'ok' | 'warn' | 'fail') => (s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : 'bad')
  const mass = stats.checks.find((c) => c.id === 'mass')!
  const power = stats.checks.find((c) => c.id === 'power')!

  return (
    <div className="hangar">
      <aside className="col catalog">
        <h3>Catalog</h3>
        <div className="tabs">
          {groups.map((g) => {
            const n = PARTS.filter((p) => p.group === g && design.partIds.includes(p.id)).length
            return <button key={g} className={`tab ${g === group ? 'on' : ''}`} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}{n > 0 && <i>{n}</i>}</button>
          })}
        </div>
        <div className="parts">
          {parts.map((p: Part) => {
            const on = design.partIds.includes(p.id)
            return (
              <button key={p.id} className={`part ${on ? 'on' : ''}`} onClick={() => setDesign(togglePart(design, p))}>
                <div className="part-head"><b>{p.name}</b><span>${p.costM}M</span></div>
                <div className="part-stats">
                  <span>{p.massKg} kg</span>
                  {p.genW ? <span>+{p.genW} W</span> : p.drawW ? <span>{p.drawW} W</span> : null}
                  {p.batteryWh ? <span>{p.batteryWh} Wh</span> : null}
                  {p.storageGb ? <span>{p.storageGb} Gb</span> : null}
                  {p.downlinkGb ? <span>{p.downlinkGb} Gb/window</span> : null}
                  {p.dvMs ? <span>{p.dvMs} m/s</span> : null}
                  {p.slots ? <span>{p.slots} slots</span> : null}
                  <span className={p.rel < 0.9 ? 'low' : ''}>rel {pct(p.rel)}</span>
                </div>
                <p>{p.note}</p>
                {p.cards?.length ? <em>adds: {p.cards.map((c) => CARD[c].name).join(', ')}</em> : null}
              </button>
            )
          })}
        </div>
      </aside>

      <main className="col center">
        <div className="ship-wrap">
          <Ship3D partIds={design.partIds} />
          <div className="launcher-row">
            <span>Launcher</span>
            {LAUNCHERS.map((l) => (
              <button key={l.id} className={`chip ${design.launcherId === l.id ? 'on' : ''}`} onClick={() => setDesign({ ...design, launcherId: l.id })}>
                {l.name.replace(' launcher', '')} · {l.capacityKg} kg · ${l.costM}M
              </button>
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => setDesign({ ...design, partIds: starterFor(design.mode, design.orbitId) })}>Suggested starter</button>
          <button className="btn ghost" onClick={() => setDesign({ ...design, partIds: [] })}>Clear</button>
          <button className="btn big" disabled={stats.errors.length > 0} onClick={onSubmit}>Submit to design review ▶</button>
        </div>
        {stats.errors.length > 0 && (
          <ul className="errors">{stats.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
        <p className="hint">Iterations used: {iterations}/{MAX_ITERATIONS} · each costs ${ITERATION_COST_M}M of reserve.</p>
      </main>

      <aside className="col side" tabIndex={0} aria-label="Live resources">
        <h3>Live resources</h3>
        <Meter label="MASS (kg)" value={stats.massKg} max={stats.capacityKg} tone={mass.status === 'ok' ? 'ok' : mass.status === 'warn' ? 'warn' : 'bad'} hint="Total spacecraft mass against the rocket's capacity." />
        <Meter label={`BUDGET ($M) · MISSION ${design.mode}`} value={Math.max(0, stats.budgetM - stats.budgetLeftM)} max={stats.budgetM} text={`$${Math.round(stats.budgetM - stats.budgetLeftM)}M / $${stats.budgetM}M`} tone={cls(stats.checks[2].status)} />
        <Meter label="POWER" value={stats.demandW} max={Math.max(stats.genW, stats.demandW, 1)} text={`${Math.round(stats.demandW)} W of ${Math.round(stats.genW)} W`} tone={cls(power.status)} />
        <Meter label="FUEL (m/s)" value={stats.dvNeededMs} max={Math.max(stats.dvTankMs, stats.dvNeededMs, 1)} text={`needs ${stats.dvNeededMs} · has ${stats.dvTankMs}`} tone={stats.dvTankMs >= stats.dvNeededMs ? 'ok' : 'bad'} />
        <Meter label="INSTRUMENT SLOTS" value={stats.slotsUsed} max={Math.max(stats.slotsMax, stats.slotsUsed, 1)} text={`${stats.slotsUsed} / ${stats.slotsMax}`} tone={stats.slotsUsed > stats.slotsMax ? 'bad' : 'ok'} />

        <h3>Review checklist</h3>
        <ul className="checks">
          {stats.checks.map((c) => (
            <li key={c.id} className={c.status} title={c.why}><span>{statusIcon(c.status)}</span><div><b>{c.label}</b><small>{c.value}</small></div></li>
          ))}
        </ul>

        <h3><Term k="deck">Trouble deck</Term> <small>{deck.length} things that can go wrong</small></h3>
        <ul className="deck" tabIndex={0} aria-label="Trouble deck">
          {deck.map((e, k) => (
            <li key={k} className={CARD[e.cardId].level}><b>{CARD[e.cardId].name}</b><small>{e.because}</small></li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

// ---------- Revisión ----------

export function Review({ design, iterations, onApprove, onIterate, onForce }: {
  design: Design
  iterations: number
  onApprove: () => void
  onIterate: () => void
  onForce: () => void
}) {
  const stats = useMemo(() => computeStats(design, iterations), [design, iterations])
  const items = useMemo(() => reviewDesign(stats), [stats])
  const passed = reviewPassed(items)
  const lines = useMemo(() => reviewLines(items, passed, iterations), [items, passed, iterations])
  const [done, setDone] = useState(false)

  if (!done) return <Dialogue lines={lines} onDone={() => setDone(true)} startScene="review" />
  const FRIENDLY: Record<string, [string, string]> = {
    mass: ['', 'Light enough for the rocket'],
    power: ['', 'Enough power, even in the Moon\'s shadow'],
    budget: ['', 'Money left for surprises'],
    science: ['', 'Can answer the science question'],
    data: ['', 'Can send all the data home'],
  }
  const failed = items.filter((i) => !i.pass).length
  return (
    <div className="page narrow review2">
      <div className={`verdict ${passed ? 'ok' : 'no'}`}>
        <span>{passed ? 'GO' : 'NO GO'}</span>
        <div>
          <h2>{passed ? 'Approved for launch!' : 'Not ready yet'}</h2>
          <p>{passed ? 'The review panel signed off on your design. Time to fly.' : `The panel found ${failed} problem${failed === 1 ? '' : 's'}. You can fix the design or take the risk and launch anyway.`}</p>
        </div>
      </div>
      <ul className="checks2">
        {items.map((i) => {
          const [, label] = FRIENDLY[i.id] ?? ['', i.label]
          return (
            <li key={i.id} className={i.pass ? 'ok' : 'fail'}>
              <span className="ic">{String(items.indexOf(i) + 1).padStart(2, '0')}</span>
              <div><b>{label}</b><small>{i.say}</small><em>Checked by {CHARS[i.reviewer as keyof typeof CHARS]?.name ?? 'the panel'} · rule: {i.label}</em></div>
              <span className="mark">{i.pass ? 'PASS' : 'FIX'}</span>
            </li>
          )
        })}
      </ul>
      {passed ? (
        <div className="actions"><button className="btn big" onClick={onApprove}>Go to the launch pad </button></div>
      ) : (
        <div className="choice">
          <div className="card">
            <h3>Fix the design</h3>
            <p>Back to the hangar to change parts. Costs ${ITERATION_COST_M}M but calms the team (−10 stress). {iterations >= MAX_ITERATIONS ? 'No more tries left.' : `${MAX_ITERATIONS - iterations} tries left.`}</p>
            <button className="btn" disabled={iterations >= MAX_ITERATIONS} onClick={onIterate}>Back to the hangar</button>
          </div>
          <div className="card danger">
            <h3>Launch anyway</h3>
            <p>Risky: the spacecraft starts more stressed and with 2 extra big problems waiting. If it is too heavy, the rocket will not even lift off.</p>
            <button className="btn warn" onClick={onForce}>Launch anyway</button>
          </div>
        </div>
      )}
    </div>
  )
}
