import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import type { Crater } from '../data/types'
import { clamp, engineeringRoll, mulberry32 } from '../engine/rng'
import { at, mountStage, stars } from './stage'

export interface Landing { ok: boolean; batteryPct: number; integrity: number; sciMul: number; label: string }

const ALT = [15000, 2000, 500, 50, 0]
const TERRAIN: Record<Crater['terrain'], number> = { soft: 1, rocky: 0.85, steep: 0.8, 'very steep': 0.7 }
const HAZARDS = [
  { id: 'boulder', name: 'Boulder field', text: 'LIDAR shows boulders the size of cars right under the landing ellipse.' },
  { id: 'slope', name: 'Hidden slope', text: 'The site is tilted 18°. The legs are rated for 15°.' },
  { id: 'shadow', name: 'Unexpected shadow', text: 'A shadow hides the ground: the cameras cannot see what is there.' },
]
interface Choice { label: string; hint: string; go: () => void; off?: boolean }
interface Step { role: string; title: string; text: string; color: string; choices: Choice[] }

/** Acto III: "los 7 minutos de terror". Cuatro decisiones y una tirada final de aterrizaje. */
export function Descent3D({ crater, stress, mapped, seed, names, onDone }: {
  crater: Crater; stress: number; mapped: boolean; seed: number; names?: Record<string, string>; onDone: (l: Landing) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const sim = useRef({ alt: ALT[0], target: ALT[0], shiftX: 0, burn: 1, crash: false, landed: false, hazard: false })
  const rng = useRef(mulberry32(seed + 17))
  const [stage, setStage] = useState(0)
  const [falling, setFalling] = useState(true)
  const [tele, setTele] = useState({ alt: ALT[0], vel: 1680 })
  const [fuel, setFuel] = useState(100)
  const [bonus, setBonus] = useState(0)
  const [sciMul, setSciMul] = useState(1)
  const [log, setLog] = useState<string[]>([])
  const [hazard] = useState(() => HAZARDS[Math.floor(rng.current() * HAZARDS.length)])
  const [result, setResult] = useState<Landing | null>(null)

  const descend = (to: number) => { sim.current.target = ALT[to]; setStage(to); setFalling(true) }
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
    else if (r === 'partial' && rng.current() < 0.5) landing = { ok: true, batteryPct: 100, integrity: 80, sciMul, label: 'Hard landing. The rover rolls out with bent wheels (−20% integrity).' }
    else if (r === 'partial') {
      landing = rng.current() < 0.75
        ? { ok: true, batteryPct: 100, integrity: 100, sciMul, label: 'Tilted landing: the ramp jammed, but the deployment roll worked. Rover out!' }
          : { ok: false, batteryPct: 0, integrity: 0, sciMul, label: 'Tilted landing and the ramp stayed jammed. The rover never leaves the lander.' }
    } else landing = { ok: false, batteryPct: 0, integrity: 0, sciMul, label: 'Contact lost at 12 m. The lander is gone.' }
    sim.current.target = 0; sim.current.crash = !landing.ok && r === 'fail'
    setStage(4); setFalling(true)
    setTimeout(() => { sim.current.landed = true; setResult({ ...landing, label: `${landing.label} (success chance was ${Math.round(p * 100)}%)` }) }, 2600)
  }

  const steps: Step[] = [
    { role: 'Systems', color: 'var(--cyan)', title: 'Deorbit burn · 15 km', text: 'Time to brake out of orbit. A long burn is gentle and safe; a short one saves fuel for later surprises.',
      choices: [
        { label: 'Long burn', hint: '−30% fuel · safer', go: () => { setFuel((f) => f - 30); setBonus((b) => b + 0.03); note('Long deorbit burn.'); descend(1) } },
        { label: 'Short burn', hint: '−15% fuel · riskier', go: () => { setFuel((f) => f - 15); setBonus((b) => b - 0.08); note('Short deorbit burn.'); descend(1) } },
      ] },
    { role: 'Science', color: 'var(--pink)', title: 'Approach · 2 km', text: `LIDAR scans ${crater.name}. The planned site is closest to the hydrogen; an alternate site nearby is flatter but poorer.`,
      choices: [
        { label: 'Trust the planned site', hint: 'full science', go: () => { note('Holding the planned site.'); descend(2) } },
        { label: 'Divert to alternate', hint: 'safer · −30% ice', go: () => { setBonus((b) => b + 0.1); setSciMul(0.7); sim.current.shiftX = 10; note('Diverted to the alternate site.'); descend(2) } },
      ] },
    { role: 'Comms + Systems', color: 'var(--amber)', title: `HAZARD ALERT · 500 m · ${hazard.name}`, text: hazard.text,
      choices: [
        { label: 'Divert', hint: '−25% fuel', go: () => { setFuel((f) => f - 25); if (fuel - 25 < 10) setBonus((b) => b - 0.2); sim.current.shiftX += 9; note('Diverted around the hazard.'); descend(3) } },
        { label: 'Hold course', hint: 'roll the dice', go: () => {
          const ok = rng.current() < 0.6; if (!ok) setBonus((b) => b - 0.15)
          note(ok ? 'Held course — the hazard was smaller than it looked.' : 'Held course — the legs will land on it.'); descend(3) } },
      ] },
    { role: 'Director', color: 'var(--lime)', title: 'Touchdown · 50 m', text: `Fuel ${fuel}%. Everything comes down to this.`,
      choices: [
        { label: 'Authorize touchdown', hint: 'final roll', go: touchdown },
        { label: 'Abort and retry', hint: '−25% fuel · better odds', off: fuel < 25, go: () => { setFuel((f) => f - 25); setBonus((b) => b + 0.06); note('Abort! Climbing for another try.'); sim.current.alt = 400; descend(3) } },
      ] },
  ]

  useEffect(() => mountStage(host.current!, ({ scene, camera }) => {
    const r = mulberry32(seed)
    scene.background = new THREE.Color(0x000000)
    scene.add(stars(r, 2500, 2000))
    scene.add(new THREE.HemisphereLight(0x9aa6c8, 0x080808, 0.5))
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.4); sun.position.set(100, 40, -300); scene.add(sun)
    const geo = new THREE.PlaneGeometry(600, 600, 160, 160); geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z)
      pos.setY(i, Math.sin(x * 0.05 + r()) * 1.5 + Math.cos(z * 0.07) * 1.5 + Math.sin(x * 0.21 + z * 0.13) * 0.5 + (d > 120 ? ((d - 120) / 30) ** 2 * 4 : 0))
    }
    geo.computeVertexNormals()
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6e7078, roughness: 1 })))
    const haz = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), new THREE.MeshBasicMaterial({ color: 0xff4d5e, side: THREE.DoubleSide }))
    haz.rotation.x = -Math.PI / 2; haz.position.y = 3; haz.visible = false; scene.add(haz)
    const boulders = new THREE.Group()
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + r() * 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x77777f, flatShading: true }))
      b.position.set((r() - 0.5) * 9, 1.5, (r() - 0.5) * 9); boulders.add(b)
    }
    boulders.visible = false; scene.add(boulders)

    const lander = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.7, roughness: 0.35 })
    lander.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.4, 8), gold), 0, 1.6, 0))
    lander.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.8), new THREE.MeshStandardMaterial({ color: 0xdedfe6, metalness: 0.5 })), 0, 2.7, 0))
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2), gold)
      leg.position.set(Math.cos(i * 1.57) * 1.6, 0.8, Math.sin(i * 1.57) * 1.6); leg.rotation.set(Math.sin(i * 1.57) * 0.4, 0, -Math.cos(i * 1.57) * 0.4)
      lander.add(leg)
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7 }))
    flame.rotation.x = Math.PI; flame.position.y = -0.6; lander.add(flame)
    const glow = new THREE.PointLight(0x9fd8ff, 40, 30); glow.position.y = -1; lander.add(glow)
    scene.add(lander)
    const dust = new THREE.Mesh(new THREE.RingGeometry(1, 2.5, 40), new THREE.MeshBasicMaterial({ color: 0xc8c8d0, transparent: true, opacity: 0, side: THREE.DoubleSide }))
    dust.rotation.x = -Math.PI / 2; dust.position.y = 2; scene.add(dust)
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0 }))
    scene.add(boom)

    const yOf = (alt: number) => 2.2 + Math.log10(1 + alt) * 14
    let lx = 0, tBoom = 0
    return (dt) => {
      const s = sim.current
      // Baja en escala logarítmica hacia la altitud objetivo.
      const la = Math.log10(1 + s.alt), lt = Math.log10(1 + s.target)
      s.alt = Math.pow(10, la + (lt - la) * (1 - Math.exp(-dt * 1.1))) - 1
      if (Math.abs(s.alt - s.target) < 0.5) s.alt = s.target
      lx += (s.shiftX - lx) * dt * 0.8
      const y = yOf(s.alt)
      haz.visible = boulders.visible = s.hazard && hazard.id !== 'shadow'
      haz.position.x = boulders.position.x = 0
      if (!s.crash || !s.landed) lander.position.set(lx, y, 0)
      lander.rotation.z = Math.sin(performance.now() / 700) * 0.03
      const burning = s.alt > 0.5
      flame.visible = burning; glow.intensity = burning ? 30 + Math.random() * 20 : 0
      flame.scale.set(1, 0.7 + Math.random() * 0.5, 1)
      if (s.alt < 30 && !s.crash) { dust.material.opacity = Math.min(0.6, (30 - s.alt) / 30); dust.scale.setScalar(1 + (30 - s.alt) / 3); dust.position.x = lx }
      if (s.crash && s.alt < 1) {
        tBoom += dt; lander.visible = tBoom < 0.15
        boom.position.set(lx, 2, 0); boom.scale.setScalar(2 + tBoom * 22); boom.material.opacity = Math.max(0, 1 - tBoom / 1.4)
      }
      camera.position.set(lx + 16, y + 7 + Math.min(40, s.alt / 400), 22)
      camera.lookAt(lx, Math.max(0, y - 6 - Math.min(30, s.alt / 600)), 0)
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
        <div className="hint">{crater.name} · {mapped ? 'altimeter map ✓' : 'no altimeter map'}</div>
        {log.map((l, i) => <div key={i} className="hint">› {l}</div>)}
      </div>
      {step && (
        <div className="ds-panel" style={{ '--c': step.color } as CSSProperties}>
          <h3>{step.title}<small>{step.role.split(' + ').map((r) => (names?.[r] ? `${r} (${names[r]})` : r)).join(' + ')} decides</small></h3>
          <p>{step.text}</p>
          <div className="actions">
            {step.choices.map((c) => (
              <button key={c.label} className="btn" disabled={c.off} onClick={c.go}>{c.label}<small>{c.hint}</small></button>
            ))}
          </div>
        </div>
      )}
      {result && (
        <div className="ds-panel" style={{ '--c': result.ok ? 'var(--green)' : 'var(--red)' } as CSSProperties}>
          <h3>{result.ok ? 'TOUCHDOWN CONFIRMED' : 'LANDING FAILED'}</h3>
          <p>{result.label}</p>
          <div className="actions"><button className="btn big" onClick={() => onDone(result)}>{result.ok ? 'Deploy the rover →' : 'Plan B →'}</button></div>
        </div>
      )}
    </div>
  )
}
