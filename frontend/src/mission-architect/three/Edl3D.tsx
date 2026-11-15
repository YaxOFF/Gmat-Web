import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { clamp, mulberry32 } from '../engine/rng'
import { loadCuriosity, meshHeight, type CuriosityRig } from './curiosity'
import { HALF, loadDem, demHeight, noise, SIZE, type Dem } from './dem'
import { edlEnvironment, loadEdl, ROVER_BRIDLE, type EdlRig } from './edl'
import { untileMaterial } from './Rover3D'
import { mountStage } from './stage'
import { MARS, type RoverSite } from './world'

/** Etapas de la secuencia (PLAN-EDL.md, "Etapas de la secuencia"): duración en s, altitud y velocidad reales en el HUD. */
const STAGES = [
  { name: 'ENTRY', dur: 14, alt: [125000, 11000], vel: [5800, 403] },
  { name: 'PARACHUTE DEPLOY', dur: 6, alt: [11000, 8000], vel: [403, 167] },
  { name: 'HEAT SHIELD SEPARATION', dur: 7, alt: [8000, 1600], vel: [167, 83] },
  { name: 'BACKSHELL SEPARATION', dur: 5, alt: [1600, 1400], vel: [83, 90] },
  { name: 'POWERED DESCENT', dur: 10, alt: [1400, 20], vel: [90, 0.75] },
  { name: 'SKY CRANE', dur: 12, alt: [20, 0], vel: [0.75, 0.75] },
  { name: 'TOUCHDOWN', dur: 2.5, alt: [0, 0], vel: [0, 0] },
  { name: 'FLYAWAY', dur: 8, alt: [0, 0], vel: [0, 0] },
] as const
const TOTAL = STAGES.reduce((s, x) => s + x.dur, 0)
const LAND = { x: 0, z: -74 } // donde empieza Rover3D
const SEG = 200 // malla del terreno jugable, la misma de Rover3D
const DIV = 40 // m: la pila baja corrida en +X y el desvío propulsado la trae sobre LAND, lejos de la carcasa
const ROPE = 7.5 // m que baja el rover colgado de los cables
const SEP3 = 0.15, SEP4 = 0.2 // avance de su etapa en que se suelta el escudo / la carcasa
const Z = new THREE.Vector3(0, 0, 1)

const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Altura en pantalla (m sobre el suelo): real bajo 100 m, logarítmica arriba (como Descent3D). */
const screenY = (alt: number) => (alt < 100 ? alt : 100 + Math.log10(alt / 100) * 60)
const Y_CHUTE = screenY(11000)

interface Hud { alt: number; vel: number; stage: string; t: number }

