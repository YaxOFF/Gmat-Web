import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { CRATERS, ORBIT } from '../data/catalog'
import type { Design } from '../data/types'
import { BEST_SITE, siteTier, type EndingId, type Mission, type ScoreBreakdown } from '../engine/mission'
import { observe } from '../engine/observe'
import { ENDINGS, siteTalk } from '../story/scripts'
import { Dialogue } from './Dialogue'
import { pct } from '../engine/rng'

// ---------- Elegir el sitio de aterrizaje ----------

export function Site({ mission, design, onPick }: { mission: Mission; design: Design; onPick: (id: string) => void }) {
  const hyd = useMemo(() => Object.fromEntries(CRATERS.map((c) => [c.id, (mission.quality[c.id]?.hydrogen ?? 0) >= 0.4])), [mission])
  const lines = useMemo(() => siteTalk(mission.mapped, hyd), [mission.mapped, hyd])
  const [talk, setTalk] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const orbit = ORBIT[design.orbitId]
  const hasRelay = design.partIds.includes('relay')

  if (talk) return <Dialogue lines={lines} onDone={() => setTalk(false)} startScene="lab" />
  return (
    <div className="page">
      <h2>Pick the landing site <small>Act II · click a crater on the map or in the table</small></h2>
      <p className="lead">This is what Selene's data says. A "?" is a bet. Phase 2's rover lands on the sunlit rim of the crater you choose.</p>
      <div className="site-layout">
      <svg className="site-map" viewBox="0 0 100 100" aria-label="South pole map">
        <defs><clipPath id="siteclip"><circle cx="50" cy="50" r="47" /></clipPath></defs>
        <circle cx="50" cy="50" r="47" fill="#5a5f73" />
        <image href={`${import.meta.env.BASE_URL}moon/southpole.png`} x="0" y="0" width="100" height="100" clipPath="url(#siteclip)" preserveAspectRatio="none" />
        {CRATERS.map((c) => (
          <g key={c.id} onClick={() => setSel(c.id)} style={{ cursor: 'pointer' }}>
            <circle cx={c.x} cy={c.y} r={sel === c.id ? 7 : 5} fill="#0a0f1c99" stroke={sel === c.id ? '#5cc8f0' : '#e8ecf6aa'} strokeWidth={sel === c.id ? 1.4 : 0.6} />
            <text x={c.x} y={c.y + 11} textAnchor="middle" fontSize="3.6" fill="#fff" fontWeight="700" paintOrder="stroke" stroke="#0a0f1c" strokeWidth="0.8">{c.name}</text>
          </g>
        ))}
      </svg>
      <div className="table-wrap">
        <table className="matrix">
          <thead><tr><th></th><th>Hydrogen</th><th>Terrain</th><th>Slopes</th><th>Temperature</th><th>Relay from {orbit.name.toLowerCase()}</th></tr></thead>
          <tbody>
            {CRATERS.map((c) => {
              const q = mission.quality[c.id] ?? {}
              const cells = (['hydrogen', 'terrain', 'slope', 'temperature'] as const).map((l) => observe(c, l, q[l]))
              return (
                <tr key={c.id} className={sel === c.id ? 'sel' : ''} onClick={() => setSel(c.id)}>
                  <th>{c.name}<small>{c.blurb}</small></th>
                  {cells.map((o, k) => <td key={k} className={o.known}>{o.text}</td>)}
                  <td className="range">{orbit.relay}{!hasRelay && <small className="needs"> · rover will need a UHF radio</small>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </div>
      {design.mode === 'A' && <p className="hint">You are flying Mission A (orbiter only), so no rover lands this time. Pick "Touch it" when planning the mission to drive Buscador.</p>}
      <div className="actions">
        <button className="btn big" disabled={!sel} onClick={() => sel && onPick(sel)}>
          {!sel ? 'Select a crater' : design.mode === 'A' ? `Recommend ${CRATERS.find((c) => c.id === sel)!.name} for a future rover ▶` : `Send the rover to ${CRATERS.find((c) => c.id === sel)!.name} ▶`}
        </button>
      </div>
    </div>
  )
}

// ---------- Reporte final ----------

export function Report({ ending, mission, score, siteId, onRetry, onNew, extra }: {
  ending: EndingId
  mission: Mission | null
  score: ScoreBreakdown
  siteId: string | null
  onRetry: () => void
  onNew: () => void
  extra?: ReactNode
}) {
  const info = ENDINGS[ending]
  const log = mission?.log ?? []
  const best = CRATERS.find((c) => c.id === BEST_SITE)!
  return (
    <div className="page report">
      <div className={`ending end-${ending}`}>
        <div className="ending-icon">{info.icon}</div>
        <div>
          <h2>{info.name}</h2>
          <p>{info.blurb}</p>
        </div>
        <div className="rank"><small>RANK</small><b>{score.rank}</b><span>{score.total} pts</span></div>
      </div>
      {extra}

      <div className="report-grid">
        <section>
          <h3>How your score adds up</h3>
          <table className="score">
            <tbody>
              <tr><td>Science that reached Earth ({pct(score.transmitFraction)} of data)</td><td>{score.science}</td></tr>
              <tr><td>Money left over (×2)</td><td>{score.budget}</td></tr>
              <tr><td>Spacecraft health at the end</td><td>{score.stress}</td></tr>
              <tr><td>Landing-site bonus{siteId ? ` (${ siteTier(siteId) })` : ''}</td><td>{score.site}</td></tr>
              <tr><td>Picked the site using hydrogen data</td><td>{score.informed}</td></tr>
              <tr className="total"><td>Total</td><td>{score.total}</td></tr>
            </tbody>
          </table>
          {siteId && siteId !== BEST_SITE && <p className="hint">The best site on the map was <b>{best.name}</b> ({best.h} wt% hydrogen, {best.terrain} terrain).</p>}
        </section>

        <section>
          <h3>Why things happened <small>your choices and what they led to</small></h3>
          <ol className="causes">
            {log.length === 0 && <li>Nothing flew, so nothing happened.</li>}
            {log.map((l, k) => <li key={k} className={`k-${l.kind}`}>{l.text.replace(/^Cycle (\d+):/, 'Mapping pass $1:').replace(/^Hangar:/, 'In the hangar:')}</li>)}
          </ol>
        </section>

        <section>
          <h3>Like the real thing</h3>
          <ul className="real">
            <li><b>Lunar Prospector (1998):</b> a neutron spectrometer found hydrogen near the poles — the same job as your Selene.</li>
            <li><b>LCROSS (2009):</b> hit Cabeus and found water in the plume — why Cabeus is on your map.</li>
            <li><b>LRO (2009–):</b> a radiometer measured some of the coldest places in the solar system.</li>
            <li><b>VIPER:</b> NASA's planned south-pole rover. Phase 2 of this story.</li>
          </ul>
        </section>
      </div>

      <div className="actions">
        <button className="btn big" onClick={onRetry}>Retry with this design</button>
        <button className="btn ghost" onClick={onNew}>New game</button>
      </div>
      <p className="hint">Numbers are simplified for the game. The orbits themselves can be checked with real physics in GMAT.</p>
    </div>
  )
}
