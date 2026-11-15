import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { AGE, ANALYSES, LAB_HOURS, MICRO, MINERALS, ORGANICS, announce, type Analysis, type LabResult } from '../data/lab'
import { ROCKS, type RockKind } from '../data/samples'
import { buildTube, coreCanvas } from '../three/CoreSample'
import { at, mountStage } from '../three/stage'

export type Tube = { kind: RockKind; seed: number; pct: number }

/**
 * Laboratorio (final de Marte): los tubos sellados llegan a la Tierra. Con horas limitadas eliges qué analizar
 * en cada tubo y, al final, cuál anuncias como el gran hallazgo.
 */
export function Lab({ tubes, site, onDone }: { tubes: Tube[]; site: string; onDone: (r: LabResult) => void }) {
  const [sel, setSel] = useState(0)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<LabResult | null>(null)
  const [intro, setIntro] = useState(true)
  const used = [...done].reduce((s, k) => s + ANALYSES.find((a) => a.id === k.split(':')[1])!.hours, 0)
  const left = LAB_HOURS - used
  const t = tubes[sel]
  const run = (a: Analysis) => setDone(new Set(done).add(`${sel}:${a}`))
  const has = (i: number, a: Analysis) => done.has(`${i}:${a}`)

  if (intro) return (
    <div className="lab-intro">
      <div>
        <small>SOME YEARS LATER · SAMPLE RECEIVING LAB</small>
        <h2>Your tubes are home</h2>
        <p>A sample-return mission picked up the {tubes.length} tube{tubes.length === 1 ? '' : 's'} Buscador sealed at {site} and brought them to Earth. Now the real work starts: Earth labs can do what no rover can.</p>
        <p>You have <b>{LAB_HOURS} hours</b> of instrument time. You cannot run every test on every tube, so choose. At the end you go in front of the press with <b>one</b> tube.</p>
        <button className="btn big" onClick={() => setIntro(false)}>Enter the lab →</button>
      </div>
    </div>
  )

  return (
    <div className="lab">
      <div className="lab-stage">
        <Lab3D tubes={tubes} sel={sel} onPick={setSel} />
        <div className="lab-rack-tabs">
          {tubes.map((x, i) => (
            <button key={i} className={`lab-tab ${i === sel ? 'sel' : ''}`} onClick={() => setSel(i)}>
              <small>TUBE {i + 1}</small><b>{has(i, 'micro') || has(i, 'xrd') ? ROCKS[x.kind].name : 'Unknown sample'}</b>
            </button>
          ))}
        </div>
      </div>
      <aside className="lab-side">
        <div className="lab-hours"><span>Instrument time</span><b className={left <= 1 ? 'bad' : ''}>{left} h left</b>
          <div className="lab-hbar">{Array.from({ length: LAB_HOURS }, (_, i) => <i key={i} className={i < used ? 'used' : ''} />)}</div>
        </div>
        <h3>Tube {sel + 1} <small>{has(sel, 'micro') || has(sel, 'xrd') ? ROCKS[t.kind].name : 'identify it first'}</small></h3>
        <div className="lab-tools">
          {ANALYSES.map((a) => (
            <button key={a.id} className={`lab-tool ${has(sel, a.id) ? 'done' : ''}`} disabled={has(sel, a.id) || a.hours > left || !!result} onClick={() => run(a.id)}>
              <b>{a.name}</b><small>{a.tool} · {a.hours} h</small><span>{has(sel, a.id) ? 'Done' : a.what}</span>
            </button>
          ))}
        </div>
        <div className="lab-results">
          {has(sel, 'micro') && <Result title="Microscope"><Eyepiece kind={t.kind} seed={t.seed} /><p>{MICRO[t.kind]}</p></Result>}
          {has(sel, 'xrd') && (
            <Result title="Minerals">
              <ul className="lab-bars">{MINERALS[t.kind].map(([m, v]) => <li key={m}><span>{m}</span><i style={{ width: `${v}%` }} /><b>{v}%</b></li>)}</ul>
            </Result>
          )}
          {has(sel, 'organics') && (
            <Result title="Organics">
              <div className="lab-gauge"><i style={{ width: `${ORGANICS[t.kind].level * 100}%` }} /></div>
              <p>{ORGANICS[t.kind].text}</p>
            </Result>
          )}
          {has(sel, 'age') && (
            <Result title="Age"><p className="lab-age">{AGE[t.kind].gyr ? <><b>{AGE[t.kind].gyr}</b> billion years</> : <b>recent</b>}</p><p>{AGE[t.kind].text}</p></Result>
          )}
          {![...done].some((k) => k.startsWith(`${sel}:`)) && <p className="hint">No tests on this tube yet. The microscope is the cheapest way to see what is inside.</p>}
        </div>
        {!result
          ? <button className="btn big lab-announce" onClick={() => setResult(announce(tubes.map((x) => x.kind), sel, done))}>Announce tube {sel + 1} to the press</button>
          : (
            <div className="lab-verdict">
              <small>PRESS CONFERENCE</small>
              <h3>{result.title}</h3>
              <p>{result.text}</p>
              <p className="hint">{result.runs} test{result.runs === 1 ? '' : 's'} run · +{result.points} pts</p>
              <button className="btn big" onClick={() => onDone(result)}>Mission report →</button>
            </div>
          )}
      </aside>
    </div>
  )
}

function Result({ title, children }: { title: string; children: ReactNode }) {
  return <section className="lab-result"><h4>{title}</h4>{children}</section>
}

