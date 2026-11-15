// Escena "Viaje a la Luna": despegue y ascenso ilustrativos que empalman con la trayectoria que calculó GMAT.
// La usan la pestaña Journey del editor y el lanzamiento del juego. Desde el primer punto de la corrida todo sale
// de los datos: aquí solo se interpola entre muestras para dibujar.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ShipResult } from '../../model/results'
import { mulberry32 } from '../engine/rng'
import { arrival, liftoff, mslCraft } from './liftoff'
import { moonTexture, mountStage, realMoon, stars } from './stage'

const R_EARTH = 6378.1363, R_MOON = 1737.4 // km, los radios de GMAT
const OMEGA = 7.2921159e-5 // rad/s, giro sidéreo: solo para pintar la Tierra entre muestras
export const T_LIFT = 5, PAD_END = 12, ASC_END = 34 // segundos de la cinemática
const ARRIVAL = 6 // segundos de la escena de llegada a la Luna
const DAY_SKY = new THREE.Color(0.56, 0.75, 0.93), SPACE = new THREE.Color(0)
const ATLAS_KM = 0.058, MSL_KM = 0.008 // largo de los modelos, para escalarlos según la distancia de la cámara
const LAYERS = [ // altitud (km) donde empieza cada capa
  { key: 'troposphere', at: 0, top: 12, color: 0x8fc8ff },
  { key: 'stratosphere', at: 12, top: 50, color: 0x5f9fff },
  { key: 'mesosphere', at: 50, top: 85, color: 0x7f6cff },
  { key: 'thermosphere', at: 85, top: 600, color: 0x48d0ff },
  { key: 'karman', at: 100, top: 0, color: 0 },
] as const
export type Layer = (typeof LAYERS)[number]['key']
export type Cam = 'follow' | 'system' | 'moon'
export type Phase = 'countdown' | 'liftoff' | 'ascent' | 'tli' | 'coast' | 'approach' | 'loi' | 'orbit'
export const LABELS = ['earth', 'moon', 'tli', 'loi', 'straight'] as const

export type Hud = {
  phase: Phase; layer: Layer | null; T: number; tEnd: number; alt: number; dMoon: number | null; speed: number | null
  count: number | null; playing: boolean; cine: boolean; done: boolean
  /** En la escena de llegada a la Luna (solo con `finale`). */
  arrival?: boolean
}
/** Mando compartido con la interfaz: la escena lo lee en cada cuadro. `stopAtPeri`: termina en el periselenio sin LOI. */
export type Ctl = { T: number; playing: boolean; speed: number; cam: Cam; camChanged: boolean; straight: boolean; seekCine: number | null; stopAtPeri: boolean }
export const newCtl = (o: Partial<Ctl> = {}): Ctl =>
  ({ T: 0, playing: false, speed: 30000, cam: 'follow', camChanged: false, straight: true, seekCine: null, stopAtPeri: false, ...o })

// GMAT MJ2000Eq (z al norte) -> three (y arriba).
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)

