import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Crater } from '../data/types'
import { clamp, mulberry32, type Rng } from '../engine/rng'
import { buildLander } from './spacecraft'
import { loadCuriosity, meshHeight, type CuriosityRig, type HeightFn } from './curiosity'
import { at, mountStage, stars } from './stage'
import { MOON, type RoverSite, type World } from './world'
import type { Rock, RockKind } from './rocks'
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
/** Perforación manual: s con SPACE sostenido y la broca adentro, según la profundidad (m). */
const drillSecs = (m: number) => 2.5 + m * 2.5
// Láser (ChemCam, LIBS): alcance real de 7 m; LASER_T = s de disparos por análisis.
const LASER_MIN = 1.2, LASER_MAX = 7, LASER_T = 2.4
// Luna: escaneo del subsuelo (neutrones + infrarrojo cercano, como VIPER): s que tarda y radio que deja nítido en el mapa.
const SCAN_T = 2, SCAN_R = 16
// Marte: Curiosity perfora unos 5 cm de roca (m = hondura que dibuja el corte de rayos X).
const ROCK_CORE = { label: '5 cm', m: 0.25, cm: 5, mul: 1, cost: 3, jam: 0.04 }
const MAP_N = 96 // celdas por lado del mapa de hidrógeno
// Luna (tipo VIPER): el brazo se pliega como torre vertical junto al chasis (TRIDENT), la broca avanza por tramos
// con lectura del polvo en cada uno, se calienta al perforar, y en la sombra la vista de navegación solo llega
// hasta el Lidar (LIDAR_R m) o el cono de los faros.
const TOWER_REACH = 0.45, BITES = 4, BITE_T = 0.6, LIDAR_R = 12
const SUN_X = 0.0995, SUN_Z = -0.995 // rumbo horizontal del Sol lunar (la luz está en (40, 30, −400))
// Vista de navegación (G): cuadrícula de peligros de HZ×HZ celdas (2 m) y alcance de las cámaras del mástil.
const HZ = 120, HC = SIZE / HZ, SEE_R = 40, LABELS = 14
const HAZ_RGBA = [[60, 230, 160, 0], [255, 200, 40, 120], [255, 60, 50, 210]] // seguro, precaución, peligro
const PATH_RGBA = [200, 245, 96, 255]
const hash2 = (a: number, b: number) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1
// Suelo: un mosaico de la textura del mundo (world.ground) cada TILE unidades; world.gain compensa difusas oscuras.
const TILE = 12

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
interface Dem { n: number; size: number; vex: number; h: Float32Array }
const dems = new Map<string, Promise<Dem | null>>()
function loadDem(dir: string, id: string): Promise<Dem | null> {
  const base = `${import.meta.env.BASE_URL}${dir}/${id}`
  if (!dems.has(base)) {
    const get = (ext: string) => fetch(base + ext).then((r) => (r.ok ? r : Promise.reject(new Error(r.statusText))))
    dems.set(base, Promise.all([get('.json').then((r) => r.json()), get('.bin').then((r) => r.arrayBuffer())])
      .then(([m, b]) => ({ n: m.n, size: m.size_m, vex: m.vex ?? 1, h: new Float32Array(b) }))
      .then((d) => (d.h.length === d.n * d.n ? d : null))
      .catch(() => null)) // sin datos: terreno procedural
  }
  return dems.get(base)!
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

/** Altura (unidades) desde el DEM: escala uniforme (× vex del sitio), así las pendientes son las reales; el ruido solo da detalle fino. */
function demHeight(dem: Dem, n: (x: number, y: number) => number) {
  const k = (SIZE / dem.size) * dem.vex, last = dem.n - 1, h = dem.h
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
  integ: number; stuck: boolean; teleop: boolean; extended: boolean; goal: string
  relay: number; link: boolean; spike: number; shadow: boolean; trapped: boolean; canReturn: boolean; toast: string
  /** Cámara de perforación: pov = vista activa; xray = broca adentro; xcm = cm perforados; xice = hielo a la vista. */
  pov: boolean; lcam: boolean; xray: boolean; xcm: number; xmax: number; xice: boolean
  /** Marte: qué hay bajo la broca y si se puede perforar; cores = rocas perforadas. */
  under: string; canDrill: boolean; cores: number
  /** Vista de navegación: activa, rocas que vieron las cámaras y a cuántos metros queda la sugerida (−1 = ninguna). */
  nav: boolean; seen: number; nextD: number; nextDrill: boolean
  /** Luna: lecturas por tramo (k: 0 seco, 1 trazas, 2 hielo), calor de la broca 0..1, s de enfriado forzado,
   *  carga solar en %/s (0 = no carga) y gases en vivo del espectrómetro de masas (H2O, H2, CO2; null = nada). */
  bites: { t: string; k: number }[]; heat: number; hot: number; chg: number; gas: null | [number, number, number]
  /** drilling = SPACE sostenido (drill = avance 0..1). laser: −1 = apagado, 0 = apuntando, 0..1 = analizando. */
  drilling: boolean; laser: number; inRange: boolean; kinds: number; kindsAll: number; scanned: number
  /** Espectro LIBS: k = avance del análisis (1 = roca identificada). */
  libs: null | { kind: RockKind; k: number; isNew: boolean; pts: number; lab: boolean }
}
type Final = null | { kind: 'choice' } | { kind: 'terminal'; ending: RoverEnding; lines: string[] }

/** Acto IV: el rover entra a la sombra, perfora y tiene que volver a la luz antes de quedarse sin batería. */
export function Rover3D({ crater, quality, seed, orbitId, start, onDone, world = MOON }: {
  crater: RoverSite; world?: World; quality: number; seed: number; orbitId: string; start: RoverStart; onDone: (r: RoverResult) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const iceHunt = world.science === 'ice'
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
  const key = `${world.dir}/${crater.id}`
  const dem = loaded?.id === key ? loaded.dem : undefined // undefined = cargando
  useEffect(() => {
    let on = true
    void loadDem(world.dir, crater.id).then((d) => { if (on) setLoaded({ id: key, dem: d }) })
    return () => { on = false }
  }, [world.dir, crater.id, key])

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
    const shade = (z: number) => world.shadow ? clamp((z - LIGHT_Z) / 4 + 0.5, 0, 1) : 0 // 0 = sol, 1 = sombra
    // Hielo solo en la sombra permanente; menos si se desvió a un sitio más seguro.
    type Dep = { x: number; z: number; rich: number; taken: boolean; spike?: boolean }
    const deposits: Dep[] = []
    const want = Math.max(1, Math.round((2 + crater.h * 1.3) * start.sciMul))
    while (deposits.length < want) {
      const a = rng() * Math.PI * 2, r = 12 + rng() * (RIM - 30), x = Math.cos(a) * r, z = Math.sin(a) * r
      if (!world.shadow || z > LIGHT_Z + 12) deposits.push({ x, z, rich: crater.ice * (0.4 + rng()) * 1.3, taken: false })
    }
    const signalAt = (x: number, z: number) =>
      clamp(deposits.reduce((s, d) => s + (d.taken ? 0 : d.rich * Math.exp(-((Math.hypot(d.x - x, d.z - z) / 13) ** 2))), 0) / 10, 0, 1)

    scene.background = new THREE.Color(world.sky ?? 0x000000)
    if (world.sky === undefined) scene.add(stars(rng, 3000, 1500))
    else scene.fog = new THREE.FogExp2(world.sky, 0.0045) // polvo en suspensión: el horizonte se pierde en el cielo
    scene.add(world.sky === undefined ? new THREE.HemisphereLight(0x9aa6c8, 0x050505, 0.35) : new THREE.HemisphereLight(0xe0b48a, 0x3a2418, 0.9))
    const sun = new THREE.DirectionalLight(world.shadow ? 0xfff3dd : 0xffe2c4, world.shadow ? 3.6 : 2.8)
    if (world.shadow) sun.position.set(40, 30, -400); else sun.position.set(160, 220, -260)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 900 })
    scene.add(sun)
    const earth = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 16), new THREE.MeshBasicMaterial({ color: 0x3d7bff }))
    earth.position.set(-500, 40, -900); if (world.shadow) scene.add(earth)

    // Terreno: borde iluminado al sur, piso en sombra; velo azul = hidrógeno que vio el orbitador.
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, height(x, z))
      const lit = 1 - shade(z), g = (0.84 + n(x * 3, z * 3) * 0.24) * (0.45 + lit * 0.7) // × color del material
      const h = iceHunt ? signalAt(x, z) * quality * 0.8 : 0
      col.set([g * (1 - h * 0.6), g * (1 - h * 0.2), g + h * 0.7], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals()
    // Empieza en gris 0.5 (igual que antes); al cargar la textura pasa a world.gain. Sin textura se queda el gris.
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: new THREE.Color(0.5, 0.5, 0.5) })
    untileMaterial(groundMat); if (world.shadow) permanentShadow(groundMat, 'rover-ground')
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
    wall.position.set(0, 9, LIGHT_Z - 1); wall.castShadow = true; if (world.shadow) scene.add(wall)
    // Línea de sombra marcada sobre el suelo.
    const edge = Array.from({ length: 141 }, (_, i) => new THREE.Vector3(i - 70, height(i - 70, LIGHT_Z) + 0.15, LIGHT_Z))
    if (world.shadow) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineDashedMaterial({ color: 0xffb020, dashSize: 1.2, gapSize: 0.8 })).computeLineDistances())

    // Rocas: las bajas se trepan; las altas chocan y frenan al rover.
    // Campo de rocas del mundo (RockField en rocks.ts: ubicación, choque y apoyo comunes; aspecto por mundo).
    const field = new world.rocks({
      rng, noise: n, height, floor, count: ROCKS[crater.terrain], rim: RIM, clear: { x: 0, z: -76, r: 8 },
    })
    if (world.shadow) permanentShadow(field.mesh.material as THREE.Material, 'rover-rock')
    scene.add(field.mesh)
    // Lo que pisan las ruedas: el suelo más el lomo de las rocas chicas.
    const surface: HeightFn = (px, pz) => floor(px, pz) + field.bump(px, pz)
    // Donde apoya la broca: el suelo o, si hay una roca debajo, la cara de arriba de esa roca.
    const DRILL_R = 0.3
    const drillGround: HeightFn = (px, pz) => Math.max(surface(px, pz), field.top(px, pz, DRILL_R))

    // Texturas en mosaico (RepeatWrapping): el suelo se ve continuo; las rocas usan una sola copia.
    const reg = `${import.meta.env.BASE_URL}${world.ground}`, loader = new THREE.TextureLoader(), aniso = renderer.capabilities.getMaxAnisotropy()
    const tile = (t: THREE.Texture, reps: number) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(reps, reps); t.anisotropy = aniso; return t }
    const done = () => { groundMat.needsUpdate = true }
    loader.load(reg + 'diff.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      groundMat.map = tile(t, SIZE / TILE); groundMat.color.setRGB(world.gain * world.tint[0], world.gain * world.tint[1], world.gain * world.tint[2]); done()
    })
    loader.load(reg + 'normal.jpg', (t) => { groundMat.normalMap = tile(t, SIZE / TILE); done() })
    loader.load(reg + 'orm.jpg', (t) => { groundMat.aoMap = groundMat.roughnessMap = tile(t, SIZE / TILE); done() }) // R = AO, G = rugosidad

    // Lander en el borde y rover.
    const lander = buildLander(); lander.rotation.y = 0.6
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
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.8), new THREE.MeshStandardMaterial({ color: 0xef6f6c }))
    drill.position.set(0, 0.2, -1.1); proxy.add(drill); rover.add(proxy)
    const lamp = new THREE.SpotLight(0xe8f4ff, 60, 45, 0.55, 0.5, 1.4); lamp.position.set(0, 1.9, 1); lamp.castShadow = true
    lamp.target.position.set(0, -1, 12); rover.add(lamp, lamp.target)
    rover.traverse((o) => { o.castShadow = true })
    scene.add(rover)
    let rig: CuriosityRig | null = null, gone = false
    loadCuriosity().then((r) => {
      if (gone) return
      rig = r; rover.remove(proxy); rover.add(r.model)
      if (!iceHunt) return
      // Luna: paneles solares verticales a los costados y atrás, para el Sol rasante del polo (como VIPER).
      const cell = new THREE.MeshStandardMaterial({ color: 0x16296b, metalness: 0.6, roughness: 0.3, emissive: 0x060d2a })
      const frame = new THREE.MeshStandardMaterial({ color: 0xc9ccd4, metalness: 0.4, roughness: 0.5 })
      for (const [px, pz, ry] of [[0.6, -0.35, 0], [-0.6, -0.35, 0], [0, -1.02, Math.PI / 2]] as const) {
        const panel = new THREE.Group()
        panel.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 1.15), cell), new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.68, 1.21), frame))
        panel.position.set(px, 1.5, pz); panel.rotation.set(0, ry, px ? -Math.sign(px) * 0.14 : 0)
        panel.traverse((o) => { o.castShadow = true })
        r.model.add(panel)
      }
    }).catch((err) => console.error(err))

    // Orbitador cruzando el cielo durante cada ventana de relevo.
    const orb = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5cc8f0 }))
    scene.add(orb)
    const relay = RELAY[orbitId] ?? RELAY.polar_high
    let beacon: THREE.Mesh | null = null

    let x = 0, z = -74, yaw = 0, speed = 0, bat = start.batteryPct, temp = 20, heaters = true
    const depth = start.deep ? 3 : 2 // hondura fija: la del taladro instalado (1 m, o 2 m con el taladro profundo)
    let prog = 0, drilling = false, holeX = Infinity, holeZ = Infinity, contact = 0
    let laserT = 0, aimed = false, aimT = 0, zapT = 0, libsT = 0, scannedN = 0, scanT = 0, cores = 0, mapDirty = true
    let drillRock: Rock | null = null
    let iceTop = 0.5, biteT = 0, bitT = 0, hotT = 0, sublim = 0, chg = 0
    const bites: { t: string; k: number }[] = []
    // Lectura del polvo que sube la broca al llegar a la fracción f del hoyo. Con espectrómetro de masas da el
    // agua estimada; sin él solo se ve si el polvo trae escarcha.
    const reading = (f: number) => {
      const cm = Math.round(f * cur().cm)
      const est = xIce > 0 && f >= iceTop ? xIce * (1 - sublim) * Math.min(1, (f - iceTop) / (1 - iceTop) + 0.25) : 0
      if (!start.massSpec) return { t: `${cm} cm · ${est > 0 ? 'frost in the cuttings' : 'dry cuttings'}`, k: est > 0 ? 2 : 0 }
      if (est > 0) return { t: `${cm} cm · water ice ~${est.toFixed(1)}%`, k: 2 }
      return xIce > 0 && f >= iceTop - 1 / BITES ? { t: `${cm} cm · traces of water vapor`, k: 1 } : { t: `${cm} cm · dry regolith`, k: 0 }
    }
    let nav = false, navK = 0, pathT = 0, seenN = 0, next: Rock | null = null, shown: Rock[] = []
    const scans: { x: number; z: number }[] = [], holes: { x: number; z: number; wet: boolean }[] = []
    const flags = new Map<Rock, THREE.Mesh>() // rocas analizadas que conviene perforar
    const cur = () => (iceHunt ? { ...DEPTHS[depth], cm: DEPTHS[depth].m * 100 } : ROCK_CORE)
    let laserRock: Rock | null = null, cand: Rock | null = null, libs: Hud['libs'] = null
    const found = new Map<string, number>(), hit = new THREE.Vector3(), candHit = new THREE.Vector3(), mast = new THREE.Vector3(), lo = new THREE.Vector3()
    let jamT = 0, top = false, steer = 0, toast = '', toastT = 0, hudT = 0, beepT = 0, t = 0
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
      if (e.code === 'KeyG' && !e.repeat) {
        nav = !nav; pathT = 0
        if (nav) say(iceHunt ? 'Navigation cameras: the grid shows hazards ahead (yellow = caution, red = danger).'
          : 'Navigation cameras: rocks tagged, hazards on the grid, and a safe route to the next rock.', 4.5)
      }
      if (e.code === 'KeyH') { heaters = !heaters; say(heaters ? 'Heaters ON.' : 'Heaters OFF: saves power, but the rover gets colder.') }
      if (e.code === 'KeyF' && !e.repeat && laserT === 0 && scanT === 0 && !drilling) {
        if (Math.abs(speed) > 0.8) say(iceHunt ? 'Stop first: the scan needs the rover still.' : 'Stop first: the laser needs a steady mast.', 2)
        else if (iceHunt) { scanT = SCAN_T; bat -= 1 * kB }
        else if (!cand) say(`No unscanned rock within ${LASER_MAX} m. Drive closer to one.`, 2)
        else { laserRock = cand; hit.copy(candHit); laserT = LASER_T; aimed = false; aimT = 0; zapT = 0; libsT = 0; bat -= 0.5 * kB }
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
    // Marcas de hoyo. Todo se crea al cargar: agregar una luz o un material nuevo en pleno juego obliga a three.js
    // a recompilar los shaders de la escena y el cuadro se traba. Las luces del hielo salen de un grupo fijo apagado.
    const markGeo = new THREE.CylinderGeometry(0.12, 0.12, 1)
    const wetMat = new THREE.MeshBasicMaterial({ color: 0x38e1ff }), dryMat = new THREE.MeshBasicMaterial({ color: 0x777777 })
    const glows = Array.from({ length: 4 }, () => new THREE.PointLight(0x38e1ff, 0, 12))
    scene.add(...glows)
    for (const m of [wetMat, dryMat]) { // una copia mínima bajo el suelo deja los programas compilados desde el inicio
      const warm = new THREE.Mesh(markGeo, m); warm.scale.setScalar(0.001); warm.position.set(0, -50, 0); warm.frustumCulled = false; scene.add(warm)
    }
    let glowN = 0
    const mark = (wet: boolean) => {
      // Marca en el hoyo que dejó la broca (con el Curiosity, donde apoyó el brazo).
      const tip = rig ? rig.drillPoint(new THREE.Vector3()) : rover.localToWorld(new THREE.Vector3(0, 0, -1.2))
      if (!rig) tip.y = height(tip.x, tip.z)
      const m = new THREE.Mesh(markGeo, wet ? wetMat : dryMat); m.scale.y = wet ? 3 : 1
      m.position.set(tip.x, tip.y + (wet ? 1.5 : 0.5), tip.z); scene.add(m)
      if (wet) { const glow = glows[glowN++ % glows.length]; glow.position.copy(m.position); glow.intensity = 30 }
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
    say(iceHunt ? `Touchdown on the sunlit rim of ${crater.name}!`
      : `Touchdown at ${crater.name}. Laser the rocks (F) to identify them, then drill the promising ones.`, iceHunt ? 3 : 5)
    const up3 = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), qy = new THREE.Quaternion(), camT = new THREE.Vector3(), off = new THREE.Vector3()
    camera.position.set(0, 8, -86)
    // Cámara de perforación (POV junto a la broca) + corte de rayos X + luz de trabajo de la torreta.
    const xray = makeXray(); scene.add(xray.group)
    const work = new THREE.PointLight(0xfff1dc, 0, 4, 1.4); scene.add(work)
    const chase = camera.position.clone(), chaseLook = new THREE.Vector3(0, 0, -74)
    const dp = new THREE.Vector3(), povPos = new THREE.Vector3(), povLook = new THREE.Vector3(), look = new THREE.Vector3()
    const lpPos = new THREE.Vector3(), lpLook = new THREE.Vector3()
    let lpov = 0
    let pov = 0, xIce = 0, xOn = false, xSeen = false, xk = 0
    // Láser del ChemCam: haz (cilindro con el eje en Z, largo 1), chispa de plasma y mira sobre la roca objetivo.
    const glowMat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).rotateX(Math.PI / 2), glowMat(0xff5a48, 0.95))
    beam.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8).rotateX(Math.PI / 2), glowMat(0xff2a1a, 0.28)))
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glowMat(0xfff0c0, 1))
    spark.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowMat(0xffa040, 0.3)))
    const flash = new THREE.PointLight(0xffc890, 0, 6, 1.6)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.235, 28), new THREE.MeshBasicMaterial({ color: 0xc8f560, transparent: true, opacity: 0.9, depthTest: false, fog: false, side: THREE.DoubleSide }))
    ring.renderOrder = 5; beam.visible = spark.visible = ring.visible = false
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, depthTest: false, fog: false, side: THREE.DoubleSide }))
    wave.renderOrder = 4; wave.visible = false
    scene.add(beam, spark, flash, ring, wave)

    // Vista de navegación (como las Navcam/Hazcam): cuadrícula de 2 m sobre el suelo con el peligro de cada celda.
    // 0 = seguro, 1 = precaución (pendiente o cerca de una roca alta), 2 = peligro (roca alta, pendiente fuerte, borde).
    const haz = new Uint8Array(HZ * HZ)
    const cellX = (c: number) => -HALF + ((c % HZ) + 0.5) * HC, cellZ = (c: number) => HALF - (Math.floor(c / HZ) + 0.5) * HC
    const cellOf = (wx: number, wz: number) => clamp(Math.floor((HALF - wz) / HC), 0, HZ - 1) * HZ + clamp(Math.floor((wx + HALF) / HC), 0, HZ - 1)
    for (let c = 0; c < HZ * HZ; c++) {
      const wx = cellX(c), wz = cellZ(c)
      const deg = Math.atan(Math.hypot(floor(wx + 1, wz) - floor(wx - 1, wz), floor(wx, wz + 1) - floor(wx, wz - 1)) / 2) * 57.3
      haz[c] = Math.hypot(wx, wz) > HALF - 9 || deg > 27 ? 2 : deg > 17 ? 1 : 0
    }
    for (const r of field.blocks) {
      const reach = r.r + 2.6, n = Math.ceil(reach / HC), c0 = cellOf(r.x, r.z), ci = c0 % HZ, cj = Math.floor(c0 / HZ)
      for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= HZ || j >= HZ) continue
        const c = j * HZ + i, d = Math.hypot(cellX(c) - r.x, cellZ(c) - r.z)
        if (d < r.r + 1.3) haz[c] = 2; else if (d < reach) haz[c] = Math.max(haz[c], 1) // 1.3 m = medio ancho del rover
      }
    }
    const hazPx = new Uint8Array(HZ * HZ * 4), hazTex = new THREE.DataTexture(hazPx, HZ, HZ)
    hazTex.magFilter = hazTex.minFilter = THREE.NearestFilter
    const paintHaz = (path: number[]) => {
      for (let c = 0; c < HZ * HZ; c++) hazPx.set(HAZ_RGBA[haz[c]], c * 4)
      for (const c of path) hazPx.set(PATH_RGBA, c * 4)
      hazTex.needsUpdate = true
    }
    paintHaz([])
    // La cuadrícula usa la misma malla del terreno (mismos UV), así queda pegada al relieve.
    const gridMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: {
        haz: { value: hazTex }, rover: { value: new THREE.Vector2() }, n: { value: HZ }, gain: { value: 0 },
        fwd: { value: new THREE.Vector2(0, 1) }, lamp: { value: 1 }, lightZ: { value: world.shadow ? LIGHT_Z : 1e6 }, lidar: { value: LIDAR_R },
      },
      vertexShader: 'varying vec2 vUv; varying vec2 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D haz; uniform vec2 rover; uniform float n; uniform float gain; varying vec2 vUv; varying vec2 vW;
        uniform vec2 fwd; uniform float lamp; uniform float lightZ; uniform float lidar;
        void main() {
          vec2 f = abs( fract( vUv * n ) - 0.5 ); float line = smoothstep( 0.455, 0.5, max( f.x, f.y ) );
          vec4 h = texture2D( haz, vUv );
          vec2 to = vW - rover; float d = length( to );
          // En la sombra permanente las cámaras no ven: queda el Lidar cercano y lo que alumbran los faros.
          float cone = lamp * smoothstep( 0.80, 0.88, dot( to / max( d, 0.001 ), fwd ) ) * ( 1.0 - smoothstep( 36.0, 45.0, d ) );
          float seen = mix( 1.0, max( 1.0 - smoothstep( lidar - 2.0, lidar + 1.0, d ), cone ), smoothstep( lightZ - 2.0, lightZ + 2.0, vW.y ) );
          float a = ( h.a * 0.5 + line * 0.6 ) * ( 1.0 - smoothstep( 30.0, 60.0, d ) ) * seen * gain;
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( h.rgb, a );
        }`,
    })
    const gridMesh = new THREE.Mesh(geo, gridMat); gridMesh.renderOrder = 2; gridMesh.visible = false; scene.add(gridMesh)

    // Ruta sugerida: A* sobre la cuadrícula hasta quedar a `reach` m de la roca. Peligro = no se pasa; precaución cuesta 4×.
    const gCost = new Float32Array(HZ * HZ), from = new Int32Array(HZ * HZ), shut = new Uint8Array(HZ * HZ)
    const route = (rock: Rock, reach: number): number[] => {
      gCost.fill(Infinity); shut.fill(0)
      const start = cellOf(x, z), away = (c: number) => Math.hypot(cellX(c) - rock.x, cellZ(c) - rock.z)
      const open: [number, number][] = [[0, start]]; gCost[start] = 0; from[start] = -1
      for (let it = 0; open.length && it < 8000; it++) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i
        const c = open[bi][1]; open[bi] = open[open.length - 1]; open.pop()
        if (shut[c]) continue
        shut[c] = 1
        if (haz[c] < 2 && away(c) <= reach) { const path: number[] = []; for (let k = c; k >= 0; k = from[k]) path.push(k); return path }
        const ci = c % HZ, cj = Math.floor(c / HZ)
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const i = ci + di, j = cj + dj; if ((!di && !dj) || i < 0 || j < 0 || i >= HZ || j >= HZ) continue
          const k = j * HZ + i; if (shut[k] || haz[k] === 2) continue
          const g = gCost[c] + Math.hypot(di, dj) * HC * (haz[k] === 1 ? 4 : 1)
          if (g < gCost[k]) { gCost[k] = g; from[k] = c; open.push([g + Math.max(0, away(k) - reach), k]) }
        }
      }
      return []
    }
    // Etiquetas sobre las rocas (HTML encima del 3D): se reubican cada cuadro, el texto se arma con el HUD.
    const labBox = labelsRef.current
    const labs = labBox ? Array.from({ length: LABELS }, () => { const d = document.createElement('div'); d.hidden = true; labBox.appendChild(d); return d }) : []
    const fpPos = new THREE.Vector3(), fpLook = new THREE.Vector3(), lv = new THREE.Vector3(), camDir = new THREE.Vector3()
    const navTick = () => {
      // Lo que ven las cámaras: toda roca a SEE_R m queda registrada. Sugerida: el objetivo de taladro más cercano o,
      // si no hay, la roca sin analizar más cercana.
      const d2 = (r: Rock) => Math.hypot(r.x - x, r.z - z)
      for (const r of field.rocks) if (!r.seen && d2(r) < SEE_R) { r.seen = true; seenN++ }
      const near = (list: Rock[]) => list.reduce<Rock | null>((b, r) => (!b || d2(r) < d2(b) ? r : b), null)
      const seen = field.rocks.filter((r) => r.seen && d2(r) < SEE_R + 10)
      next = near([...flags.keys()]) ?? near(seen.filter((r) => !r.scanned))
      pathT -= 0.1
      if (pathT <= 0) { pathT = 1; paintHaz(next ? route(next, flags.has(next) ? next.r + 2.7 : 5) : []) }
      const by = (list: Rock[], n: number) => list.sort((a, b) => d2(a) - d2(b)).slice(0, n)
      shown = [...new Set([...(next ? [next] : []), ...by([...flags.keys()], 4), ...by(seen.filter((r) => !r.scanned), 6), ...by(seen.filter((r) => r.scanned), 5)])].slice(0, LABELS)
      labs.forEach((d, i) => {
        const r = shown[i]; if (!r) return
        const m = `${d2(r).toFixed(0)} m`, flag = flags.has(r)
        d.className = 'rv-lab ' + (r === next ? 'next' : flag ? 'target' : r.drilled ? 'done' : r.scanned ? 'known' : 'scan')
        d.textContent = r === next ? (flag ? `▼ DRILL THIS · ${r.kind.name} · ${m}` : `▼ SCAN NEXT (F) · ${m}`)
          : flag ? `◆ ${r.kind.name} · drill target · ${m}` : r.drilled ? `✓ ${r.kind.name} · sampled` : r.scanned ? `✓ ${r.kind.name}` : `○ not scanned · ${m}`
      })
    }

    // Mapa de pistas (Luna): hidrógeno que vio el orbitador en celdas gruesas de 15 m, con ruido según la calidad
    // del mapeo; lo que el rover ya escaneó (F) se ve nítido. Arriba = norte (hacia la sombra), como la cámara.
    const mapCv = mapRef.current, mapCtx = mapCv?.getContext('2d') ?? null
    const mapOff = document.createElement('canvas'); mapOff.width = mapOff.height = MAP_N
    const octx = mapOff.getContext('2d'), img = octx?.createImageData(MAP_N, MAP_N)
    const paintMap = () => {
      if (!octx || !img) return
      for (let j = 0; j < MAP_N; j++) for (let i = 0; i < MAP_N; i++) {
        const wx = HALF - ((i + 0.5) / MAP_N) * SIZE, wz = HALF - ((j + 0.5) / MAP_N) * SIZE
        const fine = scans.some((c) => Math.hypot(wx - c.x, wz - c.z) < SCAN_R)
        const cx = (Math.floor(wx / 15) + 0.5) * 15, cz = (Math.floor(wz / 15) + 0.5) * 15
        const v = fine ? signalAt(wx, wz) : clamp(signalAt(cx, cz) * (0.5 + quality * 0.5) + (hash2(cx, cz) - 0.5) * 0.5 * (1 - quality), 0, 1) * 0.75
        const g = Math.hypot(wx, wz) > RIM ? 12 : (world.shadow && wz < LIGHT_Z ? 84 : 30) + (fine ? 16 : 0)
        img.data.set([g + (40 - g) * v, g + (205 - g) * v, g + (255 - g) * v, 255], (j * MAP_N + i) * 4)
      }
      octx.putImageData(img, 0, 0)
    }
    const drawMap = () => {
      if (!mapCv || !mapCtx) return
      if (mapDirty) { paintMap(); mapDirty = false }
      const W = mapCv.width, c = mapCtx, px = (wx: number) => ((HALF - wx) / SIZE) * W, pz = (wz: number) => ((HALF - wz) / SIZE) * W
      c.imageSmoothingEnabled = false; c.drawImage(mapOff, 0, 0, W, W)
      if (world.shadow) { c.strokeStyle = '#ffb020'; c.lineWidth = 1; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(px(-70), pz(LIGHT_Z)); c.lineTo(px(70), pz(LIGHT_Z)); c.stroke(); c.setLineDash([]) }
      c.strokeStyle = '#38e1ff55'; for (const k of scans) { c.beginPath(); c.arc(px(k.x), pz(k.z), (SCAN_R / SIZE) * W, 0, 6.3); c.stroke() }
      for (const k of holes) { c.fillStyle = k.wet ? '#38e1ff' : '#8a8a8a'; c.beginPath(); c.arc(px(k.x), pz(k.z), 3, 0, 6.3); c.fill(); c.strokeStyle = '#000'; c.stroke() }
      const spike = deposits.find((d) => d.spike && !d.taken)
      if (spike) { c.strokeStyle = '#ef6f6c'; c.lineWidth = 2; c.beginPath(); c.arc(px(spike.x), pz(spike.z), 5, 0, 6.3); c.stroke() }
      c.fillStyle = '#fff'; c.fillRect(px(9) - 2, pz(-70) - 2, 4, 4) // lander
      // Rover: flecha en su rumbo (en pantalla, +x del mundo queda a la izquierda y +z arriba).
      c.save(); c.translate(px(x), pz(z)); c.rotate(Math.atan2(-Math.sin(yaw), Math.cos(yaw)))
      c.fillStyle = '#c8f560'; c.strokeStyle = '#000'; c.lineWidth = 1
      c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke(); c.restore()
    }

    // Puntos visibles de rocas altas que caen dentro de la huella de las ruedas con el rover en (px, pz, ry).
    const PROXY_FOOT = { minX: -1.1, maxX: 1.1, minZ: -1.25, maxZ: 1.25 } // la caja provisional
    const hits = (px: number, pz: number, ry: number) => field.hits(px, pz, ry, rig?.foot ?? PROXY_FOOT)

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
        if (drilling || laserT > 0 || scanT > 0 || vmax === 0) speed *= 0.8
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
        const dark = world.shadow && z > LIGHT_Z
        // Regolito blando: a veces atrapa las ruedas.
        if (dark && !stuck && Math.abs(speed) > 1.5 && rng() < dt * (crater.terrain === 'soft' ? 0.012 : 0.006)) {
          stuck = true; speed = 0; say(`Stuck in soft regolith! Press R to break free (${start.mesh ? '85' : '50'}% per try).`, 5)
        }
        if (dark && !entered) { entered = true; say('Entering permanent shadow. No sunlight, no charging. Watch the red return marker.', 5) }

        // Energía y temperatura.
        bat -= dt * (drain() + Math.abs(speed) * 0.07) * kB
        // Carga solar. En la Luna el Sol es rasante: los paneles laterales rinden más con el rover de costado al Sol
        // (2 %/s) que de frente o de espaldas (0.8 %/s).
        chg = dark ? 0 : world.shadow ? 0.8 + 1.2 * Math.abs(Math.cos(yaw) * SUN_X - Math.sin(yaw) * SUN_Z) : 1.4
        if (!dark) bat = Math.min(100, bat + dt * chg * kB)
        st.minTemp = Math.min(st.minTemp, temp)
        temp += dt * (!dark ? (20 - temp) * 0.3 : heaters ? (20 - temp) * 0.05 : -1.2)
        const need = needToReturn()
        if (dark && !trapped && bat < need) { trapped = true; say('POINT OF NO RETURN crossed. You cannot make it back to the light.', 6) }
        if (trapped && !dark) trapped = false

        // Perforación manual: SPACE sostenido despliega el brazo y avanza la broca; al soltar, el brazo se guarda.
        // El avance se conserva mientras el rover no se mueva del hoyo. Luna: se perfora el regolito en la sombra.
        // Marte: solo rocas (la que quede bajo la broca), una vez cada una.
        if (jamT > 0) jamT -= dt
        const D = cur()
        const holding = keys.has('Space') && laserT === 0 && scanT === 0
        if (hotT > 0) hotT -= dt
        if (holding && hotT > 0 && toastT <= 0) say('The bit is too hot. Let it cool for a moment.', 1.5)
        let want = holding && jamT <= 0 && hotT <= 0 && Math.abs(speed) < 0.8
        if (want && !drilling) {
          const quiet = toastT <= 0
          if (iceHunt) {
            if (!dark && world.shadow) { want = false; if (quiet) say('Nothing to find on the sunlit rim: drive into the shadow first.') }
          } else {
            drillRock = field.under(dp.x, dp.z, DRILL_R)
            if (!drillRock) { want = false; if (quiet) say('No rock under the drill. Park with a rock right in front of the arm.', 2.5) }
            else if (drillRock.drilled) { want = false; if (quiet) say('This rock is already sampled. Find another one.', 2.5) }
          }
        }
        if (want && !drilling) {
          if (Math.hypot(x - holeX, z - holeZ) > 0.25) { prog = 0; holeX = x; holeZ = z }
          if (prog === 0) {
            // Hoyo nuevo: cuánto hielo hay y desde qué fracción del hoyo aparece (fija por lugar; no consume el rng).
            xIce = iceHunt ? sampleAt(D.mul).pct : 0; iceTop = 0.2 + hash2(x * 7.1, z * 3.3) * 0.55
            xray.reset(iceHunt ? iceTop : 0.25); bites.length = 0; sublim = 0 // los rayos X muestran ese mismo hielo
          }
          libsT = 0
        }
        drilling = want
        if (!drilling && prog > 0 && Math.hypot(x - holeX, z - holeZ) > 0.25) prog = 0 // se fue del hoyo: avance perdido
        // Por tramos (como TRIDENT): cada 1/BITES del hoyo la broca se detiene un momento a sacar el polvo y da una lectura.
        const cutting = drilling && biteT <= 0 && (rig ? contact >= 1 : true)
        if (biteT > 0) biteT -= dt
        // La broca se calienta al cortar (más en hielo) y se enfría al parar; soltar SPACE la enfría más rápido.
        if (!cutting) bitT = Math.max(0, bitT - dt * (drilling ? 0.2 : 0.5))
        if (cutting) {
          const step = dt / drillSecs(D.m), before = prog
          prog += step; bat -= D.cost * kB * step // la energía se gasta a medida que avanza
          drill.position.y = -0.05 - Math.sin(t * 20) * 0.08
          if (iceHunt && prog < 1) {
            const inIce = xIce > 0 && prog >= iceTop
            bitT += dt * (0.17 + (inIce ? 0.12 : 0))
            const b = Math.floor(prog * BITES)
            if (b > Math.floor(before * BITES)) { const r = reading(b / BITES); bites.push(r); biteT = BITE_T; beep(r.k === 2 ? 1500 : r.k === 1 ? 1000 : 600) }
            if (bitT >= 1) {
              // Sobrecalentada: se detiene sola unos segundos y, si ya estaba en hielo, parte se sublima.
              bitT = 1; hotT = 2.5; drilling = false; keys.delete('Space')
              if (inIce) { sublim = Math.min(0.6, sublim + 0.15); say('Bit overheated! Part of the ice sublimated (−15% water). Drill in shorter bursts.', 4) }
              else say('Bit overheated. Let it cool, then keep drilling in shorter bursts.', 3)
            }
          }
          if (prog >= 1) {
            // Hoyo terminado: el taladro se detiene solo; hay que soltar y volver a apretar SPACE para el siguiente.
            prog = 0; drilling = false; holeX = holeZ = Infinity; keys.delete('Space'); drill.position.y = 0.2
            if (rng() < D.jam) { jamT = 15; bat -= 2 * kB; say('Jammed drill! Freeing it takes 15 s (−2% battery).') }
            else if (!iceHunt) {
              // Marte: el polvo de la roca va a CheMin y SAM; esa roca no se vuelve a perforar.
              const rock = drillRock!, kind = rock.kind, pts = kind.core ?? 5
              rock.drilled = true; cores++; st.samples++; st.points += pts
              if (!rock.scanned) { rock.scanned = true; scannedN++; found.set(kind.id, (found.get(kind.id) ?? 0) + 1); cand = null }
              const flag = flags.get(rock); if (flag) { scene.remove(flag); flags.delete(rock) }
              mark(!!kind.target)
              libs = { kind, k: 1, isNew: false, pts, lab: true }; libsT = 16
              beep(kind.target ? 1400 : 1000)
              say(`${kind.name} sampled: the powder goes to the onboard lab. +${pts} science.`)
            }
            else if (temp < -30 && rng() < 0.35) say('Instrument fault from the cold — sample lost. Turn the heaters on.')
            else {
              const core = sampleAt(D.mul), dep = core.dep, pct = +(core.pct * (1 - sublim)).toFixed(1) // lo sublimado se perdió
              record(pct); mark(pct > 0)
              if (dep) dep.taken = true
              holes.push({ x, z, wet: pct > 0 }); mapDirty = true
              if (pct > 0) beep(1400)
              say(verdict(pct) + ' Stored until the next relay pass.')
              if (pct > 0 && !anomaly) {
                anomaly = true
                const sx = (rng() - 0.5) * 60, sz = 52
                deposits.push({ x: sx, z: sz, rich: crater.ice * 2.2 + 4, taken: false, spike: true })
                beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xef6f6c, transparent: true, opacity: 0.25, side: THREE.DoubleSide }))
                beacon.position.set(sx, height(sx, sz) + 30, sz); scene.add(beacon)
                setTimeout(() => say(`ANOMALOUS READING: a massive hydrogen spike ${Math.round(Math.hypot(sx - x, sz - z))} m deeper inside (pink beacon). Go for it, or head back to recharge?`, 7), 3600)
              }
            }
          }
        } else drill.position.y = 0.2

        // Láser (ChemCam, LIBS): F apunta el mástil a la roca sin analizar más cercana, dispara y lee su composición.
        if (laserT > 0 && laserRock) {
          if (!aimed) { aimT += dt; if (aimT > 1.5) aimed = true }
          else {
            laserT -= dt; zapT -= dt
            if (zapT <= 0) { zapT = 0.16; beep(2600) }
            libs = { kind: laserRock.kind, k: 1 - Math.max(0, laserT) / LASER_T, isNew: false, pts: 0, lab: false }; libsT = 1
            if (laserT <= 0) {
              const kind = laserRock.kind, seen = found.get(kind.id) ?? 0, pts = seen ? 2 : kind.pts
              const rock = laserRock
              laserT = 0; rock.scanned = true; laserRock = null; cand = null; scannedN++
              if (kind.target && !rock.drilled) {
                // Rombo verde sobre la roca: conviene perforarla.
                let ty = -Infinity; for (let i = 1; i < rock.pts.length; i += 3) ty = Math.max(ty, rock.pts[i])
                const flag = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xc8f560, fog: false }))
                flag.position.set(rock.x, ty + 0.9, rock.z); scene.add(flag); flags.set(rock, flag)
              }
              found.set(kind.id, seen + 1); st.points += pts
              libs = { kind, k: 1, isNew: !seen, pts, lab: false }; libsT = 12
              beep(seen ? 1100 : 1500)
              say((seen ? `${kind.name} again. +${pts} science.` : `New rock type identified: ${kind.name}! +${pts} science.`) + (kind.target ? ' Worth drilling: marked with a green diamond.' : ''), 4.5)
            }
          }
        }
        if (libsT > 0) libsT -= dt
        // Luna: escaneo del subsuelo. Deja nítido en el mapa lo que hay a SCAN_R m (el orbitador solo da manchas gruesas).
        if (scanT > 0) {
          scanT -= dt
          if (scanT <= 0) {
            scanT = 0; scans.push({ x, z }); mapDirty = true; beep(1300)
            const near = Math.min(...deposits.filter((d) => !d.taken).map((d) => Math.hypot(d.x - x, d.z - z)), Infinity)
            say(near < SCAN_R ? `Scan complete: hydrogen-rich ground ${near.toFixed(0)} m away. The map shows it sharp now.`
              : `Scan complete: nothing within ${SCAN_R} m. Check the map for the next blue patch.`, 4.5)
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
        if (!iceHunt) sig = 0 // en Marte no se busca hielo
        beepT -= dt
        if (beepT <= 0 && sig > 0.05) { beep(500 + sig * 900); beepT = 1.2 - sig * 1.1 }
        hudT -= dt; toastT -= dt
        if (hudT <= 0) {
          hudT = 0.1
          mast.set(x, height(x, z) + 2, z)
          if (!iceHunt && laserT === 0) cand = field.target(x, z, LASER_MIN, LASER_MAX, mast, candHit)
          const below = iceHunt ? null : field.under(dp.x, dp.z, DRILL_R)
          const under = !below ? 'soil' : below.drilled ? `${below.kind.name} · sampled` : below.scanned ? below.kind.name : 'unknown rock'
          const canDrill = !!below && !below.drilled
          drawMap()
          if (nav && !iceHunt) navTick(); else next = null
          const spike = deposits.find((d) => d.spike && !d.taken)
          const goal = trapped ? 'No way back to the light. Make the remaining power count.'
            : stuck ? 'Stuck! Press R to rock the wheels free.'
            : !iceHunt ? (drilling ? 'Keep holding SPACE until the drill finishes.'
              : canDrill && Math.abs(speed) < 0.8 ? `${below!.scanned ? below!.kind.name : 'Rock'} under the arm: hold SPACE to drill it.`
              : cand ? 'Rock in laser range (green ring): stop and press F to analyze it.'
              : nav && next ? `Follow the green route on the grid: ${flags.has(next) ? 'drill target' : 'rock to scan'} ${Math.hypot(next.x - x, next.z - z).toFixed(0)} m away. Red cells are hazards.`
              : flags.size ? 'Drill target marked with a green diamond: park with that rock right in front of the arm.'
              : 'Press G for the navigation cameras: they tag the rocks, show hazards and suggest a safe route.')
            : !dark && !entered ? 'Drive north (W) across the orange line. The ice is in the permanent shadow.'
            : !dark && st.wet > 0 ? 'Safe in the sunlight. End the mission, or recharge and go back in.'
            : !dark && bat < 99 && chg < 1.6 ? 'Recharging slowly: park side-on to the Sun so the side panels face it.'
            : !dark ? 'Recharging in the sun. Head back into the shadow when ready.'
            : bat < need + 12 ? 'Battery is getting low: turn back south to the light now.'
            : sig > 0.2 ? 'Strong signal! Stop (S) and hold SPACE to drill here.'
            : scans.length === 0 ? 'Check the hydrogen map (bottom left) and press F to scan the ground around you.'
            : st.wet > 0 ? 'Ice found! Keep exploring, or drive back south to the light to finish.'
            : 'Follow the neutron signal: the bar fills and the beeps speed up near ice.'
          setHud({
            goal,
            bat, need, temp, heaters, sig, speed, slope, samples: st.samples, stored: stored.length, sent: st.waterG,
            drill: prog, drilling, depth, jam: Math.max(0, jamT), relay: inWin ? 0 : relay.period - relay.dur - ph, link,
            spike: spike ? Math.hypot(spike.x - x, spike.z - z) : -1, shadow: dark, trapped,
            canReturn: !dark && entered && st.wet > 0, toast: toastT > 0 ? toast : '',
            integ, stuck, teleop: !start.autonav && !link, extended: st.extended,
            lcam: lpov > 0.5, pov: pov > 0.5, xray: xOn, xcm: +(clamp(prog, 0, 1) * cur().cm).toFixed(1), xmax: cur().cm, xice: xSeen,
            under, canDrill, cores,
            bites: [...bites], heat: bitT, hot: Math.max(0, hotT), chg,
            gas: iceHunt && start.massSpec && sig > 0.04 ? [sig * (0.85 + Math.random() * 0.15), sig * (0.4 + Math.random() * 0.2), sig * (0.2 + Math.random() * 0.15)] : null,
            nav, seen: seenN, nextD: next ? Math.hypot(next.x - x, next.z - z) : -1, nextDrill: !!next && flags.has(next),
            laser: scanT > 0 ? 1 - scanT / SCAN_T : laserT > 0 ? (aimed ? 1 - laserT / LASER_T : 0) : -1, inRange: !!cand,
            kinds: found.size, kindsAll: field.kinds.length, scanned: scannedN, libs: libsT > 0 ? libs : null,
          })
        }
      }
      if (beacon) (beacon.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(performance.now() / 300) * 0.08
      if (paused) { drilling = false; laserT = 0; scanT = 0 }
      // Onda del escaneo: un anillo que se abre sobre el suelo hasta SCAN_R.
      wave.visible = scanT > 0
      if (wave.visible) {
        const q = 1 - scanT / SCAN_T
        wave.position.set(x, height(x, z) + 0.4, z); wave.scale.setScalar(0.5 + q * SCAN_R); (wave.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - q * q)
      }
      for (const f of flags.values()) f.rotation.y += dt * 1.5
      if (rig) {
        // Suspensión procedural: cada rueda busca el suelo y el chasis queda en el promedio de los rockers.
        rig.update(dt, rover, x, z, yaw, paused ? 0 : speed, paused ? 0 : steer, surface)
        rig.drill(dt, drilling, drillGround, iceHunt ? TOWER_REACH : undefined)
        if (rig.aim(dt, laserT > 0 ? hit : null) && laserT > 0) aimed = true
        rig.laserOrigin(lo)
      } else {
        if (laserT > 0) aimed = true
        nrm.set(-gx, 1, -gz).normalize()
        rover.position.set(x, height(x, z), z)
        rover.quaternion.setFromUnitVectors(up3, nrm).multiply(qy.setFromAxisAngle(up3, yaw))
        rover.updateMatrixWorld(); rover.localToWorld(lo.set(0, 1.9, 1))
        dp.set(x + Math.sin(yaw) * 1.4, 0, z + Math.cos(yaw) * 1.4)
      }
      // Rayo: pulsos que parpadean entre el lente y la roca, con la chispa de plasma donde pega.
      const firing = laserT > 0 && aimed
      beam.visible = firing && Math.random() > 0.25
      spark.visible = firing; flash.intensity = firing ? 3 + Math.random() * 12 : 0
      if (firing) {
        const len = lo.distanceTo(hit)
        beam.position.copy(lo).lerp(hit, 0.5); beam.lookAt(hit); beam.scale.set(1, 1, len)
        spark.position.copy(hit); spark.scale.setScalar(0.5 + Math.random() * 1.3); flash.position.copy(hit).lerp(lo, 0.03)
      }
      // Mira sobre la roca que el láser analizaría (o está analizando).
      ring.visible = !paused && (laserT > 0 || !!cand)
      if (ring.visible) {
        ring.position.copy(laserT > 0 ? hit : candHit); ring.lookAt(camera.position)
        ring.scale.setScalar(laserT > 0 ? 0.7 + Math.sin(performance.now() / 60) * 0.12 : 1 + Math.sin(performance.now() / 300) * 0.08)
      }
      if (top) off.set(0, 45, -0.1); else off.set(-Math.sin(yaw) * 10, 5.5, -Math.cos(yaw) * 10)
      camT.set(x, height(x, z), z)
      chase.lerp(off.add(camT), 1 - Math.exp(-dt * 4)); chaseLook.set(camT.x, camT.y + 1.2, camT.z)

      // Perforación vista de cerca: la cámara se acerca a la broca y, con la broca adentro, entra el corte de rayos X.
      contact = rig ? rig.drillContact() : 0
      pov += ((rig && drilling ? 1 : 0) - pov) * (1 - Math.exp(-dt * (drilling ? 2.5 : 1.8)))
      xOn = drilling && contact >= 1
      if (rig) {
        rig.drillPoint(dp)
        // Al lado de la broca, del lado del brazo y un poco adelante, mirando hacia el rover (como el plano de NatGeo).
        // Con la broca adentro se aleja y baja la mirada para que entre todo el hoyo, según su profundidad.
        xk += ((xOn ? 1 : 0) - xk) * (1 - Math.exp(-dt * 1.5))
        const dm = cur().m * xk, c = Math.cos(yaw), s = Math.sin(yaw), lx = 1.35 + dm * 0.45, lz = 1.15 + dm * 0.35
        povPos.set(dp.x + lx * c + lz * s, 0, dp.z - lx * s + lz * c)
        povPos.y = Math.max(dp.y + 0.6 + dm * 0.15, drillGround(povPos.x, povPos.z) + 0.3)
        povLook.set(dp.x, dp.y + 0.18 - dm * 0.45, dp.z)
        work.position.set(dp.x + 0.3 * c + 0.4 * s, dp.y + 0.8, dp.z - 0.3 * s + 0.4 * c)
        xSeen = xray.update(dt, dp, xOn, clamp(prog, 0, 1), cur().m, xIce)
      }
      work.intensity = 9 * pov
      const k = pov * pov * (3 - 2 * pov)
      // Vista de navegación: primera persona desde el mástil, mirando al frente y algo hacia abajo.
      navK += ((nav ? 1 : 0) - navK) * (1 - Math.exp(-dt * 4))
      const kn = navK * navK * (3 - 2 * navK), sy = Math.sin(yaw), cy = Math.cos(yaw)
      fpPos.set(x + sy * 0.95, rover.position.y + 2.15, z + cy * 0.95)
      fpLook.set(x + sy * 12, rover.position.y + 0.3, z + cy * 12)
      gridMesh.visible = navK > 0.02; gridMat.uniforms.gain.value = kn; gridMat.uniforms.rover.value.set(x, z)
      gridMat.uniforms.fwd.value.set(sy, cy); gridMat.uniforms.lamp.value = lamp.visible ? 1 : 0
      camera.position.copy(chase).lerp(fpPos, kn).lerp(povPos, k)
      look.copy(chaseLook).lerp(fpLook, kn).lerp(povLook, k)
      // Cámara del láser: junto a la roca, del lado contrario al rover, con la chispa adelante y el mástil al fondo.
      lpov += ((laserT > 0 ? 1 : 0) - lpov) * (1 - Math.exp(-dt * (laserT > 0 ? 2.5 : 1.8)))
      if (laserT > 0) {
        const bx = lo.x - hit.x, bz = lo.z - hit.z, bl = Math.hypot(bx, bz) || 1, ux = bx / bl, uz = bz / bl
        lpPos.set(hit.x - ux * 1.3 - uz * 1.1, 0, hit.z - uz * 1.3 + ux * 1.1)
        lpPos.y = Math.max(hit.y + 0.55, drillGround(lpPos.x, lpPos.z) + 0.35)
        lpLook.copy(hit).lerp(lo, 0.18)
      }
      if (lpov > 0.001) { const k2 = lpov * lpov * (3 - 2 * lpov); camera.position.lerp(lpPos, k2); look.lerp(lpLook, k2) }
      camera.lookAt(look)
      // Etiquetas de rocas: proyectadas a la pantalla con la cámara ya ubicada.
      const tags = nav && !iceHunt && !paused && navK > 0.6 && pov < 0.3 && lpov < 0.3
      if (labBox && (tags || !labBox.hidden)) {
        labBox.hidden = !tags
        if (tags) {
          camera.updateMatrixWorld(); camera.getWorldDirection(camDir)
          const w = labBox.clientWidth, hgt = labBox.clientHeight
          labs.forEach((d, i) => {
            const r = shown[i]
            if (!r || lv.set(r.x, r.top + 0.45, r.z).sub(camera.position).dot(camDir) < 0.5) { d.hidden = true; return }
            lv.set(r.x, r.top + 0.45, r.z).project(camera)
            d.hidden = Math.abs(lv.x) > 1 || Math.abs(lv.y) > 1
            if (!d.hidden) d.style.transform = `translate(${((lv.x + 1) / 2 * w).toFixed(1)}px, ${((1 - lv.y) / 2 * hgt).toFixed(1)}px) translate(-50%, -100%)`
          })
        }
      }
    }
    return Object.assign(tick, { cleanup: () => { gone = true; labBox?.replaceChildren(); removeEventListener('keydown', down); removeEventListener('keyup', up); void audio?.close() } })
  }), [crater, world, iceHunt, quality, seed, orbitId, start, dem])

  const h = hud
  const text = final?.kind === 'terminal' ? final.lines.join('\n').slice(0, typed) : ''
  const typedAll = final?.kind === 'terminal' && typed >= final.lines.join('\n').length
  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      <div className={`rv-xray${h?.pov || h?.lcam ? ' on' : ''}${h?.xray ? ' scan' : ''}`} aria-hidden={!h?.pov && !h?.lcam}>
        <div className="rv-xray-tag">{h?.lcam ? '● LASER CAM · CHEMCAM FIRING' : h?.xray ? '● X-RAY · SUBSURFACE SCAN' : '● DRILL CAM · ARM DEPLOYING'}</div>
        {h?.xray && (
          <div className="rv-xray-read">
            <span>Depth</span><b>{h.xcm} / {h.xmax} cm</b>
            {h.xice && iceHunt && <em>ICE CRYSTALS DETECTED</em>}
          </div>
        )}
      </div>
      {h && !final && (h.drilling || h.drill > 0) && (
        <div className="rv-hold">
          <small>{!h.drilling ? `PAUSED AT ${Math.round(h.drill * 100)}% · HOLD SPACE TO RESUME` : h.xray || h.drill > 0 ? `DRILLING · ${h.xcm} / ${h.xmax} cm · KEEP HOLDING SPACE` : 'DEPLOYING ARM · KEEP HOLDING SPACE'}</small>
          <div className="rv-hold-bar"><i style={{ width: `${Math.min(100, h.drill * 100)}%` }} />{iceHunt && [1, 2, 3].map((k) => <em key={k} style={{ left: `${k * 25}%` }} />)}</div>
          <b>{Math.round(h.drill * 100)}%</b>
          {iceHunt && (
            <>
              <div className={`rv-heat${h.heat > 0.8 ? ' hot' : ''}`}><span>BIT TEMP{h.hot > 0 ? ` · COOLING ${h.hot.toFixed(1)} s` : h.heat > 0.8 ? ' · RELEASE SPACE TO COOL' : ''}</span><div><i style={{ width: `${Math.min(100, h.heat * 100)}%` }} /></div></div>
              {h.bites.length > 0 && <ul className="rv-bites">{h.bites.map((b) => <li key={b.t} className={`k${b.k}`}>{b.t}</li>)}</ul>}
            </>
          )}
        </div>
      )}
      {h && !final && h.laser >= 0 && (
        <div className={`rv-hold ${iceHunt ? 'scan' : 'laser'}`}>
          <small>{iceHunt ? 'NEUTRON + NEAR-INFRARED · SCANNING THE SUBSURFACE' : h.laser === 0 ? 'CHEMCAM · AIMING THE MAST' : 'CHEMCAM LASER · VAPORIZING ROCK'}</small>
          <div className="rv-hold-bar"><i style={{ width: `${h.laser * 100}%` }} /></div>
          <b>{Math.round(h.laser * 100)}%</b>
        </div>
      )}
      {h?.libs && !final && (
        <div className="rv-libs">
          <small>{h.libs.lab ? 'CHEMIN + SAM · DRILLED SAMPLE' : 'CHEMCAM · LIBS SPECTRUM'}</small>
          <div className="rv-spec">
            {h.libs.kind.spectrum.map(([el, v]) => <div key={el}><i style={{ height: `${Math.round(v * h.libs!.k * 100)}%` }} /><span>{el}</span></div>)}
          </div>
          {h.libs.k >= 1 ? (
            <>
              <h4>{h.libs.kind.name}{h.libs.isNew && <em>NEW</em>}{!h.libs.lab && h.libs.kind.target && <em>DRILL TARGET</em>}</h4>
              <p className="min">{h.libs.kind.minerals}</p>
              <p>{h.libs.lab ? h.libs.kind.lab : h.libs.kind.note}</p>
              <p className="pts">+{h.libs.pts} science</p>
            </>
          ) : <h4 className="wait">Reading the plasma light…</h4>}
        </div>
      )}
      {h && (
        <div className="rv-hud">
          <h3>BUSCADOR · {crater.name}</h3>
          <div className="rv-row"><span>Battery</span><b>{h.bat.toFixed(0)}%{h.chg > 0 ? ` charging ${h.chg.toFixed(1)}%/s` : ''}</b></div>
          <div className="rv-bar rv-bat">
            <i style={{ width: `${h.bat}%`, background: h.trapped || h.bat < h.need + 5 ? 'var(--red)' : undefined }} />
            {h.need > 0 && <em style={{ left: `${Math.min(h.need, 100)}%` }} title="Battery needed to return to the light" />}
          </div>
          <div className="rv-row"><span>Needed to return</span><b className={h.trapped ? 'bad' : ''}>{h.trapped ? 'NO RETURN' : `${h.need.toFixed(0)}%`}</b></div>
          <div className="rv-row"><span>Temperature · heaters <kbd>H</kbd></span><b className={h.temp < -10 ? 'bad' : ''}>{h.temp.toFixed(0)}°C · {h.heaters ? 'on' : 'off'}</b></div>
          <div className="rv-row"><span>Wheels</span><b className={h.integ < 30 ? 'bad' : ''}>{h.stuck ? 'STUCK: press R' : `${h.integ}%`}{h.teleop ? ' · teleop (slow)' : ''}</b></div>
          {iceHunt ? (
            <>
              <div className="rv-row"><span>Neutron signal (H)</span><b>{Math.round(h.sig * 100)}</b></div>
              <div className="rv-bar sig"><i style={{ width: `${h.sig * 100}%` }} /></div>
              <div className="rv-row"><span>Drill depth</span><b>{h.jam > 0 ? `JAMMED ${h.jam.toFixed(0)}s` : DEPTHS[h.depth].label}</b></div>
              <div className="rv-row"><span>Relay</span><b className={h.link ? 'good' : ''}>{h.link ? 'ORBITER OVERHEAD' : `next pass ${h.relay.toFixed(0)} s`}</b></div>
              <div className="rv-row"><span>Samples · waiting · sent</span><b>{h.samples} · {h.stored} · {h.sent} g</b></div>
              {h.spike >= 0 && <div className="rv-row"><span>Hydrogen spike</span><b className="pink">{h.spike.toFixed(0)} m</b></div>}
            </>
          ) : (
            <>
              <div className="rv-row"><span>Laser <kbd>F</kbd></span><b className={h.inRange ? 'good' : ''}>{h.inRange ? 'ROCK IN RANGE' : 'no rock within 7 m'}</b></div>
              <div className="rv-row"><span>Under the drill</span><b className={h.canDrill ? 'good' : ''}>{h.jam > 0 ? `JAMMED ${h.jam.toFixed(0)}s` : h.under}</b></div>
              <div className="rv-row"><span>Rocks seen by the cameras <kbd>G</kbd></span><b>{h.seen}</b></div>
              <div className="rv-row"><span>Rock types identified</span><b>{h.kinds} / {h.kindsAll}</b></div>
              <div className="rv-row"><span>Rocks analyzed · drilled</span><b>{h.scanned} · {h.cores}</b></div>
            </>
          )}
          <p className="hint">{iceHunt ? `Blue tint = hydrogen your orbiter mapped (${Math.round(quality * 100)}% quality). ` : 'Like Curiosity: laser first, drill the rocks that water touched. '}Seed {seed}{dem ? ` · ${world.relief}${dem.vex !== 1 ? ` ×${dem.vex}` : ''}` : ''}</p>
        </div>
      )}
      <div ref={labelsRef} className="rv-labels" hidden />
      {h?.gas && !final && !h.pov && (
        <div className="rv-libs gas">
          <small>MASS SPECTROMETER · LIVE VOLATILES</small>
          <div className="rv-spec">
            {(['H₂O', 'H₂', 'CO₂'] as const).map((el, i) => <div key={el}><i style={{ height: `${Math.round(Math.min(1, h.gas![i]) * 100)}%` }} /><span>{el}</span></div>)}
          </div>
          <p>Gases rising from the regolith. Sweep the area to find where the water peak is strongest before drilling.</p>
        </div>
      )}
      {h?.nav && !final && !h.pov && !h.lcam && (
        <div className="rv-nav">
          <b>● NAVCAM · HAZARD VIEW</b>
          <span><i className="n-safe" /> clear</span><span><i className="n-warn" /> caution</span><span><i className="n-bad" /> hazard</span>
          {!iceHunt && <span><i className="n-path" /> suggested route{h.nextD >= 0 ? ` · ${h.nextDrill ? 'drill target' : 'rock to scan'} ${h.nextD.toFixed(0)} m` : ' · no rock in sight'}</span>}
          {iceHunt && h.shadow && <span>in the dark: lidar {LIDAR_R} m + headlights <kbd>L</kbd></span>}
          <span><kbd>G</kbd> close</span>
        </div>
      )}
      {iceHunt && (
        <div className="rv-map">
          <small>HYDROGEN MAP · WHERE ICE MAY BE</small>
          <canvas ref={mapRef} width={200} height={200} />
          <p><i className="k-blue" /> hydrogen seen from orbit (coarse) · <kbd>F</kbd> scan to sharpen · <i className="k-wet" /> ice core · <i className="k-dry" /> dry</p>
        </div>
      )}
      <div className="rv-keys">
        <div><kbd>W A S D</kbd> drive · hold <kbd>SPACE</kbd> drill · <kbd>F</kbd> {iceHunt ? 'scan' : 'laser'}</div>
        <div><kbd>L</kbd> lights · <kbd>C</kbd> top view · <kbd>G</kbd> nav view · <kbd>R</kbd> unstick</div>
        <button className="btn small ghost" onClick={() => setSound(!sound)}>{sound ? 'Sound on' : 'Sound off'}</button>
      </div>
      {h && !final && <div className="rv-goal" role="status"><small>WHAT TO DO</small>{h.goal}</div>}
      {h?.toast && !final && <div className="rv-toast">{h.toast}</div>}
      {h?.canReturn && !final && (
        <div className="rv-end">
          <button className="btn big" onClick={() => api.current?.finish('return')}>Back in the light — end mission </button>
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
