import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Crater } from '../data/types'
import { clamp, mulberry32, type Rng } from '../engine/rng'
import { loadCuriosity, meshHeight, type CuriosityRig, type HeightFn } from './curiosity'
import { at, mountStage, stars } from './stage'
import { makeXray } from './xray'

export type RoverEnding = 'return' | 'last' | 'frozen' | 'dead'
export interface RoverResult {
  samples: number; wet: number; waterG: number; lostG: number; bestPct: number; points: number
  ending: RoverEnding; seed: number; minTemp: number; confirmed: number; live: boolean; extended: boolean
}
/** Lo que llega del aterrizaje y del Rover Bay del hangar. */
export interface RoverStart {
  batteryPct: number; sciMul: number; integrity: number
  batteryKWh: number; mesh: boolean; deep: boolean; massSpec: boolean; autonav: boolean; canExtend: boolean
}
export const DEFAULT_ROVER: RoverStart = { batteryPct: 100, sciMul: 1, integrity: 100, batteryKWh: 6, mesh: false, deep: true, massSpec: true, autonav: true, canExtend: true }

const SIZE = 240, HALF = SIZE / 2, RIM = 92, SEG = 200
const DRILL_T = 5 // s por perforación: el brazo se despliega (0.9), baja (0.5) y perfora el resto
const DRILL_BUSY = DRILL_T - 1.4 - 0.2 // s con la broca adentro (el margen evita que el corte termine antes)
const CLIMB = 0.5 // m: una roca que sobresale hasta aquí se pasa por encima (el rocker-bogie la trepa); más alta, es obstáculo
// Regolito "moon_03" (Poly Haven, CC0): un mosaico cada TILE unidades; GAIN compensa que la difusa es oscura.
const TILE = 12, GAIN = 1.8

// Hex-tiling (Mikkelsen, "Practical Real-Time Hex-Tiling", JCGT 2022): el plano se parte en hexágonos y cada uno
// muestrea la textura con su propio giro y desplazamiento; cada píxel mezcla los 3 más cercanos, así no hay período.
// textureGrad con las derivadas giradas evita costuras de mip; la normal se gira de vuelta para que la luz cuadre.
const UNTILE = /* glsl */ `
const float HEX_SQ3 = 1.7320508, HEX_DENS = 0.6, HEX_GAIN = 4.0;
float untileHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float untileNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(untileHash(i), untileHash(i + vec2(1, 0)), f.x), mix(untileHash(i + vec2(0, 1)), untileHash(i + 1.0), f.x), f.y);
}
vec2 hexHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
void hexGrid(vec2 st, out vec3 w, out vec2 v1, out vec2 v2, out vec2 v3) {
  vec2 sk = mat2(1.0, -0.57735027, 0.0, 1.15470054) * (st * 2.0 * HEX_SQ3);
  vec2 b = floor(sk); vec3 t = vec3(fract(sk), 0.0); t.z = 1.0 - t.x - t.y;
  float s = step(0.0, -t.z), s2 = 2.0 * s - 1.0;
  w = pow(vec3(-t.z * s2, s - t.y * s2, s - t.x * s2), vec3(HEX_GAIN)); // exponente: transiciones cortas, sin lavar el contraste
  w /= w.x + w.y + w.z;
  v1 = b + vec2(s, s); v2 = b + vec2(s, 1.0 - s); v3 = b + vec2(1.0 - s, s);
}
void hexXf(vec2 v, vec2 uv, out vec2 uvo, out mat2 R) {
  float a = hexHash2(v).x * 6.2831853, c = cos(a), s = sin(a);
  R = mat2(c, s, -s, c);
  vec2 cen = vec2(v.x + 0.5 * v.y, 0.8660254 * v.y) / (2.0 * HEX_SQ3 * HEX_DENS);
  uvo = R * (uv - cen) + cen + hexHash2(v + 17.0);
}
vec4 untile(sampler2D t, vec2 uv) {
  vec3 w; vec2 v1, v2, v3, u; mat2 R; hexGrid(uv * HEX_DENS, w, v1, v2, v3);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  hexXf(v1, uv, u, R); vec4 acc = w.x * textureGrad(t, u, R * dx, R * dy);
  hexXf(v2, uv, u, R); acc += w.y * textureGrad(t, u, R * dx, R * dy);
  hexXf(v3, uv, u, R); acc += w.z * textureGrad(t, u, R * dx, R * dy);
  return acc;
}
vec3 untileN(sampler2D t, vec2 uv) {
  vec3 w; vec2 v1, v2, v3, u; mat2 R; hexGrid(uv * HEX_DENS, w, v1, v2, v3);
  vec2 dx = dFdx(uv), dy = dFdy(uv); vec3 n;
  hexXf(v1, uv, u, R); n = textureGrad(t, u, R * dx, R * dy).xyz * 2.0 - 1.0; n.xy = transpose(R) * n.xy; vec3 acc = w.x * n;
  hexXf(v2, uv, u, R); n = textureGrad(t, u, R * dx, R * dy).xyz * 2.0 - 1.0; n.xy = transpose(R) * n.xy; acc += w.y * n;
  hexXf(v3, uv, u, R); n = textureGrad(t, u, R * dx, R * dy).xyz * 2.0 - 1.0; n.xy = transpose(R) * n.xy; acc += w.z * n;
  return normalize(acc);
}
// Variación grande: manchas de ~3 a 8 mosaicos entre regolito viejo (oscuro, frío) y fresco (claro, cálido).
vec3 untileMacro(vec2 uv) {
  float m = untileNoise(uv * 0.12) * 0.65 + untileNoise(uv * 0.37 + 9.1) * 0.35;
  return mix(vec3(0.8, 0.81, 0.85), vec3(1.14, 1.09, 1.02), m);
}
`
// Pendiente (vNormal frente al "arriba" del mundo) y distancia se calculan en main: esos varyings aún no existen en <common>.
const MACRO = 'diffuseColor *= sampledDiffuseColor;\n\tdiffuseColor.rgb *= untileMacro( vMapUv ) * ( 1.0 - 0.22 * smoothstep( 0.08, 0.4, ' +
  '1.0 - dot( normalize( vNormal ), normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) ) );'
