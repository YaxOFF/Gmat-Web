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

export function Title({ onStart, onMars }: { onStart: () => void; onMars: () => void }) {
  return (
    <div className="title-screen">
      <div className="halftone" />
      <div className="title-moon" />
      <div className="title-inner">
        <div className="kicker">NASA SPACE APPS 2026 · SPACE MISSION DESIGN GAME</div>
        <h1>MISSION<br /><b>ARCHITECT</b></h1>
        <p className="tag">Episode 1 · Water on the Moon</p>
        <p className="sub">Design a spacecraft with a tight budget, launch it, and find out <em>why</em> it worked or failed.</p>
        <button className="btn big" onClick={onStart}>START MISSION ▶</button>
        <button className="btn ghost" onClick={onMars}>TRY MARS ▶</button>
        <p className="hint">1 or 4 players · 20–30 min · click, Space or → advances the story</p>
      </div>
    </div>
  )
}

// ---------- Órbita ----------

export function OrbitPick({ design, onPick, onInspect }: { design: Design; onPick: (orbitId: string) => void; onInspect: (orbitId: string) => void }) {
  const [sel, setSel] = useState(design.orbitId)
  const bar = (v: number, max: number) => <div className="mini"><i style={{ width: `${(v / max) * 100}%` }} /></div>
  return (
    <div className="page">
      <h2>Choose the orbit <small>Initial feasibility · CML 2</small></h2>
      <p className="lead">The orbit shapes everything else. No orbit is best: each one trades something away.</p>
      <div className="orbit-grid">
        {ORBITS.map((o) => (
          <button key={o.id} className={`card orbit ${sel === o.id ? 'sel' : ''}`} onClick={() => setSel(o.id)}>
            <div className="orbit-art">
              <svg viewBox="0 0 200 120"><circle cx="100" cy="150" r="90" fill="#b9bdc9" />
                <ellipse cx="100" cy="60" rx={o.id === 'polar_ellip' ? 92 : o.id === 'polar_high' ? 70 : 58} ry={o.id === 'polar_ellip' ? 46 : 26} fill="none" stroke="#d7ff3a" strokeWidth="2" strokeDasharray="6 4" />
              </svg>
            </div>
            <h3>{o.name}</h3>
            <div className="alt">{o.altitude} · period {o.periodMin} min</div>
            <div className="spec"><span>Map sharpness</span>{bar(o.res, 1.5)}</div>
            <div className="spec"><span><Term k="dv">Fuel needed</Term></span>{bar(o.dvInsertion + o.dvKeeping, 1250)}</div>
            <div className="spec"><span><Term k="eclipse">Eclipse</Term> per orbit</span><b>{o.eclipseMin} min</b></div>
            <div className="spec"><span>Rover relay</span><b className="small">{o.relay}</b></div>
            <p className="note">{o.note}</p>
          </button>
        ))}
      </div>
      <div className="orbit-stage">
        <span className="tagline">Schematic view · drag to rotate, scroll to zoom</span>
        <Orbit3D orbitId={sel} partIds={design.partIds} />
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={() => onInspect(sel)}>Inspect in GMAT ↗</button>
        <button className="btn big" onClick={() => onPick(sel)}>Lock orbit → Hangar</button>
      </div>
      <p className="hint">Game values. "Inspect in GMAT" opens a real GMAT script of this orbit (lunar gravity, 3 days) in the workspace and runs it.</p>
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
                {p.cards?.length ? <em>⚠ adds: {p.cards.map((c) => CARD[c].name).join(', ')}</em> : null}
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
          <button className="btn ghost" onClick={() => setDesign({ ...design, partIds: starterFor(design.mode) })}>Suggested starter</button>
          <button className="btn ghost" onClick={() => setDesign({ ...design, partIds: [] })}>Clear</button>
          <button className="btn big" disabled={stats.errors.length > 0} onClick={onSubmit}>Submit to design review ▶</button>
        </div>
        {stats.errors.length > 0 && (
          <ul className="errors">{stats.errors.map((e) => <li key={e}>✖ {e}</li>)}</ul>
        )}
        <p className="hint">Iterations used: {iterations}/{MAX_ITERATIONS} · each costs ${ITERATION_COST_M}M of reserve.</p>
      </main>

      <aside className="col side">
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

        <h3><Term k="deck">Ship's deck</Term> <small>{deck.length} cards</small></h3>
        <ul className="deck">
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
  return (
    <div className="page narrow">
      <h2>Design review <small>{passed ? 'Approved' : 'Rejected'}</small></h2>
      <ul className="checks big">
        {items.map((i) => <li key={i.id} className={i.pass ? 'ok' : 'fail'}><span>{i.pass ? '✔' : '✖'}</span><div><b>{i.label}</b><small>{i.say}</small></div></li>)}
      </ul>
      {passed ? (
        <div className="actions"><button className="btn big" onClick={onApprove}>Proceed to launch ▶</button></div>
      ) : (
        <div className="choice">
          <div className="card">
            <h3>Iterate</h3>
            <p>Go back to the hangar. −${ITERATION_COST_M}M of reserve, −10 stress. {iterations >= MAX_ITERATIONS ? 'No iterations left.' : `${MAX_ITERATIONS - iterations} left.`}</p>
            <button className="btn" disabled={iterations >= MAX_ITERATIONS} onClick={onIterate}>Back to hangar</button>
          </div>
          <div className="card danger">
            <h3>Force the launch</h3>
            <p>+15 stress and 2 extra major trouble cards. If the mass is over capacity, the rocket will not lift.</p>
            <button className="btn warn" onClick={onForce}>Launch anyway</button>
          </div>
        </div>
      )}
    </div>
  )
}
