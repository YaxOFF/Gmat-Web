import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { clamp, mulberry32 } from '../engine/rng'
import { loadCuriosity, meshHeight, type CuriosityRig } from './curiosity'
import { loadDem, demHeight, noise, SIZE as BASE_SIZE, type Dem } from './dem'
import { edlEnvironment, loadEdl, ROVER_BRIDLE, type EdlRig } from './edl'
import { puffs, puffTexture } from './Launch3D'
import { DEFAULT_ROVER, siteDeposits, siteRocks, untileMaterial, type RoverStart } from './Rover3D'
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
// Terreno jugable con la misma área (× MARS.scale) y malla que Rover3D en Marte: si no, el corte cambia el suelo.
const SIZE = BASE_SIZE * MARS.scale, HALF = SIZE / 2, SEG = Math.round(200 * MARS.scale)
const DIV = 40 // m: la pila baja corrida en +X y el desvío propulsado la trae sobre LAND, lejos de la carcasa
const ROPE = 7.5 // m que baja el rover colgado de los cables
const SEP3 = 0.15, SEP4 = 0.2 // avance de su etapa en que se suelta el escudo / la carcasa
const Z = new THREE.Vector3(0, 0, 1)
// Escape hacia +Z y un poco a -X: el choque queda dentro del cuadro final (cámara detrás del rover mirando a +Z).
const FLY = new THREE.Vector3(-0.45, 0, 0.89).normalize(), FLY_AXIS = new THREE.Vector3(FLY.z, 0, -FLY.x)
const ENTRY_DIR = new THREE.Vector3(1.2, 1, 0).normalize() // contrario a la marcha de la entrada: hacia allá va la estela
const SUN_OFF = new THREE.Vector3(160, 220, -260)
const CHUTE_R = 12, CHUTE_L = 30, CHUTE_TH = 1.0, GORES = 16 // casquete, largo de las líneas y abertura (rad)
const DUST = new THREE.Color(0xe6cfb4)
const QUALITY = 0.8 // el de MarsTest para Rover3D: tiñe el suelo con la señal de hidrógeno igual que allá

const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Altura en pantalla (m sobre el suelo): real bajo 100 m, logarítmica arriba (como Descent3D). */
const screenY = (alt: number) => (alt < 100 ? alt : 100 + Math.log10(alt / 100) * 60)
const Y_CHUTE = screenY(11000)

interface Hud { alt: number; vel: number; stage: string; t: number }