const FADE = 'vec3 mapN = untileN( normalMap, vNormalMapUv );\n\tmapN.xy *= mix( 1.0, 0.35, smoothstep( 40.0, 160.0, length( vViewPosition ) ) );'
function untileMaterial(mat: THREE.MeshStandardMaterial) {
  const chunk = (name: keyof typeof THREE.ShaderChunk, ...pairs: [string, string][]) =>
    pairs.reduce((src, [from, to]) => {
      if (!src.includes(from)) console.warn(`untile: ${name} cambió en three.js; el suelo queda sin hex-tiling`)
      return src.replace(from, to)
    }, THREE.ShaderChunk[name])
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + UNTILE)
      .replace('#include <map_fragment>', chunk('map_fragment', ['texture2D( map, vMapUv )', 'untile( map, vMapUv )'], ['diffuseColor *= sampledDiffuseColor;', MACRO]))
      .replace('#include <normal_fragment_maps>', chunk('normal_fragment_maps', ['vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', FADE]))
      .replace('#include <aomap_fragment>', chunk('aomap_fragment', ['texture2D( aoMap, vAoMapUv )', 'untile( aoMap, vAoMapUv )']))
      .replace('#include <roughnessmap_fragment>', chunk('roughnessmap_fragment', ['texture2D( roughnessMap, vRoughnessMapUv )', 'untile( roughnessMap, vRoughnessMapUv )']))
  }
}

/**
 * Sombra permanente sin límite de distancia: al norte de LIGHT_Z el Sol (luz direccional) no llega, en todo el
 * terreno hasta el horizonte. El mapa de sombras solo cubre ±150 m; esto cubre el resto. Linterna y luces puntuales
 * siguen iluminando. Encadena el onBeforeCompile que ya tenga el material; `key` separa la caché de programas.
 */
function permanentShadow(mat: THREE.Material, key: string) {
  const prev = mat.onBeforeCompile.bind(mat)
  const sun = 'getDirectionalLightInfo( directionalLight, directLight );'
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPermZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvec4 permP = vec4( transformed, 1.0 );\n' +
        '\t#ifdef USE_INSTANCING\n\tpermP = instanceMatrix * permP;\n\t#endif\n\tvPermZ = ( modelMatrix * permP ).z;')
    if (!sh.fragmentShader.includes('#include <lights_fragment_begin>')) console.warn('permanentShadow: three.js cambió; sin sombra permanente')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPermZ;')
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(sun,
        `${sun}\n\t\tdirectLight.color *= 1.0 - smoothstep( ${(LIGHT_Z - 1).toFixed(1)}, ${LIGHT_Z.toFixed(1)}, vPermZ );`))
  }
  mat.customProgramCacheKey = () => key
}

/** Relieve real del cráter (LOLA, tools/moon/build_moon.py): n×n alturas en metros sobre una ventana de size_m. */
interface Dem { n: number; size: number; h: Float32Array }
const dems = new Map<string, Promise<Dem | null>>()
function loadDem(id: string): Promise<Dem | null> {
  if (!dems.has(id)) {
    const base = `${import.meta.env.BASE_URL}moon/craters/${id}`
    const get = (ext: string) => fetch(base + ext).then((r) => (r.ok ? r : Promise.reject(new Error(r.statusText))))
    dems.set(id, Promise.all([get('.json').then((r) => r.json()), get('.bin').then((r) => r.arrayBuffer())])
      .then(([m, b]) => ({ n: m.n, size: m.size_m, h: new Float32Array(b) }))
      .then((d) => (d.h.length === d.n * d.n ? d : null))
      .catch(() => null)) // sin datos: terreno procedural
  }
  return dems.get(id)!
}
const LIGHT_Z = -58 // al sur de esta línea el borde recibe sol; al norte, sombra permanente
const STEEP: Record<Crater['terrain'], number> = { soft: 0.6, rocky: 1, steep: 1.6, 'very steep': 2.2 }
const ROCKS: Record<Crater['terrain'], number> = { soft: 50, rocky: 260, steep: 130, 'very steep': 170 }
// Pasos del orbitador sobre el cráter (s de juego): la órbita elegida en CML 2 decide el relevo.
const RELAY: Record<string, { period: number; dur: number }> = {
  polar_low: { period: 40, dur: 7 }, polar_high: { period: 60, dur: 11 }, polar_ellip: { period: 110, dur: 32 },
}
const DEPTHS = [
  { label: '25 cm', m: 0.25, mul: 0.6, cost: 3, jam: 0.03 },
  { label: '50 cm', m: 0.5, mul: 1, cost: 4, jam: 0.08 },
  { label: '1 m', m: 1, mul: 1.4, cost: 6, jam: 0.15 },
  { label: '2 m', m: 2, mul: 1.8, cost: 8, jam: 0.22 },
]
const tier = (pct: number) => pct > 5 ? { pts: 100, msg: 'RICH VEIN! Viable resource for Artemis.' }
  : pct >= 1 ? { pts: 60, msg: 'WATER ICE CONFIRMED.' }
  : pct > 0 ? { pts: 30, msg: 'Trace ice detected!' } : { pts: 5, msg: 'Dry regolith. No trace of water.' }

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

/** Altura (unidades) desde el DEM: escala uniforme, así las pendientes son las reales; el ruido solo da detalle fino. */
function demHeight(dem: Dem, n: (x: number, y: number) => number) {
  const k = SIZE / dem.size, last = dem.n - 1, h = dem.h
  return (x: number, z: number) => {
    const c = clamp(((x + HALF) / SIZE) * last, 0, last - 1e-6), r = clamp(((z + HALF) / SIZE) * last, 0, last - 1e-6)
    const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, i = r0 * dem.n + c0
    const m = (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + dem.n] * (1 - fc) + h[i + dem.n + 1] * fc) * fr
    return m * k + n(x + 500, z + 500) * 0.5
  }
}

interface Hud {
  bat: number; need: number; temp: number; heaters: boolean; sig: number; speed: number; slope: number
  samples: number; stored: number; sent: number; drill: number; depth: number; jam: number
  integ: number; stuck: boolean; teleop: boolean; extended: boolean
  relay: number; link: boolean; spike: number; shadow: boolean; trapped: boolean; canReturn: boolean; toast: string
  /** Cámara de perforación: pov = vista activa; xray = broca adentro; xcm = cm perforados; xice = hielo a la vista. */
  pov: boolean; xray: boolean; xcm: number; xice: boolean
}
type Final = null | { kind: 'choice' } | { kind: 'terminal'; ending: RoverEnding; lines: string[] }

