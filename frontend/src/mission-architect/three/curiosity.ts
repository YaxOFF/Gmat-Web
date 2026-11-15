import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Altura del suelo (mundo) en un punto XZ. */
export type HeightFn = (x: number, z: number) => number

export interface CuriosityRig {
  /** Nodo raíz del modelo; se cuelga del grupo del rover (frente = +Z, arriba = +Y). */
  model: THREE.Object3D
  /** Huella de las ruedas en el marco del rover (m, frente = +Z), con el radio y el ancho de la rueda incluidos. */
  foot: { minX: number; maxX: number; minZ: number; maxZ: number }
  /**
   * Suspensión rocker-bogie procedural: apoya las seis ruedas sobre `ground` y coloca `body` (el grupo del rover,
   * padre de `model`) con la altura, el cabeceo y el alabeo que resultan. `x, z, yaw` ubican el rover;
   * `speed` (m/s) gira las ruedas y `turn` (-1..1) orienta las cuatro de dirección.
   */
  update(dt: number, body: THREE.Object3D, x: number, z: number, yaw: number, speed: number, turn: number, ground: HeightFn): void
  /**
   * Brazo robótico: con `on` se despliega frente al rover, baja la broca vertical hasta `ground` (suelo o lomo de
   * roca, en mundo) y perfora girando; sin `on` la saca y vuelve a guardarse. Llamar después de `update`.
   * `reach` (m) = distancia de la broca al pie del brazo; corto = brazo plegado como torre vertical junto al chasis.
   */
  drill(dt: number, on: boolean, ground: HeightFn, reach?: number): void
  /** Punto (mundo) donde la broca toca o tocaría el suelo ahora mismo. */
  drillPoint(out: THREE.Vector3): THREE.Vector3
  /** 0 = broca en el aire o guardada, 1 = apoyada (y girando si sigue perforando). */
  drillContact(): number
  /**
   * Mástil: gira la cabeza (ChemCam) hacia `target` (mundo) o, con null, la devuelve al frente. Devuelve true cuando
   * ya apunta. Llamar después de `update`.
   */
  aim(dt: number, target: THREE.Vector3 | null): boolean
  /** Lente del ChemCam (mundo): de donde sale el láser. */
  laserOrigin(out: THREE.Vector3): THREE.Vector3
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
  const diff = model.getObjectByName('Diferencial')
  const track = Math.abs(sides[0].xRocker - sides[1].xRocker)
  const wxs = sides.flatMap((s) => s.wx), wzs = sides.flatMap((s) => s.wz), halfW = 0.2 // medio ancho de rueda
  const foot = {
    minX: Math.min(...wxs) - halfW, maxX: Math.max(...wxs) + halfW,
    minZ: Math.min(...wzs) - radius, maxZ: Math.max(...wzs) + radius,
  }
  model.traverse((o) => {
    o.castShadow = true; o.receiveShadow = true
    // El export de Blender deja metallic = 1 en tex_03, tex_04, wheels y parts_AO sin mapa de metal. La escena
    // no tiene environment map, así que un metal puro no refleja nada y la textura se ve negra: se baja a casi 0.
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (m?.isMeshStandardMaterial && !m.metalnessMap && m.metalness > 0.2) m.metalness = 0.15
  })

  let steer = 0
  const arm = armRig(model)
  // Cabeza del mástil: acimut en Y y elevación en X (girar +X baja lo que está al frente, +Z).
  const head = model.getObjectByName('Mastil_Cabeza'), lens = model.getObjectByName('ChemCam') ?? head
  const hv = new THREE.Vector3()
  let az = 0, elv = 0

  return {
    model,
    foot,
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
    drill: (dt, on, ground, reach) => arm.drill(dt, on, ground, reach),
    drillPoint: (out) => arm.point(out),
    drillContact: () => arm.contact(),
    aim(dt, target) {
      if (!head?.parent) return true
      let taz = 0, tel = 0
      if (target) {
        head.parent.worldToLocal(hv.copy(target)).sub(head.position)
        taz = Math.atan2(hv.x, hv.z); tel = Math.atan2(-hv.y, Math.hypot(hv.x, hv.z))
      }
      const dAz = Math.atan2(Math.sin(taz - az), Math.cos(taz - az)) // por el lado corto
      az += dAz * k(dt, 6); elv += (tel - elv) * k(dt, 6)
      head.rotation.set(elv, az, 0, 'YXZ')
      return Math.abs(dAz) + Math.abs(tel - elv) < 0.03
    },
    laserOrigin: (out) => (lens ? lens.localToWorld(out.set(0, 0, 0.12)) : model.getWorldPosition(out)),
  }
}

const ARM_REACH = 1.05 // m: distancia de la broca al pie del brazo, hacia adelante
const ARM_HOVER = 0.22 // m: altura de la punta sobre el suelo antes de bajar
const ARM_PLUNGE = 0.06 // m: cuánto se mete la broca al perforar

