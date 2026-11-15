import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Crater } from '../data/types'
import { clamp, mulberry32, type Rng } from '../engine/rng'
import { mountStage, stars } from './stage'

export interface RoverResult { samples: number; wet: number; waterG: number; bestPct: number; seed: number }

const SIZE = 240, HALF = SIZE / 2, RIM = 92
const STEEP: Record<Crater['terrain'], number> = { soft: 0.6, rocky: 1, steep: 1.6, 'very steep': 2.2 }
const ROCKS: Record<Crater['terrain'], number> = { soft: 50, rocky: 260, steep: 130, 'very steep': 170 }

/** Ruido de valor sembrado con varias octavas. */
function noise(rng: Rng) {
  const N = 64, g = Float32Array.from({ length: N * N }, () => rng())
  const v = (x: number, y: number) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)]
  const s = (t: number) => t * t * (3 - 2 * t)
  const one = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi)
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * fx
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * fx
    return a + (b - a) * fy
  }
  return (x: number, y: number) => one(x / 22, y / 22) + one(x / 9, y / 9) * 0.4 + one(x / 3.5, y / 3.5) * 0.12
}

interface Hud { bat: number; sig: number; speed: number; slope: number; samples: number; waterG: number; drill: number; toast: string; over: boolean }

/** Fase 2: el rover baja al cráter elegido y busca hielo con su espectrómetro de neutrones. */
export function Rover3D({ crater, quality, seed, onDone }: {
  crater: Crater; quality: number; seed: number; onDone: (r: RoverResult) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState<Hud>({ bat: 100, sig: 0, speed: 0, slope: 0, samples: 0, waterG: 0, drill: 0, toast: '', over: false })
  const result = useRef<RoverResult>({ samples: 0, wet: 0, waterG: 0, bestPct: 0, seed })
  const [sound, setSound] = useState(true)
  const soundRef = useRef(sound)
  useEffect(() => { soundRef.current = sound }, [sound])

  useEffect(() => mountStage(host.current!, ({ scene, camera, el }) => {
    const rng = mulberry32(seed ^ Math.imul(crater.id.length, 0x9e3779b1))
    const n = noise(rng), steep = STEEP[crater.terrain]
    const height = (x: number, z: number) => {
      const r = Math.hypot(x, z)
      const rim = r > RIM - 20 ? Math.pow((r - (RIM - 20)) / 20, 2) * 9 * steep : 0
      return n(x + 500, z + 500) * 3.2 * steep + rim
    }
    // Depósitos de hielo: más y más ricos donde la sonda midió más hidrógeno.
    const deposits = Array.from({ length: Math.round(2 + crater.h * 1.3) }, () => {
      const a = rng() * Math.PI * 2, r = 12 + rng() * (RIM - 30)
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, rich: crater.ice * (0.5 + rng()) * 1.4, taken: false }
    })
    const signalAt = (x: number, z: number) =>
      clamp(deposits.reduce((s, d) => s + (d.taken ? 0 : d.rich * Math.exp(-((Math.hypot(d.x - x, d.z - z) / 13) ** 2))), 0) / 10, 0, 1)

    scene.background = new THREE.Color(0x000000)
    scene.add(stars(rng, 3000, 1500))
    scene.add(new THREE.HemisphereLight(0x9aa6c8, 0x050505, 0.35))
    const sun = new THREE.DirectionalLight(0xfff3dd, 3.2)
    sun.position.set(-300, 22, 120); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 900 })
    scene.add(sun)
    const earth = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 16), new THREE.MeshBasicMaterial({ color: 0x3d7bff }))
    earth.position.set(600, 90, -900); scene.add(earth)

    // Terreno con un velo azul donde el mapa orbital vio hidrógeno (más nítido si el mapeo fue mejor).
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, 200, 200); geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, height(x, z))
      const g = 0.42 + n(x * 3, z * 3) * 0.12, h = signalAt(x, z) * quality * 0.8
      col.set([g * (1 - h * 0.6), g * (1 - h * 0.2), g + h * 0.35], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals()
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
    ground.receiveShadow = true; ground.castShadow = true; scene.add(ground)

    // Rocas: colisionan y frenan al rover.
    const rockN = ROCKS[crater.terrain], rocks: { x: number; z: number; r: number }[] = []
    const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x77777f, roughness: 1, flatShading: true }), rockN)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3()
    for (let i = 0; i < rockN; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (RIM - 12), x = Math.cos(a) * r, z = Math.sin(a) * r
      const s = 0.3 + Math.pow(rng(), 3) * 2.6
      rocks.push({ x, z, r: s })
      q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3))
      rockMesh.setMatrixAt(i, m4.compose(v.set(x, height(x, z) + s * 0.3, z), q, new THREE.Vector3(s, s * (0.6 + rng() * 0.5), s)))
    }
    rockMesh.castShadow = true; rockMesh.receiveShadow = true; scene.add(rockMesh)

    // Rover.
    const rover = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: 0xdedfe6, metalness: 0.5, roughness: 0.4 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.4), metal); body.position.y = 0.55; rover.add(body)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 1.6), new THREE.MeshStandardMaterial({ color: 0x1b2f8f, metalness: 0.7, roughness: 0.25 }))
    panel.position.y = 0.85; rover.add(panel)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1), metal); mast.position.set(0, 1.3, 0.8); rover.add(mast)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x222222 })); head.position.set(0, 1.9, 0.85); rover.add(head)
    const wheels: THREE.Mesh[] = []
    for (const sx of [-1, 1]) for (const sz of [-0.9, 0, 0.9]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x333338 }))
      w.rotation.z = Math.PI / 2; w.position.set(sx * 0.95, 0.32, sz); rover.add(w); wheels.push(w)
    }
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.8), new THREE.MeshStandardMaterial({ color: 0xff3d81 }))
    drill.position.set(0, 0.2, -1.1); rover.add(drill)
    const lamp = new THREE.SpotLight(0xe8f4ff, 60, 45, 0.55, 0.5, 1.4); lamp.position.set(0, 1.9, 1); lamp.castShadow = true
    lamp.target.position.set(0, -1, 12); rover.add(lamp, lamp.target)
    rover.traverse((o) => { o.castShadow = true })
    scene.add(rover)

    let x = 0, z = 0, yaw = rng() * 6, speed = 0, bat = 100, drillT = 0, top = false, toast = '', toastT = 0, hudT = 0, over = false, beepT = 0
    const keys = new Set<string>()
    const visible = () => el.getClientRects().length > 0
    const down = (e: KeyboardEvent) => {
      if (!visible() || (e.target as HTMLElement).closest?.('input,textarea')) return
      keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
      if (e.code === 'KeyL') lamp.visible = !lamp.visible
      if (e.code === 'KeyC') top = !top
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
    addEventListener('keydown', down); addEventListener('keyup', up)

    let audio: AudioContext | null = null
    const beep = (f: number) => {
      if (!soundRef.current) return
      audio ??= new AudioContext()
      const o = audio.createOscillator(), g = audio.createGain()
      o.frequency.value = f; g.gain.setValueAtTime(0.05, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.06)
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.07)
    }

    const st = result.current
    const cold = crater.tempC < -200 ? 0.24 : 0.16
    const say = (t: string) => { toast = t; toastT = 3 }
    say(`Touchdown in ${crater.name}. Follow the neutron signal and drill with SPACE.`)
    const up3 = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), qy = new THREE.Quaternion(), camT = new THREE.Vector3(), off = new THREE.Vector3()
    camera.position.set(0, 8, -12)

    const tick = (dt: number) => {
      const e = 0.6
      const gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e)
      if (!over) {
        const thr = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
        const turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        const fx = Math.sin(yaw), fz = Math.cos(yaw), uphill = gx * fx + gz * fz
        const slope = Math.atan(Math.hypot(gx, gz)) * 57.3
        if (drillT > 0) speed *= 0.8
        else {
          speed += (thr * 4.5 - uphill * 6 * Math.sign(speed || thr)) * dt
          speed *= 1 - dt * (thr ? 0.6 : 2.2)
          speed = clamp(speed, -2.5, 6)
          yaw += turn * dt * 1.6 * (speed >= 0 ? 1 : -1) * clamp(Math.abs(speed) / 2 + 0.3, 0, 1)
        }
        let nx = x + fx * speed * dt, nz = z + fz * speed * dt
        const hit = rocks.find((r) => Math.hypot(r.x - nx, r.z - nz) < r.r + 1.1)
        if (hit) {
          if (Math.abs(speed) > 2) { bat -= 2; say('Bump! Hit a boulder (−2% battery).') }
          speed *= -0.3; nx = x; nz = z
        }
        if (Math.hypot(nx, nz) > HALF - 8 || (slope > 34 && uphill * speed > 0)) {
          say('Too steep — the wheels slip.'); speed *= -0.2; nx = x; nz = z
        }
        x = nx; z = nz
        bat -= dt * (cold + Math.abs(speed) * 0.07 + (lamp.visible ? 0.05 : 0))

        if (keys.has('Space') && drillT === 0 && Math.abs(speed) < 0.8) { drillT = 1.6; bat -= 4 }
        if (drillT > 0) {
          drillT -= dt; drill.position.y = -0.05 - Math.sin((1.6 - drillT) * 20) * 0.08
          if (drillT <= 0) {
            drillT = 0; drill.position.y = 0.2; st.samples++
            const best = deposits.filter((d) => !d.taken).map((d) => ({ d, k: Math.hypot(d.x - x, d.z - z) })).sort((a, b) => a.k - b.k)[0]
            const wet = !!best && best.k < 6
            const pct = wet ? +(best.d.rich * (1 - best.k / 7)).toFixed(1) : 0
            const tip = rover.localToWorld(new THREE.Vector3(0, 0, -1.2))
            const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wet ? 3 : 1), new THREE.MeshBasicMaterial({ color: wet ? 0x38e1ff : 0x777777 }))
            mark.position.set(tip.x, height(tip.x, tip.z) + (wet ? 1.5 : 0.5), tip.z); scene.add(mark)
            if (wet) {
              best.d.taken = true; st.wet++; st.waterG += Math.round(pct * 10); st.bestPct = Math.max(st.bestPct, pct)
              say(`ICE! Sample is ${pct}% water by weight (+${Math.round(pct * 10)} g).`); beep(1400)
              const glow = new THREE.PointLight(0x38e1ff, 30, 12); glow.position.copy(mark.position); scene.add(glow)
            } else say('Dry regolith. Keep looking — watch the signal bar.')
          }
        }
        if (bat <= 0) { bat = 0; over = true; say('Battery depleted. Rover enters survival mode.') }
        else if (deposits.every((d) => d.taken)) { over = true; say('Every ice pocket found. Incredible run!') }

        for (const w of wheels) w.rotation.x += (speed * dt) / 0.32
        const sig = clamp(signalAt(x, z) + (rng() - 0.5) * 0.3 * (1 - quality), 0, 1)
        beepT -= dt
        if (beepT <= 0 && sig > 0.05) { beep(500 + sig * 900); beepT = 1.2 - sig * 1.1 }
        hudT -= dt; toastT -= dt
        if (hudT <= 0 || over) {
          hudT = 0.1
          setHud({ bat, sig, speed, slope, samples: st.samples, waterG: st.waterG, drill: drillT / 1.6, toast: toastT > 0 || over ? toast : '', over })
        }
      }
      // Pose sobre el terreno y cámara de persecución.
      nrm.set(-gx, 1, -gz).normalize()
      rover.position.set(x, height(x, z), z)
      rover.quaternion.setFromUnitVectors(up3, nrm).multiply(qy.setFromAxisAngle(up3, yaw))
      if (top) off.set(0, 45, -0.1); else off.set(-Math.sin(yaw) * 10, 5.5, -Math.cos(yaw) * 10)
      camT.set(x, height(x, z), z)
      camera.position.lerp(off.add(camT), 1 - Math.exp(-dt * 4))
      camera.lookAt(camT.x, camT.y + 1.2, camT.z)
    }
    return Object.assign(tick, { cleanup: () => { removeEventListener('keydown', down); removeEventListener('keyup', up); void audio?.close() } })
  }), [crater, quality, seed])

  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      <div className="rv-hud">
        <h3>ROVER · {crater.name}</h3>
        <div className="rv-row"><span>Battery</span><b>{hud.bat.toFixed(0)}%</b></div>
        <div className="rv-bar"><i style={{ width: `${hud.bat}%`, background: hud.bat < 20 ? 'var(--red)' : undefined }} /></div>
        <div className="rv-row"><span>Neutron signal (H)</span><b>{Math.round(hud.sig * 100)}</b></div>
        <div className="rv-bar sig"><i style={{ width: `${hud.sig * 100}%` }} /></div>
        <div className="rv-row"><span>Speed · slope</span><b>{Math.abs(hud.speed).toFixed(1)} m/s · {hud.slope.toFixed(0)}°</b></div>
        <div className="rv-row"><span>Samples</span><b>{hud.samples}</b></div>
        <div className="rv-row"><span>Water found</span><b>{hud.waterG} g</b></div>
        {hud.drill > 0 && <div className="rv-drill"><i style={{ width: `${(1 - hud.drill) * 100}%` }} /></div>}
        <p className="hint">Blue tint = hydrogen your orbiter mapped (map quality {Math.round(quality * 100)}%). Seed {seed}</p>
      </div>
      <div className="rv-keys">
        <div><kbd>W A S D</kbd> drive</div>
        <div><kbd>SPACE</kbd> drill (stop first)</div>
        <div><kbd>L</kbd> headlights · <kbd>C</kbd> top view</div>
        <button className="btn small ghost" onClick={() => setSound(!sound)}>{sound ? 'Sound on' : 'Sound off'}</button>
      </div>
      {hud.toast && <div className="rv-toast">{hud.toast}</div>}
      <div className="rv-end">
        <button className={`btn ${hud.over ? 'big' : 'ghost'}`} onClick={() => onDone({ ...result.current })}>
          {hud.over ? 'Transmit results →' : 'End drive & transmit'}
        </button>
      </div>
    </div>
  )
}
