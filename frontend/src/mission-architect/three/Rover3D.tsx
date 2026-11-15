import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Crater } from '../data/types'
import { clamp, mulberry32, type Rng } from '../engine/rng'
import { buildLander } from './spacecraft'
import { loadCuriosity, meshHeight, type CuriosityRig, type HeightFn } from './curiosity'
import { at, earthMesh, mountStage, stars } from './stage'
import { MOON, type RoverSite, type World } from './world'
import { makeXray } from './xray'
import { CoreSample } from './CoreSample'
import { ROCKS as ROCK_INFO, rocksAt, type RockKind } from '../data/samples'

export type RoverEnding = 'return' | 'last' | 'frozen' | 'dead'
export interface RoverResult {
  samples: number; wet: number; waterG: number; lostG: number; bestPct: number; points: number
  ending: RoverEnding; seed: number; minTemp: number; confirmed: number; live: boolean; extended: boolean
  /** Marte: núcleos que llegaron a la Tierra (tipo y semilla del modelo). */
  cores: { kind: RockKind; seed: number; pct: number }[]
}
/** Lo que llega del aterrizaje y del Rover Bay del hangar. */
export interface RoverStart {
  batteryPct: number; sciMul: number; integrity: number
  batteryKWh: number; mesh: boolean; deep: boolean; massSpec: boolean; autonav: boolean; canExtend: boolean
}
export const DEFAULT_ROVER: RoverStart = { batteryPct: 100, sciMul: 1, integrity: 100, batteryKWh: 6, mesh: false, deep: true, massSpec: true, autonav: true, canExtend: true }

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyL', 'KeyC', 'KeyH', 'KeyR', 'KeyT', 'Digit1', 'Digit2', 'Digit3', 'Digit4'])
const SIZE = 240, HALF = SIZE / 2, RIM = 92, SEG = 200
const DRILL_T = 5 // s por perforación: el brazo se despliega (0.9), baja (0.5) y perfora el resto
const DRILL_BUSY = DRILL_T - 1.4 - 0.2 // s con la broca adentro (el margen evita que el corte termine antes)
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
const STORM_T = 110 // s de juego hasta la primera tormenta de polvo (Marte); se suma un azar de hasta 40 s
const STORM_LEN = 55 // s que dura cada tormenta
const STORM_GAP = 110 // s de cielo limpio entre tormentas
const TUBES = 3 // tubos de muestra del rover (Marte)
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
  pov: boolean; xray: boolean; xcm: number; xice: boolean
  /** Marte: s hasta la próxima tormenta (si stormOn, s hasta que se va). */
  storm: number; stormOn: boolean
  /** Marte: paneles limpios 0..1 y tubos sellados. stuckHint = lleva rato sin poder avanzar. */
  clean: number; tubes: number; stuckHint: boolean
}
type Final = null | { kind: 'choice' } | { kind: 'terminal'; ending: RoverEnding; lines: string[] }