/** Entrada, descenso y aterrizaje en Marte (cinemática): las 8 etapas con plasma, paracaídas, llamas y polvo. */
/** `start` = el mismo que recibirá Rover3D: cambia cuántos depósitos salen y, con eso, el rng de las rocas. */
export function Edl3D({ site, seed, onDone, start = DEFAULT_ROVER }: { site: RoverSite; seed: number; onDone: () => void; start?: RoverStart }) {
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
    const { signalAt } = siteDeposits(rng, site, start, MARS) // mismo rng que Rover3D: después salen las mismas rocas
    const d = dem!.dem
    const height = d ? demHeight(d, n, SIZE) : (x: number, z: number) => n(x + 500, z + 500) * 3.2
    const h0 = height(LAND.x, LAND.z)

    const env = edlEnvironment(renderer); scene.environment = env
    const sky = new THREE.Color(MARS.sky!), space = new THREE.Color(0x120c10)
    scene.background = sky.clone()
    const fog = new THREE.FogExp2(MARS.sky!, 0.0045); scene.fog = fog
    scene.add(new THREE.HemisphereLight(0xe0b48a, 0x3a2418, 0.9))
    // El sol sigue a la pila (y abajo al rover) con una cámara de sombra chica: sombras nítidas en la zona de contacto.
    const sun = new THREE.DirectionalLight(0xffe2c4, 2.8); sun.position.copy(SUN_OFF); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005
    Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, far: 900 })
    scene.add(sun, sun.target)

    // Terreno: el jugable de Rover3D (relieve real) y uno exterior hasta el horizonte, con el mismo material. Sin luz del
    // entorno (Rover3D no tiene) y con los mismos colores de vértice, así el corte a Rover3D no cambia el suelo.
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: new THREE.Color(0.5, 0.5, 0.5), envMapIntensity: 0 })
    untileMaterial(groundMat)
    const plane = (size: number, seg: number, y: (x: number, z: number) => number, uvMeters: boolean, tint: boolean) => {
      const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2)
      const p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i); p.setY(i, y(x, z))
        if (uvMeters) uv.setXY(i, (x + HALF) / SIZE, (HALF - z) / SIZE)
        const v = (0.84 + n(x * 3, z * 3) * 0.24) * 1.15, s = tint ? signalAt(x, z) * QUALITY * 0.8 : 0
        col.set([v * (1 - s * 0.6), v * (1 - s * 0.2), v + s * 0.7], i * 3)
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals()
      const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; scene.add(m)
      return g
    }
    const floor = meshHeight(plane(SIZE, SEG, height, false, MARS.science === 'ice'), SIZE, SEG) // lo que pisan las ruedas, igual que en Rover3D
    const rocks = siteRocks(rng, n, height, floor, site, MARS); scene.add(rocks.mesh)
    for (const m of [rocks.mesh.material].flat()) (m as THREE.MeshStandardMaterial).envMapIntensity = 0
    plane(SIZE * 10, SIZE, (x, z) => {
      const out = Math.max(Math.abs(x), Math.abs(z)) - HALF, bx = clamp(x, -HALF, HALF), bz = clamp(z, -HALF, HALF)
      return out < -1e-3 ? height(bx, bz) - 6 : height(bx, bz) - 0.3 + clamp(out / 60, 0, 1) * (n(x * 0.2 + 900, z * 0.2 + 900) - 0.8) * 14
    }, true, false)
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

    // Efectos. Una sola luz puntual: naranja del plasma en la entrada, azulada de los motores después.
    const glow = new THREE.PointLight(0xffffff, 0, 80, 2); scene.add(glow)
    const puff = puffTexture()
    const trail = puffs(scene, 220, puff, true), dust = puffs(scene, 320, puff, false, height, LAND.x, LAND.z)
    // Plasma: casquete aditivo delante del escudo (se ajusta al tamaño del escudo al cargar).
    const plasma = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    // Paracaídas de disco y banda: casquete con gajos blancos y naranjas, líneas hasta el cono de la carcasa.
    const chute = new THREE.Group(); chute.visible = false
    const cg = new THREE.SphereGeometry(CHUTE_R, GORES * 3, 10, 0, Math.PI * 2, 0.08, CHUTE_TH), uvs = cg.attributes.uv
    const cc = new Float32Array(uvs.count * 3), white = new THREE.Color(0xf2efe8), orange = new THREE.Color(0xe8641e)
    for (let k = 0; k < uvs.count; k++) {
      const gore = Math.floor(uvs.getX(k) * GORES) % GORES, band = (1 - uvs.getY(k)) * Math.PI > 0.72 ? 2 : 0
      ;((gore + band) % 4 === 0 ? orange : white).toArray(cc, k * 3)
    }
    cg.setAttribute('color', new THREE.BufferAttribute(cc, 3))
    const canopy = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }))
    canopy.position.y = CHUTE_L - CHUTE_R * Math.cos(CHUTE_TH); canopy.castShadow = true
    const rim = CHUTE_R * Math.sin(CHUTE_TH), lines: number[] = []
    for (let k = 0; k < GORES; k++) { const f = (k / GORES) * Math.PI * 2; lines.push(0, 0, 0, Math.cos(f) * rim, CHUTE_L, Math.sin(f) * rim) }
    chute.add(canopy, new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)), new THREE.LineBasicMaterial({ color: 0xd8d0c0 })))
    // Llamas de los 8 motores: conos aditivos azulados por su -Y local, una geometría y un material compartidos.
    const flameGeo = new THREE.ConeGeometry(0.11, 1.4, 10, 1, true).rotateX(Math.PI).translate(0, -0.7, 0)
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x8fc4ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    const flames: THREE.Mesh[] = []
    let hsR = 3, hsBottom = 0
    let rig: EdlRig | null = null, cur: CuriosityRig | null = null, rest: THREE.Quaternion[] = [], yRest = 0, dead = false
    Promise.all([loadCuriosity(), loadEdl()]).then(([r, edl]) => {
      if (dead) return
      r.model.traverse((o) => { o.castShadow = true })
      body.add(r.model); stack.add(edl.root); rig = edl; cur = r
      rest = edl.thrusters.map((o) => o.quaternion.clone())
      // Medidas del escudo y la punta de la carcasa, con la pila aún en el origen.
      edl.root.updateMatrixWorld(true)
      const hb = new THREE.Box3().setFromObject(edl.heatshield), bb = new THREE.Box3().setFromObject(edl.backshell)
      hsR = (hb.max.x - hb.min.x) / 2; hsBottom = edl.heatshield.worldToLocal(a.set(0, hb.min.y, 0)).y
      plasma.scale.set(hsR * 1.25, hsR * 0.6, hsR * 1.25); plasma.position.y = hsBottom + hsR * 0.25; edl.heatshield.add(plasma)
      chute.position.copy(edl.backshell.worldToLocal(a.set(0, bb.max.y, 0))); edl.backshell.add(chute)
      for (const nz of edl.nozzles) { const f = new THREE.Mesh(flameGeo, flameMat); flames.push(f); nz.add(f) }
      // Altura del origen del rover apoyado en llano: dice cuánto le falta a las ruedas para tocar.
      r.update(0, body, LAND.x, LAND.z, 0, 0, 0, () => h0); yRest = body.position.y - h0
    }).catch((e: Error) => !dead && setErr(e.message))

    const camOff = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3(), camLook = new THREE.Vector3()
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion()
    let t = 0, hudT = 0, first = true, ended = false, detached = false, crashed = false, trailAcc = 0, dustAcc = 0
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
        const d = Math.max(0, s - 1.5) ** 2 * 6, sp = stack.position
        sp.set(LAND.x + FLY.x * d, h0 + ROPE + yRest + 1.5 + 4 * smooth(s / 1.5) - Math.max(0, s - 4.5) ** 2 * 6, LAND.z + FLY.z * d)
        const gy = height(clamp(sp.x, -HALF, HALF), clamp(sp.z, -HALF, HALF))
        if (!crashed && sp.y < gy) {
          crashed = true // nube de polvo donde cae
          for (let k = 0; k < 90; k++) {
            const f = Math.random() * Math.PI * 2, v = 3 + Math.random() * 8
            dust.emit(a.set(sp.x, gy + 1, sp.z), b.set(Math.cos(f) * v, 2 + Math.random() * 8, Math.sin(f) * v), 5 + Math.random() * 4, 4, 5)
          }
        }
      }
      if (i === 7) stack.quaternion.setFromAxisAngle(FLY_AXIS, tilt)
      else stack.rotation.set(0, 0, tilt)
      stack.updateMatrixWorld(true)
      rig.heatshield.position.y = -hsDrop
      rig.heatshield.rotation.set(hsDrop * 0.012, hsDrop * 0.05, 0) // cae girando
      rig.heatshield.visible = hsDrop < 150
      if (i <= 3) rig.backshell.position.y = bsRise
      else if (!detached) { scene.attach(rig.backshell); detached = true } // se queda con el paracaídas
      if (detached) {
        const bp = rig.backshell.position; bp.x += 2 * dt; bp.y -= 12 * dt
        rig.backshell.visible = bp.y > height(clamp(bp.x, -HALF, HALF), bp.z) // se oculta al llegar al suelo
      }
      // Paracaídas: sale en la etapa 2 (se estira, se infla con un rebote) y queda vertical con un balanceo leve.
      chute.visible = i >= 1
      if (chute.visible) {
        const k = i === 1 ? p : 1, reach = smooth(k / 0.2), inf = clamp((k - 0.15) / 0.25, 0, 1)
        const w = 0.08 + 0.92 * smooth(inf) * (1 + 0.12 * Math.sin(inf * Math.PI * 3) * (1 - inf))
        chute.scale.set(w, Math.max(reach, 0.01), w)
        chute.rotation.set(Math.sin(t * 0.9) * 0.05, 0, -(i <= 3 ? tilt : 0) + Math.sin(t * 0.7) * 0.07)
      }
      // Plasma: crece al entrar en la atmósfera y se apaga al frenar, antes del paracaídas.
      const heat = i === 0 ? smooth(p / 0.15) * (1 - smooth((p - 0.55) / 0.45)) : 0
      plasma.visible = heat > 0.01
      ;(plasma.material as THREE.MeshBasicMaterial).opacity = heat * (0.65 + Math.random() * 0.15)
      trailAcc += dt * 110 * heat
      for (; trailAcc >= 1; trailAcc--) {
        const f = Math.random() * Math.PI * 2
        rig.heatshield.localToWorld(a.set(Math.cos(f) * hsR, hsBottom + hsR * 0.3, Math.sin(f) * hsR))
        trail.emit(a, b.copy(ENTRY_DIR).multiplyScalar(14 + Math.random() * 8).addScaledVector(Z, (Math.random() - 0.5) * 3), 0.5 + Math.random() * 0.5, hsR * 0.6, hsR * 1.2)
      }
      trail.step(dt, (u, m) => { m.color.setHSL(0.1 - u * 0.09, 1, 0.65 - u * 0.35); m.opacity = 0.5 * (1 - u) ** 2 })
      // Motores: encendidos desde el descenso propulsado; más suaves colgando el rover, apagados tras el choque.
      const thr = crashed ? 0 : i === 4 || i === 7 ? 1 : i === 5 ? 0.65 : i === 6 ? 0.5 : 0
      for (const f of flames) { f.visible = thr > 0; f.scale.set(1, thr * (0.8 + Math.random() * 0.4), 1) }
      if (heat > 0.01) { rig.heatshield.localToWorld(glow.position.set(0, hsBottom - hsR * 0.5, 0)); glow.color.setHex(0xff8a3a); glow.intensity = 25 * heat }
      else if (thr > 0) { rig.skycrane.localToWorld(glow.position.set(0, -0.8, 0)); glow.color.setHex(0x9fc8ff); glow.intensity = thr * (35 + Math.random() * 15) }
      else glow.intensity = 0
      // Polvo: el chorro levanta el suelo cuando la nave baja de 25 m.
      const sp = stack.position, gy = height(clamp(sp.x, -HALF, HALF), clamp(sp.z, -HALF, HALF)), blast = thr * clamp(1 - (sp.y - gy) / 25, 0, 1)
      dustAcc += dt * 120 * blast
      for (; dustAcc >= 1; dustAcc--) {
        const f = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3, v = 6 + Math.random() * 8 * blast
        const x = sp.x + Math.cos(f) * r, z = sp.z + Math.sin(f) * r
        dust.emit(a.set(x, height(clamp(x, -HALF, HALF), clamp(z, -HALF, HALF)) + 0.6, z), b.set(Math.cos(f) * v, 0.5 + Math.random() * 2, Math.sin(f) * v), 2.5 + Math.random() * 1.5, 1.8, 3)
      }
      dust.step(dt, (u, m) => { m.color.copy(DUST); m.opacity = 0.7 * Math.min(1, u * 10) * (1 - u) ** 1.5 }, 0.9, 0.4)
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
      sun.target.position.copy(i >= 5 ? body.position : stack.position); sun.position.copy(sun.target.position).add(SUN_OFF)
      fog.density = 0.0045 * Math.min(1, 50 / Math.max(ys, 1)) // arriba la niebla de Rover3D taparía todo el suelo

      if (i <= 4) {
        // Cámara de costado por etapa; al escudo se lo mira desde abajo para verlo caer.
        if (i === 0) camOff.set(20, 5, 24)
        else if (i === 1) camOff.set(15, 2, 20).lerp(a.set(30, 6, 44), smooth(p / 0.4)) // se aleja para que entre el paracaídas
        else if (i === 2) camOff.set(12 + hsDrop * 0.2, -6 - hsDrop * 0.1, 16 + hsDrop * 0.3)
        else if (i === 3) camOff.set(14 + bsRise * 0.5, 3 + bsRise * 0.4, 20 + bsRise * 0.7) // se aleja para ver la pila y la carcasa
        else camOff.set(14, 3, 20)
        want.copy(stack.position).add(camOff)
        look.copy(stack.position).setY(stack.position.y + 1.5 + (i === 1 ? 12 * smooth(p / 0.4) : i === 2 ? -hsDrop * 0.15 : bsRise * 0.5))
      } else {
        // Abajo: junto al sitio, mirando entre el SkyCrane y el rover; al final, a donde arranca la cámara de Rover3D.
        // Gira en arco alrededor del rover (en línea recta pasaría por encima de él).
        const e = i === 7 ? smooth(p) : 0, ang = lerp(Math.atan2(11, 15), Math.PI, e), r = lerp(Math.hypot(11, 15), 10, e)
        camOff.set(Math.sin(ang) * r, lerp(3.5, 5.5, e), Math.cos(ang) * r)
        // Al final, exactamente la persecución con que arranca Rover3D: suelo + (0, 5.5, -10), mirando a suelo + 1.2.
        want.copy(body.position).lerp(a.set(LAND.x, h0, LAND.z), e).add(camOff)
        look.copy(body.position).lerp(stack.position, i === 7 ? 0.5 * (1 - smooth((p - 0.2) / 0.5)) : 0.5); look.y += 1
        look.lerp(b.set(LAND.x, h0 + 1.2, LAND.z), e)
      }
      const fin = i === 7 ? smooth(p) : 0
      want.y = Math.max(want.y, height(want.x, want.z) + 3 * (1 - fin)) // Rover3D no corrige la altura: al final tampoco
      scene.environmentIntensity = 1 - fin // Rover3D no tiene entorno: se apaga mientras el SkyCrane se va
      if (first) { camera.position.copy(want); camLook.copy(look); first = false }
      const k = 1 - Math.exp(-dt * (2.5 + 6 * fin)) // al final se pega al encuadre de Rover3D
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
      {!h && <div className="edl-loading"><b>{err ? 'LOAD FAILED' : 'PREPARING ENTRY…'}</b><span>{site.name} · terrain and spacecraft</span></div>}
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