/** Muestras de la nave: tiempo (s desde la primera), posición y velocidad respecto a la Tierra, posición de la Luna. */
export function track(ship: ShipResult) {
  const c = ship.columns
  const col = (k: string) => c[k] ?? []
  const [a1, X, Y, Z, VX, VY, VZ, LX, LY, LZ, lon] = ['A1ModJulian', 'EarthMJ2000Eq.X', 'EarthMJ2000Eq.Y', 'EarthMJ2000Eq.Z',
    'EarthMJ2000Eq.VX', 'EarthMJ2000Eq.VY', 'EarthMJ2000Eq.VZ', 'LunaMJ2000Eq.X', 'LunaMJ2000Eq.Y', 'LunaMJ2000Eq.Z', 'Earth.Longitude'].map(col)
  const t: number[] = [], pos: THREE.Vector3[] = [], vel: THREE.Vector3[] = [], moon: THREE.Vector3[] = []
  let a0 = NaN, theta0 = 0, hasMoon = true
  const num = (...xs: unknown[]) => xs.every((x) => typeof x === 'number')
  for (let i = 0; i < a1.length; i++) {
    if (!num(a1[i], X[i], Y[i], Z[i], VX[i], VY[i], VZ[i])) continue
    const [x, y, z] = [X[i], Y[i], Z[i]] as number[]
    if (Number.isNaN(a0)) {
      a0 = a1[i] as number
      // Ángulo de giro de la Tierra = ascensión recta de la nave − su longitud (las dos de GMAT).
      if (typeof lon[i] === 'number') theta0 = Math.atan2(y, x) - ((lon[i] as number) * Math.PI) / 180
    }
    const ti = ((a1[i] as number) - a0) * 86400
    // Misma época repetida (GMAT reescribe el estado en el mismo instante): queda la última.
    if (t.length && ti <= t[t.length - 1]) { t.pop(); pos.pop(); vel.pop(); if (moon.length > t.length) moon.pop() }
    t.push(ti); pos.push(v3(x, y, z)); vel.push(v3(VX[i] as number, VY[i] as number, VZ[i] as number))
    if (num(LX[i], LY[i], LZ[i])) moon.push(v3(x - (LX[i] as number), y - (LY[i] as number), z - (LZ[i] as number)))
    else hasMoon = false
  }
  return { t, pos, vel, moon: hasMoon && moon.length === t.length ? moon : null, theta0 }
}
export type Track = ReturnType<typeof track>

/** La nave que llega más cerca de la Luna (en la plantilla, Nave y no la sonda de prueba). */
export function pickShip(ships: ShipResult[]) {
  let best = ships[0]?.name ?? '', min = Infinity
  for (const sh of ships) {
    const [x, y, z] = ['LunaMJ2000Eq.X', 'LunaMJ2000Eq.Y', 'LunaMJ2000Eq.Z'].map((k) => sh.columns[k] ?? [])
    for (let i = 0; i < x.length; i++) {
      const d = Math.hypot(Number(x[i]), Number(y[i]), Number(z[i]))
      if (d < min) { min = d; best = sh.name }
    }
  }
  return best
}

/** Periselenio: la muestra más cercana a la Luna (donde la plantilla aplica la LOI); −1 sin Luna. */
export function periIndex(tr: Track) {
  if (!tr.moon) return -1
  let best = 0
  tr.pos.forEach((p, i) => { if (p.distanceTo(tr.moon![i]) < tr.pos[best].distanceTo(tr.moon![best])) best = i })
  return best
}

/** Tierra con la imagen NaturalEarthII que trae Cesium (nivel 2: 8×4 teselas TMS, la fila 0 es la del sur). */
function earthTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024
  const g = c.getContext('2d')!; g.fillStyle = '#1b3a5c'; g.fillRect(0, 0, 2048, 1024)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) {
    const img = new Image()
    img.onload = () => { g.drawImage(img, x * 256, (3 - y) * 256, 256, 256); tex.needsUpdate = true }
    img.src = `/cesium/Assets/Textures/NaturalEarthII/2/${x}/${y}.jpg`
  }
  return tex
}

/** Brillo de borde (fresnel) para las capas de la atmósfera; con logarithmicDepthBuffer. */
function glowShell(radius: number, color: number, strength: number, power = 3) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, power: { value: power } },
    vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform vec3 color; uniform float strength; uniform float power;
varying vec3 vN; varying vec3 vV;
void main() {
  #include <logdepthbuf_fragment>
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
  gl_FragColor = vec4(color, f * strength);
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), mat)
}

/** Índice fraccional de la muestra en el tiempo `T` (búsqueda binaria). */
function frac(t: number[], T: number) {
  if (T <= t[0]) return 0
  if (T >= t[t.length - 1]) return t.length - 1
  let lo = 0, hi = t.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= T) lo = m; else hi = m }
  return lo + (T - t[lo]) / (t[hi] - t[lo])
}

