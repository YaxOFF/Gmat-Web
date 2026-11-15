import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Rng } from '../engine/rng'
import type { HeightFn } from './curiosity'

/** m: una roca que sobresale hasta aquí se pasa por encima (el rocker-bogie la trepa); más alta, es obstáculo. */
export const CLIMB = 0.5

/** Huella de las ruedas en el marco del rover (frente = +Z), como `CuriosityRig.foot`. */
export interface Foot { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Una roca tal como se ve: `pts` = vértices que asoman sobre el suelo (XYZ de mundo, de a 3), `r` = radio de esa
 * huella en planta y `h` = cuánto sobresale. El choque y el apoyo de la broca usan esto, no la escala base.
 */
export interface Rock {
  x: number; z: number; r: number; h: number; pts: Float32Array; kind: RockKind
  /** Altura (mundo) del punto visible más alto. */
  top: number
  /** seen = la vieron las cámaras (vista de navegación); scanned = analizada con el láser; drilled = perforada. */
  seen?: boolean; scanned?: boolean; drilled?: boolean
}

/**
 * Tipo de roca (litología real del mundo). `weight` = abundancia relativa, `color` = tono base de la instancia,
 * `spectrum` = picos que muestra el láser (LIBS: elemento e intensidad 0..1), `pts` = puntos por identificarla
 * por primera vez. Taladro (solo Marte): `target` = vale la pena perforarla, `lab` = lo que encuentran CheMin y SAM
 * en el polvo, `core` = puntos por esa muestra.
 */
export interface RockKind {
  id: string; name: string; color: number; weight: number; pts: number
  minerals: string; note: string; spectrum: [string, number][]
  target?: boolean; lab?: string; core?: number
}

/** Luna (tierras altas del polo sur): lo que trajeron Apollo y Luna y lo que ven los orbitadores. */
export const MOON_KINDS: RockKind[] = [
  { id: 'anorthosite', name: 'Ferroan anorthosite', color: 0xbdb8ad, weight: 0.34, pts: 10, minerals: 'Plagioclase feldspar (>90%)',
    note: 'The original lunar crust: light crystals that floated on the magma ocean 4.4 billion years ago. The Apollo 15 "Genesis Rock" is one.',
    spectrum: [['Ca', 0.85], ['Al', 0.95], ['Si', 0.7], ['O', 0.8], ['Fe', 0.12], ['Mg', 0.08]] },
  { id: 'breccia', name: 'Impact breccia', color: 0x8a8277, weight: 0.3, pts: 8, minerals: 'Welded fragments of older rocks and glass',
    note: 'Rubble fused together by meteorite impacts. The most common rock in the lunar highlands.',
    spectrum: [['Si', 0.75], ['Al', 0.6], ['Ca', 0.55], ['O', 0.8], ['Fe', 0.35], ['Mg', 0.3]] },
  { id: 'mare_basalt', name: 'Mare basalt', color: 0x4b4947, weight: 0.14, pts: 15, minerals: 'Pyroxene, plagioclase, ilmenite',
    note: 'Dark lava from the maria, rich in iron and titanium. Here at the pole it was thrown in by a distant impact.',
    spectrum: [['Fe', 0.9], ['Ti', 0.7], ['Si', 0.65], ['Mg', 0.5], ['Ca', 0.4], ['O', 0.75]] },
  { id: 'impact_melt', name: 'Impact melt rock', color: 0x37363b, weight: 0.12, pts: 15, minerals: 'Glassy matrix with tiny crystals',
    note: 'Rock that melted in an impact and froze fast. Its age dates the crater that made it.',
    spectrum: [['Si', 0.85], ['Al', 0.5], ['Fe', 0.5], ['Ca', 0.45], ['Mg', 0.4], ['O', 0.8]] },
  { id: 'troctolite', name: 'Troctolite (Mg-suite)', color: 0x7c8468, weight: 0.07, pts: 25, minerals: 'Olivine + plagioclase',
    note: 'Greenish rock from deep intrusions below the crust. Apollo 17 sample 76535 is the most famous.',
    spectrum: [['Mg', 0.95], ['Si', 0.7], ['Fe', 0.5], ['Al', 0.5], ['Ca', 0.4], ['O', 0.8]] },
  { id: 'kreep', name: 'KREEP basalt', color: 0x8f7a5c, weight: 0.03, pts: 40, minerals: 'Potassium, rare earths, phosphorus; thorium-rich',
    note: 'The last dregs of the magma ocean. Slightly radioactive, and rare outside Oceanus Procellarum: a great find.',
    spectrum: [['K', 0.9], ['P', 0.75], ['Th', 0.6], ['Si', 0.7], ['Fe', 0.5], ['Ca', 0.45]] },
]

/** Marte: lo que identificaron Curiosity (ChemCam, CheMin), Opportunity y Perseverance. */
export const MARS_KINDS: RockKind[] = [
  { id: 'basalt', core: 5, lab: 'CheMin: pyroxene, plagioclase and olivine. Volcanic rock that water never altered.',
    name: 'Basalt', color: 0x4a3a35, weight: 0.34, pts: 8, minerals: 'Pyroxene, plagioclase, olivine',
    note: 'Dark volcanic rock. Most of the Martian crust is made of it.',
    spectrum: [['Si', 0.8], ['Fe', 0.75], ['Mg', 0.6], ['Ca', 0.5], ['Al', 0.45], ['O', 0.8]] },
  { id: 'mudstone', target: true, core: 60, lab: 'CheMin: about 20% smectite clay. SAM: carbon, hydrogen, oxygen, nitrogen, sulfur and simple organic molecules. A freshwater lake that could have supported microbes.',
    name: 'Mudstone', color: 0x8b8378, weight: 0.2, pts: 20, minerals: 'Smectite clay, fine silt',
    note: 'Mud from the floor of an ancient lake. Curiosity drilled it at Yellowknife Bay: fresh water, once habitable.',
    spectrum: [['Si', 0.75], ['Al', 0.65], ['Mg', 0.6], ['Fe', 0.5], ['H', 0.55], ['O', 0.85]] },
  { id: 'hematite', target: true, core: 40, lab: 'CheMin: hematite with clay minerals. The iron rusted in liquid water.',
    name: 'Hematite sandstone', color: 0x7d3a28, weight: 0.18, pts: 15, minerals: 'Sand grains cemented with iron oxide',
    note: 'Hematite usually forms in water. Opportunity found it as "blueberries"; Curiosity on Vera Rubin Ridge.',
    spectrum: [['Fe', 0.95], ['O', 0.9], ['Si', 0.6], ['Al', 0.3], ['Mg', 0.25], ['Ca', 0.2]] },
  { id: 'sulfate', target: true, core: 45, lab: 'CheMin: gypsum, bassanite and anhydrite. SAM bakes water vapor out of the powder: groundwater flowed through these cracks.',
    name: 'Sulfate-veined rock', color: 0xbfa58c, weight: 0.14, pts: 20, minerals: 'Calcium sulfate veins (gypsum, bassanite)',
    note: 'White veins left by groundwater flowing through cracks. ChemCam sees calcium, sulfur and hydrogen together.',
    spectrum: [['Ca', 0.95], ['S', 0.85], ['H', 0.6], ['O', 0.85], ['Si', 0.3], ['Fe', 0.2]] },
  { id: 'conglomerate', core: 10, lab: 'The pebbles crumble: no clean powder for the lab. Curiosity never drilled its conglomerates either; the rounded pebbles already tell of a stream.',
    name: 'Conglomerate', color: 0x6f5a4b, weight: 0.1, pts: 20, minerals: 'Rounded pebbles in a sandy cement',
    note: 'Pebbles rounded by a flowing stream, like the "Hottah" outcrop: water ran here, ankle to hip deep.',
    spectrum: [['Si', 0.8], ['Al', 0.55], ['K', 0.5], ['Na', 0.45], ['Fe', 0.45], ['Ca', 0.4]] },
  { id: 'meteorite', core: 5, lab: 'The bit barely scratches the metal. Curiosity never drilled its meteorites: the laser was enough.',
    name: 'Iron meteorite', color: 0x3d4048, weight: 0.04, pts: 40, minerals: 'Iron-nickel metal (kamacite, taenite)',
    note: 'A piece of an asteroid core. Curiosity found a 2 m one, "Lebanon", in 2014.',
    spectrum: [['Fe', 1], ['Ni', 0.7], ['Co', 0.3], ['P', 0.2], ['S', 0.15], ['Si', 0.05]] },
]

export interface RockFieldOptions {
  rng: Rng
  /** Ruido 2D sembrado (deforma la geometría de la roca). */
  noise: (x: number, y: number) => number
  /** Altura analítica del terreno (ubica cada roca). */
  height: HeightFn
  /** Altura de la malla que se ve (decide qué parte de la roca asoma). */
  floor: HeightFn
  count: number
  /** Radio del cráter: las rocas caen entre 8 m y rim − 4 m del centro. */
  rim: number
  /** Zona despejada (aterrizaje). */
  clear: { x: number; z: number; r: number }
}

/**
 * Campo de rocas del rover. La base hace todo lo que afecta al juego (ubicación, qué se ve, choque, piedras que
 * se trepan, apoyo de la broca), así cada mundo choca igual. Las subclases solo cambian el aspecto: geometría,
 * material y tono de cada roca.
 */
export abstract class RockField {
  readonly mesh: THREE.InstancedMesh
  readonly rocks: Rock[] = []
  /** Tipos de roca de este mundo. */
  readonly kinds: RockKind[]
  /** Rocas bajas (h ≤ CLIMB): se trepan. */
  readonly pebbles: Rock[]
  /** Rocas altas: chocan. */
  readonly blocks: Rock[]

