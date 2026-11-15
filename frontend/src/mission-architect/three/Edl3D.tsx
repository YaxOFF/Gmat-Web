import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { clamp, mulberry32 } from '../engine/rng'
import { loadCuriosity } from './curiosity'
import { HALF, loadDem, demHeight, noise, SIZE, type Dem } from './dem'
import { edlEnvironment, loadEdl, type EdlRig } from './edl'
import { untileMaterial } from './Rover3D'
import { mountStage } from './stage'
import { MARS, type RoverSite } from './world'

/** Etapas de la secuencia (PLAN-EDL.md, "Etapas de la secuencia"): duración en s, altitud y velocidad reales en el HUD. */
const STAGES = [
  { name: 'ENTRY', dur: 14, alt: [125000, 11000], vel: [5800, 403] },
  { name: 'PARACHUTE DEPLOY', dur: 6, alt: [11000, 8000], vel: [403, 167] },
  { name: 'HEAT SHIELD SEPARATION', dur: 7, alt: [8000, 1600], vel: [167, 83] },
  { name: 'BACKSHELL SEPARATION', dur: 5, alt: [1600, 1400], vel: [83, 90] },
] as const
const TOTAL = STAGES.reduce((s, x) => s + x.dur, 0)
const LAND = { x: 0, z: -74 } // donde empieza Rover3D
const SEP3 = 0.15, SEP4 = 0.2 // avance de su etapa en que se suelta el escudo / la carcasa

const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Altura en pantalla (m sobre el suelo): real bajo 100 m, logarítmica arriba (como Descent3D). */
const screenY = (alt: number) => (alt < 100 ? alt : 100 + Math.log10(alt / 100) * 60)
const Y_CHUTE = screenY(11000)

interface Hud { alt: number; vel: number; stage: string; t: number }

