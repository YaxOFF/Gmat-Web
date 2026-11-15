// Pestaña "Journey": la escena del viaje (three/journeyScene.ts) con los controles del editor.
import { useEffect, useMemo, useRef, useState } from 'react'
import { en as es } from '../i18n/en'
import { ASC_END, LABELS, T_LIFT, mountJourney, newCtl, pickShip, track, type Cam, type Hud, type Track } from '../mission-architect/three/journeyScene'
import { useApp } from '../store'
import s from './Results.module.css'

const fmt = (km: number) => `${Math.round(km).toLocaleString('en-US')} km`
const met = (T: number) => `${Math.floor(T / 86400)}d ${Math.floor((T % 86400) / 3600)}h ${String(Math.floor((T % 3600) / 60)).padStart(2, '0')}m`

function Journey({ tr }: { tr: Track }) {
  const host = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const labels = useRef<Partial<Record<(typeof LABELS)[number], HTMLDivElement | null>>>({})
  const ctl = useRef(newCtl())
  const [hud, setHud] = useState<Hud>({ phase: 'countdown', layer: null, T: 0, tEnd: 0, alt: 0, dMoon: null, speed: null, count: T_LIFT, playing: false, cine: true, done: false })
  const [cam, setCam] = useState<Cam>('follow')
  const [speed, setSpeed] = useState(30000)
  const [straight, setStraight] = useState(true)

  useEffect(() => mountJourney(host.current!, {
    getTrack: () => tr, ctl: ctl.current, labels: labels.current, flash: () => flash.current,
    onHud: (h) => setHud((p) => ({ ...p, ...h })),
  }), [tr])

  const c = ctl.current
  const J = es.journey
  const layer = hud.layer ? J.layers[hud.layer] : null
  return (
    <div className={s.root}>
      <div className={s.bar}>
        {hud.cine
          ? <button className={s.btn} onClick={() => { c.seekCine = ASC_END }}>{J.skip}</button>
          : <>
              <button className={s.btn} onClick={() => { if (c.T >= hud.tEnd) c.T = 0; c.playing = !c.playing; setHud((h) => ({ ...h, playing: c.playing })) }}>{hud.playing ? J.pause : J.play}</button>
              <input type="range" min={0} max={hud.tEnd} step={60} value={hud.T} aria-label={J.time} style={{ flex: 1, minWidth: 120 }}
                onChange={(e) => { c.T = Number(e.target.value); setHud((h) => ({ ...h, T: c.T })) }} />
              <span>{met(hud.T)}</span>
              <label>{J.speed}{' '}
                <select value={speed} onChange={(e) => { c.speed = Number(e.target.value); setSpeed(c.speed) }}>
                  {[3000, 10000, 30000, 100000].map((v) => <option key={v} value={v}>×{v.toLocaleString('en-US')}</option>)}
                </select>
              </label>
              <label>{J.camera}{' '}
                <select value={cam} onChange={(e) => { c.cam = e.target.value as Cam; c.camChanged = true; setCam(c.cam) }}>
                  {(['follow', 'system', 'moon'] as const).filter((k) => k !== 'moon' || tr.moon).map((k) => <option key={k} value={k}>{J.cams[k]}</option>)}
                </select>
              </label>
              {tr.moon && <label><input type="checkbox" checked={straight} onChange={(e) => { c.straight = e.target.checked; setStraight(c.straight) }} /> {J.straight}</label>}
              <button className={s.btn} onClick={() => { c.seekCine = 0 }}>{J.replay}</button>
            </>}
        <span className={s.muted}>{J.hint}</span>
      </div>
      <div className={s.globe} style={{ overflow: 'hidden' }}>
        <div ref={host} style={{ position: 'absolute', inset: 0 }} />
        <div ref={flash} className={s.jFlash} />
        {LABELS.map((k) => (
          <div key={k} ref={(el) => { labels.current[k] = el }} className={`${s.jLabel} ${k === 'straight' ? s.jStraight : ''}`}>{J.labels[k]}</div>
        ))}
        {hud.count != null && <div className={s.jCount}>T−{hud.count}</div>}
        <div className={s.jHud}>
          <div className={s.jPhase}>{J.phases[hud.phase]}</div>
          {!hud.cine && <div>{J.hud.met}: {met(hud.T)}</div>}
          <div>{J.hud.alt}: {hud.alt < 10 ? `${hud.alt.toFixed(2)} km` : fmt(hud.alt)}</div>
          {hud.dMoon != null && <div>{J.hud.moon}: {fmt(hud.dMoon)}</div>}
          {hud.speed != null && <div>{J.hud.speed}: {hud.speed.toFixed(2)} km/s</div>}
          <div className={s.muted}>{hud.cine ? J.illustrative : J.fromGmat}</div>
        </div>
        {layer && <div className={s.jLayer}><b>{layer[0]}</b><span>{layer[1]}</span></div>}
      </div>
    </div>
  )
}

export default function Journey3D() {
  const results = useApp((st) => st.results)
  const ships = results?.ships ?? []
  const [name, setName] = useState('')
  const ship = ships.find((sh) => sh.name === (name || pickShip(ships)))
  const tr = useMemo(() => (ship ? track(ship) : null), [ship])
  if (!results) return <div className={s.empty}>{es.results.none}</div>
  if (!ship || !tr || tr.t.length < 2) return <div className={s.empty}>{es.results.empty}</div>
  return (
    <>
      {ships.length > 1 && (
        <div className={s.bar} style={{ padding: '6px 10px 0' }}>
          <label>{es.journey.ship}{' '}
            <select value={ship.name} onChange={(e) => setName(e.target.value)}>
              {ships.map((sh) => <option key={sh.name} value={sh.name}>{sh.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <Journey key={`${results.runId}${ship.name}`} tr={tr} />
    </>
  )
}