/** Vista del ocular: un recorte del núcleo ampliado, en un círculo. */
function Eyepiece({ kind, seed }: { kind: RockKind; seed: number }) {
  const src = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 220
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.drawImage(coreCanvas(kind, seed).color, 180, 70, 90, 90, 0, 0, 220, 220)
    const v = g.createRadialGradient(110, 110, 70, 110, 110, 112); v.addColorStop(0, '#0000'); v.addColorStop(1, '#000c')
    g.fillStyle = v; g.fillRect(0, 0, 220, 220)
    g.strokeStyle = '#ffffff55'; g.lineWidth = 1; g.beginPath(); g.moveTo(110, 20); g.lineTo(110, 200); g.moveTo(20, 110); g.lineTo(200, 110); g.stroke()
    g.fillStyle = '#ffffffcc'; g.fillRect(150, 196, 40, 3); g.font = '11px Consolas, monospace'; g.fillText('1 mm', 154, 192)
    return c.toDataURL()
  }, [kind, seed])
  return <img className="lab-eye" src={src} alt="Microscope view" />
}

/** Sala del laboratorio: mesa, gradilla con los tubos y un microscopio; clic en un tubo para tomarlo. */
function Lab3D({ tubes, sel, onPick }: { tubes: Tube[]; sel: number; onPick: (i: number) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const selRef = useRef(sel)
  const pick = useRef(onPick)
  useEffect(() => { selRef.current = sel; pick.current = onPick })
  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer }) => {
    const pm = new THREE.PMREMGenerator(renderer)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.background = new THREE.Color(0x0d1424)
    const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra })
    // Sala: piso, pared con luz azul de sala limpia, mesa blanca.
    scene.add(at(new THREE.Mesh(new THREE.PlaneGeometry(40, 30), mat(0x1a2236, { roughness: 0.3, metalness: 0.2 })), 0, -2, 0).rotateX(-Math.PI / 2))
    scene.add(at(new THREE.Mesh(new THREE.PlaneGeometry(40, 16), mat(0x15203a)), 0, 4, -6))
    for (let i = -3; i <= 3; i++) scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.2), new THREE.MeshBasicMaterial({ color: 0xbfe6ff })), i * 4, 8, -3))
    scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 5), mat(0xb9c2cf, { roughness: 0.5 })), 0, -0.15, 0))
    scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(14, 2, 0.2), mat(0x2b3550)), 0, -1.2, 2.4))
    // Gradilla
    const rack = new THREE.Group(); scene.add(rack)
    rack.add(at(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 1.4), mat(0x8a93a6, { metalness: 0.7, roughness: 0.3 })), 0, 0.15, 0))
    // Barras delante y detrás (no una placa: los tubos se ven enteros).
    for (const z of [-0.36, 0.36]) rack.add(at(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 0.1), mat(0x8a93a6, { metalness: 0.7, roughness: 0.3 })), 0, 1.25, z))
    for (const x of [-2.55, 2.55]) rack.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.82), mat(0x8a93a6, { metalness: 0.7, roughness: 0.3 })), x, 0.75, 0))
    // Tubos (escala 0.45: ~1.6 de alto), de pie en la gradilla.
    const xs = tubes.map((_, i) => (i - (tubes.length - 1) / 2) * 1.6)
    const objs = tubes.map((tb, i) => {
      const g = buildTube(tb.kind, tb.seed, `TUBE ${i + 1} · MARS 2027`)
      g.scale.setScalar(0.45); g.position.set(xs[i], 0.95, 0); g.userData.i = i
      ;(g.userData.cap as THREE.Group).position.y = g.userData.closed
      scene.add(g); return g
    })
    // Microscopio estilizado a la izquierda y un monitor a la derecha.
    const scope = new THREE.Group(); scope.position.set(-4.6, 0, -0.6); scene.add(scope)
    scope.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 1.2), mat(0xf2f4f8)), 0, 0.12, 0))
    scope.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.4), mat(0xf2f4f8)), 0, 1.1, -0.4))
    scope.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1, 24), mat(0x222831, { metalness: 0.6 })), 0, 1.6, 0).rotateX(0.5))
    const mon = at(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.1), mat(0x0a0f1c)), 4.6, 1.2, -0.8); mon.rotation.y = -0.4; scene.add(mon)
    const scr = at(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ color: 0x1f6fa8 })), 4.6, 1.2, -0.74); scr.rotation.y = -0.4; scene.add(scr)
    scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x1a1410, 0.7))
    const key = new THREE.SpotLight(0xffffff, 120, 30, 0.6, 0.5, 1.2); key.position.set(2, 8, 6); key.target.position.set(0, 0.5, 0); scene.add(key, key.target)
    camera.position.set(0, 3.1, 6.4); camera.lookAt(0, 0.9, 0)

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const onClick = (ev: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const h = ray.intersectObjects(objs, true)[0]
      if (!h) return
      let o: THREE.Object3D | null = h.object
      while (o && o.userData.i === undefined) o = o.parent
      if (o) pick.current(o.userData.i as number)
    }
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.style.cursor = 'pointer'
    let t = 0
    return Object.assign((dt: number) => {
      t += dt
      objs.forEach((g, i) => {
        const on = i === selRef.current
        g.position.y += ((on ? 1.75 : 0.95) - g.position.y) * (1 - Math.exp(-dt * 5))
        g.rotation.y = on ? g.rotation.y + dt * 0.7 : g.rotation.y * (1 - dt * 3)
        g.rotation.z = on ? Math.sin(t * 1.2) * 0.05 : 0
      })
    }, { cleanup: () => { renderer.domElement.removeEventListener('click', onClick); env.dispose(); pm.dispose() } })
  }), [tubes])
  return <div ref={host} className="view3d lab-view" />
}
