import { mulberry32 } from '../engine/rng'
import { southPoleImage } from '../three/stage'
import { Orbit3D } from '../three/Orbit3D'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CARD } from '../data/cards'
import { CRATERS, CRATER, CYCLES, ORBIT } from '../data/catalog'
import type { Layer } from '../data/types'
import {
  aggMods, baseQuality, beginCycle, respond, respondP, runCycle,
  type CyclePlan, type CycleReport, type Ctx, type Mission,
} from '../engine/mission'
import { knownFromQuality, LAYER_LABEL, observe } from '../engine/observe'
import { pct, type Rng } from '../engine/rng'
import { ACT1_INTRO, COLD_SPOT_EVENT, ECLIPSE_EVENT, debrief } from '../story/scripts'
import { Dialogue, Strip } from './Dialogue'
import { Meter, StressMeter, Term } from './Hud'

const LAYERS: Layer[] = ['hydrogen', 'terrain', 'slope', 'temperature', 'buriedIce']

function PoleMap({ m, ctx, targets, focus, onToggle, onFocus, small }: {
  small?: boolean
  m: Mission
  ctx: Ctx
  targets: string[]
  focus: string
  onToggle: (id: string) => void
  onFocus: (id: string) => void
}) {
  return (
    <svg className={`polemap ${small ? 'small' : ''}`} viewBox="0 0 100 100">
      <image href={southPoleImage(mulberry32(7))} x="3" y="3" width="94" height="94" />
      <circle cx="50" cy="50" r="47" fill="none" stroke="#26314f" strokeWidth="0.8" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#ffffff30" strokeWidth="0.3" strokeDasharray="1 1.5" />
      <circle cx="50" cy="50" r="15" fill="none" stroke="#ffffff30" strokeWidth="0.3" strokeDasharray="1 1.5" />
      <text x="50" y="97" textAnchor="middle" fontSize="3" fill="#e8ecf6aa">SOUTH POLE · view from above</text>
      {CRATERS.map((c) => {
        const q = m.quality[c.id]?.hydrogen
        const k = knownFromQuality(q)
        const sel = targets.includes(c.id)
        const color = k === 'exact' ? '#62d394' : k === 'range' ? '#ffa94d' : '#1a2033'
        const hot = k !== 'none' && ctx.stats.layers.includes('hydrogen')
        const size = k === 'none' ? 5 : 3.5 + Math.min(c.h, 6) * 0.6
        return (
          <g key={c.id} className="node" onClick={() => onToggle(c.id)} onMouseEnter={() => onFocus(c.id)} style={{ cursor: 'pointer' }}>
            <circle cx={c.x} cy={c.y} r={size + 2.5} fill="none" stroke={sel ? '#ef6f6c' : focus === c.id ? '#fff' : 'transparent'} strokeWidth="1" strokeDasharray={sel ? '0' : '1.5 1'} />
            <circle cx={c.x} cy={c.y} r={size} fill={color} opacity={hot ? 0.92 : 0.8} stroke="#000a" strokeWidth="0.5" />
            <text x={c.x} y={c.y + size + 5} textAnchor="middle" fontSize="3.2" fill="#fff" fontWeight="700" paintOrder="stroke" stroke="#0a0f1c" strokeWidth="0.8">{c.name}</text>
            {k === 'none' && <text x={c.x} y={c.y + 1.2} textAnchor="middle" fontSize="4" fill="#7b8099">?</text>}
          </g>
        )
      })}
    </svg>
  )
}