/** Entrada, descenso y aterrizaje en Marte (cinemática): las 8 etapas, sin efectos todavía. */
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
      return g
    }
    const floor = meshHeight(plane(SIZE, SEG, height, false), SIZE, SEG) // lo que pisan las ruedas, igual que en Rover3D
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

    // La pila (SkyCrane + cápsula) en el marco del rover; las piezas sueltas se mueven dentro de ella. El rover va en su
    // propio grupo: sigue a la pila hasta que los cables lo bajan y después lo apoya la suspensión de curiosity.ts.
    const stack = new THREE.Group(), body = new THREE.Group(); scene.add(stack, body)
    // Cables: 3 segmentos de cada Bridle_Anchor_n a su enganche en el rover, rehechos cada cuadro.
    const ropePos = new THREE.BufferAttribute(new Float32Array(18), 3)
    const ropes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', ropePos), new THREE.LineBasicMaterial({ color: 0x2a2a2a }))
    ropes.frustumCulled = false; ropes.visible = false; scene.add(ropes)
    let rig: EdlRig | null = null, cur: CuriosityRig | null = null, rest: THREE.Quaternion[] = [], yRest = 0, dead = false
    Promise.all([loadCuriosity(), loadEdl()]).then(([r, edl]) => {
      if (dead) return
      r.model.traverse((o) => { o.castShadow = true })
      body.add(r.model); stack.add(edl.root); rig = edl; cur = r
      rest = edl.thrusters.map((o) => o.quaternion.clone())
      // Altura del origen del rover apoyado en llano: dice cuánto le falta a las ruedas para tocar.
      r.update(0, body, LAND.x, LAND.z, 0, 0, 0, () => h0); yRest = body.position.y - h0
    }).catch((e: Error) => !dead && setErr(e.message))

    const camOff = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3(), camLook = new THREE.Vector3()
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion()
    let t = 0, hudT = 0, first = true, ended = false, detached = false, crashed = false
    const tick = (dt: number) => {
      if (!rig || !cur) return
      t = Math.min(TOTAL, t + dt)
      let i = 0, t0 = 0
      while (i < STAGES.length - 1 && t >= t0 + STAGES[i].dur) t0 += STAGES[i++].dur
      const st = STAGES[i], p = clamp((t - t0) / st.dur, 0, 1)
      const vel = lerp(st.vel[0], st.vel[1], smooth(p)), wob = Math.sin(t * 1.7) * 0.03
      let alt = 0, tilt = 0, hsDrop = 160, bsRise = 0, open = true, lift = 0, comp = 0
      if (i <= 4) {
        // Altitud: tasa constante en escala logarítmica dentro de cada etapa; velocidad lineal.
        alt = st.alt[0] * Math.pow(st.alt[1] / st.alt[0], p)
        const ys = screenY(alt)
        if (i <= 3) {
          // Trayectoria inclinada hasta el paracaídas; después casi vertical, corrida DIV en +X.
          stack.position.set(LAND.x + DIV + Math.max(0, ys - Y_CHUTE) * 1.2, h0 + ys, LAND.z)
          hsDrop = 0; open = false
          if (i === 0) tilt = -0.6 + wob // escudo por delante, con ángulo de ataque
          else if (i === 1) tilt = lerp(-0.6, 0, smooth(p / 0.7)) + Math.sin(p * 9) * 0.12 * (1 - p) + wob
          else tilt = wob
          if (i === 2 && p > SEP3) { const u = (p - SEP3) / (1 - SEP3); hsDrop = 40 * u * u; open = true }
          if (i === 3) {
            hsDrop = 40 + 120 * p; open = true
            if (p > SEP4) { const u = (p - SEP4) / (1 - SEP4); bsRise = 45 * u * u }
          }
        } else {
          // Desvío: acelera hacia LAND inclinándose hacia allá y frena inclinándose al revés.
          stack.position.set(LAND.x + DIV * (1 - smooth(p)), h0 + ys, LAND.z)
          tilt = 0.35 * Math.sin(2 * Math.PI * p) + wob * (1 - p); comp = tilt * 0.6
        }
      } else if (i === 5) {
        // Sky crane: baja a ritmo constante mientras suelta ROPE de cable; las ruedas tocan justo al final.
        const h = lerp(20, ROPE + yRest, p)
        stack.position.set(LAND.x, h0 + h, LAND.z)
        lift = h - ROPE * smooth(p / 0.55) - yRest; alt = Math.max(0, lift)
      } else if (i === 6) {
        stack.position.set(LAND.x, h0 + ROPE + yRest + 1.5 * smooth(p), LAND.z) // cables cortados: sube un poco
      } else {
        // Vuelo de escape: sube, se inclina ~45°, acelera hacia -X y cae lejos.
        const s = p * st.dur
        tilt = 0.8 * smooth((s - 1) / 1.2)
        stack.position.set(LAND.x - Math.max(0, s - 1.5) ** 2 * 6, h0 + ROPE + yRest + 1.5 + 4 * smooth(s / 1.5) - Math.max(0, s - 4.5) ** 2 * 6, LAND.z)
        if (stack.position.y < height(clamp(stack.position.x, -HALF, HALF), stack.position.z)) crashed = true
      }
      stack.rotation.set(0, 0, tilt); stack.updateMatrixWorld(true)
      rig.heatshield.position.y = -hsDrop
      rig.heatshield.rotation.set(hsDrop * 0.012, hsDrop * 0.05, 0) // cae girando
      rig.heatshield.visible = hsDrop < 150
      if (i <= 3) rig.backshell.position.y = bsRise
      else if (!detached) { scene.attach(rig.backshell); detached = true } // se queda con el paracaídas
      if (detached) { rig.backshell.position.x += 2 * dt; rig.backshell.position.y -= 12 * dt }
      rig.skycrane.visible = open && !crashed; body.visible = open // con la cápsula cerrada no se ven: ahorra dibujado
      // Propulsores: giran desde su pivote para compensar parte de la inclinación del desvío, con un temblor leve.
      rig.thrusters.forEach((o, j) => o.quaternion.copy(rest[j]).premultiply(q.setFromAxisAngle(Z, -comp + (i >= 4 ? Math.sin(t * 7 + j * 1.9) * 0.02 : 0))))

      // Rover: pegado a la pila; colgado, con la suspensión en reposo sobre un llano imaginario; al tocar, el llano
      // se vuelve el relieve real en los últimos 0.4 m para que las ruedas apoyen sin salto.
      if (i <= 4) { body.position.copy(stack.position); body.rotation.copy(stack.rotation) }
      else {
        const w = 1 - clamp(lift / 0.4, 0, 1)
        cur.update(dt, body, LAND.x, LAND.z, 0, 0, 0, (x, z) => lerp(h0, floor(x, z), w) + lift)
      }
      ropes.visible = i === 5 || (i === 6 && p < 0.3)
      if (ropes.visible) {
        rig.anchors.forEach((o, j) => {
          o.getWorldPosition(a); body.localToWorld(b.copy(ROVER_BRIDLE[j]))
          ropePos.setXYZ(j * 2, a.x, a.y, a.z); ropePos.setXYZ(j * 2 + 1, b.x, b.y, b.z)
        })
        ropePos.needsUpdate = true
      }

      // Cielo: más oscuro arriba, el color de Rover3D abajo.
      const ys = stack.position.y - h0, air = smooth((Math.log10(Math.max(alt, 1)) - 3.9) / 1.1) // 0 bajo 8 km, 1 a 100 km
      ;(scene.background as THREE.Color).copy(sky).lerp(space, air); fog.color.copy(scene.background as THREE.Color)
      fog.density = 0.0045 * Math.min(1, 50 / Math.max(ys, 1)) // arriba la niebla de Rover3D taparía todo el suelo

      if (i <= 4) {
        // Cámara de costado por etapa; al escudo se lo mira desde abajo para verlo caer.
        if (i === 0) camOff.set(20, 5, 24)
        else if (i === 1) camOff.set(15, 2, 20)
        else if (i === 2) camOff.set(12 + hsDrop * 0.2, -6 - hsDrop * 0.1, 16 + hsDrop * 0.3)
        else if (i === 3) camOff.set(14 + bsRise * 0.5, 3 + bsRise * 0.4, 20 + bsRise * 0.7) // se aleja para ver la pila y la carcasa
        else camOff.set(14, 3, 20)
        want.copy(stack.position).add(camOff)
        look.copy(stack.position).setY(stack.position.y + 1.5 + (i === 2 ? -hsDrop * 0.15 : bsRise * 0.5))
      } else {
        // Abajo: junto al sitio, mirando entre el SkyCrane y el rover; al final, a donde arranca la cámara de Rover3D.
        // Gira en arco alrededor del rover (en línea recta pasaría por encima de él).
        const e = i === 7 ? smooth(p) : 0, ang = lerp(Math.atan2(11, 15), Math.PI, e), r = lerp(Math.hypot(11, 15), 10, e)
        camOff.set(Math.sin(ang) * r, lerp(3.5, 5.5, e), Math.cos(ang) * r)
        want.copy(body.position).add(camOff)
        look.copy(body.position).lerp(stack.position, i === 7 ? 0.5 * (1 - smooth((p - 0.2) / 0.5)) : 0.5); look.y += 1
      }
      want.y = Math.max(want.y, height(want.x, want.z) + 3)
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