/** Acto IV: el rover entra a la sombra, perfora y tiene que volver a la luz antes de quedarse sin batería. */
export function Rover3D({ crater, quality, seed, orbitId, start, onDone }: {
  crater: Crater; quality: number; seed: number; orbitId: string; start: RoverStart; onDone: (r: RoverResult) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState<Hud | null>(null)
  const [final, setFinal] = useState<Final>(null)
  const [typed, setTyped] = useState(0)
  const result = useRef<RoverResult>({ samples: 0, wet: 0, waterG: 0, lostG: 0, bestPct: 0, points: 0, ending: 'dead', seed, minTemp: 20, confirmed: 0, live: false, extended: false })
  const api = useRef<{ lastDrill: () => void; transmitAll: () => void; finish: (e: RoverEnding) => void; extend: () => void } | null>(null)
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone }, [onDone])
  const [sound, setSound] = useState(true)
  const soundRef = useRef(sound)
  useEffect(() => { soundRef.current = sound }, [sound])
  const [loaded, setLoaded] = useState<{ id: string; dem: Dem | null } | null>(null)
  const dem = loaded?.id === crater.id ? loaded.dem : undefined // undefined = cargando
  useEffect(() => {
    let on = true
    void loadDem(crater.id).then((d) => { if (on) setLoaded({ id: crater.id, dem: d }) })
    return () => { on = false }
  }, [crater.id])

  // Mensaje final letra por letra.
  useEffect(() => {
    if (final?.kind !== 'terminal') return
    const total = final.lines.join('\n').length
    const id = setInterval(() => setTyped((t) => (t >= total ? t : t + 1)), 35)
    return () => clearInterval(id)
  }, [final])

  useEffect(() => dem === undefined ? undefined : mountStage(host.current!, ({ scene, camera, el, renderer }) => {
    const rng = mulberry32(seed ^ Math.imul(crater.id.length, 0x9e3779b1))
    const n = noise(rng), steep = STEEP[crater.terrain]
    const height = dem ? demHeight(dem, n) : (x: number, z: number) => {
      const r = Math.hypot(x, z)
      const rim = r > RIM - 20 ? Math.pow((r - (RIM - 20)) / 20, 2) * 9 * steep : 0
      return n(x + 500, z + 500) * 3.2 * steep + rim
    }
    const shade = (z: number) => clamp((z - LIGHT_Z) / 4 + 0.5, 0, 1) // 0 = sol, 1 = sombra
    // Hielo solo en la sombra permanente; menos si se desvió a un sitio más seguro.
    type Dep = { x: number; z: number; rich: number; taken: boolean; spike?: boolean }
    const deposits: Dep[] = []
    const want = Math.max(1, Math.round((2 + crater.h * 1.3) * start.sciMul))
    while (deposits.length < want) {
      const a = rng() * Math.PI * 2, r = 12 + rng() * (RIM - 30), x = Math.cos(a) * r, z = Math.sin(a) * r
      if (z > LIGHT_Z + 12) deposits.push({ x, z, rich: crater.ice * (0.4 + rng()) * 1.3, taken: false })
    }
    const signalAt = (x: number, z: number) =>
      clamp(deposits.reduce((s, d) => s + (d.taken ? 0 : d.rich * Math.exp(-((Math.hypot(d.x - x, d.z - z) / 13) ** 2))), 0) / 10, 0, 1)

    scene.background = new THREE.Color(0x000000)
    scene.add(stars(rng, 3000, 1500))
    scene.add(new THREE.HemisphereLight(0x9aa6c8, 0x050505, 0.35))
    const sun = new THREE.DirectionalLight(0xfff3dd, 3.6)
    sun.position.set(40, 30, -400); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 900 })
    scene.add(sun)
    const earth = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 16), new THREE.MeshBasicMaterial({ color: 0x3d7bff }))
    earth.position.set(-500, 40, -900); scene.add(earth)

    // Terreno: borde iluminado al sur, piso en sombra; velo azul = hidrógeno que vio el orbitador.
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, height(x, z))
      const lit = 1 - shade(z), g = (0.84 + n(x * 3, z * 3) * 0.24) * (0.45 + lit * 0.7) // × color del material
      const h = signalAt(x, z) * quality * 0.8
      col.set([g * (1 - h * 0.6), g * (1 - h * 0.2), g + h * 0.7], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals()
    // Empieza en gris 0.5 (igual que antes); al cargar la textura pasa a GAIN. Sin textura se queda el gris.
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: new THREE.Color(0.5, 0.5, 0.5) })
    untileMaterial(groundMat); permanentShadow(groundMat, 'rover-ground')
    const ground = new THREE.Mesh(geo, groundMat)
    ground.receiveShadow = true; ground.castShadow = true; scene.add(ground)
    const floor = meshHeight(geo, SIZE, SEG) // la malla que se ve, no el ruido analítico
    // Terreno exterior: más allá del límite jugable el suelo sigue hasta el horizonte (si no, se ve el vacío).
    // Su grilla cae justo sobre ±HALF; lo de adentro se hunde bajo el terreno principal y el borde baja un poco
    // para que no queden rendijas. Mismo material y UV en metros, así la textura continúa sin salto.
    const OUT = SIZE * 10, OSTEP = 10, oseg = OUT / OSTEP
    const ogeo = new THREE.PlaneGeometry(OUT, OUT, oseg, oseg); ogeo.rotateX(-Math.PI / 2)
    const op = ogeo.attributes.position, ouv = ogeo.attributes.uv, ocol = new Float32Array(op.count * 3)
    for (let i = 0; i < op.count; i++) {
      const x = op.getX(i), z = op.getZ(i), out = Math.max(Math.abs(x), Math.abs(z)) - HALF
      const bx = clamp(x, -HALF, HALF), bz = clamp(z, -HALF, HALF)
      const fade = clamp(out / 60, 0, 1) // el relieve extra entra de a poco para que el borde empalme
      op.setY(i, out < -1e-3 ? height(bx, bz) - 6 : height(bx, bz) - 0.3 + fade * (n(x * 0.2 + 900, z * 0.2 + 900) - 0.8) * 14)
      ouv.setXY(i, (x + HALF) / SIZE, (HALF - z) / SIZE)
      const g = (0.84 + n(x * 3, z * 3) * 0.24) * (0.45 + (1 - shade(z)) * 0.7)
      ocol.set([g, g, g], i * 3)
    }
    ogeo.setAttribute('color', new THREE.BufferAttribute(ocol, 3)); ogeo.computeVertexNormals()
    const outer = new THREE.Mesh(ogeo, groundMat); outer.receiveShadow = true; scene.add(outer)
    // Muro invisible sobre la línea de sombra: con el Sol a 4° proyecta la sombra permanente sobre el piso.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(320, 16, 0.5), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
    wall.position.set(0, 9, LIGHT_Z - 1); wall.castShadow = true; scene.add(wall)
    // Línea de sombra marcada sobre el suelo.
    const edge = Array.from({ length: 141 }, (_, i) => new THREE.Vector3(i - 70, height(i - 70, LIGHT_Z) + 0.15, LIGHT_Z))
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineDashedMaterial({ color: 0xffb020, dashSize: 1.2, gapSize: 0.8 })).computeLineDistances())

    // Rocas: las bajas se trepan; las altas chocan y frenan al rover.
    // Cada roca guarda lo que de verdad se ve: los vértices que asoman sobre el suelo (pts, XYZ de mundo), el radio
    // de esa huella (r) y cuánto sobresale (h). Así el choque usa la forma dibujada, no la escala base.
    type Rock = { x: number; z: number; r: number; h: number; pts: Float32Array }
    const rockN = ROCKS[crater.terrain], rocks: Rock[] = []
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), v0 = new THREE.Vector3(), tint = new THREE.Color()
    // Roca irregular: icosaedro subdividido deformado con el mismo ruido; tono medio del regolito (sin GAIN).
    const rockGeo = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('normal').deleteAttribute('uv'))
    const rp = rockGeo.attributes.position
    for (let i = 0; i < rp.count; i++) {
      v0.fromBufferAttribute(rp, i).multiplyScalar(0.7 + n(v0.x * 2.3 + v0.z * 1.1 + 40, v0.y * 2.3 - v0.z * 1.7 + 40) * 0.3)
      rp.setXYZ(i, v0.x, v0.y, v0.z)
    }
    rockGeo.computeVertexNormals()
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8277, roughness: 1 }); permanentShadow(rockMat, 'rover-rock')
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockN)
    for (let i = 0; i < rockN; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (RIM - 12), x = Math.cos(a) * r, z = Math.sin(a) * r
      if (Math.hypot(x, z + 76) < 8) continue // despeja la zona de aterrizaje
      const s = 0.3 + Math.pow(rng(), 3) * 2.6
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.6, rng() * 6.3, (rng() - 0.5) * 0.6)) // apoyada: poco ladeo
      const sy = s * (0.5 + rng() * 0.4), bury = 0.25 + rng() * 0.15 // semienterrada
      m4.compose(v.set(x, height(x, z) - sy * bury, z), q, new THREE.Vector3(s * (0.8 + rng() * 0.4), sy, s * (0.8 + rng() * 0.4)))
      const pts: number[] = []; let rr = 0, hh = 0
      for (let k = 0; k < rp.count; k++) {
        v0.fromBufferAttribute(rp, k).applyMatrix4(m4)
        const above = v0.y - floor(v0.x, v0.z)
        if (above <= 0.1) continue // enterrado o al ras: no se ve, no choca
        pts.push(v0.x, v0.y, v0.z); rr = Math.max(rr, Math.hypot(v0.x - x, v0.z - z)); hh = Math.max(hh, above)
      }
      const tone = 0.85 + rng() * 0.25
      if (!pts.length) continue // quedó toda bajo el suelo
      const idx = rocks.length
      rocks.push({ x, z, r: rr, h: hh, pts: Float32Array.from(pts) })
      rockMesh.setMatrixAt(idx, m4); rockMesh.setColorAt(idx, tint.setScalar(tone))
    }
    rockMesh.count = rocks.length // sin instancias vacías (antes quedaban rocas fantasma en el origen)
    // Lo que pisan las ruedas: el suelo más el lomo de las rocas chicas, redondeado con el ancho de la rueda.
    const pebbles = rocks.filter((r) => r.h <= CLIMB), blocks = rocks.filter((r) => r.h > CLIMB)
    const surface: HeightFn = (px, pz) => {
      let bump = 0
      for (const r of pebbles) {
        const reach = r.r + 0.3, dx = px - r.x, dz = pz - r.z, d2 = dx * dx + dz * dz
        if (d2 < reach * reach) bump = Math.max(bump, r.h * 0.5 * (1 + Math.cos((Math.PI * Math.sqrt(d2)) / reach)))
      }
      return floor(px, pz) + bump
    }
    // Donde apoya la broca: el suelo o, si hay una roca debajo, la cara de arriba de esa roca (vértices visibles a
    // menos de DRILL_R en planta). Así el brazo baja menos sobre una piedra alta.
    const DRILL_R = 0.3
    const drillGround: HeightFn = (px, pz) => {
      let top = surface(px, pz)
      for (const r of rocks) {
        if (Math.hypot(r.x - px, r.z - pz) > r.r + DRILL_R) continue
        for (let i = 0; i < r.pts.length; i += 3) {
          if (Math.hypot(r.pts[i] - px, r.pts[i + 2] - pz) < DRILL_R) top = Math.max(top, r.pts[i + 1])
        }
      }
      return top
    }
    rockMesh.castShadow = true; rockMesh.receiveShadow = true; scene.add(rockMesh)

    // Texturas en mosaico (RepeatWrapping): el suelo se ve continuo; las rocas usan una sola copia.
    const reg = `${import.meta.env.BASE_URL}moon/regolith/`, loader = new THREE.TextureLoader(), aniso = renderer.capabilities.getMaxAnisotropy()
    const tile = (t: THREE.Texture, reps: number) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(reps, reps); t.anisotropy = aniso; return t }
    const done = () => { groundMat.needsUpdate = true }
    loader.load(reg + 'diff.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      groundMat.map = tile(t, SIZE / TILE); groundMat.color.setScalar(GAIN); done()
    })
    loader.load(reg + 'normal.jpg', (t) => { groundMat.normalMap = tile(t, SIZE / TILE); done() })
    loader.load(reg + 'orm.jpg', (t) => { groundMat.aoMap = groundMat.roughnessMap = tile(t, SIZE / TILE); done() }) // R = AO, G = rugosidad

    // Lander en el borde y rover.
    const lander = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.7, roughness: 0.35 })
    lander.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.4, 8), gold), 0, 1.6, 0))
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2), gold)
      leg.position.set(Math.cos(i * 1.57) * 1.6, 0.8, Math.sin(i * 1.57) * 1.6); leg.rotation.set(Math.sin(i * 1.57) * 0.4, 0, -Math.cos(i * 1.57) * 0.4)
      lander.add(leg)
    }
    lander.position.set(9, height(9, -70), -70); scene.add(lander)

    // Rover: caja provisional hasta que carga el Curiosity articulado (public/models/curiosity_rover.glb).
    const rover = new THREE.Group(), proxy = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: 0xdedfe6, metalness: 0.5, roughness: 0.4 })
    proxy.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.4), metal), 0, 0.55, 0))
    proxy.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 1.6), new THREE.MeshStandardMaterial({ color: 0x1b2f8f, metalness: 0.7, roughness: 0.25 })), 0, 0.85, 0))
    proxy.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1), metal), 0, 1.3, 0.8))
    proxy.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x222222 })), 0, 1.9, 0.85))
    const wheels: THREE.Mesh[] = []
    for (const sx of [-1, 1]) for (const sz of [-0.9, 0, 0.9]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x333338 }))
      w.rotation.z = Math.PI / 2; w.position.set(sx * 0.95, 0.32, sz); proxy.add(w); wheels.push(w)
    }
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.8), new THREE.MeshStandardMaterial({ color: 0xff3d81 }))
    drill.position.set(0, 0.2, -1.1); proxy.add(drill); rover.add(proxy)
    const lamp = new THREE.SpotLight(0xe8f4ff, 60, 45, 0.55, 0.5, 1.4); lamp.position.set(0, 1.9, 1); lamp.castShadow = true
    lamp.target.position.set(0, -1, 12); rover.add(lamp, lamp.target)
    rover.traverse((o) => { o.castShadow = true })
    scene.add(rover)
    let rig: CuriosityRig | null = null, gone = false
    loadCuriosity().then((r) => { if (gone) return; rig = r; rover.remove(proxy); rover.add(r.model) }).catch((err) => console.error(err))

    // Orbitador cruzando el cielo durante cada ventana de relevo.
    const orb = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd7ff3a }))
    scene.add(orb)
    const relay = RELAY[orbitId] ?? RELAY.polar_high
    let beacon: THREE.Mesh | null = null

    let x = 0, z = -74, yaw = 0, speed = 0, bat = start.batteryPct, temp = 20, heaters = true, depth = 1
    let drillT = 0, jamT = 0, top = false, steer = 0, toast = '', toastT = 0, hudT = 0, beepT = 0, t = 0
    let paused = false, trapped = false, entered = false, anomaly = false, link = false
    let integ = start.integrity, stuck = false, freeT = 0
    const kB = 6 / start.batteryKWh // una batería de 3 kWh se vacía (y se llena) el doble de rápido en %
    const stored: { pct: number; conf: boolean }[] = [] // muestras aún sin bajar a la Tierra
    const keys = new Set<string>()
    const st = result.current
    const say = (s: string, secs = 3.5) => { toast = s; toastT = secs }
    const visible = () => el.getClientRects().length > 0
    const down = (e: KeyboardEvent) => {
      if (!visible() || paused || (e.target as HTMLElement).closest?.('input,textarea')) return
      keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
      if (e.code === 'KeyL') lamp.visible = !lamp.visible
      if (e.code === 'KeyC') top = !top
      if (e.code === 'KeyH') { heaters = !heaters; say(heaters ? 'Heaters ON.' : 'Heaters OFF: saves power, but the rover gets colder.') }
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const d = +e.code.slice(5) - 1
        if (d === 3 && !start.deep) say('2 m needs the deep drill (Rover Bay).')
        else { depth = d; say(`Drill depth: ${DEPTHS[depth].label}`, 1.5) }
      }
      if (e.code === 'KeyR' && stuck && freeT <= 0) {
        freeT = 1.5; bat -= 2 * kB
        if (rng() < (start.mesh ? 0.85 : 0.5)) { stuck = false; say(start.mesh ? 'The mesh wheels "walk" out of the soft regolith!' : 'Free! The wheels bite again.') }
        else say('Still stuck. Try again (R): each attempt costs battery.')
      }
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

    const drain = () => (0.1 + (heaters && z > LIGHT_Z ? 0.16 : 0) + (lamp.visible ? 0.05 : 0)) * (temp < -10 ? 1.25 : 1)
    // Batería para volver en línea recta a la luz a 3.5 m/s, más 3 % de margen.
    const needToReturn = () => { const d = Math.max(0, z - LIGHT_Z), v = !start.autonav || integ < 30 ? 2.2 : 3.5; return d ? (d / v) * (drain() + v * 0.07) * kB + 3 : 0 }
    const sampleAt = (mul: number) => {
      const best = deposits.filter((d) => !d.taken).map((d) => ({ d, k: Math.hypot(d.x - x, d.z - z) })).sort((a, b) => a.k - b.k)[0]
      if (!best || best.k >= 6) return { pct: 0, dep: null as Dep | null }
      return { pct: +(best.d.rich * (1 - best.k / 7) * mul).toFixed(1), dep: best.d }
    }
    const mark = (wet: boolean) => {
      // Marca en el hoyo que dejó la broca (con el Curiosity, donde apoyó el brazo).
      const tip = rig ? rig.drillPoint(new THREE.Vector3()) : rover.localToWorld(new THREE.Vector3(0, 0, -1.2))
      if (!rig) tip.y = height(tip.x, tip.z)
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wet ? 3 : 1), new THREE.MeshBasicMaterial({ color: wet ? 0x38e1ff : 0x777777 }))
      m.position.set(tip.x, tip.y + (wet ? 1.5 : 0.5), tip.z); scene.add(m)
      if (wet) { const glow = new THREE.PointLight(0x38e1ff, 30, 12); glow.position.copy(m.position); scene.add(glow) }
    }
    const record = (pct: number) => {
      st.samples++; stored.push({ pct, conf: start.massSpec })
      if (pct > 0) { st.wet++; st.bestPct = Math.max(st.bestPct, pct); if (link) st.live = true }
    }
    const downlink = () => {
      for (const { pct, conf } of stored) {
        st.points += conf ? tier(pct).pts : pct > 0 ? 15 : 5
        if (conf) { st.waterG += Math.round(pct * 10); if (pct >= 1) st.confirmed++ }
      }
      const k = stored.length; stored.length = 0; return k
    }
    const lose = () => { for (const { pct } of stored) st.lostG += Math.round(pct * 10); stored.length = 0 }
    const verdict = (pct: number) => !start.massSpec && pct > 0
      ? 'Hydrogen detected, could be hydroxyl (no mass spectrometer to confirm water).'
      : tier(pct).msg + (pct ? ` ${pct}% water by weight.` : '')
    const terminal = (ending: RoverEnding, lines: string[]) => {
      paused = true; st.ending = ending; setTyped(0); setFinal({ kind: 'terminal', ending, lines })
    }
    api.current = {
      lastDrill: () => {
        const { pct, dep } = sampleAt(DEPTHS[depth].mul)
        if (dep) dep.taken = true
        lose(); record(pct)
        downlink()
        terminal('last', [`[BUSCADOR] FINAL CORE: ${pct ? `${pct}% WATER BY WEIGHT` : 'DRY'}.`, `[BUSCADOR] BATTERY 2%. TEMPERATURE ${Math.round(Math.min(temp, -52))}°C. TRANSMITTING...`, '', '— signal lost —'])
      },
      transmitAll: () => {
        const k = downlink()
        terminal('last', [`[BUSCADOR] SENDING ${k} STORED SAMPLE${k === 1 ? '' : 'S'}... DONE.`, `[BUSCADOR] BATTERY 2%. TEMPERATURE ${Math.round(Math.min(temp, -52))}°C. TRANSMITTING...`, '', '— signal lost —'])
      },
      finish: (e) => { if (e === 'return') downlink(); st.ending = e; doneRef.current({ ...st }) },
      extend: () => {
        st.extended = true; entered = false; downlink(); st.points += 20
        for (let i = 0; i < 3; i++) { const a = rng() * Math.PI, r = 30 + rng() * 40; deposits.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rich: crater.ice * (0.6 + rng()) * 1.5, taken: false }) }
        say('Extended mission approved: +4 cycles. New hydrogen targets deeper in the crater.', 5)
      },
    }
    say(`Touchdown on the sunlit rim of ${crater.name}. The ice is in the dark beyond the orange line.`, 5)
    const up3 = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), qy = new THREE.Quaternion(), camT = new THREE.Vector3(), off = new THREE.Vector3()
    camera.position.set(0, 8, -86)
    // Cámara de perforación (POV junto a la broca) + corte de rayos X + luz de trabajo de la torreta.
    const xray = makeXray(); scene.add(xray.group)
    const work = new THREE.PointLight(0xfff1dc, 0, 4, 1.4); scene.add(work)
    const chase = camera.position.clone(), chaseLook = new THREE.Vector3(0, 0, -74)
    const dp = new THREE.Vector3(), povPos = new THREE.Vector3(), povLook = new THREE.Vector3(), look = new THREE.Vector3()
    let pov = 0, xT = 0, xIce = 0, xOn = false, xSeen = false, xk = 0

    // Puntos visibles de rocas altas que caen dentro de la huella de las ruedas con el rover en (px, pz, ry).
    const PROXY_FOOT = { minX: -1.1, maxX: 1.1, minZ: -1.25, maxZ: 1.25 } // la caja provisional
    const hits = (px: number, pz: number, ry: number) => {
      const f = rig?.foot ?? PROXY_FOOT, c = Math.cos(ry), s = Math.sin(ry)
      const span = Math.hypot(Math.max(-f.minX, f.maxX), Math.max(-f.minZ, f.maxZ))
      let k = 0
      for (const r of blocks) {
        if (Math.hypot(r.x - px, r.z - pz) > r.r + span) continue
        for (let i = 0; i < r.pts.length; i += 3) {
          const dx = r.pts[i] - px, dz = r.pts[i + 2] - pz, lx = dx * c - dz * s, lz = dx * s + dz * c
          if (lx > f.minX && lx < f.maxX && lz > f.minZ && lz < f.maxZ) k++
        }
      }
      return k
    }

    const tick = (dt: number) => {
      const e = 0.6
      const gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e)
      let slope = 0, sig = 0
      if (!paused) {
        t += dt
        const thr = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
        const turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        const fx = Math.sin(yaw), fz = Math.cos(yaw), uphill = gx * fx + gz * fz
        slope = Math.atan(Math.hypot(gx, gz)) * 57.3
        const teleop = !start.autonav && !link
        const vmax = integ <= 0 || stuck ? 0 : integ < 30 || teleop ? 2.5 : 6
        if (freeT > 0) freeT -= dt
        steer = turn
        if (drillT > 0 || vmax === 0) speed *= 0.8
        else {
          speed += (thr * 4.5 - uphill * 6 * Math.sign(speed || thr)) * dt
          speed *= 1 - dt * (thr ? 0.6 : 2.2)
          speed = clamp(speed, -Math.min(2.5, vmax), vmax)
          yaw += turn * dt * 1.6 * (speed >= 0 ? 1 : -1) * clamp(Math.abs(speed) / 2 + 0.3, 0, 1)
        }
        let nx = x + fx * speed * dt, nz = z + fz * speed * dt
        // Choca solo si avanzar mete más la roca en la huella de las ruedas; alejarse siempre se puede.
        const inside = hits(nx, nz, yaw)
        if (inside > 0 && inside >= hits(x, z, yaw)) {
          if (Math.abs(speed) > 2) {
            const dmg = start.mesh ? 5 : 10
            integ = Math.max(0, integ - dmg); bat -= 2 * kB
            say(integ <= 0 ? 'Wheels destroyed. Buscador is immobilized, but it can still drill here.'
              : `Bump! Wheels −${dmg}% (now ${integ}%).` + (integ < 30 ? ' Below 30%: slow driving only.' : ''))
          } else if (toastT <= 0) say('A boulder blocks the way.', 1.5)
          speed *= -0.3; nx = x; nz = z
        }
        if (Math.hypot(nx, nz) > HALF - 8 || (slope > 34 && uphill * speed > 0)) { say('Too steep — the wheels slip.'); speed *= -0.2; nx = x; nz = z }
        x = nx; z = nz
        const dark = z > LIGHT_Z
        // Regolito blando: a veces atrapa las ruedas.
        if (dark && !stuck && Math.abs(speed) > 1.5 && rng() < dt * (crater.terrain === 'soft' ? 0.012 : 0.006)) {
          stuck = true; speed = 0; say(`Stuck in soft regolith! Press R to break free (${start.mesh ? '85' : '50'}% per try).`, 5)
        }
        if (dark && !entered) { entered = true; say('Entering permanent shadow. No sunlight, no charging. Watch the red return marker.', 5) }

        // Energía y temperatura.
        bat -= dt * (drain() + Math.abs(speed) * 0.07) * kB
        if (!dark) bat = Math.min(100, bat + dt * 1.4 * kB)
        st.minTemp = Math.min(st.minTemp, temp)
        temp += dt * (!dark ? (20 - temp) * 0.3 : heaters ? (20 - temp) * 0.05 : -1.2)
        const need = needToReturn()
        if (dark && !trapped && bat < need) { trapped = true; say('POINT OF NO RETURN crossed. You cannot make it back to the light.', 6) }
        if (trapped && !dark) trapped = false

        // Perforación.
        if (keys.has('Space') && drillT === 0 && jamT <= 0 && Math.abs(speed) < 0.8) {
          if (!dark) say('Nothing to find on the sunlit rim: drive into the shadow first.')
          else {
            drillT = DRILL_T; bat -= DEPTHS[depth].cost * kB
            xT = 0; xIce = sampleAt(DEPTHS[depth].mul).pct; xray.reset() // los rayos X muestran el hielo que hay ahí
          }
        }
        if (jamT > 0) jamT -= dt
        if (drillT > 0) {
          drillT -= dt; drill.position.y = -0.05 - Math.sin((DRILL_T - drillT) * 20) * 0.08
          if (drillT <= 0) {
            drillT = 0; drill.position.y = 0.2
            if (rng() < DEPTHS[depth].jam) { jamT = 15; bat -= 2 * kB; say('Jammed drill! Freeing it takes 15 s (−2% battery).') }
            else if (temp < -30 && rng() < 0.35) say('Instrument fault from the cold — sample lost. Turn the heaters on.')
            else {
              const { pct, dep } = sampleAt(DEPTHS[depth].mul)
              record(pct); mark(pct > 0)
              if (dep) dep.taken = true
              if (pct > 0) beep(1400)
              say(verdict(pct) + ' Stored until the next relay pass.')
              if (pct > 0 && !anomaly) {
                anomaly = true
                const sx = (rng() - 0.5) * 60, sz = 52
                deposits.push({ x: sx, z: sz, rich: crater.ice * 2.2 + 4, taken: false, spike: true })
                beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3d81, transparent: true, opacity: 0.25, side: THREE.DoubleSide }))
                beacon.position.set(sx, height(sx, sz) + 30, sz); scene.add(beacon)
                setTimeout(() => say(`ANOMALOUS READING: a massive hydrogen spike ${Math.round(Math.hypot(sx - x, sz - z))} m deeper inside (pink beacon). Go for it, or head back to recharge?`, 7), 3600)
              }
            }
          }
        }

        // Relevo: solo se baja lo guardado cuando el orbitador pasa por encima.
        const ph = t % relay.period, inWin = ph > relay.period - relay.dur
        orb.visible = inWin
        if (inWin) {
          const a = ((ph - (relay.period - relay.dur)) / relay.dur) * Math.PI
          orb.position.set(Math.cos(a) * 600, 80 + Math.sin(a) * 380, 300)
          if (stored.length) { const k = downlink(); say(`Relay pass: ${k} sample${k === 1 ? '' : 's'} downlinked to Earth.`); beep(900) }
        }
        link = inWin

        if (beacon) beacon.visible = deposits.some((d) => d.spike && !d.taken)
        if (temp < -40) terminal('frozen', [`[BUSCADOR] TEMPERATURE ${Math.round(temp)}°C.`, '[BUSCADOR] ELECTRONICS FAILURE...', '', '— signal lost —'])
        else if (trapped && bat <= 8) { paused = true; setFinal({ kind: 'choice' }) }
        else if (bat <= 0) { bat = 0; lose(); terminal('dead', ['[BUSCADOR] BATTERY 0%.', '[BUSCADOR] ENTERING SURVIVAL MODE...', '', '— signal lost —']) }

        if (!rig) for (const w of wheels) w.rotation.x += (speed * dt) / 0.32
        sig = clamp(signalAt(x, z) + (rng() - 0.5) * 0.3 * (1 - quality), 0, 1)
        beepT -= dt
        if (beepT <= 0 && sig > 0.05) { beep(500 + sig * 900); beepT = 1.2 - sig * 1.1 }
        hudT -= dt; toastT -= dt
        if (hudT <= 0) {
          hudT = 0.1
          const spike = deposits.find((d) => d.spike && !d.taken)
          setHud({
            bat, need, temp, heaters, sig, speed, slope, samples: st.samples, stored: stored.length, sent: st.waterG,
            drill: drillT / DRILL_T, depth, jam: Math.max(0, jamT), relay: inWin ? 0 : relay.period - relay.dur - ph, link,
            spike: spike ? Math.hypot(spike.x - x, spike.z - z) : -1, shadow: dark, trapped,
            canReturn: !dark && entered && st.wet > 0, toast: toastT > 0 ? toast : '',
            integ, stuck, teleop: !start.autonav && !link, extended: st.extended,
            pov: pov > 0.5, xray: xOn, xcm: Math.round(clamp(xT / DRILL_BUSY, 0, 1) * DEPTHS[depth].m * 100), xice: xSeen,
          })
        }
      }
      if (beacon) (beacon.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(performance.now() / 300) * 0.08
      if (rig) {
        // Suspensión procedural: cada rueda busca el suelo y el chasis queda en el promedio de los rockers.
        rig.update(dt, rover, x, z, yaw, paused ? 0 : speed, paused ? 0 : steer, surface)
        rig.drill(dt, drillT > 0, drillGround)
      } else {
        nrm.set(-gx, 1, -gz).normalize()
        rover.position.set(x, height(x, z), z)
        rover.quaternion.setFromUnitVectors(up3, nrm).multiply(qy.setFromAxisAngle(up3, yaw))
      }
      if (top) off.set(0, 45, -0.1); else off.set(-Math.sin(yaw) * 10, 5.5, -Math.cos(yaw) * 10)
      camT.set(x, height(x, z), z)
      chase.lerp(off.add(camT), 1 - Math.exp(-dt * 4)); chaseLook.set(camT.x, camT.y + 1.2, camT.z)

      // Perforación vista de cerca: la cámara se acerca a la broca y, con la broca adentro, entra el corte de rayos X.
      const contact = rig ? rig.drillContact() : 0
      pov += ((rig && drillT > 0 ? 1 : 0) - pov) * (1 - Math.exp(-dt * (drillT > 0 ? 2.5 : 1.8)))
      xOn = drillT > 0 && contact >= 1
      if (xOn && !paused) xT += dt
      if (rig) {
        rig.drillPoint(dp)
        // Al lado de la broca, del lado del brazo y un poco adelante, mirando hacia el rover (como el plano de NatGeo).
        // Con la broca adentro se aleja y baja la mirada para que entre todo el hoyo, según su profundidad.
        xk += ((xOn ? 1 : 0) - xk) * (1 - Math.exp(-dt * 1.5))
        const dm = DEPTHS[depth].m * xk, c = Math.cos(yaw), s = Math.sin(yaw), lx = 1.35 + dm * 0.45, lz = 1.15 + dm * 0.35
        povPos.set(dp.x + lx * c + lz * s, 0, dp.z - lx * s + lz * c)
        povPos.y = Math.max(dp.y + 0.6 + dm * 0.15, drillGround(povPos.x, povPos.z) + 0.3)
        povLook.set(dp.x, dp.y + 0.18 - dm * 0.45, dp.z)
        work.position.set(dp.x + 0.3 * c + 0.4 * s, dp.y + 0.8, dp.z - 0.3 * s + 0.4 * c)
        xSeen = xray.update(dt, dp, xOn, clamp(xT / DRILL_BUSY, 0, 1), DEPTHS[depth].m, xIce)
      }
      work.intensity = 9 * pov
      const k = pov * pov * (3 - 2 * pov)
      camera.position.copy(chase).lerp(povPos, k)
      camera.lookAt(look.copy(chaseLook).lerp(povLook, k))
    }
    return Object.assign(tick, { cleanup: () => { gone = true; removeEventListener('keydown', down); removeEventListener('keyup', up); void audio?.close() } })
  }), [crater, quality, seed, orbitId, start, dem])

  const h = hud
  const text = final?.kind === 'terminal' ? final.lines.join('\n').slice(0, typed) : ''
  const typedAll = final?.kind === 'terminal' && typed >= final.lines.join('\n').length
  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      <div className={`rv-xray${h?.pov ? ' on' : ''}${h?.xray ? ' scan' : ''}`} aria-hidden={!h?.pov}>
        <div className="rv-xray-tag">{h?.xray ? '● X-RAY · SUBSURFACE SCAN' : '● DRILL CAM · ARM DEPLOYING'}</div>
        {h?.xray && (
          <div className="rv-xray-read">
            <span>Depth</span><b>{h.xcm} / {DEPTHS[h.depth].m * 100} cm</b>
            {h.xice && <em>ICE CRYSTALS DETECTED</em>}
          </div>
        )}
      </div>
      {h && (
        <div className="rv-hud">
          <h3>BUSCADOR · {crater.name}</h3>
          <div className="rv-row"><span>Battery</span><b>{h.bat.toFixed(0)}%{h.shadow ? '' : ' ☀ charging'}</b></div>
          <div className="rv-bar rv-bat">
            <i style={{ width: `${h.bat}%`, background: h.trapped || h.bat < h.need + 5 ? 'var(--red)' : undefined }} />
            {h.need > 0 && <em style={{ left: `${Math.min(h.need, 100)}%` }} title="Battery needed to return to the light" />}
          </div>
          <div className="rv-row"><span>Needed to return</span><b className={h.trapped ? 'bad' : ''}>{h.trapped ? 'NO RETURN' : `${h.need.toFixed(0)}%`}</b></div>
          <div className="rv-row"><span>Temperature · heaters <kbd>H</kbd></span><b className={h.temp < -10 ? 'bad' : ''}>{h.temp.toFixed(0)}°C · {h.heaters ? 'on' : 'off'}</b></div>
          <div className="rv-row"><span>Wheels</span><b className={h.integ < 30 ? 'bad' : ''}>{h.stuck ? 'STUCK: press R' : `${h.integ}%`}{h.teleop ? ' · teleop (slow)' : ''}</b></div>
          <div className="rv-row"><span>Neutron signal (H)</span><b>{Math.round(h.sig * 100)}</b></div>
          <div className="rv-bar sig"><i style={{ width: `${h.sig * 100}%` }} /></div>
          <div className="rv-row"><span>Drill depth <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>{start.deep && <kbd>4</kbd>}</span><b>{h.jam > 0 ? `JAMMED ${h.jam.toFixed(0)}s` : DEPTHS[h.depth].label}</b></div>
          <div className="rv-row"><span>Relay</span><b className={h.link ? 'good' : ''}>{h.link ? 'ORBITER OVERHEAD' : `next pass ${h.relay.toFixed(0)} s`}</b></div>
          <div className="rv-row"><span>Samples · waiting · sent</span><b>{h.samples} · {h.stored} · {h.sent} g</b></div>
          {h.spike >= 0 && <div className="rv-row"><span>Hydrogen spike</span><b className="pink">{h.spike.toFixed(0)} m</b></div>}
          {h.drill > 0 && <div className="rv-drill"><i style={{ width: `${(1 - h.drill) * 100}%` }} /></div>}
          <p className="hint">Blue tint = hydrogen your orbiter mapped ({Math.round(quality * 100)}% quality). Seed {seed}{dem ? ' · Real LOLA relief' : ''}</p>
        </div>
      )}
      <div className="rv-keys">
        <div><kbd>W A S D</kbd> drive · <kbd>SPACE</kbd> drill</div>
        <div><kbd>L</kbd> lights · <kbd>C</kbd> top view · <kbd>R</kbd> unstick</div>
        <button className="btn small ghost" onClick={() => setSound(!sound)}>{sound ? 'Sound on' : 'Sound off'}</button>
      </div>
      {h?.toast && !final && <div className="rv-toast">{h.toast}</div>}
      {h?.canReturn && !final && (
        <div className="rv-end">
          <button className="btn big" onClick={() => api.current?.finish('return')}>Back in the light — end mission ☀</button>
          {start.canExtend && !h.extended && <button className="btn big ghost" onClick={() => api.current?.extend()}>Request extended mission (+4 cycles)</button>}
        </div>
      )}
      {final?.kind === 'choice' && (
        <div className="rv-final">
          <h2>THE LAST MESSAGE</h2>
          <p>Battery 8%. You are too deep in the dark to make it back. There is power for one thing only.</p>
          <div className="actions">
            <button className="btn big" onClick={() => api.current?.lastDrill()}>Final drill here<small>Sends this core. Unsent samples are lost.</small></button>
            <button className="btn big ghost" onClick={() => api.current?.transmitAll()}>Transmit everything<small>Secures the {h?.stored ?? 0} stored samples.</small></button>
          </div>
        </div>
      )}
      {final?.kind === 'terminal' && (
        <div className="rv-final term">
          <pre>{text}<span className="caret" /></pre>
          {typedAll && <button className="btn" onClick={() => onDone({ ...result.current })}>Continue →</button>}
        </div>
      )}
    </div>
  )
}
