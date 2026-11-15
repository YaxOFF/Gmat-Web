import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { LaunchOutcome } from '../engine/mission'
import { mulberry32, type Rng } from '../engine/rng'
import { at, bodyMaterial, mountStage, stars } from './stage'

const T_LIFT = 5, T_EVENT = 2.4, T_SPACE = 13, T_END = 19
/** El GLB está en metros reales (cohete de 58 m): escala a la escena y altura de la cubierta sobre el suelo. */
const SCALE = 0.4, PAD_Y = 6.5 * SCALE
const HOT = new THREE.Color(0xffb060), GREY = new THREE.Color(0xd9d9de)
const DAY = new THREE.Color(0xcfe0ee), BLACK = new THREE.Color(0x000000)

/** La nave MSL mide 8 m de popa a proa en el GLB: escala en la escena y punto medio para centrarla. */
const MSL_SCALE = 0.5, MSL_MID = 3.9

/** Prepara un GLB de Blender: sombras, y metal acotado (sin mapa de entorno el metal puro se ve negro). */
function tame(model: THREE.Object3D) {
  model.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (m?.isMeshStandardMaterial) m.metalness = Math.min(m.metalness, 0.3)
    o.castShadow = o.receiveShadow = true
  })
}

/** Mancha radial suave: la misma textura sirve para humo y fuego. */
export function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/** Textura de lienzo repetible con manchas al azar (pasto, concreto). */
function speckle(rng: Rng, base: string, dots: string[], repeat: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = base; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) { g.fillStyle = dots[Math.floor(rng() * dots.length)]; g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 5, 1 + rng() * 5) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat)
  return t
}

/**
 * Complejo de lanzamiento costero de día: cielo en degradado, matorral, plataforma de concreto, camino de oruga
 * hasta el edificio de integración, mar al fondo, cuatro torres pararrayos con sus cables y nubes.
 * Devuelve el grupo y el domo del cielo (se desvanece al subir).
 */
function buildSite(rng: Rng, puff: THREE.Texture) {
  const site = new THREE.Group()
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 1, ...o })
  const flat = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const p = at(new THREE.Mesh(new THREE.PlaneGeometry(w, d), m), x, y, z); p.rotation.x = -Math.PI / 2; p.receiveShadow = true; site.add(p); return p
  }
  // Cielo: cenit azul profundo, horizonte pálido.
  const sc = document.createElement('canvas'); sc.width = 2; sc.height = 256
  const sg = sc.getContext('2d')!, grad = sg.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#2a66b8'); grad.addColorStop(0.32, '#6fa4de'); grad.addColorStop(0.5, '#cfe0ee'); grad.addColorStop(1, '#cfe0ee')
  sg.fillStyle = grad; sg.fillRect(0, 0, 2, 256)
  const skyTex = new THREE.CanvasTexture(sc); skyTex.colorSpace = THREE.SRGBColorSpace
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }))
  dome.renderOrder = -1; site.add(dome)

  // Suelo: sin planos encimados (a esta distancia parpadearían): matorral, playa y mar van uno junto al otro.
  flat(6000, 2860, std({ map: speckle(rng, '#5f6d3d', ['#4d5a30', '#6f7b45', '#7a7550', '#515f37'], 300) }), 0, -0.3, 1070)
  flat(6000, 40, std({ color: 0xd8c9a0 }), 0, -0.3, -380)
  flat(6000, 2600, std({ color: 0x1d5c88, roughness: 0.35 }), 0, -0.3, -1700)
  const concrete = std({ map: speckle(rng, '#9c9b95', ['#8d8c86', '#a9a8a2', '#84837d'], 12) })
  const slab = at(new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 0.5, 48), concrete), 0, -0.25, 0); slab.receiveShadow = true; site.add(slab)
  const way = at(new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 240), std({ color: 0xb3a88c })), 0, -0.25, -180); way.receiveShadow = true; site.add(way)
  // Edificio de integración vertical al final del camino y naves bajas.
  const wall = std({ color: 0xd9d6cc })
  for (const [w, h, d, x, z] of [[16, 34, 16, 0, -312], [30, 6, 14, -40, -300], [18, 5, 12, 70, -150]])
    site.add(at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall), x, h / 2 - 0.3, z))

  // Torres pararrayos: celosía de líneas (patas, anillos y cruces por tramo), mástil blanco y cables entre puntas.
  const H = 40, R = 36, pts: number[] = []
  const seg = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
  const tops: THREE.Vector3[] = []
  for (const [cx, cz] of [[-R, -R], [R, -R], [R, R], [-R, R]]) {
    const corner = (lvl: number, i: number) => {
      const y = (lvl / 10) * H, w = 2.4 - 1.8 * (lvl / 10)
      return new THREE.Vector3(cx + (i === 0 || i === 3 ? -w : w), y, cz + (i < 2 ? -w : w))
    }
    for (let l = 0; l < 10; l++) for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      seg(corner(l, i), corner(l + 1, i)); seg(corner(l + 1, i), corner(l + 1, j))
      seg(l % 2 ? corner(l, i) : corner(l, j), l % 2 ? corner(l + 1, j) : corner(l + 1, i))
    }
    site.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 9, 8), std({ color: 0xf2f2f2 })), cx, H + 4.5, cz))
    tops.push(new THREE.Vector3(cx, H + 9, cz))
  }
  tops.forEach((a, i) => { // catenaria aproximada en 8 tramos
    const b = tops[(i + 1) % 4], p = (t: number) => a.clone().lerp(b, t).setY(a.y - 5 * Math.sin(Math.PI * t))
    for (let k = 0; k < 8; k++) seg(p(k / 8), p((k + 1) / 8))
  })
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  site.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8e949c })))

  // Nubes lejos del eje de ascenso, para que la cámara no las atraviese.
  for (let i = 0; i < 34; i++) {
    const a = rng() * Math.PI * 2, r = 260 + rng() * 1300
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0.55 + rng() * 0.35, depthWrite: false }))
    cl.position.set(Math.cos(a) * r, 110 + rng() * 260, Math.sin(a) * r); cl.scale.set(160 + rng() * 240, 50 + rng() * 60, 1); site.add(cl)
  }
  return { site, dome }
}