/** Entrada, descenso y aterrizaje en Marte (cinemática). Fase E3: etapas 1 a 4, sin efectos. */
export function Edl3D({ site, seed, onDone }: { site: RoverSite; seed: number; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState<Hud | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone }, [onDone])
  const [dem, setDem] = useState<{ id: string; dem: Dem | null } | null>(null)
  useEffect(() => {
    let on = true
    void loadDem(MARS.dir, site.id).then((d) => { if (on) setDem({ id: site.id, dem: d }) })
    return () => { on = false }
  }, [site.id])
  const ready = dem?.id === site.id

  useEffect(() => !ready ? undefined : mountStage(host.current!, ({ scene, camera, renderer }) => {
    // Mismo relieve que Rover3D: misma semilla, mismo ruido (el ruido consume el rng primero).
    const rng = mulberry32(seed ^ Math.imul(site.id.length, 0x9e3779b1))
    const n = noise(rng)
    const d = dem!.dem
    const height = d ? demHeight(d, n) : (x: number, z: number) => n(x + 500, z + 500) * 3.2
    const h0 = height(LAND.x, LAND.z)

    const env = edlEnvironment(renderer); scene.environment = env
    const sky = new THREE.Color(MARS.sky!), space = new THREE.Color(0x120c10)
    scene.background = sky.clone()
    const fog = new THREE.FogExp2(MARS.sky!, 0.0045); scene.fog = fog
    scene.add(new THREE.HemisphereLight(0xe0b48a, 0x3a2418, 0.9))
    const sun = new THREE.DirectionalLight(0xffe2c4, 2.8); sun.position.set(160, 220, -260); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 900 })
    scene.add(sun)

    // Terreno: el jugable de Rover3D (relieve real) y uno exterior hasta el horizonte, con el mismo material.
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: new THREE.Color(0.5, 0.5, 0.5) })
    untileMaterial(groundMat)
    const plane = (size: number, seg: number, y: (x: number, z: number) => number, uvMeters: boolean) => {
      const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2)
      const p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i); p.setY(i, y(x, z))
        if (uvMeters) uv.setXY(i, (x + HALF) / SIZE, (HALF - z) / SIZE)
        const v = 0.84 + n(x * 3, z * 3) * 0.24
        col.set([v, v, v], i * 3)
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals()
      const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; scene.add(m)
    }
    plane(SIZE, 200, height, false)
    plane(SIZE * 10, SIZE, (x, z) => {
      const out = Math.max(Math.abs(x), Math.abs(z)) - HALF, bx = clamp(x, -HALF, HALF), bz = clamp(z, -HALF, HALF)
      return out < -1e-3 ? height(bx, bz) - 6 : height(bx, bz) - 0.3 + clamp(out / 60, 0, 1) * (n(x * 0.2 + 900, z * 0.2 + 900) - 0.8) * 14
    }, true)
    const reg = `${import.meta.env.BASE_URL}${MARS.ground}`, loader = new THREE.TextureLoader(), aniso = renderer.capabilities.getMaxAnisotropy()
    const tile = (t: THREE.Texture) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(SIZE / 12, SIZE / 12); t.anisotropy = aniso; groundMat.needsUpdate = true; return t }
    const tex: THREE.Texture[] = []
    loader.load(reg + 'diff.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; tex.push(t); groundMat.map = tile(t)
      groundMat.color.setRGB(MARS.gain * MARS.tint[0], MARS.gain * MARS.tint[1], MARS.gain * MARS.tint[2])
    })
    loader.load(reg + 'normal.jpg', (t) => { tex.push(t); groundMat.normalMap = tile(t) })
    loader.load(reg + 'orm.jpg', (t) => { tex.push(t); groundMat.aoMap = groundMat.roughnessMap = tile(t) })

    // La pila (SkyCrane + rover + cápsula) en el marco del rover; las piezas sueltas se mueven dentro de ella.
    const stack = new THREE.Group(); scene.add(stack)
    let rig: EdlRig | null = null, rover: THREE.Object3D | null = null, dead = false
    Promise.all([loadCuriosity(), loadEdl()]).then(([r, edl]) => {
      if (dead) return
      r.model.traverse((o) => { o.castShadow = true })
      edl.root.add(r.model); stack.add(edl.root); rig = edl; rover = r.model
    }).catch((e: Error) => !dead && setErr(e.message))

    const camOff = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3(), camLook = new THREE.Vector3()
    let t = 0, hudT = 0, first = true, ended = false
    const tick = (dt: number) => {
      if (!rig || !rover) return
      t = Math.min(TOTAL, t + dt)
      let i = 0, t0 = 0
      while (i < STAGES.length - 1 && t >= t0 + STAGES[i].dur) t0 += STAGES[i++].dur
      const st = STAGES[i], p = clamp((t - t0) / st.dur, 0, 1)
      // Altitud: tasa constante en escala logarítmica dentro de cada etapa; velocidad lineal.
      const alt = st.alt[0] * Math.pow(st.alt[1] / st.alt[0], p), vel = lerp(st.vel[0], st.vel[1], smooth(p))
      const ys = screenY(alt)
      // Trayectoria inclinada hasta el paracaídas; después casi vertical sobre el punto de contacto.
      stack.position.set(LAND.x + Math.max(0, ys - Y_CHUTE) * 1.2, h0 + ys, LAND.z)

      const wob = Math.sin(t * 1.7) * 0.03
      let tilt = 0, hsDrop = 0, bsRise = 0, open = false
      if (i === 0) tilt = -0.6 + wob // escudo por delante, con ángulo de ataque
      else if (i === 1) tilt = lerp(-0.6, 0, smooth(p / 0.7)) + Math.sin(p * 9) * 0.12 * (1 - p) + wob
      else tilt = wob
      if (i === 2 && p > SEP3) { const q = (p - SEP3) / (1 - SEP3); hsDrop = 40 * q * q; open = true }
      if (i === 3) {
        hsDrop = 40 + 120 * p; open = true
        if (p > SEP4) { const q = (p - SEP4) / (1 - SEP4); bsRise = 45 * q * q }
      }
      stack.rotation.set(0, 0, tilt)
      rig.heatshield.position.y = -hsDrop
      rig.heatshield.rotation.set(hsDrop * 0.012, hsDrop * 0.05, 0) // cae girando
      rig.heatshield.visible = hsDrop < 150
      rig.backshell.position.y = bsRise
      rig.skycrane.visible = rover.visible = open // con la cápsula cerrada no se ven: ahorra dibujado

      // Cielo: más oscuro arriba, el color de Rover3D abajo.
      const air = smooth((Math.log10(alt) - 3.9) / 1.1) // 0 bajo 8 km, 1 a 100 km
      ;(scene.background as THREE.Color).copy(sky).lerp(space, air); fog.color.copy(scene.background as THREE.Color)
      fog.density = 0.0045 * Math.min(1, 50 / ys) // arriba la niebla de Rover3D taparía todo el suelo

      // Cámara de costado por etapa; al escudo se lo mira desde abajo para verlo caer.
      if (i === 0) camOff.set(20, 5, 24)
      else if (i === 1) camOff.set(15, 2, 20)
      else if (i === 2) camOff.set(12 + hsDrop * 0.2, -6 - hsDrop * 0.1, 16 + hsDrop * 0.3)
      else camOff.set(14 + bsRise * 0.5, 3 + bsRise * 0.4, 20 + bsRise * 0.7) // se aleja para ver la pila y la carcasa
      want.copy(stack.position).add(camOff)
      want.y = Math.max(want.y, height(want.x, want.z) + 3)
      look.copy(stack.position).setY(stack.position.y + 1.5 + (i === 2 ? -hsDrop * 0.15 : bsRise * 0.5))
      if (first) { camera.position.copy(want); camLook.copy(look); first = false }
      const k = 1 - Math.exp(-dt * 2.5)
      camera.position.lerp(want, k); camLook.lerp(look, k); camera.lookAt(camLook)

      hudT -= dt
      if (hudT <= 0) { hudT = 0.1; setHud({ alt, vel, stage: st.name, t }) }
      if (t >= TOTAL && !ended) { ended = true; doneRef.current() }
    }
    return Object.assign(tick, { cleanup: () => { dead = true; env.dispose(); for (const x of tex) x.dispose() } })
  }), [ready, dem, site.id, seed])

  const h = hud
  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      <div className="ds-hud">
        <div>ALTITUDE</div><b>{!h ? '—' : h.alt >= 1000 ? `${(h.alt / 1000).toFixed(1)} km` : `${Math.round(h.alt)} m`}</b>
        <div>VELOCITY {h ? `${Math.round(h.vel * 3.6)} km/h` : '—'}</div>
        <div>{h ? h.stage : 'LOADING MODELS…'}</div>
        <div className="hint">{site.name} · T+{h ? h.t.toFixed(0) : 0} s</div>
        {err && <div style={{ color: 'tomato' }}>{err}</div>}
      </div>
    </div>
  )
}
