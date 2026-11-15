import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import type { Crater } from '../data/types'
import { clamp, engineeringRoll, mulberry32 } from '../engine/rng'
import { buildLander } from './spacecraft'
import { earthMesh, mountStage, stars } from './stage'
import { PLANET } from '../data/planet'

export interface Landing { ok: boolean; batteryPct: number; integrity: number; sciMul: number; label: string }

const ALT = [15000, 2000, 500, 50, 0]
const TERRAIN: Record<Crater['terrain'], number> = { soft: 1, rocky: 0.85, steep: 0.8, 'very steep': 0.7 }
const HAZARDS = [
  { id: 'boulder', name: 'Boulder field', text: 'LIDAR shows boulders the size of cars right under the landing ellipse.' },
  { id: 'slope', name: 'Hidden slope', text: 'The site is tilted 18°. The legs are rated for 15°.' },
  { id: 'shadow', name: 'Unexpected shadow', text: 'A shadow hides the ground: the cameras cannot see what is there.' },
]
const MARS_HAZARDS = [
  { id: 'boulder', name: 'Boulder field', text: 'Terrain-relative navigation sees boulders the size of cars right under the target.' },
  { id: 'slope', name: 'Delta cliff', text: 'The target sits next to a cliff edge. One gust and the stage drifts over it.' },
  { id: 'shadow', name: 'Dust devil', text: 'A dust devil crosses the landing zone: the cameras lose the ground for a few seconds.' },
]
interface Choice { label: string; hint: string; go: () => void; off?: boolean }
interface Step { role: string; title: string; text: string; color: string; choices: Choice[] }