/**
 * Reserva fija de partículas (sprites) que se reciclan. Al tocar el suelo el chorro se desvía hacia afuera,
 * como en la plataforma. `look(a, material)` pinta cada una según su edad normalizada `a` (0..1).
 * `floor` da la altura del suelo y (`cx`, `cz`) el centro desde el que se abre el rebote.
 */
export function puffs(scene: THREE.Scene, n: number, map: THREE.Texture, additive: boolean, floor = (_x: number, _z: number) => 0, cx = 0, cz = 0) {
  const group = new THREE.Group(); scene.add(group)
  const all = Array.from({ length: n }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }))
    s.visible = false; group.add(s)
    return { s, v: new THREE.Vector3(), age: 0, life: 0, size: 1, grow: 0 }
  })
  let next = 0
  return {
    group,
    emit(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow: number) {
      const q = all[next]; next = (next + 1) % n
      q.s.position.copy(p); q.v.copy(v); q.age = 0; q.life = life; q.size = size; q.grow = grow; q.s.visible = true
    },
    step(dt: number, look: (a: number, m: THREE.SpriteMaterial) => void, drag = 0, lift = 0) {
      for (const q of all) {
        if (!q.s.visible) continue
        q.age += dt
        if (q.age >= q.life) { q.s.visible = false; continue }
        q.v.multiplyScalar(Math.exp(-dt * drag)); q.v.y += lift * dt
        const p = q.s.position.addScaledVector(q.v, dt)
        const f = floor(p.x, p.z) + 0.5, dx = p.x - cx, dz = p.z - cz
        if (p.y < f && q.v.y < 0) { // rebote en el suelo: la velocidad de caída pasa a ser radial
          const sp = -q.v.y * 0.7, ang = dx * dx + dz * dz > 0.01 ? Math.atan2(dz, dx) + (Math.random() - 0.5) : Math.random() * 6.28
          q.v.set(Math.cos(ang) * sp, 0.5, Math.sin(ang) * sp); p.y = f
        }
        q.s.scale.setScalar(q.size + q.grow * q.age)
        look(q.age / q.life, q.s.material)
      }
    },
  }
}

