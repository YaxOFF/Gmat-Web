import { useEffect, useRef, useState } from 'react'
import type { LaunchOutcome } from '../engine/mission'
import { cachedTransfer, liveTransfer } from '../gmat'
import { ASC_END, LABELS, T_LIFT, mountJourney, newCtl, type Cam, type Hud, type Phase, type Track } from './journeyScene'

const PHASE: Record<Phase, string> = {
  countdown: 'Countdown', liftoff: 'Liftoff', ascent: 'Ascent', tli: 'Trans-lunar injection',
  coast: 'Coast to the Moon', approach: 'Lunar approach', loi: 'Lunar orbit insertion', orbit: 'Lunar orbit',
}
const LAYER: Record<string, string> = {
  troposphere: 'TROPOSPHERE · 0–12 km', stratosphere: 'STRATOSPHERE · 12–50 km', mesosphere: 'MESOSPHERE · 50–85 km',
  thermosphere: 'THERMOSPHERE · 85–600 km', karman: 'KÁRMÁN LINE · 100 km · space begins',
}
const LABEL: Record<(typeof LABELS)[number], string> = { earth: 'Earth', moon: 'Moon', tli: 'TLI', loi: 'LOI', straight: 'Straight line (not how it flies)' }
const ORDER: Phase[] = ['countdown', 'liftoff', 'ascent', 'tli', 'coast', 'approach', 'loi', 'orbit']

/**
 * Lanzamiento que sale bien (o se pierde en la LOI): despegue, capas de la atmósfera y el viaje con la trayectoria
 * que GMAT calcula en vivo al pulsar Launch. Sin motor usa una corrida guardada. Las tiradas siguen siendo del juego.
 */
export function MoonJourney3D({ launch, orbitId, onDone }: { launch: LaunchOutcome; orbitId: string; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const labels = useRef<Partial<Record<(typeof LABELS)[number], HTMLDivElement | null>>>({})
  const ctl = useRef(newCtl({ stopAtPeri: launch.status === 'lost', straight: false }))
  const [hud, setHud] = useState<Hud>({ phase: 'countdown', layer: null, T: 0, tEnd: 0, alt: 0, dMoon: null, speed: null, count: T_LIFT, playing: false, cine: true, done: false })
  const [source, setSource] = useState<'live' | 'cached' | 'pending'>('pending')
  const [cam, setCam] = useState<Cam>('follow')
  const [fast, setFast] = useState(false)

  useEffect(() => {
    let live: Track | null = null, cached: Track | null = null, liveDone = false
    const t0 = Date.now()
    liveTransfer(orbitId).then((tr) => { live = tr; liveDone = true })
    cachedTransfer().then((tr) => { cached = tr })
    const off = mountJourney(host.current!, {
      // La corrida en vivo tarda ~5 s; si falla o pasan 30 s, la guardada.
      getTrack: () => {
        const tr = live ?? (liveDone || Date.now() - t0 > 30000 ? cached : null)
        if (tr) setSource(tr === live ? 'live' : 'cached')
        return tr
      },
      ctl: ctl.current, labels: labels.current, flash: () => flash.current,
      onHud: (h) => setHud((p) => ({ ...p, ...h })),
    })
    return off
  }, [orbitId])

  const c = ctl.current
  const reached = (p: Phase) => ORDER.indexOf(hud.phase) >= ORDER.indexOf(p)
  // Las tarjetas de Mission Control aparecen cuando la escena llega a su momento.
  const when = (label: string) => label === 'Launch' ? reached('liftoff') : label === 'Solar array deployment' ? reached('tli')
    : label === 'Lunar orbit insertion' ? reached('loi') || (launch.status === 'lost' && hud.done) : true
  const shown = launch.events.filter((e) => when(e.label))
  const tag = hud.count != null ? `T−${hud.count}` : launch.status === 'lost' && hud.done ? 'SIGNAL LOST' : hud.phase === 'orbit' ? 'ORBIT ACHIEVED' : ''
  const km = (v: number) => `${Math.round(v).toLocaleString('en-US')} km`
  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      <div ref={flash} style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0, pointerEvents: 'none' }} />
      {LABELS.map((k) => (
        <div key={k} ref={(el) => { labels.current[k] = el }} style={{ position: 'absolute', left: 0, top: 0, display: 'none', pointerEvents: 'none', font: '12px sans-serif', whiteSpace: 'nowrap', color: k === 'straight' ? '#ffb347' : '#fff', textShadow: '0 0 3px #000' }}>{LABEL[k]}</div>
      ))}
      {tag && <div className={`dlg-sfx ${tag === 'SIGNAL LOST' ? 'bad' : 'good'}`}><span>{tag}</span></div>}
      <div className="ds-hud" style={{ width: 360 }}>
        <div>MISSION CONTROL · {PHASE[hud.phase].toUpperCase()}</div>
        <div className="hint">
          Altitude {hud.alt < 10 ? `${hud.alt.toFixed(2)} km` : km(hud.alt)}
          {hud.dMoon != null && <> · Moon {km(hud.dMoon)}</>}
          {hud.speed != null && <> · {hud.speed.toFixed(2)} km/s</>}
          {!hud.cine && <> · day {(hud.T / 86400).toFixed(1)}</>}
        </div>
        {hud.layer && <div className="hint" style={{ color: 'var(--amber)' }}>{LAYER[hud.layer]}</div>}
        <div className="hint" style={{ color: 'var(--dim)' }}>
          {hud.cine ? 'Launch and ascent: illustration' : source === 'live' ? 'Trajectory: computed live by GMAT' : 'Trajectory: saved GMAT run (engine offline)'}
        </div>
        {shown.map((e, i) => (
          <div key={i} className="hint" style={{ color: e.result === 'fail' ? 'var(--red)' : e.result === 'partial' ? 'var(--amber)' : 'var(--green)' }}>
            › {e.label}{e.p != null ? ` · ${Math.round(e.p * 100)}% chance → ${e.result?.toUpperCase()}` : ''}<br /><span style={{ color: 'var(--dim)' }}>{e.text}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
          {hud.cine
            ? <button className="btn small ghost" onClick={() => { c.seekCine = ASC_END }}>Skip launch</button>
            : <>
                {(['follow', 'system', 'moon'] as const).map((k) => (
                  <button key={k} className={`btn small ${cam === k ? '' : 'ghost'}`} onClick={() => { c.cam = k; c.camChanged = true; setCam(k) }}>
                    {k === 'follow' ? 'Chase' : k === 'system' ? 'Earth–Moon' : 'Moon'}
                  </button>
                ))}
                <button className="btn small ghost" onClick={() => { c.speed = fast ? 30000 : 90000; setFast(!fast) }}>Speed ×{fast ? 3 : 1}</button>
                <button className="btn small ghost" onClick={() => { c.straight = !c.straight }}>Straight line</button>
              </>}
        </div>
      </div>
      {(hud.done || (!hud.cine && hud.phase === 'orbit')) && (
        <div className="rv-end"><button className="btn big" onClick={onDone}>{launch.status === 'ok' ? 'Begin mapping →' : 'Mission report →'}</button></div>
      )}
    </div>
  )
}