/** Acto III: "los 7 minutos de terror". Cuatro decisiones y una tirada final de aterrizaje. */
export function Descent3D({ crater, stress, mapped, seed, names, onDone }: {
  crater: Crater; stress: number; mapped: boolean; seed: number; names?: Record<string, string>; onDone: (l: Landing) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const sim = useRef({ alt: ALT[0], target: ALT[0], shiftX: 0, burn: 1, crash: false, landed: false, hazard: false, done: false })
  const rng = useRef(mulberry32(seed + 17))
  const [stage, setStage] = useState(0)
  const [falling, setFalling] = useState(true)
  const [tele, setTele] = useState({ alt: ALT[0], vel: 1680 })
  const [fuel, setFuel] = useState(100)
  const [bonus, setBonus] = useState(0)
  const [sciMul, setSciMul] = useState(1)
  const [log, setLog] = useState<string[]>([])
  const [hazard] = useState(() => (PLANET.id === 'mars' ? MARS_HAZARDS : HAZARDS)[Math.floor(rng.current() * HAZARDS.length)])
  const mars = PLANET.id === 'mars'
  const [result, setResult] = useState<Landing | null>(null)

  const descend = (to: number) => { if (to === 3) sim.current.hazard = false; sim.current.target = ALT[to]; setStage(to); setFalling(true) }
  const note = (s: string) => setLog((l) => [...l.slice(-3), s])

  // Aviso cuando el lander llega a la altitud de la siguiente decisión.
  useEffect(() => {
    if (!falling) return
    const id = setInterval(() => {
      const s = sim.current
      setTele({ alt: s.alt, vel: Math.max(0, s.alt / 9 + (s.landed ? 0 : 1)) })
      if (Math.abs(s.alt - s.target) < Math.max(2, s.target * 0.02)) {
        s.alt = s.target; setFalling(false)
        if (stage === 2) s.hazard = true
      }
    }, 100)
    return () => clearInterval(id)
  }, [falling, stage])

  const touchdown = () => {
    const p = clamp(0.85 * TERRAIN[crater.terrain] * (mapped ? 1.2 : 1) * (1 - stress / 200) + bonus, 0.05, 0.97)
    const { result: r } = engineeringRoll(rng.current, p)
    let landing: Landing
    if (r === 'success') landing = { ok: true, batteryPct: 100, integrity: 100, sciMul, label: 'Perfect landing. TILT 4°. ALL SYSTEMS NOMINAL.' }
    else if (r === 'partial' && rng.current() < 0.5) landing = { ok: true, batteryPct: 100, integrity: 80, sciMul, label: mars ? 'Hard touchdown on the wheels (−20% integrity). The rover is down.' : 'Hard landing. The rover drives out with bent wheels (−20% integrity).' }
    else if (r === 'partial') {
      landing = rng.current() < 0.75
        ? { ok: true, batteryPct: 100, integrity: 100, sciMul, label: mars ? 'A cable snagged on the sky crane, but the cutters fired in time. Rover down!' : 'Tilted landing: the ramp jammed, but the rover drove off anyway. Rover out!' }
          : { ok: false, batteryPct: 0, integrity: 0, sciMul, label: mars ? 'The sky crane cables tangled. The rover never reached the ground.' : 'Tilted landing and the ramp stayed jammed. The rover never leaves the lander.' }
    } else landing = { ok: false, batteryPct: 0, integrity: 0, sciMul, label: 'Contact lost at 12 m. The lander is gone.' }
    sim.current.target = 0; sim.current.crash = !landing.ok && r === 'fail'
    setStage(4); setFalling(true)
    // El resultado aparece cuando la animación toca el suelo (no por reloj: en equipos lentos va atrasada).
    const id = setInterval(() => {
      if (!sim.current.done) return
      clearInterval(id); sim.current.landed = true; setTele({ alt: 0, vel: 0 })
      setResult({ ...landing, label: `${landing.label} (success chance was ${Math.round(p * 100)}%)` })
    }, 100)
  }

  const steps: Step[] = [
    mars
      ? { role: 'Systems', color: 'var(--cyan)', title: 'Parachute · 15 km', text: 'The heat shield is glowing and the air is thin. Open the parachute early for a gentle ride, or late to stay on target and save fuel for the sky crane.',
        choices: [
          { label: 'Open early', hint: '−30% fuel · safer', go: () => { setFuel((f) => f - 30); setBonus((b) => b + 0.03); note('Parachute opened early.'); descend(1) } },
          { label: 'Open late', hint: '−15% fuel · riskier', go: () => { setFuel((f) => f - 15); setBonus((b) => b - 0.08); note('Parachute opened late.'); descend(1) } },
        ] }
      : { role: 'Systems', color: 'var(--cyan)', title: 'Deorbit burn · 15 km', text: 'Time to brake out of orbit. A long burn is gentle and safe; a short one saves fuel for later surprises.',
        choices: [
          { label: 'Long burn', hint: '−30% fuel · safer', go: () => { setFuel((f) => f - 30); setBonus((b) => b + 0.03); note('Long deorbit burn.'); descend(1) } },
          { label: 'Short burn', hint: '−15% fuel · riskier', go: () => { setFuel((f) => f - 15); setBonus((b) => b - 0.08); note('Short deorbit burn.'); descend(1) } },
        ] },
    { role: 'Science', color: 'var(--pink)', title: 'Approach · 2 km', text: `${mars ? 'The cameras match the ground to Ares\'s maps' : 'LIDAR scans'} ${crater.name}. The planned site is closest to the ${PLANET.hint}; an alternate site nearby is flatter but poorer.`,
      choices: [
        { label: 'Trust the planned site', hint: 'full science', go: () => { note('Holding the planned site.'); descend(2) } },
        { label: 'Divert to alternate', hint: `safer · −30% ${mars ? 'rocks' : 'ice'}`, go: () => { setBonus((b) => b + 0.1); setSciMul(0.7); sim.current.shiftX = 10; note('Diverted to the alternate site.'); descend(2) } },
      ] },
    { role: 'Comms + Systems', color: 'var(--amber)', title: `HAZARD ALERT · 500 m · ${hazard.name}`, text: hazard.text,
      choices: [
        { label: 'Divert', hint: '−25% fuel', go: () => { setFuel((f) => f - 25); if (fuel - 25 < 10) setBonus((b) => b - 0.2); sim.current.shiftX += 9; note('Diverted around the hazard.'); descend(3) } },
        { label: 'Hold course', hint: 'no fuel · 60% it is fine', go: () => {
          const ok = rng.current() < 0.6; if (!ok) setBonus((b) => b - 0.15)
          note(ok ? 'Held course — the hazard was smaller than it looked.' : 'Held course — the legs will land on it.'); descend(3) } },
      ] },
    { role: 'Director', color: 'var(--lime)', title: mars ? 'Sky crane · 20 m' : 'Touchdown · 50 m',
      text: mars ? `Fuel ${fuel}%. The descent stage hovers and lowers Buscador on cables. Everything comes down to this.` : `Fuel ${fuel}%. Everything comes down to this.`,
      choices: [
        { label: mars ? 'Lower the rover' : 'Authorize touchdown', hint: 'commit to landing', go: touchdown },
        { label: 'Abort and retry', hint: '−25% fuel · better odds', off: fuel < 25, go: () => { setFuel((f) => f - 25); setBonus((b) => b + 0.06); note('Abort! Climbing for another try.'); sim.current.alt = 400; descend(3) } },
      ] },
  ]

  useEffect(() => mountStage(host.current!, ({ scene, camera }) => {
    const r = mulberry32(seed)
    scene.background = new THREE.Color(0x000000)
    scene.add(stars(r, 2500, 2000))
    scene.add(new THREE.HemisphereLight(0x9aa6c8, 0x080808, 0.5))
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.4); scene.add(sun)
    // Marte: cielo de polvo color caramelo y suelo rojizo; la Luna: negro con estrellas.
    const mars = PLANET.id === 'mars', sky = mars ? 0xc9a27c : 0x03050b
    scene.background = new THREE.Color(sky)
    scene.fog = new THREE.Fog(sky, mars ? 120 : 160, mars ? 420 : 520)
    sun.position.set(-260, 60, -120); sun.intensity = 3; sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 800 })
    // Terreno lunar: ondulación suave + cráteres con borde levantado, gris con variación (sin facetas).
    const craters = Array.from({ length: 34 }, () => ({ x: (r() - 0.5) * 700, z: (r() - 0.5) * 700, rad: 6 + Math.pow(r(), 2) * 55 }))
    craters.push({ x: 0, z: -60, rad: 70 }) // el cráter objetivo, delante
    const hAt = (x: number, z: number) => {
      let h = Math.sin(x * 0.02) * 2 + Math.cos(z * 0.025) * 2 + Math.sin((x + z) * 0.07) * 0.6
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.rad
        if (d < 1) h -= (1 - d * d) * c.rad * 0.22
        else if (d < 1.5) h += Math.sin((d - 1) * Math.PI * 2) * c.rad * 0.06
      }
      return h
    }
    const geo = new THREE.PlaneGeometry(900, 900, 220, 220); geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, hAt(x, z))
      const v = 0.42 + (Math.sin(x * 0.31) * Math.cos(z * 0.27)) * 0.04 + r() * 0.05
      col.set(mars ? [v * 1.5, v * 0.85, v * 0.55] : [v, v, v * 1.03], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals()
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
    ground.receiveShadow = true; scene.add(ground)
    const earth = earthMesh(8.5) // vista desde la Luna: ~2° de diámetro aparente a ~490 de distancia
    earth.position.set(160, 70, -460); if (!mars) scene.add(earth)
    const haz = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), new THREE.MeshBasicMaterial({ color: 0xff4d5e, side: THREE.DoubleSide }))
    haz.rotation.x = -Math.PI / 2; haz.position.y = hAt(0, 0) + 0.4; haz.visible = false; scene.add(haz)
    const boulders = new THREE.Group()
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + r() * 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x77777f, flatShading: true }))
      b.position.set((r() - 0.5) * 9, 1.5, (r() - 0.5) * 9); boulders.add(b)
    }
    boulders.position.y = hAt(0, 0) - 1; boulders.visible = false; scene.add(boulders)

    const lander = buildLander()
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7 }))
    flame.rotation.x = Math.PI; flame.position.y = -0.9; lander.add(flame)
    const glow = new THREE.PointLight(0x9fd8ff, 40, 30); glow.position.y = -1; lander.add(glow)
    scene.add(lander)
    const dust = new THREE.Mesh(new THREE.RingGeometry(1, 2.5, 40), new THREE.MeshBasicMaterial({ color: 0x9a9ca6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    dust.rotation.x = -Math.PI / 2; dust.position.y = hAt(0, 0) + 0.3; scene.add(dust)
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0 }))
    scene.add(boom)

    const yOf = (alt: number) => hAt(lx, 0) + Math.log10(1 + alt) * 14
    let lx = 0, tBoom = 0, contact = -1
    const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), tilt = new THREE.Quaternion(), flat = new THREE.Quaternion()
    return (dt) => {
      const s = sim.current
      if (s.target > 0 || s.alt > 60) {
        // Lejos del suelo: baja en escala logarítmica hacia la altitud de la siguiente decisión.
        const la = Math.log10(1 + s.alt), lt = Math.log10(1 + s.target)
        s.alt = Math.pow(10, la + (lt - la) * (1 - Math.exp(-dt * 1.1))) - 1
        if (Math.abs(s.alt - s.target) < 0.05) s.alt = s.target
      } else {
        // Últimos metros: frenado continuo hasta tocar, sin saltos.
        s.alt = Math.max(0, s.alt - dt * (1.2 + s.alt * 0.9))
      }
      lx += (s.shiftX - lx) * dt * 0.8
      const ground = hAt(lx, 0)
      const y = yOf(s.alt)
      haz.visible = boulders.visible = s.hazard && hazard.id !== 'shadow'
      haz.position.x = boulders.position.x = 0
      if (!s.crash) lander.position.set(lx, y, 0)
      // Se apoya según la pendiente del terreno al acercarse; en vuelo, un leve balanceo.
      const e = 1.5
      nrm.set(hAt(lx - e, 0) - hAt(lx + e, 0), 2 * e, hAt(lx, -e) - hAt(lx, e)).normalize()
      tilt.setFromUnitVectors(up, nrm); flat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(performance.now() / 700) * 0.03)
      lander.quaternion.copy(flat).slerp(tilt, Math.max(0, Math.min(1, 1 - s.alt / 20)))
      // Contacto: compresión de patas y nube de polvo.
      if (s.alt === 0 && s.target === 0 && !s.crash && contact < 0) contact = 0
      if (contact >= 0) { contact += dt; if (contact > 0.9) s.done = true; lander.scale.set(1, 1 - 0.06 * Math.exp(-contact * 6) * Math.cos(contact * 18), 1) }
      const burning = s.alt > 0.05 && contact < 0
      flame.visible = burning; glow.intensity = burning ? 30 + Math.random() * 20 : 0
      flame.scale.set(1, 0.7 + Math.random() * 0.5, 1)
      dust.position.set(lx, ground + 0.3, 0)
      if (s.alt < 25 && !s.crash && contact < 0) { dust.material.opacity = Math.min(0.35, (25 - s.alt) / 50); dust.scale.setScalar(1 + (25 - s.alt) / 8) }
      else if (contact >= 0 && contact < 1.5) { dust.material.opacity = 0.35 * (1 - contact / 1.5); dust.scale.setScalar(4 + contact * 4) }
      else dust.material.opacity = Math.max(0, dust.material.opacity - dt * 0.3)
      if (s.crash) {
        if (s.alt > 0.05) lander.position.set(lx, y, 0)
        else {
          tBoom += dt; lander.visible = tBoom < 0.15; if (tBoom > 1.2) s.done = true
          boom.position.set(lx, ground + 2, 0); boom.scale.setScalar(2 + tBoom * 22); boom.material.opacity = Math.max(0, 1 - tBoom / 1.4)
        }
      }
      // Cámara de costado: nunca por debajo del terreno donde está parada.
      const cx = lx + 14, cz = 20
      camera.position.set(cx, Math.max(y + 4 + Math.min(10, s.alt / 1500), hAt(cx, cz) + 3), cz)
      camera.lookAt(lx - 4, y - 3 - Math.min(14, s.alt / 900), -24)
    }
  }), [seed, hazard])

  const step = !falling && !result && stage < 4 ? steps[stage] : null
  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      <div className="ds-hud">
        <div>ALTITUDE</div><b>{tele.alt >= 1000 ? `${(tele.alt / 1000).toFixed(1)} km` : `${Math.round(tele.alt)} m`}</b>
        <div>VELOCITY {Math.round(tele.vel)} m/s</div>
        <div>FUEL {fuel}%</div>
        <div className="hint">{crater.name} · {mapped ? 'altimeter map ' : 'no altimeter map'}</div>
        {log.map((l, i) => <div key={i} className="hint">› {l}</div>)}
      </div>
      {step && (
        <div className="ds-panel ds-choice" style={{ '--c': step.color } as CSSProperties}>
          <div className="ds-meta">
            <span className="ds-role">{step.role.split(' + ').map((r) => (names?.[r] ? `${r} (${names[r]})` : r)).join(' + ')} decides</span>
            <span className="ds-steps">{steps.map((_, i) => <i key={i} className={i < stage ? 'done' : i === stage ? 'now' : ''} />)}</span>
          </div>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <div className="ds-options">
            {step.choices.map((c) => (
              <button key={c.label} className="ds-option" disabled={c.off} onClick={c.go}><b>{c.label}</b><small>{c.hint}</small></button>
            ))}
          </div>
        </div>
      )}
      {result && (
        <div className="ds-panel ds-choice" style={{ '--c': result.ok ? 'var(--green)' : 'var(--red)' } as CSSProperties}>
          <h3>{result.ok ? 'TOUCHDOWN CONFIRMED' : 'LANDING FAILED'}</h3>
          <p>{result.label}</p>
          <div className="actions"><button className="btn big" onClick={() => onDone(result)}>{result.ok ? 'Deploy the rover →' : mars ? 'What happens next →' : 'Plan B →'}</button></div>
        </div>
      )}
    </div>
  )
}
