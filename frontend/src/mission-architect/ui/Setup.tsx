import { useState } from 'react'
import { MODE_BUDGET_M, MODE_MULT, BUDGET_M } from '../data/catalog'
import type { MissionMode } from '../data/types'
import { ROLES, type Role, type Team } from '../engine/roles'
import { MissionPatch } from './Patch'

const MODES: { id: MissionMode; icon: string; title: string; q: string; what: string; stars: number; tag?: string }[] = [
  { id: 'A', icon: '', title: 'Map it', q: 'Where is the hydrogen?', what: 'Fly an orbiter, map the south pole and point to the best crater.', stars: 1 },
  { id: 'B', icon: '', title: 'Touch it', q: 'Is it really ice?', what: 'Orbiter + a rover that lands, drives into the dark and drills.', stars: 2, tag: 'Recommended' },
  { id: 'C', icon: '', title: 'Measure it', q: 'How much ice, and how deep?', what: 'Adds a radar and a 2 m drill. Bigger budget, harder choices.', stars: 3 },
]
const FLOW = ['Pick an orbit', 'Build the spacecraft', 'Launch', 'Map the craters', 'Land & explore']

export function Setup({ mode, team, onDone }: {
  mode: MissionMode; team: Team; onDone: (mode: MissionMode, team: Team) => void
}) {
  const [m, setM] = useState<MissionMode>(mode)
  const [t, setT] = useState<Team>(team)
  const setName = (r: Role, v: string) => setT({ ...t, names: { ...t.names, [r]: v } })
  const setPlayers = (n: 1 | 4) => setT({
    players: n,
    names: n === 1 ? { Director: 'You', Systems: 'You', Science: 'You', Comms: 'You' } : { Director: 'Player 1', Systems: 'Player 2', Science: 'Player 3', Comms: 'Player 4' },
  })
  const pick = MODES.find((x) => x.id === m)!
  return (
    <div className="page setup2">
      <h2>Plan your mission</h2>
      <p className="lead">Three quick choices and you are ready to design your spacecraft.</p>

      <section className="step">
        <h3><i>01</i> Who is playing?</h3>
        <div className="pick-row">
          <button className={`pick ${t.players === 1 ? 'sel' : ''}`} aria-pressed={t.players === 1} onClick={() => setPlayers(1)}>
            <span className="pick-icon">1 player</span><b>Solo</b><small>You make every decision.</small>
          </button>
          <button className={`pick ${t.players === 4 ? 'sel' : ''}`} aria-pressed={t.players === 4} onClick={() => setPlayers(4)}>
            <span className="pick-icon">4 players</span><b>Team of 4</b><small>Each person takes a role. Pass the mouse when it is your turn.</small>
          </button>
        </div>
        {t.players === 4 && (
          <div className="crew">
            {ROLES.map((r) => (
              <label key={r.id} className="crew-card" style={{ borderColor: r.color }}>
                <span><span className="code">{r.icon}</span> {r.title}</span>
                <input value={t.names[r.id]} onChange={(e) => setName(r.id, e.target.value)} maxLength={16} aria-label={`${r.title} name`} />
                <small>Goal: {r.main[1]}</small>
              </label>
            ))}
          </div>
        )}
        {t.players === 1 && (
          <details className="goals">
            <summary>Bonus goals you can earn</summary>
            <ul>{ROLES.map((r) => <li key={r.id}><span className="code">{r.icon}</span> <b>{r.main[0]}</b>: {r.main[1]}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="step">
        <h3><i>02</i> What do you want to find out?</h3>
        <div className="pick-row three">
          {MODES.map((x) => (
            <button key={x.id} className={`pick mode2 ${m === x.id ? 'sel' : ''}`} aria-pressed={m === x.id} onClick={() => setM(x.id)}>
              {x.tag && <em className="tag2">{x.tag}</em>}
              <span className="pick-icon">Mission {x.id}</span>
              <b>{x.title}</b>
              <span className="q2">"{x.q}"</span>
              <small>{x.what}</small>
              <span className="meta2">Difficulty {x.stars}/3 · ${BUDGET_M + MODE_BUDGET_M[x.id]}M budget · points ×{MODE_MULT[x.id]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="step final">
        <MissionPatch mode={m} size={200} />
        <div>
          <h3><i>03</i> Your mission patch</h3>
          <p>Every real mission gets one. Yours says: <b>{pick.title}</b> — {pick.q.toLowerCase()}</p>
          <ol className="flow">{FLOW.slice(0, m === 'A' ? 4 : 5).map((f) => <li key={f}>{f}</li>)}</ol>
          <button className="btn big" onClick={() => onDone(m, t)}>Start designing →</button>
        </div>
      </section>
    </div>
  )
}
