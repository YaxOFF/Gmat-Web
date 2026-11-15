// Vista "Viaje": despegue y ascenso ilustrativos (three.js) que empalman con la trayectoria que calculó GMAT.
// Desde el primer punto de la corrida todo sale de los datos: aquí solo se interpola entre muestras para dibujar.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { en as es } from '../i18n/en'
import { mulberry32 } from '../mission-architect/engine/rng'
import { liftoff, mslCraft } from '../mission-architect/three/liftoff'
import { moonTexture, mountStage, realMoon, stars } from '../mission-architect/three/stage'
import type { ShipResult } from '../model/results'
import { useApp } from '../store'
import s from './Results.module.css'

const R_EARTH = 6378.1363, R_MOON = 1737.4 // km, los radios de GMAT
const OMEGA = 7.2921159e-5 // rad/s, giro sidéreo: solo para pintar la Tierra entre muestras
const T_LIFT = 5, PAD_END = 12, ASC_END = 34 // segundos de la cinemática
const ATLAS_KM = 0.058, MSL_KM = 0.008 // largo de los modelos, para escalarlos según la distancia de la cámara
const LAYERS = [ // altitud (km) donde empieza cada capa; los nombres están en i18n
  { key: 'troposphere', at: 0, top: 12, color: 0x8fc8ff },
  { key: 'stratosphere', at: 12, top: 50, color: 0x5f9fff },
  { key: 'mesosphere', at: 50, top: 85, color: 0x7f6cff },
  { key: 'thermosphere', at: 85, top: 600, color: 0x48d0ff },
  { key: 'karman', at: 100, top: 0, color: 0 },
] as const
type Layer = (typeof LAYERS)[number]['key']
type Cam = 'follow' | 'system' | 'moon'
type Phase = 'countdown' | 'liftoff' | 'ascent' | 'tli' | 'coast' | 'approach' | 'loi' | 'orbit'

// GMAT MJ2000Eq (z al norte) -> three (y arriba).
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)