function Dossier({ m, id }: { m: Mission; id: string }) {
  const c = CRATER[id]
  return (
    <div className="dossier">
      <h4>{c.name}</h4>
      <p className="blurb">{c.blurb}</p>
      <table>
        <tbody>
          {LAYERS.map((l) => {
            const o = observe(c, l, m.quality[id]?.[l])
            return <tr key={l} className={o.known}><td>{LAYER_LABEL[l]}</td><td>{o.text}</td></tr>
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Mapping({ ctx, mission, setMission, rng, onFinish }: {
  ctx: Ctx
  mission: Mission
  setMission: (m: Mission) => void
  rng: Rng
  onFinish: () => void
}) {
  const { stats, design } = ctx
  const orbit = ORBIT[design.orbitId]
  const m = mission
  const [event, setEvent] = useState<'intro' | 'none' | 'done'>(m.cycle === 1 ? 'intro' : 'none')
  const [plan, setPlan] = useState<CyclePlan>({ targets: [], calibrate: false, eclipseSave: false })
  const [focus, setFocus] = useState('cabeus')
  const [report, setReport] = useState<CycleReport | null>(null)
  const cycle = Math.min(report ? report.cycle : m.cycle, CYCLES)
  const [eventDone, setEventDone] = useState<Record<number, boolean>>({})
  const drawnFor = useRef(0)

  // Roba cartas una sola vez por ciclo
  useEffect(() => {
    if (m.cycle > CYCLES || drawnFor.current === m.cycle) return
    drawnFor.current = m.cycle
    setMission(beginCycle(m, rng).m)
  }, [m.cycle]) // eslint-disable-line react-hooks/exhaustive-deps

  const mods = useMemo(() => aggMods(m), [m])
  const toggle = (id: string) =>
    setPlan((p) => ({ ...p, targets: p.targets.includes(id) ? p.targets.filter((t) => t !== id) : p.targets.length >= 2 ? [p.targets[1], id] : [...p.targets, id] }))

  if (m.cycle === 1 && event === 'intro') return <Dialogue lines={ACT1_INTRO} onDone={() => setEvent('done')} startScene="moonOrbit" />
  if (!report && m.cycle === 3 && !eventDone[3]) return <Dialogue lines={ECLIPSE_EVENT} onDone={() => setEventDone({ ...eventDone, 3: true })} startScene="control" />
  if (!report && m.cycle === 4 && !eventDone[4]) return <Dialogue lines={COLD_SPOT_EVENT} onDone={() => setEventDone({ ...eventDone, 4: true })} startScene="control" />

  const doRespond = (uid: number) => setMission(respond(m, uid, rng).m)
  const run = () => {
    const r = runCycle(m, ctx, plan, rng)
    setMission(r.m)
    setReport(r.report)
  }
  const canRun = plan.calibrate || plan.targets.length > 0
  const finished = report && m.cycle > CYCLES
  const qPreview = baseQuality(orbit.res) * mods.qMul * (plan.targets.length === 2 ? 0.65 : 1) * (plan.eclipseSave ? 0.8 : 1) + m.qBonus
  const stored = Math.round(m.storedGb * 10) / 10

  return (
    <div className="mapping">
      <aside className="col">
        <h3>Mapping pass {cycle} of {CYCLES}</h3>
        <div className="passes">{Array.from({ length: CYCLES }, (_, i) => <i key={i} className={i + 1 < cycle ? 'done' : i + 1 === cycle ? 'now' : ''} />)}</div>
        <p className="hint">{m.cycle >= 3 ? <><Term k="eclipse">Eclipse</Term> season: longer dark periods, the battery works harder.</> : <>From pass 3 the <Term k="eclipse">eclipses</Term> get longer.</>}</p>

        <h3>Problems on board</h3>
        {m.cards.filter((c) => !c.resolved).length === 0 && <p className="hint">All quiet. Nothing is going wrong right now.</p>}
        <ul className="cards">
          {m.cards.filter((c) => !c.resolved).map((c) => {
            const d = CARD[c.id]
            return (
              <li key={c.uid} className={d.level}>
                <div className="card-head"><b>{d.name}</b><span>{d.level}</span></div>
                <p>{d.text}</p>
                <small>From: {d.source}</small>
                {d.timer ? <small className="timer">⏱ {Math.max(0, d.timer - c.age)} pass(es) to fix it</small> : null}
                {d.response && !report && (
                  <button className="btn small" disabled={c.tried} onClick={() => doRespond(c.uid)}>
                    {c.tried ? 'Already tried' : `${d.response.role}: ${d.response.label} (${pct(respondP(m, c.uid))})`}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="col center">
        <PoleMap small={!!report} m={m} ctx={ctx} targets={plan.targets} focus={focus} onToggle={toggle} onFocus={setFocus} />
        <div className="map3d">
          <span className="tagline">Selene over the south pole · gold = craters you will scan · drag to rotate</span>
          <Orbit3D orbitId={design.orbitId} highlight={focus} targets={plan.targets} partIds={design.partIds} />
        </div>
        {!report && <div className="plan">
          <div className="plan-row">
            <b>Targets:</b> {plan.targets.length ? plan.targets.map((t) => CRATER[t].name).join(' + ') : 'click up to 2 craters'}
            {plan.targets.length === 2 && <em> · split focus: quality −35%</em>}
          </div>
          <label className={`toggle ${m.cycle !== 1 ? 'disabled' : ''}`}>
            <input type="checkbox" checked={plan.calibrate} disabled={m.cycle !== 1} onChange={(e) => setPlan({ ...plan, calibrate: e.target.checked })} />
            Calibrate instruments first (cycle 1 only: no data now, +20% quality later)
          </label>
          <label className="toggle">
            <input type="checkbox" checked={plan.eclipseSave} onChange={(e) => setPlan({ ...plan, eclipseSave: e.target.checked })} />
            Instruments off in eclipse (battery safer, quality −20%)
          </label>
          <button className="btn big" disabled={!canRun} onClick={run}>Scan the selected craters ▶</button>
        </div>}

        {report && (
          <div className="result">
            <h3>Pass {report.cycle} results</h3>
            <div className="res-grid">
              <div><small>Quality</small><b>{report.calibrated ? '—' : pct(report.quality)}</b></div>
              <div><small>Science</small><b>+{report.sciencePts}</b></div>
              <div><small>Data</small><b>{report.generatedGb.toFixed(0)} Gb made · {report.downlinkedGb.toFixed(0)} Gb sent</b></div>
              <div><small>Battery low</small><b>{Math.round(report.batteryMinPct)}%</b></div>
            </div>
            {report.revealed.length > 0 && (
              <ul className="revealed">{report.revealed.map((r, k) => <li key={k} className={r.known}>{r.crater}: {LAYER_LABEL[r.layer]} {r.known === 'exact' ? 'exact' : '≈ rough'}</li>)}</ul>
            )}
            <Strip lines={debrief(report, m.cards.length > 0)} />
            <button className="btn big" onClick={finished ? onFinish : () => { setReport(null); setPlan({ targets: [], calibrate: false, eclipseSave: false }) }}>
              {finished ? 'Choose the landing site ▶' : `Start cycle ${m.cycle} ▶`}
            </button>
          </div>
        )}
      </main>

      <aside className="col side">
        <StressMeter stress={m.stress} />
        <Meter label="BATTERY" value={m.batteryPct} max={100} text={`${Math.round(m.batteryPct)}%`} tone={m.batteryPct < 40 ? 'warn' : 'ok'} />
        <Meter label="RECORDER (Gb)" value={stored} max={stats.storageGb} tone={stored / Math.max(1, stats.storageGb) > 0.8 ? 'bad' : 'ok'} hint="Data waiting to be sent home." />
        <Meter label="DATA SENT" value={m.transmittedGb} max={Math.max(1, m.generatedGb)} text={`${m.transmittedGb.toFixed(0)} / ${m.generatedGb.toFixed(0)} Gb`} tone="info" hint="Science only counts for the fraction that reaches Earth." />
        <Meter label="FUEL (m/s)" value={Math.max(0, m.dvLeft)} max={Math.max(1, stats.dvTankMs)} text={`${Math.round(m.dvLeft)} m/s`} tone={m.dvLeft < 50 ? 'bad' : 'ok'} />
        <p className="hint">Expected map quality: <b>{pct(Math.max(0, Math.min(1, qPreview)))}</b> (≥75% exact · ≥40% rough)</p>
        <Dossier m={m} id={focus} />
      </aside>

    </div>
  )
}