  constructor(o: RockFieldOptions) {
    const geo = this.geometry(o.noise), mat = this.material(), kinds = this.kinds = this.kindList()
    const total = kinds.reduce((a, k) => a + k.weight, 0)
    const mesh = new THREE.InstancedMesh(geo, mat, o.count)
    const rp = geo.attributes.position, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3()
    const v0 = new THREE.Vector3(), tint = new THREE.Color(), { rng } = o
    for (let i = 0; i < o.count; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (o.rim - 12), x = Math.cos(a) * r, z = Math.sin(a) * r
      if (Math.hypot(x - o.clear.x, z - o.clear.z) < o.clear.r) continue
      const s = 0.3 + Math.pow(rng(), 3) * 2.6
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.6, rng() * 6.3, (rng() - 0.5) * 0.6)) // apoyada: poco ladeo
      const sy = s * (0.5 + rng() * 0.4), bury = 0.25 + rng() * 0.15 // semienterrada
      m4.compose(v.set(x, o.height(x, z) - sy * bury, z), q, new THREE.Vector3(s * (0.8 + rng() * 0.4), sy, s * (0.8 + rng() * 0.4)))
      const pts: number[] = []; let rr = 0, hh = 0, ty = -Infinity
      for (let k = 0; k < rp.count; k++) {
        v0.fromBufferAttribute(rp, k).applyMatrix4(m4)
        const above = v0.y - o.floor(v0.x, v0.z)
        if (above <= 0.1) continue // enterrado o al ras: no se ve, no choca
        pts.push(v0.x, v0.y, v0.z); rr = Math.max(rr, Math.hypot(v0.x - x, v0.z - z)); hh = Math.max(hh, above); ty = Math.max(ty, v0.y)
      }
      const tone = this.tone(rng)
      if (!pts.length) continue // quedó toda bajo el suelo
      const idx = this.rocks.length
      // Tipo por hash de la posición: no consume el rng (las semillas ubican las rocas igual que antes).
      let pick = (Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * total, kind = kinds[0]
      for (const k of kinds) { kind = k; pick -= k.weight; if (pick <= 0) break }
      this.rocks.push({ x, z, r: rr, h: hh, pts: Float32Array.from(pts), kind, top: ty })
      mesh.setMatrixAt(idx, m4); mesh.setColorAt(idx, tint.set(kind.color).multiplyScalar(tone))
    }
    mesh.count = this.rocks.length // sin instancias vacías (si no, quedan rocas fantasma en el origen)
    mesh.castShadow = mesh.receiveShadow = true
    this.mesh = mesh
    this.pebbles = this.rocks.filter((r) => r.h <= CLIMB)
    this.blocks = this.rocks.filter((r) => r.h > CLIMB)
  }