/**
 * Brazo de 5 articulaciones (Brazo → Superior → Antebrazo → Muñeca → Torreta → Taladro). Hombro, codo y muñeca giran
 * en X local, en el plano vertical del brazo. Hombro y codo resuelven un IK de dos eslabones hasta la muñeca; la
 * muñeca deja la broca (eje +Z del Taladro) apuntando hacia abajo, así la punta cae en el objetivo a cualquier altura.
 */
function armRig(model: THREE.Object3D) {
  const get = (n: string) => model.getObjectByName(n)
  const base = get('Brazo'), sh = get('Brazo_Superior'), el = get('Brazo_Antebrazo'), wr = get('Brazo_Muneca'), bit = get('Taladro')
  if (!base || !sh || !el || !wr || !bit) {
    const p = new THREE.Vector3()
    return { drill: (_dt: number, _on: boolean, _ground: HeightFn, _reach?: number) => {}, point: (out: THREE.Vector3) => out.copy(model.getWorldPosition(p)), contact: () => 0 }
  }
  model.updateMatrixWorld(true)
  // Geometría en reposo, en el marco de Brazo (plano z-y). Ángulo de cada eslabón: atan2(y, z).
  const S = sh.position.clone(), E = el.position.clone(), W = wr.position.clone()
  const L1 = Math.hypot(E.z, E.y), a1 = Math.atan2(E.y, E.z)
  const L2 = Math.hypot(W.z, W.y), a2 = Math.atan2(W.y, W.z)
  // Punta de la broca en el marco de la muñeca: el vértice más adelantado (+Z) del Taladro.
  const toWrist = wr.matrixWorld.clone().invert(), v = new THREE.Vector3(), tip = new THREE.Vector3(0, 0, -Infinity)
  bit.traverse((o) => {
    const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.attributes.position : null
    for (let i = 0; g && i < g.count; i++) {
      v.fromBufferAttribute(g, i).applyMatrix4(o.matrixWorld).applyMatrix4(toWrist)
      if (v.z > tip.z) tip.copy(v)
    }
  })
  const Lt = Math.hypot(tip.z, tip.y), at = Math.atan2(tip.y, tip.z)
  const tipX = S.x + E.x + W.x + tip.x // los giros en X no mueven la punta de lado

  // Girar +θ en X baja el ángulo del eslabón en θ: el eje de la broca (ángulo 0) queda en −θ.
  let deploy = 0, lower = 0, spin = 0
  const target = new THREE.Vector3(), local = new THREE.Vector3(), down = new THREE.Vector3()
  const toBase = new THREE.Quaternion()
  const ease = (x: number) => x * x * (3 - 2 * x)

  let reach = ARM_REACH
  const aim = (ground: HeightFn) => {
    target.set(tipX, 0, reach); base.localToWorld(target)
    target.y = ground(target.x, target.z)
    return target
  }
  return {
    point: (out: THREE.Vector3) => out.copy(target),
    contact: () => lower,
    drill(dt: number, on: boolean, ground: HeightFn, armReach = ARM_REACH) {
      reach = armReach
      // Fases: desplegar → bajar → perforar; al terminar, subir → guardar.
      if (on) { deploy = Math.min(1, deploy + dt / 0.9); if (deploy >= 1) lower = Math.min(1, lower + dt / 0.5) }
      else { lower = Math.max(0, lower - dt / 0.35); if (lower <= 0) deploy = Math.max(0, deploy - dt / 0.9) }
      const drilling = on && lower >= 1
      spin = drilling ? spin + dt * 25 : spin
      bit.rotation.z = spin
      if (deploy <= 0) { sh.rotation.x = el.rotation.x = wr.rotation.x = 0; aim(ground); return }

      aim(ground)
      const plunge = drilling ? ARM_PLUNGE + Math.sin(performance.now() / 18) * 0.004 : 0
      local.copy(target); local.y += ARM_HOVER * (1 - ease(lower)) - plunge
      base.worldToLocal(local)
      // Giro total para que la broca apunte a la vertical del mundo aunque el chasis esté inclinado.
      down.set(0, -1, 0).applyQuaternion(base.getWorldQuaternion(toBase).invert())
      const total = -Math.atan2(down.y, down.z), tz = Lt * Math.cos(at - total), ty = Lt * Math.sin(at - total)
      // Muñeca = objetivo menos la herramienta; IK de dos eslabones (codo arriba) desde el hombro.
      let dz = local.z - tz - S.z, dy = local.y - ty - S.y
      const d = THREE.MathUtils.clamp(Math.hypot(dz, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3)
      const ang = Math.atan2(dy, dz); dz = Math.cos(ang) * d; dy = Math.sin(ang) * d
      const alpha = ang + Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
      const beta = Math.atan2(dy - L1 * Math.sin(alpha), dz - L1 * Math.cos(alpha))
      const ts = a1 - alpha, te = a2 - beta - ts, tw = total - ts - te
      const k = ease(deploy)
      sh.rotation.x = ts * k; el.rotation.x = te * k; wr.rotation.x = tw * k
    },
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
