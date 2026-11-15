import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Altura del suelo (mundo) en un punto XZ. */
export type HeightFn = (x: number, z: number) => number

export interface CuriosityRig {
  /** Nodo raíz del modelo; se cuelga del grupo del rover (frente = +Z, arriba = +Y). */
  model: THREE.Object3D
  /**
   * Suspensión rocker-bogie procedural: apoya las seis ruedas sobre `ground` y coloca `body` (el grupo del rover,
   * padre de `model`) con la altura, el cabeceo y el alabeo que resultan. `x, z, yaw` ubican el rover;
   * `speed` (m/s) gira las ruedas y `turn` (-1..1) orienta las cuatro de dirección.
   */
  update(dt: number, body: THREE.Object3D, x: number, z: number, yaw: number, speed: number, turn: number, ground: HeightFn): void
  /** Gira la broca mientras perfora. */
  drill(dt: number, on: boolean): void
}

const SIDES = ['Izq', 'Der'] as const
const MAX_STEER = 0.5 // rad
const MAX_TILT = 0.9 // rad, tope de cada articulación
const SOLVE_STEPS = 5, SOLVE_GAIN = 0.85
const k = (dt: number, rate: number) => 1 - Math.exp(-dt * rate)
const lim = (v: number, m: number) => THREE.MathUtils.clamp(v, -m, m)

interface Side {
  rocker: THREE.Object3D; bogie: THREE.Object3D
  steerF: THREE.Object3D; steerR: THREE.Object3D
  wheels: THREE.Object3D[] // delantera, media, trasera
  /** Posiciones de reposo en el marco del chasis: ruedas (x, z) y pivotes (z). */
  wx: number[]; wz: number[]; zBogie: number; zRocker: number; xRocker: number
  rho: number; beta: number
}