/** Acto IV: el rover entra a la sombra, perfora y tiene que volver a la luz antes de quedarse sin batería. */
export function Rover3D({ crater, quality, seed, orbitId, start, onDone, world = MOON }: {
  crater: RoverSite; world?: World; quality: number; seed: number; orbitId: string; start: RoverStart; onDone: (r: RoverResult) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState<Hud | null>(null)
  const [final, setFinal] = useState<Final>(null)
  const [typed, setTyped] = useState(0)
  const result = useRef<RoverResult>({ samples: 0, wet: 0, waterG: 0, lostG: 0, bestPct: 0, points: 0, ending: 'dead', seed, minTemp: 20, confirmed: 0, live: false, extended: false, cores: [] })
  const api = useRef<{ lastDrill: () => void; transmitAll: () => void; finish: (e: RoverEnding) => void; extend: () => void; seal: () => void; discard: () => void; reset: () => void } | null>(null)
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone }, [onDone])
  const [sound, setSound] = useState(true)
  const rocksMode = world.science === 'rocks'
  /** Núcleo recién perforado (Marte): se muestra en 3D unos segundos. */
  // pending = espera que el jugador lo selle en un tubo o lo descarte; sealed = ya está en un tubo.
  const [core, setCore] = useState<{ kind: RockKind; seed: number; n: number; conf: boolean; state: 'pending' | 'sealed' | 'discarded' } | null>(null)
  useEffect(() => { if (!core || core.state === 'pending') return; const id = setTimeout(() => setCore(null), 2500); return () => clearTimeout(id) }, [core])
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
    // Marte: afloramientos de roca de agua antigua (tipo según el sitio); la señal es la de minerales hidratados.
    type Dep = { x: number; z: number; rich: number; taken: boolean; spike?: boolean; kind?: RockKind }
    const deposits: Dep[] = []
    const rockSet = rocksAt(crater.id)
    const pickRock = () => rockSet.mix[Math.floor(rng() * rockSet.mix.length)]
    const want = Math.max(rocksMode ? 2 : 1, Math.round((2 + crater.h * 1.3) * start.sciMul))
    while (deposits.length < want) {
      const a = rng() * Math.PI * 2, r = 12 + rng() * (RIM - 30), x = Math.cos(a) * r, z = Math.sin(a) * r
      if (rocksMode) deposits.push({ x, z, rich: Math.max(2, crater.h) * (0.5 + rng()) * 1.3, taken: false, kind: pickRock() })
      else if (!world.shadow || z > LIGHT_Z + 12) deposits.push({ x, z, rich: crater.ice * (0.4 + rng()) * 1.3, taken: false })
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
    const earth = earthMesh(18) // ~2° vista desde la Luna (como se ve de verdad desde el polo sur)
    earth.position.set(-500, 40, -900); if (world.shadow) scene.add(earth)

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
    loadCuriosity().then((r) => { if (gone) return; rig = r; rover.remove(proxy); rover.add(r.model) }).catch((err) => console.error(err))

    // Orbitador cruzando el cielo durante cada ventana de relevo.
    const orb = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5cc8f0 }))
    scene.add(orb)
    const relay = RELAY[orbitId] ?? RELAY.polar_high
    let beacon: THREE.Mesh | null = null

    let x = 0, z = -74, yaw = 0, speed = 0, bat = start.batteryPct, temp = 20, heaters = true, depth = 1
    let drillT = 0, jamT = 0, top = false, steer = 0, toast = '', toastT = 0, hudT = 0, beepT = 0, t = 0
    let paused = false, trapped = false, entered = false, anomaly = false, link = false
    // Marte: la tormenta de polvo llega a stormAt s (la misión extendida la corre); con ella el Sol casi desaparece.
    let stormAt = STORM_T + rng() * 40, stormWarned = false, tau = 0, coreN = 0
    // Marte: polvo en los paneles (0 limpio … 0.65 tope), tubos sellados y núcleo que espera decisión.
    let panelDust = 0, pending: { pct: number; kind: RockKind; seed: number } | null = null
    const tubes: { pct: number; kind: RockKind; seed: number }[] = []
    // Reinicio: posiciones seguras de los últimos segundos; stuckT = tiempo acelerando sin avanzar.
    const trail: { x: number; z: number; yaw: number }[] = []
    let trailT = 0, stuckT = 0, resetCd = 0
    const skyClear = new THREE.Color(world.sky ?? 0), skyStorm = new THREE.Color(0x5a3a26), sunMax = sun.intensity
    let integ = start.integrity, stuck = false, freeT = 0
    const kB = 6 / start.batteryKWh // una batería de 3 kWh se vacía (y se llena) el doble de rápido en %
    const stored: { pct: number; conf: boolean; kind?: RockKind; seed: number }[] = [] // muestras aún sin bajar a la Tierra
    const keys = new Set<string>()
    const st = result.current
    const say = (s: string, secs = 3.5) => { toast = s; toastT = secs }
    const visible = () => el.getClientRects().length > 0
    const down = (e: KeyboardEvent) => {
      if (!visible() || paused || (e.target as HTMLElement).closest?.('input,textarea')) return
      // Teclas del juego: no deben llegar a ningún otro control (p. ej. el editor de GMAT debajo).
      if (GAME_KEYS.has(e.code)) { e.preventDefault(); e.stopPropagation() }
      keys.add(e.code)
      if (e.code === 'KeyL') lamp.visible = !lamp.visible
      if (e.code === 'KeyC') top = !top
      if (e.code === 'KeyH') { heaters = !heaters; say(heaters ? 'Heaters ON.' : 'Heaters OFF: saves power, but the rover gets colder.') }
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const d = +e.code.slice(5) - 1
        if (d === 3 && !start.deep) say('2 m needs the deep drill (Rover Bay).')
        else { depth = d; say(`Drill depth: ${DEPTHS[depth].label}`, 1.5) }
      }
      if (e.code === 'KeyT') api.current?.reset()
      if (e.code === 'KeyR' && stuck && freeT <= 0) {
        freeT = 1.5; bat -= 2 * kB
        if (rng() < (start.mesh ? 0.85 : 0.5)) { stuck = false; say(start.mesh ? 'The mesh wheels "walk" out of the soft regolith!' : 'Free! The wheels bite again.') }
        else say('Still stuck. Try again (R): each attempt costs battery.')
      }
    }
    const up = (e: KeyboardEvent) => { keys.delete(e.code); if (GAME_KEYS.has(e.code) && visible()) { e.preventDefault(); e.stopPropagation() } }
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    addEventListener('keydown', down, true); addEventListener('keyup', up, true)

    let audio: AudioContext | null = null
    const beep = (f: number) => {
      if (!soundRef.current) return
      audio ??= new AudioContext()
      const o = audio.createOscillator(), g = audio.createGain()
      o.frequency.value = f; g.gain.setValueAtTime(0.05, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.06)
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.07)
    }

    // Marte es frío siempre: los calefactores gastan en todo momento, y más con la tormenta encima.
    const drain = () => rocksMode
      ? (0.12 + (heaters ? 0.12 + tau * 0.12 : 0) + (lamp.visible ? 0.05 : 0)) * (temp < -10 ? 1.25 : 1)
      : (0.1 + (heaters && z > LIGHT_Z ? 0.16 : 0) + (lamp.visible ? 0.05 : 0)) * (temp < -10 ? 1.25 : 1)
    // Batería para volver en línea recta a la luz a 3.5 m/s, más 3 % de margen.
    const needToReturn = () => { if (rocksMode) return 0; const d = Math.max(0, z - LIGHT_Z), v = !start.autonav || integ < 30 ? 2.2 : 3.5; return d ? (d / v) * (drain() + v * 0.07) * kB + 3 : 0 }
    const sampleAt = (mul: number) => {
      const best = deposits.filter((d) => !d.taken).map((d) => ({ d, k: Math.hypot(d.x - x, d.z - z) })).sort((a, b) => a.k - b.k)[0]
      if (!best || best.k >= 6) return { pct: 0, dep: null as Dep | null, kind: 'dust' as RockKind }
      return { pct: +(best.d.rich * (1 - best.k / 7) * mul).toFixed(1), dep: best.d as Dep | null, kind: best.d.kind ?? 'dust' as RockKind }
    }
    const mark = (wet: boolean) => {
      // Marca en el hoyo que dejó la broca (con el Curiosity, donde apoyó el brazo).
      const tip = rig ? rig.drillPoint(new THREE.Vector3()) : rover.localToWorld(new THREE.Vector3(0, 0, -1.2))
      if (!rig) tip.y = height(tip.x, tip.z)
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wet ? 3 : 1), new THREE.MeshBasicMaterial({ color: wet ? rocksMode ? 0xffd36a : 0x38e1ff : 0x777777 }))
      m.position.set(tip.x, tip.y + (wet ? 1.5 : 0.5), tip.z); scene.add(m)
      if (wet) { const glow = new THREE.PointLight(rocksMode ? 0xffd36a : 0x38e1ff, 30, 12); glow.position.copy(m.position); scene.add(glow) }
    }
    const record = (pct: number, kind: RockKind = 'dust') => {
      const seedN = Math.floor(rng() * 1e6)
      st.samples++
      if (rocksMode) {
        if (pending) say('The previous core was left on the ground: you did not seal it.', 3)
        pending = { pct, kind, seed: seedN }
      } else stored.push({ pct, conf: start.massSpec, seed: seedN })
      const good = rocksMode ? kind !== 'dust' : pct > 0
      if (good) { st.wet++; st.bestPct = Math.max(st.bestPct, pct); if (link) st.live = true }
      return seedN
    }
    const downlink = () => {
      for (const { pct, conf, kind, seed: s } of stored) {
        if (kind) {
          // Valor del núcleo: el de la roca × cercanía al afloramiento y profundidad. Sin espectrómetro de orgánicos, 40%.
          const info = ROCK_INFO[kind], f = clamp(0.5 + pct / 10, 0.5, 1.3)
          st.points += Math.round(info.value * f * (conf || info.bio === 0 ? 1 : 0.4))
          void s; if (conf && info.bio >= 2) st.confirmed++
          continue
        }
        st.points += conf ? tier(pct).pts : pct > 0 ? 15 : 5
        if (conf) { st.waterG += Math.round(pct * 10); if (pct >= 1) st.confirmed++ }
      }
      const k = stored.length; stored.length = 0; return k
    }
    const lose = () => { for (const { pct, kind } of stored) st.lostG += kind ? 1 : Math.round(pct * 10); stored.length = 0 }
    const verdict = (pct: number, kind: RockKind = 'dust') => {
      if (rocksMode) {
        const info = ROCK_INFO[kind]
        if (kind === 'dust') return 'Only dust and sand here. Follow the mineral signal to an outcrop.'
        return `${info.name}! Like ${info.real}.` + (!start.massSpec && info.bio > 0 ? ' No organics spectrometer: we cannot look for organic molecules.' : '')
      }
      return !start.massSpec && pct > 0
        ? 'Hydrogen detected, could be hydroxyl (no mass spectrometer to confirm water).'
        : tier(pct).msg + (pct ? ` ${pct}% water by weight.` : '')
    }
    const terminal = (ending: RoverEnding, lines: string[]) => {
      paused = true; st.ending = ending; setTyped(0); setFinal({ kind: 'terminal', ending, lines })
    }
    api.current = {
      lastDrill: () => {
        const { pct, dep, kind } = sampleAt(DEPTHS[depth].mul)
        if (dep) dep.taken = true
        lose(); record(pct, kind)
        if (rocksMode && pending && tubes.length < TUBES) api.current?.seal()
        downlink()
        const what = rocksMode ? ROCK_INFO[kind].name.toUpperCase() : pct ? `${pct}% WATER BY WEIGHT` : 'DRY'
        terminal('last', [`[BUSCADOR] FINAL CORE: ${what}.`, `[BUSCADOR] BATTERY 2%. TEMPERATURE ${Math.round(Math.min(temp, -52))}°C. TRANSMITTING...`, '', '— signal lost —'])
      },
      transmitAll: () => {
        const k = downlink()
        terminal('last', [`[BUSCADOR] SENDING ${k} STORED SAMPLE${k === 1 ? '' : 'S'}... DONE.`, `[BUSCADOR] BATTERY 2%. TEMPERATURE ${Math.round(Math.min(temp, -52))}°C. TRANSMITTING...`, '', '— signal lost —'])
      },
      finish: (e) => { if (e === 'return') downlink(); st.ending = e; doneRef.current({ ...st }) },
      // Sellar: el núcleo entra a un tubo (va al laboratorio) y sus datos esperan el próximo pase del orbitador.
      seal: () => {
        if (!pending) return
        if (tubes.length >= TUBES) { say('All tubes are full.'); return }
        tubes.push(pending); st.cores.push({ kind: pending.kind, seed: pending.seed, pct: pending.pct })
        stored.push({ pct: pending.pct, conf: start.massSpec, kind: pending.kind, seed: pending.seed })
        if (pending.kind !== 'dust') { st.wet++; st.bestPct = Math.max(st.bestPct, pending.pct); if (link) st.live = true }
        setCore((c) => (c ? { ...c, state: 'sealed' } : c)); pending = null
        say(tubes.length >= TUBES ? 'Tube 3 of 3 sealed. The rack is full: end the mission and take them to the lab.' : `Sealed in tube ${tubes.length} of ${TUBES}.`, 4)
      },
      discard: () => { if (!pending) return; pending = null; setCore((c) => (c ? { ...c, state: 'discarded' } : c)); say('Core discarded. The tube stays free for a better rock.', 3) },
      // Reiniciar: vuelve a donde estuvo hace unos segundos (o al lander), a cambio de batería.
      reset: () => {
        if (paused || resetCd > 0) return
        const back = trail.length > 5 ? trail.splice(trail.length - 5)[0] : trail.shift() ?? { x: 0, z: -74, yaw: 0 }
        x = back.x; z = back.z; yaw = back.yaw; speed = 0; stuck = false; stuckT = 0; resetCd = 3
        bat -= 6 * kB; say('Rover reset to a safe spot a few metres back (−6% battery).', 3)
      },
      extend: () => {
        st.extended = true; entered = false; downlink(); st.points += 20
        for (let i = 0; i < 3; i++) {
          const a = rng() * Math.PI, r = 30 + rng() * 40
          deposits.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rich: (rocksMode ? Math.max(2, crater.h) : crater.ice) * (0.6 + rng()) * 1.5, taken: false, kind: rocksMode ? pickRock() : undefined })
        }
        if (rocksMode) { stormAt = t + 60; stormWarned = false; entered = false; panelDust = 0 }
        say(rocksMode ? 'Extended mission approved. The storm is clearing, and the orbiter spotted three new outcrops.'
          : 'Extended mission approved: +4 cycles. New hydrogen targets deeper in the crater.', 5)
      },
    }
    say(world.shadow ? `Touchdown on the sunlit rim of ${crater.name}!`
      : `Touchdown at ${crater.name}! Follow the mineral signal to the old rocks, and drill before the dust storm arrives.`, world.shadow ? 3 : 6)
    const up3 = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), qy = new THREE.Quaternion(), camT = new THREE.Vector3(), off = new THREE.Vector3()
    camera.position.set(0, 8, -86)
    // Cámara de perforación (POV junto a la broca) + corte de rayos X + luz de trabajo de la torreta.
    const xray = makeXray(rocksMode ? 0xffd36a : undefined); scene.add(xray.group)
    const work = new THREE.PointLight(0xfff1dc, 0, 4, 1.4); scene.add(work)
    const chase = camera.position.clone(), chaseLook = new THREE.Vector3(0, 0, -74)
    const dp = new THREE.Vector3(), povPos = new THREE.Vector3(), povLook = new THREE.Vector3(), look = new THREE.Vector3()
    let pov = 0, xT = 0, xIce = 0, xOn = false, xSeen = false, xk = 0

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
        const vmax = integ <= 0 || stuck ? 0 : integ < 30 || teleop ? 2.5 : rocksMode && tau > 0.5 ? 3.5 : 6
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
        // Marte: llega la tormenta, el cielo se cierra (tau sube) y los paneles casi no cargan.
        if (rocksMode) {
          if (!stormWarned && t > stormAt - 35) { stormWarned = true; say('Dust storm on the horizon! In about 30 s the Sun will be gone and the batteries stop charging.', 6) }
          // Cuando una tormenta termina, la siguiente se programa; el cielo se aclara poco a poco.
          if (t > stormAt + STORM_LEN) { stormAt += STORM_LEN + STORM_GAP + rng() * 30; stormWarned = false; entered = false; say('The storm is passing. The panels will charge again, but they are dustier now.', 5) }
          tau += ((t > stormAt ? 1 : 0) - tau) * (1 - Math.exp(-dt / 6))
          // El polvo se asienta en los paneles (más con la tormenta); un remolino a veces los limpia.
          panelDust = Math.min(0.65, panelDust + dt * (0.0035 + tau * 0.006))
          if (panelDust > 0.25 && rng() < dt / 80) { panelDust *= 0.4; say('A dust devil swept the solar panels clean! Spirit got lucky like this in 2005.', 5) }
          ;(scene.background as THREE.Color).copy(skyClear).lerp(skyStorm, tau)
          if (scene.fog instanceof THREE.FogExp2) { scene.fog.color.copy(scene.background as THREE.Color); scene.fog.density = 0.0045 + tau * 0.02 }
          sun.intensity = sunMax * (1 - tau * 0.85)
        }
        const dark = world.shadow ? z > LIGHT_Z : rocksMode && t > stormAt && t < stormAt + STORM_LEN
        // Regolito blando: a veces atrapa las ruedas.
        if (dark && !stuck && Math.abs(speed) > 1.5 && rng() < dt * (crater.terrain === 'soft' ? 0.012 : 0.006)) {
          stuck = true; speed = 0; say(`Stuck in soft regolith! Press R to break free (${start.mesh ? '85' : '50'}% per try).`, 5)
        }
        if (dark && !entered) { entered = true; say(rocksMode ? 'The storm is here. The solar panels are almost dark: every drill now comes out of the battery.' : 'Entering permanent shadow. No sunlight, no charging. Watch the red return marker.', 5) }

        // Rastro para reiniciar: una posición por segundo mientras avanza bien.
        trailT += dt; if (resetCd > 0) resetCd -= dt
        if (trailT > 1 && Math.abs(speed) > 0.8 && !stuck) { trailT = 0; trail.push({ x, z, yaw }); if (trail.length > 40) trail.shift() }
        stuckT = (keys.has('KeyW') || keys.has('KeyS') || keys.has('ArrowUp') || keys.has('ArrowDown')) && Math.abs(speed) < 0.3 && drillT === 0 ? stuckT + dt : 0

        // Energía y temperatura.
        bat -= dt * (drain() + Math.abs(speed) * (rocksMode ? 0.09 : 0.07)) * kB
        // Marte recibe menos de la mitad de luz que la Luna, y el polvo la recorta aún más.
        // Con paneles limpios y quieto apenas gana ~0.2 %/s; manejando o con polvo, la batería baja.
        if (rocksMode) bat = Math.min(100, bat + dt * 0.45 * (1 - panelDust) * (1 - 0.95 * tau) * kB)
        else if (!dark) bat = Math.min(100, bat + dt * 1.4 * kB)
        st.minTemp = Math.min(st.minTemp, temp)
        if (rocksMode) temp += dt * (heaters ? (15 - temp) * 0.08 : ((tau > 0.5 ? -75 : -35) - temp) * 0.05)
        else temp += dt * (!dark ? (20 - temp) * 0.3 : heaters ? (20 - temp) * 0.05 : -1.2)
        const need = needToReturn()
        if (dark && !trapped && bat < need) { trapped = true; say('POINT OF NO RETURN crossed. You cannot make it back to the light.', 6) }
        if (trapped && !dark) trapped = false

        // Perforación.
        if (keys.has('Space') && drillT === 0 && jamT <= 0 && Math.abs(speed) < 0.8) {
          if (rocksMode && tubes.length >= TUBES) { if (toastT <= 0) say('All 3 tubes are sealed. End the mission and take them to the lab.') }
          else if (!dark && world.shadow) say('Nothing to find on the sunlit rim: drive into the shadow first.')
          else {
            drillT = DRILL_T; bat -= DEPTHS[depth].cost * kB * (rocksMode ? 1.3 : 1)
            const pre = sampleAt(DEPTHS[depth].mul)
            xT = 0; xIce = rocksMode && pre.kind === 'dust' ? 0 : pre.pct; xray.reset() // los rayos X muestran el hielo (o las vetas) que hay ahí
          }
        }
        if (jamT > 0) jamT -= dt
        if (drillT > 0) {
          drillT -= dt; drill.position.y = -0.05 - Math.sin((DRILL_T - drillT) * 20) * 0.08
          if (drillT <= 0) {
            drillT = 0; drill.position.y = 0.2
            if (rng() < DEPTHS[depth].jam + (rocksMode ? tau * 0.12 : 0)) { jamT = 15; bat -= 2 * kB; say('Jammed drill! Freeing it takes 15 s (−2% battery).') }
            else if (temp < -30 && rng() < 0.35) say('Instrument fault from the cold — sample lost. Turn the heaters on.')
            else {
              const { pct, dep, kind } = sampleAt(DEPTHS[depth].mul)
              const good = rocksMode ? kind !== 'dust' : pct > 0
              const coreSeed = record(pct, kind); mark(good)
              if (dep) dep.taken = true
              if (good) beep(1400)
              if (rocksMode) { coreN++; setCore({ kind, seed: coreSeed, n: coreN, conf: start.massSpec, state: 'pending' }) }
              say(rocksMode ? verdict(pct, kind) + ' Seal it in a tube, or discard it?' : verdict(pct, kind) + ' Stored until the next relay pass.', rocksMode ? 6 : 3.5)
              if (good && !anomaly) {
                anomaly = true
                const sx = (rng() - 0.5) * 60, sz = 52
                deposits.push({ x: sx, z: sz, rich: (rocksMode ? Math.max(2, crater.h) * 2 : crater.ice * 2.2) + 4, taken: false, spike: true, kind: rocksMode ? rockSet.rare : undefined })
                beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xef6f6c, transparent: true, opacity: 0.25, side: THREE.DoubleSide }))
                beacon.position.set(sx, height(sx, sz) + 30, sz); scene.add(beacon)
                setTimeout(() => say(rocksMode
                  ? `ODD SPECTRUM: the orbiter sees a strange rock ${Math.round(Math.hypot(sx - x, sz - z))} m away (pink beacon). Worth the drive before the storm?`
                  : `ANOMALOUS READING: a massive hydrogen spike ${Math.round(Math.hypot(sx - x, sz - z))} m deeper inside (pink beacon). Go for it, or head back to recharge?`, 7), 3600)
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
        else if ((rocksMode ? dark : trapped) && bat <= 8) { paused = true; setFinal({ kind: 'choice' }) }
        else if (bat <= 0) {
          bat = 0; lose()
          terminal('dead', rocksMode
            ? ['[BUSCADOR] TAU 10.8. SOLAR ARRAY OUTPUT 0.', '[BUSCADOR] BATTERY 0%. ENTERING SURVIVAL MODE...', '', '— signal lost —', '', 'Like Opportunity in 2018: "My battery is low and it\'s getting dark."']
            : ['[BUSCADOR] BATTERY 0%.', '[BUSCADOR] ENTERING SURVIVAL MODE...', '', '— signal lost —'])
        }

        if (!rig) for (const w of wheels) w.rotation.x += (speed * dt) / 0.32
        sig = clamp(signalAt(x, z) + (rng() - 0.5) * 0.3 * (1 - quality), 0, 1)
        beepT -= dt
        if (beepT <= 0 && sig > 0.05) { beep(500 + sig * 900); beepT = 1.2 - sig * 1.1 }
        hudT -= dt; toastT -= dt
        if (hudT <= 0) {
          hudT = 0.1
          const spike = deposits.find((d) => d.spike && !d.taken)
          const goal = trapped ? 'No way back to the light. Make the remaining power count.'
            : stuck ? 'Stuck! Press R to rock the wheels free, or T to reset the rover.'
            : stuckT > 2.5 ? 'Not moving? Press T to reset the rover a few metres back.'
            : rocksMode && pending ? 'Look at the core: seal it in a tube, or discard it.'
            : rocksMode && tubes.length >= TUBES ? 'All 3 tubes are full. End the mission and take them to the lab.'
            : rocksMode ? (dark ? (st.wet > 0 ? 'Storm! Cache the cores now, or risk one more drill on battery.' : 'Storm! Find one good rock fast: the battery is not charging.')
              : sig > 0.2 ? 'Strong mineral signal! Stop (S) and press SPACE to drill a core.'
              : spike ? 'Drive to the pink beacon: something odd is there.'
              : st.wet > 0 ? 'Good core! Find a different rock, or cache the cores to end the mission.'
              : 'Follow the mineral signal: the bar fills and the beeps speed up near old water rocks.')
            : !world.shadow ? (sig > 0.2 ? 'Strong signal! Stop (S) and press SPACE to drill here.' : 'Free drive: follow the neutron signal and drill anywhere.')
            : !dark && !entered ? 'Drive north (W) across the orange line. The ice is in the permanent shadow.'
            : !dark && st.wet > 0 ? 'Safe in the sunlight. End the mission, or recharge and go back in.'
            : !dark ? 'Recharging in the sun. Head back into the shadow when ready.'
            : bat < need + 12 ? 'Battery is getting low: turn back south to the light now.'
            : sig > 0.2 ? 'Strong signal! Stop (S) and press SPACE to drill here.'
            : st.wet > 0 ? 'Ice found! Keep exploring, or drive back south to the light to finish.'
            : 'Follow the neutron signal: the bar fills and the beeps speed up near ice.'
          setHud({
            goal,
            bat, need, temp, heaters, sig, speed, slope, samples: st.samples, stored: stored.length, sent: rocksMode ? st.cores.length : st.waterG,
            drill: drillT / DRILL_T, depth, jam: Math.max(0, jamT), relay: inWin ? 0 : relay.period - relay.dur - ph, link,
            spike: spike ? Math.hypot(spike.x - x, spike.z - z) : -1, shadow: dark, trapped,
            canReturn: rocksMode ? tubes.length > 0 : !dark && entered && st.wet > 0, toast: toastT > 0 ? toast : '',
            storm: rocksMode ? (dark ? stormAt + STORM_LEN - t : stormAt - t) : 0, stormOn: dark && rocksMode,
            clean: 1 - panelDust, tubes: tubes.length, stuckHint: stuckT > 2.5 || stuck,
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
    return Object.assign(tick, { cleanup: () => { gone = true; removeEventListener('keydown', down, true); removeEventListener('keyup', up, true); void audio?.close() } })
  }), [crater, world, rocksMode, quality, seed, orbitId, start, dem])

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
            {h.xice && <em>{rocksMode ? 'MINERAL VEINS DETECTED' : 'ICE CRYSTALS DETECTED'}</em>}
          </div>
        )}
      </div>
      {h && (
        <div className="rv-hud">
          <h3>BUSCADOR · {crater.name}</h3>
          <div className="rv-row"><span>Battery</span><b>{h.bat.toFixed(0)}%{h.shadow ? '' : ' charging'}</b></div>
          <div className="rv-bar rv-bat">
            <i style={{ width: `${h.bat}%`, background: h.trapped || h.bat < h.need + 5 ? 'var(--red)' : undefined }} />
            {h.need > 0 && <em style={{ left: `${Math.min(h.need, 100)}%` }} title="Battery needed to return to the light" />}
          </div>
          {rocksMode
            ? <>
              <div className="rv-row"><span>Dust storm</span><b className={h.stormOn || h.storm < 35 ? 'bad' : ''}>{h.stormOn ? `OVERHEAD · clears in ${h.storm.toFixed(0)} s` : `next in ${h.storm.toFixed(0)} s`}</b></div>
              <div className="rv-row"><span>Solar panels</span><b className={h.clean < 0.55 ? 'bad' : ''}>{Math.round(h.clean * 100)}% clean{h.stormOn ? ' · no sun' : ''}</b></div>
              <div className="rv-row"><span>Sample tubes</span><b>{'●'.repeat(h.tubes)}<i className="rv-tube-empty">{'○'.repeat(Math.max(0, 3 - h.tubes))}</i> {h.tubes}/3</b></div>
            </>
            : <div className="rv-row"><span>Needed to return</span><b className={h.trapped ? 'bad' : ''}>{h.trapped ? 'NO RETURN' : `${h.need.toFixed(0)}%`}</b></div>}
          <div className="rv-row"><span>Temperature · heaters <kbd>H</kbd></span><b className={h.temp < -10 ? 'bad' : ''}>{h.temp.toFixed(0)}°C · {h.heaters ? 'on' : 'off'}</b></div>
          <div className="rv-row"><span>Wheels</span><b className={h.integ < 30 ? 'bad' : ''}>{h.stuck ? 'STUCK: press R' : `${h.integ}%`}{h.teleop ? ' · teleop (slow)' : ''}</b></div>
          <div className="rv-row"><span>{rocksMode ? 'Mineral signal' : 'Neutron signal (H)'}</span><b>{Math.round(h.sig * 100)}</b></div>
          <div className="rv-bar sig"><i style={{ width: `${h.sig * 100}%` }} /></div>
          <div className="rv-row"><span>Drill depth <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>{start.deep && <kbd>4</kbd>}</span><b>{h.jam > 0 ? `JAMMED ${h.jam.toFixed(0)}s` : DEPTHS[h.depth].label}</b></div>
          <div className="rv-row"><span>Relay</span><b className={h.link ? 'good' : ''}>{h.link ? 'ORBITER OVERHEAD' : `next pass ${h.relay.toFixed(0)} s`}</b></div>
          <div className="rv-row"><span>{rocksMode ? 'Cores · waiting · sent' : 'Samples · waiting · sent'}</span><b>{h.samples} · {h.stored} · {rocksMode ? h.sent : `${h.sent} g`}</b></div>
          {h.spike >= 0 && <div className="rv-row"><span>{rocksMode ? 'Odd spectrum' : 'Hydrogen spike'}</span><b className="pink">{h.spike.toFixed(0)} m</b></div>}
          {h.drill > 0 && <div className="rv-drill"><i style={{ width: `${(1 - h.drill) * 100}%` }} /></div>}
          <p className="hint">Blue tint = {rocksMode ? 'hydrated minerals' : 'hydrogen'} your orbiter mapped ({Math.round(quality * 100)}% quality). Seed {seed}{dem ? ` · ${world.relief}${dem.vex !== 1 ? ` ×${dem.vex}` : ''}` : ''}</p>
        </div>
      )}
      <div className="rv-keys">
        <div><kbd>W A S D</kbd> drive · <kbd>SPACE</kbd> drill</div>
        <div><kbd>L</kbd> lights · <kbd>C</kbd> top view · <kbd>R</kbd> unstick · <kbd>T</kbd> reset</div>
        <button className="btn small ghost" onClick={() => setSound(!sound)}>{sound ? 'Sound on' : 'Sound off'}</button>{' '}
        <button className={`btn small ${h?.stuckHint ? 'warn' : 'ghost'}`} title="Stuck in a hole or on a rock? Put the rover back a few metres (−6% battery)." onClick={() => api.current?.reset()}>Reset rover</button>
      </div>
      {h && !final && <div className="rv-goal" role="status"><small>WHAT TO DO</small>{h.goal}</div>}
      {h?.toast && !final && <div className="rv-toast">{h.toast}</div>}
      {h?.canReturn && !final && (
        <div className="rv-end">
          <button className="btn big" onClick={() => api.current?.finish('return')}>{rocksMode ? 'Leave the tubes for pickup — end mission' : 'Back in the light — end mission'}</button>
          {start.canExtend && !h.extended && <button className="btn big ghost" onClick={() => api.current?.extend()}>Request extended mission (+4 cycles)</button>}
        </div>
      )}
      {rocksMode && (
        // Siempre montado (oculto sin núcleo): el visor 3D se crea una vez y no da tirones al perforar o sellar.
        <aside className={`rv-core ${core?.state ?? ''}`} hidden={!core || !!final}>
          {core && <>
            <small>CORE #{core.n} · {DEPTHS[hud?.depth ?? 1].label} deep{core.state === 'sealed' ? ' · SEALED' : core.state === 'discarded' ? ' · DISCARDED' : ''}</small>
            <h4>{ROCK_INFO[core.kind].name}</h4>
          </>}
          <CoreSample kind={core?.kind ?? null} seed={core?.seed ?? 0} sealed={core?.state === 'sealed'} />
          {core && <>
            <p className="real">Real case: <b>{ROCK_INFO[core.kind].real}</b><br /><span>{ROCK_INFO[core.kind].where}</span></p>
            <p>{ROCK_INFO[core.kind].story}</p>
            {ROCK_INFO[core.kind].bio > 0 && <p className={`bio b${ROCK_INFO[core.kind].bio}`}>{core.conf ? ['', 'Could preserve traces of life', 'Good place to look for ancient life', 'POTENTIAL BIOSIGNATURE'][ROCK_INFO[core.kind].bio] : 'No organics spectrometer on board: chemistry unknown'}</p>}
            {core.state === 'pending' && (
              <div className="rv-core-actions">
                <button className="btn small" disabled={(hud?.tubes ?? 0) >= 3} onClick={() => api.current?.seal()}>Seal in tube {Math.min(3, (hud?.tubes ?? 0) + 1)}/3</button>
                <button className="btn small ghost" onClick={() => api.current?.discard()}>Discard</button>
              </div>
            )}
          </>}
        </aside>
      )}
      {final?.kind === 'choice' && (
        <div className="rv-final">
          <h2>THE LAST MESSAGE</h2>
          <p>{rocksMode ? 'Battery 8%. The storm has hidden the Sun and the panels are dark. There is power for one thing only.' : 'Battery 8%. You are too deep in the dark to make it back. There is power for one thing only.'}</p>
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