  /** Geometría base de una roca (radio ~1), ya deformada. */
  protected abstract geometry(noise: (x: number, y: number) => number): THREE.BufferGeometry
  protected abstract material(): THREE.MeshStandardMaterial
  /** Tono por roca; consume exactamente un número del rng (mantiene las semillas). */
  protected tone(rng: Rng): number { return 0.85 + rng() * 0.25 }
  /** Litologías del mundo (el color de cada roca sale de su tipo × tono). */
  protected abstract kindList(): RockKind[]

  /** Icosaedro subdividido deformado con el ruido: la forma común, con más o menos facetas y rugosidad. */
  protected static lumpy(noise: (x: number, y: number) => number, detail: number, base: number, amp: number) {
    const geo = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'))
    const p = geo.attributes.position, v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).multiplyScalar(base + noise(v.x * 2.3 + v.z * 1.1 + 40, v.y * 2.3 - v.z * 1.7 + 40) * amp)
      p.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    return geo
  }

  /** Puntos visibles de rocas altas dentro de la huella `foot` con el rover en (px, pz) y rumbo `yaw`. */
  hits(px: number, pz: number, yaw: number, foot: Foot): number {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const span = Math.hypot(Math.max(-foot.minX, foot.maxX), Math.max(-foot.minZ, foot.maxZ))
    let k = 0
    for (const r of this.blocks) {
      if (Math.hypot(r.x - px, r.z - pz) > r.r + span) continue
      for (let i = 0; i < r.pts.length; i += 3) {
        const dx = r.pts[i] - px, dz = r.pts[i + 2] - pz, lx = dx * c - dz * s, lz = dx * s + dz * c
        if (lx > foot.minX && lx < foot.maxX && lz > foot.minZ && lz < foot.maxZ) k++
      }
    }
    return k
  }

  /**
   * Roca sin analizar más cercana a (px, pz) entre `min` y `max` metros (en planta), y el punto visible de esa
   * roca más cercano a `from` (donde pega el láser). null si no hay ninguna.
   */
  target(px: number, pz: number, min: number, max: number, from: THREE.Vector3, out: THREE.Vector3): Rock | null {
    let best: Rock | null = null, bd = Infinity
    for (const r of this.rocks) {
      if (r.scanned) continue
      const d = Math.hypot(r.x - px, r.z - pz)
      if (d < min || d - r.r > max || d >= bd) continue
      best = r; bd = d
    }
    if (!best) return null
    let pd = Infinity
    for (let i = 0; i < best.pts.length; i += 3) {
      const d = (best.pts[i] - from.x) ** 2 + (best.pts[i + 1] - from.y) ** 2 + (best.pts[i + 2] - from.z) ** 2
      if (d < pd) { pd = d; out.set(best.pts[i], best.pts[i + 1], best.pts[i + 2]) }
    }
    return best
  }

  /** Roca visible bajo el punto (px, pz) a menos de `rad` en planta: la que tocaría la broca. null = suelo. */
  under(px: number, pz: number, rad: number): Rock | null {
    let best: Rock | null = null, top = -Infinity
    for (const r of this.rocks) {
      if (Math.hypot(r.x - px, r.z - pz) > r.r + rad) continue
      for (let i = 0; i < r.pts.length; i += 3) {
        if (r.pts[i + 1] > top && Math.hypot(r.pts[i] - px, r.pts[i + 2] - pz) < rad) { top = r.pts[i + 1]; best = r }
      }
    }
    return best
  }

  /** Lo que suben las ruedas sobre el suelo por el lomo de las rocas chicas, redondeado con el ancho de la rueda. */
  bump(px: number, pz: number): number {
    let b = 0
    for (const r of this.pebbles) {
      const reach = r.r + 0.3, dx = px - r.x, dz = pz - r.z, d2 = dx * dx + dz * dz
      if (d2 < reach * reach) b = Math.max(b, r.h * 0.5 * (1 + Math.cos((Math.PI * Math.sqrt(d2)) / reach)))
    }
    return b
  }

  /** Cara de arriba de cualquier roca a menos de `rad` en planta (−∞ si no hay): donde apoya la broca. */
  top(px: number, pz: number, rad: number): number {
    let t = -Infinity
    for (const r of this.rocks) {
      if (Math.hypot(r.x - px, r.z - pz) > r.r + rad) continue
      for (let i = 0; i < r.pts.length; i += 3) {
        if (Math.hypot(r.pts[i] - px, r.pts[i + 2] - pz) < rad) t = Math.max(t, r.pts[i + 1])
      }
    }
    return t
  }
}

/** Luna: rocas redondeadas por el bombardeo de micrometeoritos, gris del regolito. */
export class MoonRocks extends RockField {
  protected geometry(noise: (x: number, y: number) => number) { return RockField.lumpy(noise, 2, 0.7, 0.3) }
  protected material() { return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }) }
  protected kindList() { return MOON_KINDS }
}

/**
 * Marte: basalto oscuro y anguloso (pocas facetas, sombreado plano). Contrasta con el polvo rojo; antes las rocas
 * eran del mismo color que el suelo y con la niebla se perdían, así que el rover parecía chocar con nada.
 */
export class MarsRocks extends RockField {
  protected geometry(noise: (x: number, y: number) => number) { return RockField.lumpy(noise, 1, 0.6, 0.55) }
  protected material() { return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }) }
  protected tone(rng: Rng) { return 0.7 + rng() * 0.45 }
  protected kindList() { return MARS_KINDS }
}

export type RockFieldClass = new (o: RockFieldOptions) => RockField