/** Carga el Curiosity articulado (nodos nombrados en Blender) y arma su rig de suspensión. */
export async function loadCuriosity(): Promise<CuriosityRig> {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/curiosity_rover.glb`)
  return rigCuriosity(gltf.scene)
}

/** Arma el rig sobre un modelo ya cargado, en reposo y sin transformar. */
export function rigCuriosity(model: THREE.Object3D): CuriosityRig {
  model.updateMatrixWorld(true)
  const node = (name: string) => {
    const o = model.getObjectByName(name)
    if (!o) throw new Error(`curiosity_rover.glb: falta el nodo ${name}`)
    return o
  }
  const p = new THREE.Vector3()
  const rest = (o: THREE.Object3D) => model.worldToLocal(o.getWorldPosition(p)).clone()

  const sides: Side[] = SIDES.map((s) => {
    const i = s[0]
    const rocker = node(`Rocker_${s}`), bogie = node(`Bogie_${s}`)
    const wheels = [node(`Rueda_D${i}`), node(`Rueda_M${i}`), node(`Rueda_T${i}`)]
    const w = wheels.map(rest)
    return {
      rocker, bogie, wheels, steerF: node(`Direccion_D${i}`), steerR: node(`Direccion_T${i}`),
      wx: w.map((v) => v.x), wz: w.map((v) => v.z), zBogie: rest(bogie).z, zRocker: rest(rocker).z, xRocker: rest(rocker).x,
      rho: 0, beta: 0,
    }
  })
  const radius = (sides[0].wheels[0].userData.radio as number | undefined) ?? 0.244
  const diff = model.getObjectByName('Diferencial'), bit = model.getObjectByName('Taladro')
  const track = Math.abs(sides[0].xRocker - sides[1].xRocker)
  model.traverse((o) => { o.castShadow = true; o.receiveShadow = true })

  let steer = 0

  return {
    model,
    update(dt, body, x, z, yaw, speed, turn, ground) {
      const sn = Math.sin(yaw), cs = Math.cos(yaw)
      // 1. Estimación directa: suelo bajo cada rueda en su posición de reposo girada por el rumbo.
      const g = (lx: number, lz: number) => ground(x + lx * cs + lz * sn, z - lx * sn + lz * cs)
      const hP: number[] = []
      for (const s of sides) {
        const [hF, hM, hR] = s.wheels.map((_, i) => g(s.wx[i], s.wz[i]))
        const [zF, zM, zR] = s.wz
        // Bogie: balancín entre la rueda media y la trasera. Rocker: de la delantera al pivote del bogie.
        s.beta = Math.atan2(hM - hR, zM - zR)
        const hB = hR + ((hM - hR) * (s.zBogie - zR)) / (zM - zR)
        s.rho = Math.atan2(hF - hB, zF - s.zBogie)
        hP.push(hB + ((hF - hB) * (s.zRocker - s.zBogie)) / (zF - s.zBogie))
      }
      const [L, R] = sides
      let y = (hP[0] + hP[1]) / 2, roll = Math.atan2(hP[0] - hP[1], track)

      // 2. Ajuste en el mismo cuadro: se pone la pose, se mide cuánto flota o se hunde cada rueda de verdad
      // (al inclinarse, el chasis se desplaza y la estimación ya no vale) y se corrige. Sin estado entre cuadros:
      // el contacto no depende de los FPS ni se atrasa al avanzar.
      const pose = () => {
        // El diferencial deja el chasis en el promedio de los dos rockers.
        const pitch = (L.rho + R.rho) / 2
        // En three, girar +X baja lo que está al frente (+Z): los ángulos de cabeceo van con signo contrario.
        for (const s of sides) { s.rocker.rotation.x = -(s.rho - pitch); s.bogie.rotation.x = -(s.beta - s.rho) }
        body.position.set(x, y, z)
        body.rotation.set(-pitch, yaw, roll, 'YXZ')
        body.updateMatrixWorld(true)
      }
      const mean = [0, 0]
      for (let it = 0; it < SOLVE_STEPS; it++) {
        pose()
        sides.forEach((s, i) => {
          const [eF, eM, eR] = s.wheels.map((w) => { w.getWorldPosition(p); return p.y - radius - ground(p.x, p.z) })
          const [zF, zM, zR] = s.wz
          s.beta = lim(s.beta - ((eM - eR) / (zM - zR)) * SOLVE_GAIN, MAX_TILT)
          s.rho = lim(s.rho - ((eF - (eM + eR) / 2) / (zF - (zM + zR) / 2)) * SOLVE_GAIN, MAX_TILT)
          mean[i] = (eF + eM + eR) / 3
        })
        y -= ((mean[0] + mean[1]) / 2) * SOLVE_GAIN
        roll = lim(roll - ((mean[0] - mean[1]) / (L.wx[0] - R.wx[0])) * SOLVE_GAIN, MAX_TILT)
      }
      pose()
      if (diff) diff.rotation.y = (L.rho - R.rho) * 0.5

      steer += (turn * MAX_STEER * (speed < -0.05 ? -1 : 1) - steer) * k(dt, 6)
      const spin = (speed * dt) / radius
      for (const s of sides) {
        s.steerF.rotation.y = steer; s.steerR.rotation.y = -steer
        for (const w of s.wheels) w.rotation.x += spin
      }
    },
    drill(dt, on) { if (bit && on) bit.rotation.z += dt * 30 },
  }
}

/**
 * Altura exacta de la malla de un `PlaneGeometry(size, size, seg, seg)` ya girado al plano XZ:
 * interpola dentro del triángulo que toca, para que las ruedas pisen lo que se ve y no el ruido analítico.
 */
export function meshHeight(geo: THREE.BufferGeometry, size: number, seg: number): HeightFn {
  const pos = geo.attributes.position, n = seg + 1, step = size / seg, half = size / 2
  const h = (ix: number, iz: number) => pos.getY(iz * n + ix)
  return (x, z) => {
    const fx = THREE.MathUtils.clamp((x + half) / step, 0, seg - 1e-6), fz = THREE.MathUtils.clamp((z + half) / step, 0, seg - 1e-6)
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz
    const a = h(ix, iz), b = h(ix, iz + 1), c = h(ix + 1, iz + 1), d = h(ix + 1, iz)
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v)
  }
}