export type JourneyOpts = {
  /** Se pide al terminar la plataforma; null = aún no hay (corrida en vivo): la escena espera ahí. */
  getTrack: () => Track | null
  ctl: Ctl
  labels: Partial<Record<(typeof LABELS)[number], HTMLElement | null>>
  flash: () => HTMLElement | null
  onHud: (h: Partial<Hud>) => void
  /** Al terminar la trayectoria, la escena de llegada a la Luna (el juego); `done` llega al final de esa escena. */
  finale?: boolean
}

/** Monta la escena en `el` y devuelve el limpiador. */
export function mountJourney(el: HTMLElement, o: JourneyOpts): () => void {
  return mountStage(el, ({ scene, camera, renderer }) => {
    const rng = mulberry32(11)
    const L = liftoff(scene, rng)
    const gone = () => L.st.gone
    const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0)
    const tmp = new THREE.Vector3(), tgt = new THREE.Vector3(), prevTgt = new THREE.Vector3()
    const sky = new THREE.Color()
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.minDistance = 0.02; controls.maxDistance = 2e6; controls.enabled = false

    // --- Escena a escala real (km), armada al primer uso con la trayectoria que haya ---
    const world = new THREE.Group(); world.visible = false; scene.add(world)
    const arr = o.finale ? arrival(rng, gone) : null
    if (arr) scene.add(arr.group)
    let W: ReturnType<typeof build> | null = null
    function build(tr: Track) {
      const far = stars(rng, 4000, 1e6); world.add(far)
      world.add(new THREE.AmbientLight(0x6070a0, 0.25))
      const sunL = new THREE.DirectionalLight(0xffffff, 2.6); sunL.position.set(1, 0.25, 0.6); world.add(sunL)
      const earth = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 128, 96), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.9 }))
      world.add(earth)
      for (const l of LAYERS) if (l.top) world.add(glowShell(R_EARTH + l.top, l.color, l.key === 'thermosphere' ? 0.35 : 0.5))
      world.add(glowShell(R_EARTH * 1.02, 0x5aa8ff, 0.9, 4)) // halo visible de lejos
      const moonMat = new THREE.MeshStandardMaterial({ map: moonTexture(rng), roughness: 1 }); realMoon(moonMat)
      const moon = new THREE.Mesh(new THREE.SphereGeometry(R_MOON, 96, 64), moonMat); moon.visible = !!tr.moon; world.add(moon)

      // Trayectoria de GMAT: curva suave que pasa por cada muestra (solo dibujo), completa tenue y recorrida brillante.
      const n = tr.t.length, iP = periIndex(tr)
      const tP = iP >= 0 ? tr.t[iP] : Infinity
      const curve = new THREE.CatmullRomCurve3(tr.pos, false, 'centripetal')
      const K = Math.min(20000, n * 6)
      const pts = curve.getPoints(K)
      // Si termina en el periselenio (LOI fallida) no se dibuja la órbita que nunca ocurrió.
      const shown = o.ctl.stopAtPeri && iP >= 0 ? pts.slice(0, Math.floor((iP / (n - 1)) * K) + 1) : pts
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(shown), new THREE.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.22 })))
      const trailGeo = new THREE.BufferGeometry().setFromPoints(pts)
      world.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x7fd4ff })))
      const moonCurve = tr.moon ? new THREE.CatmullRomCurve3(tr.moon, false, 'centripetal') : null
      if (moonCurve) world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(moonCurve.getPoints(600)), new THREE.LineBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.35 })))
      // Comparación: la línea recta del punto de partida a donde estará la Luna al llegar.
      const straight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tr.pos[0], iP >= 0 ? tr.moon![iP] : tr.pos[0]]),
        new THREE.LineDashedMaterial({ color: 0xffb347, dashSize: 6000, gapSize: 4000 }))
      straight.computeLineDistances(); straight.visible = false; world.add(straight)

      // Marcadores siempre visibles (tamaño fijo en pantalla).
      const beacon = (color: number, size: number) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.puff, color, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
        sp.scale.setScalar(size); world.add(sp); return sp
      }
      const glow = beacon(0xbfe6ff, 0.035)
      beacon(0x3fb950, 0.02).position.copy(tr.pos[0])
      if (iP >= 0) beacon(0xff7b72, 0.02).position.copy(tr.pos[iP])

      // Cohete del ascenso (copia del Atlas de la plataforma) y la nave MSL para el tramo de GMAT.
      const rocket = new THREE.Group(); world.add(rocket)
      const rHolder = new THREE.Group(); rHolder.scale.setScalar(0.001); rocket.add(rHolder) // GLB en metros -> km
      if (L.st.body) rHolder.add(L.st.body.clone())
      const plume = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
      plume.rotation.x = Math.PI; plume.position.y = -30; rHolder.add(plume)
      const craft = mslCraft(gone, 0.001); world.add(craft)

      // Ascenso ilustrativo: de un punto en tierra al primer estado de GMAT, llegando en la dirección de su velocidad.
      const p1 = tr.pos[0].clone(), up1 = p1.clone().normalize()
      const down = tr.vel[0].clone().addScaledVector(up1, -tr.vel[0].dot(up1)).normalize()
      const a = 0.25 // rad recorridos sobre el suelo (~1600 km)
      const up0 = up1.clone().multiplyScalar(Math.cos(a)).addScaledVector(down, -Math.sin(a))
      const P0 = up0.clone().multiplyScalar(R_EARTH + 1.5)
      const ascent = new THREE.CubicBezierCurve3(P0, P0.clone().addScaledVector(up0, 60), p1.clone().addScaledVector(down, -700), p1)

      const at = (c: THREE.CatmullRomCurve3, T: number) => c.getPoint(frac(tr.t, T) / (n - 1))
      return {
        tr, n, K, iP, tP, far, earth, moon, trailGeo, straight, glow, rocket, rHolder, craft, ascent,
        burn: craft.userData.burn as THREE.Mesh,
        tEnd: o.ctl.stopAtPeri && iP >= 0 ? tP : tr.t[n - 1],
        posAt: (T: number) => at(curve, T),
        moonAt: (T: number) => (moonCurve ? at(moonCurve, T) : null),
        velAt: (T: number) => { const f = frac(tr.t, T), i = Math.min(n - 2, Math.floor(f)); return tr.vel[i].clone().lerp(tr.vel[i + 1], f - i) },
        drawTo: (T: number) => Math.floor((frac(tr.t, T) / (n - 1)) * K) + 1,
      }
    }
    const layerAt = (alt: number) => [...LAYERS].reverse().find((l) => alt >= l.at)?.key ?? null

    let cine = 0, wall = 0, burnUntil = 0, lastHud = 0, started = false, fin = 0
    const place = (key: (typeof LABELS)[number], p: THREE.Vector3 | null, show = true) => {
      const lab = o.labels[key]
      if (!lab) return
      if (!p || !show) { lab.style.display = 'none'; return }
      tmp.copy(p).project(camera)
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { lab.style.display = 'none'; return }
      lab.style.display = 'block'
      lab.style.transform = `translate(${((tmp.x + 1) / 2) * el.clientWidth + 8}px, ${((1 - tmp.y) / 2) * el.clientHeight - 8}px)`
    }
    const near = (pad: boolean) => { camera.near = pad ? 0.05 : 0.0005; camera.far = pad ? 8000 : 5e6; camera.updateProjectionMatrix() }

    const tick = (dt: number) => {
      wall += dt
      const c = o.ctl
      if (c.seekCine != null) { cine = c.seekCine; c.seekCine = null; started = false; fin = 0; controls.enabled = false; c.playing = false }
      if (!L.st.ready) { camera.position.set(30, 9, 42); camera.lookAt(0, 13, 0); return } // la cuenta espera al modelo
      let hud: Partial<Hud>
      const flash = o.flash()
      if (!W && cine >= PAD_END - 1) { const tr = o.getTrack(); if (tr) W = build(tr) }
      const hold = !W && cine >= PAD_END - 1 // sin trayectoria todavía: el cohete sigue en el aire esperando
      if (cine < ASC_END || !W) {
        if (!hold) cine += dt
        if (flash) flash.style.opacity = String(Math.max(0, 1 - Math.abs(cine - PAD_END) / 0.6))
        if (cine < PAD_END) {
          // Plataforma: cuenta, despegue y la cámara que se va alejando.
          for (const p of L.parts) p.visible = true
          world.visible = false; scene.background = L.sky; scene.fog = L.fog; near(true)
          const k = Math.max(0, cine - T_LIFT), y = k * k * 1.6
          L.rocket.position.y = y
          L.burn(dt, cine > T_LIFT - 0.8, k * 3.2)
          L.climb(y)
          const back = 1 + k * 0.14
          camera.up.copy(Y); camera.position.set(30 * back, Math.max(9, y * 0.85 + 9), 42 * back); camera.lookAt(0, y + 13, 0)
          hud = { phase: cine < T_LIFT ? 'countdown' : 'liftoff', count: cine < T_LIFT ? Math.ceil(T_LIFT - cine) : null, alt: (y * 2.5) / 1000, layer: cine < T_LIFT ? null : 'troposphere', cine: true, done: false }
        } else {
          // Ascenso a escala real: atraviesa las capas y la cámara se aleja hasta ver la Tierra.
          if (!W) return
          for (const p of L.parts) p.visible = false
          world.visible = true; scene.fog = null; W.craft.visible = false; W.rocket.visible = true; near(false)
          const u = Math.min(1, (cine - PAD_END) / (ASC_END - PAD_END)), sU = u * u * (3 - 2 * u)
          const p = W.ascent.getPoint(sU), dir = W.ascent.getTangent(sU)
          const alt = p.length() - R_EARTH
          W.rocket.position.copy(p); W.rocket.quaternion.setFromUnitVectors(Y, dir)
          W.earth.rotation.y = W.tr.theta0
          scene.background = sky.lerpColors(DAY_SKY, SPACE, Math.min(1, alt / 70)) // azul que se apaga al subir
          const dist = 0.4 * Math.pow(9000 / 0.4, u)
          const n0 = p.clone().normalize(), side = new THREE.Vector3().crossVectors(n0, dir).normalize()
          camera.up.copy(n0).lerp(Y, THREE.MathUtils.smoothstep(u, 0.6, 1)).normalize()
          camera.position.copy(p).addScaledVector(side.multiplyScalar(0.85).addScaledVector(n0, 0.3).addScaledVector(dir, -0.4).normalize(), dist)
          camera.lookAt(p)
          W.rHolder.scale.setScalar(0.001 * Math.max(1, (dist * 0.04) / ATLAS_KM))
          W.glow.position.copy(p)
          const m0 = W.moonAt(0); if (m0) W.moon.position.copy(m0)
          hud = { phase: 'ascent', count: null, alt, layer: layerAt(alt), cine: true, done: false }
        }
      } else if (arr && started && c.T >= W.tEnd) {
        // Llegada a la Luna: corte con destello a la Luna grande; la nave la rodea (o pasa de largo) con la cámara detrás.
        fin += dt
        if (flash) flash.style.opacity = String(Math.max(0, 1 - fin / 0.6))
        world.visible = false; arr.group.visible = true; controls.enabled = false
        scene.background = sky.set(0); near(true); camera.up.copy(Y)
        arr.update(fin, !c.stopAtPeri, camera)
        hud = { arrival: true, cine: false, done: fin >= ARRIVAL }
      } else {
        if (arr) arr.group.visible = false
        if (!started) { // empieza el tramo de GMAT
          started = true; c.T = 0; c.playing = true; burnUntil = wall + 2.5
          W.rocket.visible = false; W.craft.visible = true; controls.enabled = true
          controls.target.copy(W.tr.pos[0]); prevTgt.copy(W.tr.pos[0]); camera.up.copy(Y)
          if (flash) flash.style.opacity = '0'
        }
        for (const p of L.parts) p.visible = false
        world.visible = true; scene.fog = null; scene.background = sky.set(0); near(false)
        const T0 = c.T
        const p0 = W.posAt(c.T), m0 = W.moonAt(c.T)
        const dmin = Math.min(p0.length(), m0 ? p0.distanceTo(m0) : Infinity)
        c.T = Math.min(c.T, W.tEnd)
        if (c.playing) {
          c.T = Math.min(W.tEnd, c.T + dt * c.speed * THREE.MathUtils.clamp(dmin / 80000, 0.2, 1)) // cámara lenta cerca de la Tierra y la Luna
          if (c.T >= W.tEnd) c.playing = false
        }
        if (T0 < W.tP && c.T >= W.tP && !c.stopAtPeri) burnUntil = wall + 2.5
        const P = W.posAt(c.T), M = W.moonAt(c.T), V = W.velAt(c.T)
        W.earth.rotation.y = W.tr.theta0 + OMEGA * c.T
        if (M) { W.moon.position.copy(M); W.moon.quaternion.setFromUnitVectors(X, M.clone().negate().normalize()) } // cara visible hacia la Tierra
        const loi = Math.abs(c.T - W.tP) < 3600 && !c.stopAtPeri
        W.craft.position.copy(P); W.craft.lookAt(tmp.copy(P).addScaledVector(V, loi ? -1 : 1)) // la LOI frena: motor hacia adelante
        W.burn.visible = wall < burnUntil
        W.glow.position.copy(P)
        W.trailGeo.setDrawRange(0, W.drawTo(c.T))
        W.straight.visible = W.iP >= 0 && c.straight

        // Cámara: sigue al objetivo elegido moviéndose con él; el usuario gira y acerca con el ratón.
        const goal = () => (c.cam === 'follow' ? P : c.cam === 'moon' && M ? M : M ? tmp.copy(M).multiplyScalar(0.5) : tmp.set(0, 0, 0))
        if (c.camChanged) {
          c.camChanged = false
          const g = goal().clone(), d = c.cam === 'follow' ? 600 : c.cam === 'moon' ? 30000 : 520000
          prevTgt.copy(g); controls.target.copy(g)
          camera.position.copy(g).add(new THREE.Vector3(0.35, 0.75, 0.55).normalize().multiplyScalar(d))
        }
        tgt.copy(goal())
        const delta = tgt.clone().sub(prevTgt); prevTgt.copy(tgt)
        controls.target.add(delta); camera.position.add(delta)
        controls.update()
        W.craft.scale.setScalar(Math.max(1, (camera.position.distanceTo(P) * 0.03) / MSL_KM))

        const tP = W.tP
        const phase: Phase = c.T < 1800 ? 'tli' : !M ? 'coast' : c.T < tP - 8 * 3600 ? 'coast' : c.T < tP - 600 ? 'approach' : c.stopAtPeri ? 'approach' : c.T < tP + 3 * 3600 ? 'loi' : 'orbit'
        hud = { phase, count: null, layer: null, alt: P.length() - R_EARTH, dMoon: M ? P.distanceTo(M) - R_MOON : null, speed: V.length(), cine: false, done: !arr && c.T >= W.tEnd }
        place('moon', M)
        place('tli', W.tr.pos[0])
        place('loi', W.iP >= 0 && !c.stopAtPeri ? W.tr.pos[W.iP] : null)
        place('straight', W.iP >= 0 ? W.tr.pos[0].clone().lerp(W.tr.moon![W.iP], 0.55) : null, c.straight)
      }
      if (W) W.far.position.copy(camera.position)
      place('earth', world.visible && W ? W.earth.position : null)
      if (cine < ASC_END || fin > 0) for (const k of ['moon', 'tli', 'loi', 'straight'] as const) place(k, null)
      if (wall - lastHud > 0.1) { lastHud = wall; o.onHud({ ...hud, T: c.T, tEnd: W?.tEnd ?? 0, playing: c.playing }) }
    }
    return Object.assign(tick, { cleanup: () => { L.st.gone = true; controls.dispose() } })
  }, true)
}
