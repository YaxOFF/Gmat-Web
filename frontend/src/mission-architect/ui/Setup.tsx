import { useState } from 'react'
import { MODE_BUDGET_M, MODE_MULT, BUDGET_M } from '../data/catalog'
import type { MissionMode } from '../data/types'
import { ROLES, type Role, type Team } from '../engine/roles'

const MODES: { id: MissionMode; q: string; what: string; diff: string }[] = [
  { id: 'A', q: '"Where is there hydrogen?"', what: 'Orbiter only. Map the south pole and pick the best site for a future rover.', diff: 'Easy' },
  { id: 'B', q: '"Is it really ice?"', what: 'Orbiter + lander + rover with a drill. Land, drive into the dark and confirm the ice.', diff: 'Normal · recommended' },
  { id: 'C', q: '"How much ice, and how deep?"', what: 'Orbiter with SAR radar + rover with the 2 m deep drill. Measure the deposit.', diff: 'Hard' },
]

/** La "servilleta": boceto a mano de la misión elegida. Aparece también en el reporte final. */
export function Napkin({ mode, small }: { mode: MissionMode; small?: boolean }) {
  return (
    <svg className={`napkin ${small ? 'small' : ''}`} viewBox="0 0 320 220" key={mode}>
      <rect width="320" height="220" fill="#f4efe1" />
      <path d="M160 0 V220 M0 110 H320" stroke="#e2dccb" strokeWidth="2" />
      <g fill="none" stroke="#1d2a6b" strokeWidth="2.4" strokeLinecap="round" className="ink">
        <path d="M70 150 a60 60 0 1 0 120 0 a60 60 0 1 0 -120 0" />
        <path d="M95 135 q6 -8 14 0 M140 175 q5 -6 12 0 M150 120 q4 -5 9 0" />
        <ellipse cx="130" cy="150" rx="95" ry="38" transform="rotate(-18 130 150)" strokeDasharray="6 5" />
        <path d="M205 96 h18 v12 h-18 z M196 102 h-12 M232 102 h12" />
        {mode === 'C' && <path d="M214 110 q-10 12 0 24 M220 110 q-16 16 0 32" stroke="#c0245c" />}
        {mode !== 'A' && <>
          <path d="M214 118 C 220 160, 180 190, 150 205" strokeDasharray="3 4" stroke="#c0245c" />
          <path d="M142 200 h18 l4 6 h-26 z M145 210 a3 3 0 1 0 0.1 0 M157 210 a3 3 0 1 0 0.1 0" />
          {mode === 'C' && <path d="M166 204 v14" stroke="#c0245c" strokeWidth="3" />}
        </>}
      </g>
      <g className="ink-text" fill="#1d2a6b" fontSize="13">
        <text x="12" y="22">Selene → lunar orbit</text>
        <text x="12" y="40">{mode === 'A' ? 'map H at the S. pole' : mode === 'B' ? '+ Buscador: drill the ice!' : '+ radar + 2 m drill'}</text>
        <text x="236" y="210">MISSION {mode}</text>
      </g>
    </svg>
  )
}

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
  return (
    <div className="page setup">
      <h2>The cocktail napkin <small>Briefing · CML 1</small></h2>
      <div className="setup-grid">
        <section>
          <h3>1 · The team</h3>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className={`btn small ${t.players === 1 ? '' : 'ghost'}`} onClick={() => setPlayers(1)}>1 player (all roles)</button>
            <button className={`btn small ${t.players === 4 ? '' : 'ghost'}`} onClick={() => setPlayers(4)}>4 players (one role each)</button>
          </div>
          {ROLES.map((r) => (
            <div key={r.id} className="role" style={{ borderColor: r.color }}>
              <div className="role-head"><span>{r.icon} <b>{r.title}</b></span>
                {t.players === 4 && <input value={t.names[r.id]} onChange={(e) => setName(r.id, e.target.value)} maxLength={16} />}</div>
              <div className="hint">Mission: <b>{r.main[0]}</b> — {r.main[1]}</div>
              {t.players === 4 && <div className="hint secret">Secret (keep it to yourself): <b>{r.secret[0]}</b> — {r.secret[1]}</div>}
            </div>
          ))}
        </section>
        <section>
          <h3>2 · The question</h3>
          {MODES.map((x) => (
            <button key={x.id} className={`card mode ${m === x.id ? 'sel' : ''}`} onClick={() => setM(x.id)}>
              <div className="mode-head"><b>Mission {x.id}</b><span>{x.diff} · score ×{MODE_MULT[x.id]}</span></div>
              <div className="mode-q">{x.q}</div>
              <p>{x.what}</p>
              <span className="hint">Budget ${BUDGET_M + MODE_BUDGET_M[x.id]}M</span>
            </button>
          ))}
        </section>
        <section>
          <h3>3 · The sketch</h3>
          <Napkin mode={m} />
          <p className="hint">Every real mission starts like this: a sketch on a napkin. It goes into your final report.</p>
          <div className="actions"><button className="btn big" onClick={() => onDone(m, t)}>Approve the napkin → Orbit</button></div>
        </section>
      </div>
    </div>
  )
}