/** Lanzamiento y crucero: cuenta regresiva, ascenso y la inserción lunar, con las tiradas del motor del juego. */
export function Launch3D({ launch, seed, onDone }: { launch: LaunchOutcome; seed: number; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(0)
  const failAt = launch.status === 'launch_failure'
    ? (launch.events.length === 1 ? T_LIFT + 1 : T_LIFT + 0.6 + (launch.events.length - 1) * T_EVENT * 0.5)
    : Infinity
  const shown = launch.events.filter((_, i) => t >= T_LIFT - 2 + i * T_EVENT)

  useEffect(() => mountStage(host.current!, ({ scene, camera }) => {
    const rng = mulberry32(seed)
    const sky = DAY.clone(); scene.background = sky
    const fog = new THREE.Fog(sky, 200, 2600); scene.fog = fog // bruma de costa; toma el color del cielo
    const starField = stars(rng), starMat = starField.material as THREE.PointsMaterial
    starMat.transparent = true; starMat.fog = false; starMat.opacity = 0; scene.add(starField)
    scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x6b6a55, 1.1))
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4); sun.position.set(60, 90, 80); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 60, bottom: -40, far: 320 }); scene.add(sun)

    const tex = puffTexture()
    const { site: pad, dome } = buildSite(rng, tex)
    scene.add(pad)
    // Atlas V 541 y su plataforma (modelados en Blender). El cohete sube; la plataforma se queda.
    const rocket = new THREE.Group(); scene.add(rocket)
    const flames = new THREE.Group(); flames.visible = false; rocket.add(flames)
    const glow = new THREE.PointLight(0xffa040, 0, 120); glow.position.y = PAD_Y - 2; rocket.add(glow)
    const nozzles: { p: THREE.Vector3; r: number; srb: boolean }[] = []
    let ready = false, gone = false
    const loader = new GLTFLoader()
    loader.loadAsync(`${import.meta.env.BASE_URL}models/atlas_v_541.glb`).then((gltf) => {
      if (gone) return
      tame(gltf.scene)
      const body = gltf.scene.getObjectByName('AtlasV541')
      if (!body) throw new Error('atlas_v_541.glb: falta el nodo AtlasV541')
      const holder = new THREE.Group(); holder.scale.setScalar(SCALE); holder.position.y = PAD_Y
      holder.add(body); rocket.add(holder)
      gltf.scene.scale.setScalar(SCALE); gltf.scene.position.y = PAD_Y; pad.add(gltf.scene)
      rocket.updateMatrixWorld(true)
      const box = new THREE.Box3(), c = new THREE.Vector3()
      body.traverse((o) => {
        if (!/Nozzle/.test(o.name)) return
        box.setFromObject(o); box.getCenter(c)
        const srb = o.name.startsWith('SRB'), r = (box.max.x - box.min.x) / 2, len = srb ? 9 : 5
        nozzles.push({ p: new THREE.Vector3(c.x, box.min.y, c.z), r, srb })
        // Dardo de la llama: cono fijo bajo cada tobera; las partículas le dan el movimiento.
        const dart = new THREE.Mesh(new THREE.ConeGeometry(r * 1.15, len, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: srb ? 0xffe9b0 : 0xffb060, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
        dart.rotation.x = Math.PI; dart.position.set(c.x, box.min.y - len / 2 + 0.1, c.z); flames.add(dart)
      })
    }).catch((err) => console.error(err)).finally(() => { ready = true })

    const fire = puffs(scene, 160, tex, true), smoke = puffs(scene, 320, tex, false)
    const out = new THREE.Vector3(), vel = new THREE.Vector3()
    let fireAcc = 0, smokeAcc = 0
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0 }))
    scene.add(boom)

    // Escena de espacio: Luna y la nave en crucero.
    const space = new THREE.Group(); space.visible = false; scene.add(space)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 48), bodyMaterial(rng))
    moon.position.set(0, 0, -120); space.add(moon)
    const craft = new THREE.Group()
    // Nave MSL (Blender): en el GLB la proa va en +y y la tobera en y=0. Aquí proa a +z, motor a −z, centrada.
    loader.loadAsync(`${import.meta.env.BASE_URL}models/msl.glb`).then((gltf) => {
      if (gone) return
      tame(gltf.scene); gltf.scene.scale.setScalar(MSL_SCALE); gltf.scene.rotation.x = Math.PI / 2
      gltf.scene.position.z = -MSL_MID * MSL_SCALE; craft.add(gltf.scene)
    }).catch((err) => console.error(err))
    const burn = at(new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8 })), 0, 0, -MSL_MID * MSL_SCALE - 1.2)
    burn.rotation.x = -Math.PI / 2; craft.add(burn); space.add(craft)

    let time = 0
    const tick = (dt: number) => {
      if (!ready) { camera.position.set(30, 9, 42); camera.lookAt(0, 13, 0); return } // la cuenta espera al modelo
      time += dt; setT(time)
      const fly = time > T_LIFT && time < failAt
      if (time < T_SPACE) {
        const k = Math.max(0, time - T_LIFT)
        const y = fly ? k * k * 1.6 : rocket.position.y
        const vy = fly ? k * 3.2 : 0
        rocket.position.y = y
        if (launch.status === 'launch_failure' && launch.events.length === 1 && time > T_LIFT) rocket.position.x = Math.sin(time * 40) * 0.08
        const burning = time > T_LIFT - 0.8 && time < failAt
        flames.visible = burning; glow.intensity = burning ? 500 + Math.random() * 300 : 0
        for (const d of flames.children) d.scale.set(1, 0.85 + Math.random() * 0.3, 1)
        if (burning) {
          // Fuego: chorro rápido y corto. Humo: sale más lento, se frena, crece y queda atrás como estela.
          fireAcc += dt * 220; smokeAcc += dt * 80
          for (; fireAcc >= 1; fireAcc--) {
            const n = nozzles[Math.floor(Math.random() * nozzles.length)]; if (!n) break
            out.copy(n.p).add(rocket.position); vel.set((Math.random() - 0.5) * 3, vy - 20 - Math.random() * 8, (Math.random() - 0.5) * 3)
            fire.emit(out, vel, 0.3 + Math.random() * 0.25, n.r * (n.srb ? 3 : 2.4), 5)
          }
          for (; smokeAcc >= 1; smokeAcc--) {
            const n = nozzles[Math.floor(Math.random() * nozzles.length)]; if (!n) break
            out.copy(n.p).add(rocket.position); out.y -= 2 + Math.random() * 3
            vel.set((Math.random() - 0.5) * 5, vy * 0.25 - 12 - Math.random() * 6, (Math.random() - 0.5) * 5)
            smoke.emit(out, vel, 3 + Math.random() * 2.5, 1.6 + Math.random() * 1.4, 3.2)
          }
        }
        fire.step(dt, (a, m) => { m.color.setHSL(0.13 - a * 0.11, 1, 0.75 - a * 0.4); m.opacity = 0.9 * (1 - a) })
        smoke.step(dt, (a, m) => { m.color.lerpColors(HOT, GREY, Math.min(1, a * 6)); m.opacity = 0.55 * Math.min(1, a * 12) * (1 - a) ** 1.5 }, 1.1, 1.2)
        if (time >= failAt) {
          const b = time - failAt; rocket.visible = b < 0.12
          boom.position.copy(rocket.position).y += 14; boom.scale.setScalar(2 + b * 30); boom.material.opacity = Math.max(0, 1 - b / 1.6)
        }
        // Al subir, el azul se apaga hacia el negro del espacio y aparecen las estrellas.
        const up = Math.min(1, y / 260)
        sky.lerpColors(DAY, BLACK, up); fog.color.copy(sky); dome.material.opacity = 1 - up
        starMat.opacity = THREE.MathUtils.clamp((y - 40) / 200, 0, 1)
        camera.position.set(30, Math.max(9, y * 0.85 + 9), 42); camera.lookAt(0, y + 13, 0)
      } else if (launch.status !== 'launch_failure') {
        pad.visible = rocket.visible = fire.group.visible = smoke.group.visible = false; space.visible = true; sky.set(0x000000); scene.fog = null; starMat.opacity = 1
        const k = time - T_SPACE
        if (launch.status === 'ok') {
          craft.position.set(Math.sin(k * 0.5) * 42, 6 - k * 0.6, -120 + Math.cos(k * 0.5) * 42)
          burn.visible = k > 1.5 && k < 4
        } else { craft.position.set(-40 + k * 14, 8, -100 + k * 4); burn.visible = false }
        craft.lookAt(moon.position); craft.rotateY(Math.PI)
        const out = craft.position.clone().sub(moon.position).normalize()
        camera.position.copy(craft.position).addScaledVector(out, 9).add(new THREE.Vector3(3, 4, 0))
        camera.lookAt(craft.position)
      }
    }
    return Object.assign(tick, { cleanup: () => { gone = true } })
  }), [launch, seed, failAt])

  const end = launch.status === 'launch_failure' ? failAt + 2.5 : T_END
  const tag = t < T_LIFT ? `T−${Math.ceil(T_LIFT - t)}` : t < T_SPACE || t > T_SPACE + 3 || launch.status === 'launch_failure' ? '' : launch.status === 'ok' ? 'ORBIT ACHIEVED' : 'SIGNAL LOST'
  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      {tag && <div className="dlg-sfx good"><span>{tag}</span></div>}
      {t >= failAt && <div className="dlg-sfx bad"><span>BOOM</span></div>}
      <div className="ds-hud" style={{ width: 360 }}>
        <div>MISSION CONTROL</div>
        {shown.map((e, i) => (
          <div key={i} className="hint" style={{ color: e.result === 'fail' ? 'var(--red)' : e.result === 'partial' ? 'var(--amber)' : 'var(--green)' }}>
            › {e.label}{e.p != null ? ` · ${Math.round(e.p * 100)}% chance → ${e.result?.toUpperCase()}` : ''}<br /><span style={{ color: 'var(--dim)' }}>{e.text}</span>
          </div>
        ))}
      </div>
      {t > end && <div className="rv-end"><button className="btn big" onClick={onDone}>{launch.status === 'ok' ? 'Begin mapping →' : 'Mission report →'}</button></div>}
    </div>
  )
}
