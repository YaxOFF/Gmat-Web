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
export interface Rock { x: number; z: number; r: number; h: number; pts: Float32Array }

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
  /** Rocas bajas (h ≤ CLIMB): se trepan. */
  readonly pebbles: Rock[]
  /** Rocas altas: chocan. */
  readonly blocks: Rock[]

  constructor(o: RockFieldOptions) {
    const geo = this.geometry(o.noise), mat = this.material()
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
      const pts: number[] = []; let rr = 0, hh = 0
      for (let k = 0; k < rp.count; k++) {
        v0.fromBufferAttribute(rp, k).applyMatrix4(m4)
        const above = v0.y - o.floor(v0.x, v0.z)
        if (above <= 0.1) continue // enterrado o al ras: no se ve, no choca
        pts.push(v0.x, v0.y, v0.z); rr = Math.max(rr, Math.hypot(v0.x - x, v0.z - z)); hh = Math.max(hh, above)
      }
      const tone = this.tone(rng)
      if (!pts.length) continue // quedó toda bajo el suelo
      const idx = this.rocks.length
      this.rocks.push({ x, z, r: rr, h: hh, pts: Float32Array.from(pts) })
      mesh.setMatrixAt(idx, m4); mesh.setColorAt(idx, this.tint(tint, tone))
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
  protected tint(out: THREE.Color, tone: number): THREE.Color { return out.setScalar(tone) }

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
  protected material() { return new THREE.MeshStandardMaterial({ color: 0x8a8277, roughness: 1 }) }
}

/**
 * Marte: basalto oscuro y anguloso (pocas facetas, sombreado plano). Contrasta con el polvo rojo; antes las rocas
 * eran del mismo color que el suelo y con la niebla se perdían, así que el rover parecía chocar con nada.
 */
export class MarsRocks extends RockField {
  protected geometry(noise: (x: number, y: number) => number) { return RockField.lumpy(noise, 1, 0.6, 0.55) }
  protected material() { return new THREE.MeshStandardMaterial({ color: 0x5b4034, roughness: 0.92, flatShading: true }) }
  protected tone(rng: Rng) { return 0.7 + rng() * 0.45 }
  /** Algunas rocas más rojizas (cubiertas de polvo), otras casi negras. */
  protected tint(out: THREE.Color, tone: number) { return out.setRGB(tone * 1.05, tone * 0.95, tone * 0.9) }
}

export type RockFieldClass = new (o: RockFieldOptions) => RockField
