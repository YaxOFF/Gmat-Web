import * as THREE from 'three'

/**
 * Corte de "rayos X" de la perforación: se dibuja encima de todo (sin prueba de profundidad), así se ve a través de
 * la roca o del regolito. Un núcleo translúcido con estratos, la broca en cian bajando hasta la profundidad elegida,
 * motas de hielo que aparecen cuando la broca las alcanza y polvo que sale del hoyo (este sí, con profundidad).
 */
export interface Xray {
  group: THREE.Group
  /**
   * `p` = boca del hoyo (mundo). `on` = broca adentro. `progress` 0..1 de la perforación. `depth` en metros.
   * `ice` = % de agua de la muestra (0 = seco). Devuelve true si ya se ven motas de hielo.
   */
  update(dt: number, p: THREE.Vector3, on: boolean, progress: number, depth: number, ice: number): boolean
  /** Vuelve a sembrar estratos y hielo para una perforación nueva. */
  reset(): void
}

const CORE_R = 0.17, SHAFT_R = 0.022, ICE_MAX = 70, DUST = 60, MOON_G = 1.62

function strataTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256
  const g = c.getContext('2d')!
  for (let y = 0; y < 256;) {
    const h = 4 + Math.random() * 22, l = 30 + Math.random() * 35, hue = 190 + Math.random() * 25
    g.fillStyle = `hsl(${hue} 45% ${l}%)`; g.fillRect(0, y, 4, h); y += h
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** `crystal` = color de las motas (hielo cian en la Luna; vetas minerales en Marte). */
export function makeXray(crystal = 0x38e1ff): Xray {
  const group = new THREE.Group(); group.visible = false
  const over = (color: number, opacity: number, extra: Partial<THREE.MeshBasicMaterialParameters> = {}) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, ...extra })

  // Núcleo: cilindro abierto con estratos; tapa de arriba como anillo para marcar la boca del hoyo.
  const strata = strataTexture()
  const coreMat = over(0xffffff, 0.45, { map: strata, side: THREE.DoubleSide })
  const core = new THREE.Mesh(new THREE.CylinderGeometry(CORE_R, CORE_R, 1, 32, 1, true), coreMat)
  const rimMat = over(0x6ff7ff, 0.9, { side: THREE.DoubleSide })
  const rim = new THREE.Mesh(new THREE.RingGeometry(CORE_R * 0.92, CORE_R, 40), rimMat); rim.rotation.x = -Math.PI / 2
  const floorMat = over(0x6ff7ff, 0.5, { side: THREE.DoubleSide })
  const bottom = new THREE.Mesh(new THREE.RingGeometry(CORE_R * 0.92, CORE_R, 40), floorMat); bottom.rotation.x = -Math.PI / 2

  // Broca: eje cian brillante, punta cónica y un halo que late donde corta.
  const shaftMat = over(0x9ffcff, 0.95, { blending: THREE.AdditiveBlending })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 1, 12), shaftMat)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(SHAFT_R * 1.7, 0.08, 12), shaftMat); tip.rotation.x = Math.PI
  const haloMat = over(0x38e1ff, 0.5, { blending: THREE.AdditiveBlending })
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), haloMat)
  // Espiral de la broca: una hélice de puntos que gira con ella.
  const helixN = 90, helixPos = new Float32Array(helixN * 3)
  const helix = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(helixPos, 3)),
    new THREE.PointsMaterial({ color: 0xe8ffff, size: 0.018, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }))

  // Hielo: puntos ordenados por profundidad; el drawRange muestra solo los que la broca ya alcanzó.
  const icePos = new Float32Array(ICE_MAX * 3), iceDepth = new Float32Array(ICE_MAX)
  const iceGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(icePos, 3))
  const iceMat = new THREE.PointsMaterial({ color: crystal, size: 0.04, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
  const ice = new THREE.Points(iceGeo, iceMat)

  // Polvo: partículas balísticas con la gravedad lunar, sí ocultas por el terreno.
  const dustPos = new Float32Array(DUST * 3), dustVel = new Float32Array(DUST * 3), dustLife = new Float32Array(DUST)
  const dustGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dustMat = new THREE.PointsMaterial({ color: 0xb8b0a4, size: 0.03, transparent: true, opacity: 0.85, depthWrite: false })
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false

  const xr = new THREE.Group()
  xr.add(core, rim, bottom, shaft, tip, halo, helix, ice)
  for (const o of xr.children) { o.renderOrder = 20; o.frustumCulled = false }
  group.add(xr, dust)

  let fade = 0, spin = 0, iceN = 0
  const reset = () => {
    strata.offset.y = Math.random()
    // Profundidades 0..1 (fracción del hoyo), ordenadas; radio dentro del núcleo.
    const ds = Array.from({ length: ICE_MAX }, () => 0.25 + Math.random() * 0.75).sort((a, b) => a - b)
    ds.forEach((d, i) => {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * CORE_R * 0.85
      iceDepth[i] = d; icePos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3)
    })
    dustLife.fill(0)
  }
  reset()

  return {
    group, reset,
    update(dt, p, on, progress, depth, icePct) {
      fade += ((on ? 1 : 0) - fade) * (1 - Math.exp(-dt * (on ? 6 : 3)))
      group.visible = fade > 0.01 || dustLife.some((l) => l > 0)
      if (!group.visible) return false
      xr.visible = fade > 0.01
      xr.position.copy(p)
      const cur = Math.max(0.02, progress * depth)

      core.scale.y = depth; core.position.y = -depth / 2; strata.repeat.set(1, Math.max(1, depth * 2.5))
      bottom.position.y = -depth
      spin += dt * 18
      shaft.scale.y = cur + 0.25; shaft.position.y = 0.25 - (cur + 0.25) / 2
      tip.position.y = -cur - 0.03; halo.position.y = -cur
      halo.scale.setScalar(1 + Math.sin(spin * 1.7) * 0.25)
      for (let i = 0; i < helixN; i++) {
        const f = i / helixN, a = spin + f * Math.PI * 14
        helixPos.set([Math.cos(a) * SHAFT_R * 1.6, 0.05 - f * (cur + 0.05), Math.sin(a) * SHAFT_R * 1.6], i * 3)
      }
      helix.geometry.attributes.position.needsUpdate = true

      // Hielo: cantidad según el % de agua, visible hasta donde llegó la broca.
      iceN = icePct > 0 ? Math.min(ICE_MAX, Math.round(10 + icePct * 7)) : 0
      let shown = 0
      for (let i = 0; i < iceN; i++) {
        if (iceDepth[i] * depth > cur) break
        icePos[i * 3 + 1] = -iceDepth[i] * depth; shown++
      }
      iceGeo.setDrawRange(0, shown); iceGeo.attributes.position.needsUpdate = true
      iceMat.size = 0.035 + Math.sin(spin) * 0.008

      for (const m of [coreMat, rimMat, floorMat, shaftMat, haloMat, iceMat, helix.material as THREE.PointsMaterial]) {
        m.userData.base ??= m.opacity; m.opacity = m.userData.base * fade
      }

      // Polvo: nace en la boca del hoyo mientras la broca gira.
      for (let i = 0; i < DUST; i++) {
        if (dustLife[i] <= 0) {
          if (!on || Math.random() > dt * 30) { dustPos[i * 3 + 1] = -1e4; continue }
          const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 0.8
          dustPos.set([p.x + Math.cos(a) * 0.04, p.y + 0.02, p.z + Math.sin(a) * 0.04], i * 3)
          dustVel.set([Math.cos(a) * v * 0.6, 0.5 + Math.random() * 0.9, Math.sin(a) * v * 0.6], i * 3)
          dustLife[i] = 0.8 + Math.random() * 0.6
        }
        dustLife[i] -= dt
        dustVel[i * 3 + 1] -= MOON_G * dt
        for (let k = 0; k < 3; k++) dustPos[i * 3 + k] += dustVel[i * 3 + k] * dt
        if (dustPos[i * 3 + 1] < p.y - 0.05) dustLife[i] = 0
      }
      dustGeo.attributes.position.needsUpdate = true
      return shown > 0
    },
  }
}