/** Muestras de la nave: tiempo (s desde la primera), posición y velocidad respecto a la Tierra, posición de la Luna. */
function track(ship: ShipResult) {
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
type Track = ReturnType<typeof track>

/** La nave que llega más cerca de la Luna (en la plantilla, Nave y no la sonda de prueba). */
function pickShip(ships: ShipResult[]) {
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

type Hud = { phase: Phase; layer: Layer | null; T: number; alt: number; dMoon: number | null; speed: number | null; count: number | null; playing: boolean; cine: boolean }
type Ctl = { T: number; playing: boolean; speed: number; cam: Cam; camChanged: boolean; straight: boolean; seekCine: number | null }

function Journey({ tr }: { tr: Track }) {
  const host = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const labels = useRef<Record<string, HTMLDivElement | null>>({})
  const tEnd = tr.t[tr.t.length - 1]
  const ctl = useRef<Ctl>({ T: 0, playing: false, speed: 30000, cam: 'follow', camChanged: false, straight: true, seekCine: null })
  const [hud, setHud] = useState<Hud>({ phase: 'countdown', layer: null, T: 0, alt: 0, dMoon: null, speed: null, count: T_LIFT, playing: false, cine: true })
  const [cam, setCam] = useState<Cam>('follow')
  const [speed, setSpeed] = useState(30000)
  const [straight, setStraight] = useState(true)

  // Periselenio: la muestra más cercana a la Luna, donde la plantilla aplica la LOI.
  const iP = useMemo(() => {
    if (!tr.moon) return -1
    let best = 0
    tr.pos.forEach((p, i) => { if (p.distanceTo(tr.moon![i]) < tr.pos[best].distanceTo(tr.moon![best])) best = i })
    return best
  }, [tr])

  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer }) => {
    const rng = mulberry32(11)
    const L = liftoff(scene, rng)
    const gone = () => L.st.gone

    // --- Escena a escala real (km) ---
    const world = new THREE.Group(); world.visible = false; scene.add(world)
    const sky = new THREE.Color()
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
    const n = tr.t.length
    const curve = new THREE.CatmullRomCurve3(tr.pos, false, 'centripetal')
    const K = Math.min(20000, n * 6)
    const pts = curve.getPoints(K)
    const pathGeo = new THREE.BufferGeometry().setFromPoints(pts)
    world.add(new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.22 })))
    const trailGeo = new THREE.BufferGeometry().setFromPoints(pts)
    world.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x7fd4ff })))
    const moonCurve = tr.moon ? new THREE.CatmullRomCurve3(tr.moon, false, 'centripetal') : null
    if (moonCurve) world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(moonCurve.getPoints(600)), new THREE.LineBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.35 })))
    // Comparación: la línea recta del punto de partida a donde estará la Luna al llegar.
    const straightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tr.pos[0], iP >= 0 ? tr.moon![iP] : tr.pos[0]]),
      new THREE.LineDashedMaterial({ color: 0xffb347, dashSize: 6000, gapSize: 4000 }))
    straightLine.computeLineDistances(); straightLine.visible = iP >= 0; world.add(straightLine)

    // Marcadores siempre visibles (tamaño fijo en pantalla).
    const beacon = (color: number, size: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.puff, color, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      sp.scale.setScalar(size); world.add(sp); return sp
    }
    const shipGlow = beacon(0xbfe6ff, 0.035)
    beacon(0x3fb950, 0.02).position.copy(tr.pos[0])
    if (iP >= 0) beacon(0xff7b72, 0.02).position.copy(tr.pos[iP])

    // Cohete del ascenso (copia del Atlas de la plataforma) y la nave MSL para el tramo de GMAT.
    const rocket = new THREE.Group(); world.add(rocket)
    const rHolder = new THREE.Group(); rHolder.scale.setScalar(0.001); rocket.add(rHolder) // GLB en metros -> km
    const plume = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
    plume.rotation.x = Math.PI; plume.position.y = -30; rHolder.add(plume)
    const craft = mslCraft(gone, 0.001); world.add(craft)
    const craftBurn = craft.userData.burn as THREE.Mesh

    // Ascenso ilustrativo: de un punto en tierra al primer estado de GMAT, llegando en la dirección de su velocidad.
    const p1 = tr.pos[0].clone(), up1 = p1.clone().normalize()
    const down = tr.vel[0].clone().addScaledVector(up1, -tr.vel[0].dot(up1)).normalize()
    const a = 0.25 // rad recorridos sobre el suelo (~1600 km)
    const up0 = up1.clone().multiplyScalar(Math.cos(a)).addScaledVector(down, -Math.sin(a))
    const P0 = up0.clone().multiplyScalar(R_EARTH + 1.5)
    const ascent = new THREE.CubicBezierCurve3(P0, P0.clone().addScaledVector(up0, 60), p1.clone().addScaledVector(down, -700), p1)

    camera.near = 0.0005; camera.far = 5e6; camera.updateProjectionMatrix()
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.minDistance = 0.02; controls.maxDistance = 2e6; controls.enabled = false

    const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0)
    const tmp = new THREE.Vector3(), tgt = new THREE.Vector3(), prevTgt = new THREE.Vector3()
    const posAt = (T: number) => curve.getPoint(frac(tr.t, T) / (n - 1))
    const moonAt = (T: number) => (moonCurve ? moonCurve.getPoint(frac(tr.t, T) / (n - 1)) : null)
    const velAt = (T: number) => { const f = frac(tr.t, T), i = Math.min(n - 2, Math.floor(f)); return tr.vel[i].clone().lerp(tr.vel[i + 1], f - i) }
    const tP = iP >= 0 ? tr.t[iP] : Infinity
    const layerAt = (alt: number) => [...LAYERS].reverse().find((l) => alt >= l.at)?.key ?? null

    let cine = 0, wall = 0, burnUntil = 0, lastHud = 0, started = false
    const place = (el: HTMLDivElement | null | undefined, p: THREE.Vector3 | null, show = true) => {
      if (!el) return
      if (!p || !show) { el.style.display = 'none'; return }
      tmp.copy(p).project(camera)
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { el.style.display = 'none'; return }
      el.style.display = 'block'
      el.style.transform = `translate(${((tmp.x + 1) / 2) * host.current!.clientWidth + 8}px, ${((1 - tmp.y) / 2) * host.current!.clientHeight - 8}px)`
    }

    const tick = (dt: number) => {
      wall += dt
      const c = ctl.current
      if (c.seekCine != null) { cine = c.seekCine; c.seekCine = null; started = false; controls.enabled = false; c.playing = false }
      if (!L.st.ready) { camera.position.set(30, 9, 42); camera.lookAt(0, 13, 0); return } // la cuenta espera al modelo
      let hudNext: Partial<Hud>
      if (cine < ASC_END) {
        cine += dt
        if (flash.current) flash.current.style.opacity = String(Math.max(0, 1 - Math.abs(cine - PAD_END) / 0.6))
        if (cine < PAD_END) {
          // Plataforma: cuenta, despegue y la cámara que se va alejando.
          for (const o of L.parts) o.visible = true
          world.visible = false; scene.background = L.sky; scene.fog = L.fog; camera.near = 0.05; camera.far = 8000; camera.updateProjectionMatrix()
          const k = Math.max(0, cine - T_LIFT), y = k * k * 1.6
          L.rocket.position.y = y
          L.burn(dt, cine > T_LIFT - 0.8, k * 3.2)
          L.climb(y)
          const back = 1 + k * 0.14
          camera.up.copy(Y); camera.position.set(30 * back, Math.max(9, y * 0.85 + 9), 42 * back); camera.lookAt(0, y + 13, 0)
          hudNext = { phase: cine < T_LIFT ? 'countdown' : 'liftoff', count: cine < T_LIFT ? Math.ceil(T_LIFT - cine) : null, alt: y * 2.5 / 1000, layer: cine < T_LIFT ? null : 'troposphere', cine: true }
        } else {
          // Ascenso a escala real: atraviesa las capas y la cámara se aleja hasta ver la Tierra.
          for (const o of L.parts) o.visible = false
          world.visible = true; scene.fog = null; craft.visible = false; rocket.visible = true
          camera.near = 0.0005; camera.far = 5e6; camera.updateProjectionMatrix()
          const u = Math.min(1, (cine - PAD_END) / (ASC_END - PAD_END)), sU = u * u * (3 - 2 * u)
          const p = ascent.getPoint(sU), dir = ascent.getTangent(sU)
          const alt = p.length() - R_EARTH
          rocket.position.copy(p); rocket.quaternion.setFromUnitVectors(Y, dir)
          earth.rotation.y = tr.theta0
          scene.background = sky.setRGB(0.56, 0.75, 0.93).lerp(new THREE.Color(0), Math.min(1, alt / 70))
          const dist = 0.4 * Math.pow(9000 / 0.4, u)
          const n0 = p.clone().normalize(), side = new THREE.Vector3().crossVectors(n0, dir).normalize()
          camera.up.copy(n0).lerp(Y, THREE.MathUtils.smoothstep(u, 0.6, 1)).normalize()
          camera.position.copy(p).addScaledVector(side.multiplyScalar(0.85).addScaledVector(n0, 0.3).addScaledVector(dir, -0.4).normalize(), dist)
          camera.lookAt(p)
          rHolder.scale.setScalar(0.001 * Math.max(1, (dist * 0.04) / ATLAS_KM))
          shipGlow.position.copy(p)
          moon.position.copy(moonAt(0) ?? tmp.set(0, 0, 0))
          hudNext = { phase: 'ascent', count: null, alt, layer: layerAt(alt), cine: true }
        }
      } else {
        if (!started) { // empieza el tramo de GMAT
          started = true; c.T = 0; c.playing = true; burnUntil = wall + 2.5
          rocket.visible = false; craft.visible = true; controls.enabled = true
          controls.target.copy(tr.pos[0]); prevTgt.copy(tr.pos[0]); camera.up.copy(Y)
          if (flash.current) flash.current.style.opacity = '0'
        }
        for (const o of L.parts) o.visible = false
        world.visible = true; scene.fog = null; scene.background = sky.set(0)
        const T0 = c.T
        const p = posAt(c.T), m = moonAt(c.T)
        const dmin = Math.min(p.length(), m ? p.distanceTo(m) : Infinity)
        if (c.playing) {
          c.T = Math.min(tEnd, c.T + dt * c.speed * THREE.MathUtils.clamp(dmin / 80000, 0.2, 1)) // cámara lenta cerca de la Tierra y la Luna
          if (c.T >= tEnd) c.playing = false
        }
        if (T0 < tP && c.T >= tP) burnUntil = wall + 2.5
        const P = posAt(c.T), M = moonAt(c.T), V = velAt(c.T)
        earth.rotation.y = tr.theta0 + OMEGA * c.T
        if (M) { moon.position.copy(M); moon.quaternion.setFromUnitVectors(X, M.clone().negate().normalize()) } // cara visible hacia la Tierra
        const loi = Math.abs(c.T - tP) < 3600
        craft.position.copy(P); craft.lookAt(tmp.copy(P).addScaledVector(V, loi ? -1 : 1)) // la LOI frena: motor hacia adelante
        craftBurn.visible = wall < burnUntil
        shipGlow.position.copy(P)
        trailGeo.setDrawRange(0, Math.floor((frac(tr.t, c.T) / (n - 1)) * K) + 1)
        straightLine.visible = iP >= 0 && c.straight

        // Cámara: sigue al objetivo elegido moviéndose con él; el usuario gira y acerca con el ratón.
        if (c.camChanged) {
          c.camChanged = false
          const goal = c.cam === 'follow' ? P : c.cam === 'moon' && M ? M : M ? M.clone().multiplyScalar(0.5) : new THREE.Vector3()
          const d = c.cam === 'follow' ? 600 : c.cam === 'moon' ? 30000 : 520000
          prevTgt.copy(goal); controls.target.copy(goal)
          camera.position.copy(goal).add(new THREE.Vector3(0.35, 0.75, 0.55).normalize().multiplyScalar(d))
        }
        tgt.copy(c.cam === 'follow' ? P : c.cam === 'moon' && M ? M : M ? tmp.copy(M).multiplyScalar(0.5) : tmp.set(0, 0, 0))
        const delta = tgt.clone().sub(prevTgt); prevTgt.copy(tgt)
        controls.target.add(delta); camera.position.add(delta)
        controls.update()
        const dist = camera.position.distanceTo(P)
        craft.scale.setScalar(Math.max(1, (dist * 0.03) / MSL_KM))

        const phase: Phase = c.T < 1800 ? 'tli' : !M ? 'coast' : c.T < tP - 8 * 3600 ? 'coast' : c.T < tP - 600 ? 'approach' : c.T < tP + 3 * 3600 ? 'loi' : 'orbit'
        hudNext = { phase, count: null, layer: null, alt: P.length() - R_EARTH, dMoon: M ? P.distanceTo(M) - R_MOON : null, speed: V.length(), cine: false }
        place(labels.current.moon, M)
        place(labels.current.tli, tr.pos[0])
        place(labels.current.loi, iP >= 0 ? tr.pos[iP] : null)
        place(labels.current.straight, iP >= 0 ? tr.pos[0].clone().lerp(tr.moon![iP], 0.55) : null, c.straight)
      }
      far.position.copy(camera.position)
      place(labels.current.earth, world.visible ? earth.position : null)
      if (cine < ASC_END) for (const k of ['moon', 'tli', 'loi', 'straight']) place(labels.current[k], null)
      if (wall - lastHud > 0.1) { lastHud = wall; setHud((h) => ({ ...h, ...hudNext, T: c.T, playing: c.playing })) }
    }
    return Object.assign(tick, { cleanup: () => { L.st.gone = true; controls.dispose() } })
  }, true), [tr, iP, tEnd])

  const c = ctl.current
  const fmt = (km: number) => `${Math.round(km).toLocaleString('en-US')} km`
  const met = (T: number) => { const d = Math.floor(T / 86400), h = Math.floor((T % 86400) / 3600), m = Math.floor((T % 3600) / 60); return `${d}d ${h}h ${String(m).padStart(2, '0')}m` }
  const J = es.journey
  const layer = hud.layer ? J.layers[hud.layer] : null
  return (
    <div className={s.root}>
      <div className={s.bar}>
        {hud.cine
          ? <button className={s.btn} onClick={() => { c.seekCine = ASC_END }}>{J.skip}</button>
          : <>
              <button className={s.btn} onClick={() => { if (c.T >= tEnd) c.T = 0; c.playing = !c.playing; setHud((h) => ({ ...h, playing: c.playing })) }}>{hud.playing ? J.pause : J.play}</button>
              <input type="range" min={0} max={tEnd} step={60} value={hud.T} aria-label={J.time} style={{ flex: 1, minWidth: 120 }}
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
        {(['earth', 'moon', 'tli', 'loi', 'straight'] as const).map((k) => (
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
