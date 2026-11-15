import * as THREE from 'three'
import { at } from './stage'

// Modelo 3D de Selene armado con las piezas del hangar. Ejes: ±x paneles, +z cara a la Luna (instrumentos),
// −z hacia la Tierra (antena), −y motor. 1 unidad ≈ alto del bus mediano.

let cellTex: THREE.CanvasTexture | null = null
function cells(): THREE.CanvasTexture {
  if (cellTex) return cellTex
  const c = document.createElement('canvas'); c.width = 256; c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#0d1a4a'; g.fillRect(0, 0, 256, 64)
  g.strokeStyle = '#5a7bd6'; g.lineWidth = 1.2
  for (let x = 0; x <= 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke() }
  for (let y = 0; y <= 64; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke() }
  cellTex = new THREE.CanvasTexture(c); cellTex.colorSpace = THREE.SRGBColorSpace
  return cellTex
}

const mat = (color: number, metalness = 0.3, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, metalness, roughness })

export function buildSpacecraft(partIds: string[]): THREE.Group {
  const has = (id: string) => partIds.includes(id)
  const g = new THREE.Group()
  const medium = !has('bus_small')
  const w = medium ? 1.1 : 0.8, h = medium ? 1.3 : 1
  // Bus con manta térmica dorada (más brillante con MLI premium).
  const foil = new THREE.MeshStandardMaterial({ color: has('mli') ? 0xf2c14e : 0xc9a24a, metalness: 0.85, roughness: has('mli') ? 0.25 : 0.45 })
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), foil))
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.06, w * 1.02), mat(0x9aa0ad, 0.6)), 0, h / 2, 0))

  // Paneles solares en dos alas.
  const gaas = has('panel_gaas') || !has('panel_si')
  const span = gaas ? 2.4 : 1.7
  const panelMat = new THREE.MeshStandardMaterial({ map: cells(), color: gaas ? 0xffffff : 0x8fa6c8, metalness: 0.5, roughness: 0.3 })
  for (const s of [-1, 1]) {
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), mat(0x888888, 0.7)), s * (w / 2 + 0.2), 0, 0).rotateZ(Math.PI / 2))
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(span, 0.03, 0.75), panelMat), s * (w / 2 + 0.4 + span / 2), 0, 0))
  }
  // Radiador blanco en una cara lateral.
  if (has('radiator')) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.02, h * 0.7, w * 0.7), mat(0xf4f4f4, 0.1, 0.9)), 0, 0, 0).translateX(-w / 2 - 0.011))

  // Antena: plato de alta ganancia o mástil de baja ganancia, hacia la Tierra (−z).
  if (has('hga')) {
    const boom = at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5), mat(0x888888, 0.7)), 0, 0.2, -w / 2 - 0.25)
    boom.rotateX(Math.PI / 2); g.add(boom)
    const pts = Array.from({ length: 12 }, (_, i) => new THREE.Vector2((i / 11) * 0.55, ((i / 11) * 0.55) ** 2 * 0.9))
    const dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide }))
    dish.position.set(0, 0.2, -w / 2 - 0.5); dish.rotateX(-Math.PI / 2); g.add(dish)
  } else {
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7), mat(0xdddddd, 0.6)), 0.2, h / 2 + 0.35, -0.2))
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 12), mat(0xdddddd, 0.6)), 0.2, h / 2 + 0.75, -0.2))
  }
  if (has('relay')) g.add(at(new THREE.Mesh(new THREE.TorusKnotGeometry(0.06, 0.015, 40, 6), mat(0xffb020, 0.6)), -0.25, h / 2 + 0.12, 0.25))

  // Tanque y motor (−y).
  if (has('tank_l')) g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 8, 16), mat(0xd0d4dc, 0.7, 0.3)), 0, -h / 2 - 0.45, 0))
  else g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), mat(0xd0d4dc, 0.7, 0.3)), 0, -h / 2 - 0.25, 0))
  const nozzleY = has('tank_l') ? -h / 2 - 1.05 : -h / 2 - 0.65
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 0.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x555a66, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide })), 0, nozzleY, 0))

  // Instrumentos en la cara que mira a la Luna (+z).
  const face = w / 2
  if (has('neutron')) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.45, 16), mat(0xd7ff3a, 0.4)), -w * 0.25, h * 0.15, face + 0.22).rotateX(Math.PI / 2))
  if (has('camera')) {
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.25), mat(0x1c1f27, 0.5)), w * 0.25, h * 0.2, face + 0.12))
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x38e1ff, emissive: 0x0a3040, metalness: 0.9, roughness: 0.1 })), w * 0.25, h * 0.2, face + 0.27).rotateX(Math.PI / 2))
  }
  if (has('altimeter')) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x333, emissive: 0x550000 })), 0, -h * 0.25, face + 0.1).rotateX(Math.PI / 2))
  if (has('radiometer')) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), mat(0xff8a3a, 0.4)), -w * 0.25, -h * 0.25, face + 0.07))
  if (has('radar')) {
    const radar = at(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.5), mat(0xf0e8ee, 0.4)), 0, -h / 2 - 0.05, face + 0.45)
    radar.rotateX(-0.5); g.add(radar)
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.01, 0.42), new THREE.MeshStandardMaterial({ color: 0xff3d81, emissive: 0x300010 })), 0, -h / 2 - 0.02, face + 0.45).rotateX(-0.5))
  }

  // Módulo de aterrizaje con el rover, acoplado debajo para el viaje.
  if (has('lander')) {
    const lander = new THREE.Group()
    lander.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.7, 8), mat(0xd9a441, 0.7, 0.35)))
    for (let i = 0; i < 4; i++) {
      const leg = at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), mat(0xb0b0b0, 0.7)), Math.cos(i * 1.57 + 0.78) * 1, -0.5, Math.sin(i * 1.57 + 0.78) * 1)
      leg.rotation.set(Math.sin(i * 1.57 + 0.78) * 0.4, 0, -Math.cos(i * 1.57 + 0.78) * 0.4); lander.add(leg)
    }
    lander.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.8), mat(0xdedfe6, 0.5)), 0, 0.48, 0))
    lander.position.y = nozzleY - 0.6; g.add(lander)
  }
  g.traverse((o) => { o.castShadow = true })
  return g
}
