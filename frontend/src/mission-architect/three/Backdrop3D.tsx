import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { SceneId } from '../data/chars'
import { mulberry32 } from '../engine/rng'
import { buildSpacecraft } from './spacecraft'
import { at, mountStage, moonTexture, stars } from './stage'

// Fondos 3D de los diálogos. Las escenas espaciales usan la misma Luna (semilla 7) y el mismo modelo de
// Selene que la vista de órbita y el mapeo, para que todo el juego se vea coherente.

const SELENE = ['bus_medium', 'panel_gaas', 'hga', 'tank_s', 'neutron', 'camera', 'radiator']
const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra })

/** Contenido de la pantalla grande de cada sala, dibujado en un canvas. */
function screen(kind: SceneId): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#0c1426'; g.fillRect(0, 0, 1024, 512)
  g.strokeStyle = '#1d2a48'; g.lineWidth = 1
  for (let x = 0; x < 1024; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke() }
  for (let y = 0; y < 512; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke() }
  g.font = 'bold 30px Segoe UI, sans-serif'; g.fillStyle = '#5cc8f0'
  const moon = (x: number, y: number, r: number) => {
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    grd.addColorStop(0, '#d9d6cc'); grd.addColorStop(1, '#5d6070'); g.fillStyle = grd
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  }
  if (kind === 'control' || kind === 'boardroom') {
    moon(300, 260, 150)
    g.strokeStyle = '#5cc8f0'; g.lineWidth = 4; g.setLineDash([14, 10])
    g.beginPath(); g.ellipse(300, 260, 230, 80, -0.3, 0, 7); g.stroke(); g.setLineDash([])
    g.fillStyle = '#5cc8f0'; g.fillText(kind === 'control' ? 'SELENE · LIVE TELEMETRY' : 'WATER ON THE MOON', 560, 90)
    g.font = '24px Consolas, monospace'; g.fillStyle = '#a9c1d3'
    const rows = kind === 'control' ? ['ALT   100.2 km', 'VEL   1.63 km/s', 'BATT  96 %', 'LINK  DSN MADRID'] : ['PHASE 1  ORBITER', 'PHASE 2  ROVER', 'TARGET   SOUTH POLE', 'BUDGET   TIGHT']
    rows.forEach((r, i) => g.fillText(r, 560, 160 + i * 52))
  } else if (kind === 'lab') {
    g.fillStyle = '#5cc8f0'; g.fillText('NEUTRON COUNTS · SOUTH POLE', 40, 60)
    g.strokeStyle = '#a9c1d3'; g.lineWidth = 4; g.beginPath()
    for (let x = 0; x <= 940; x += 8) g.lineTo(40 + x, 380 - 60 * Math.sin(x / 70) - (Math.abs(x - 600) < 80 ? 160 * Math.cos((x - 600) / 51) : 0))
    g.stroke()
    g.fillStyle = '#ef6f6c'; g.fillText('▲ H spike', 560, 160)
  } else if (kind === 'review') {
    g.fillStyle = '#5cc8f0'; g.fillText('DESIGN REVIEW · CHECKLIST', 40, 60)
    g.font = '28px Segoe UI, sans-serif'
    ;['Mass margin', 'Power margin', 'Budget reserve', 'Science traceability', 'Data vs downlink'].forEach((r, i) => {
      g.fillStyle = i === 2 ? '#ffa94d' : '#62d394'; g.fillRect(40, 110 + i * 72, 26, 26)
      g.fillStyle = '#e8ecf6'; g.fillText(r, 90, 133 + i * 72)
    })
  } else {
    g.fillStyle = '#5cc8f0'; g.fillText('CLEAN ROOM · SELENE INTEGRATION', 40, 60)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

function room(scene: THREE.Scene, kind: SceneId) {
  const white = kind === 'hangar'
  scene.background = new THREE.Color(white ? 0x1a2236 : 0x0b1120)
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x0a0d16, white ? 1.1 : 0.55))
  scene.add(at(new THREE.Mesh(new THREE.PlaneGeometry(60, 40), mat(white ? 0x8d96a8 : 0x141b2e, { metalness: 0.3, roughness: 0.35 })), 0, 0, 0).rotateX(-Math.PI / 2))
  scene.add(at(new THREE.Mesh(new THREE.PlaneGeometry(60, 20), mat(white ? 0xd8dde6 : 0x18223a)), 0, 10, -10))
  // Tiras de luz en el techo.
  for (let i = -2; i <= 2; i++) scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff4dc })), i * 8, 12, -4))
  const key = new THREE.SpotLight(0xfff1d6, 160, 60, 0.7, 0.6, 1.2); key.position.set(4, 14, 8); key.target.position.set(0, 2, -6); scene.add(key, key.target)
  if (kind !== 'hangar') {
    const scr = at(new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: screen(kind) })), 0, 7.5, -9.9)
    scene.add(scr)
    scene.add(at(new THREE.Mesh(new THREE.PlaneGeometry(16.6, 8.6), mat(0x05070d)), 0, 7.5, -9.95))
    const glow = new THREE.PointLight(0xa9c1d3, 20, 18); glow.position.set(0, 7, -7); scene.add(glow)
  }
  // Mobiliario por sala.
  if (kind === 'boardroom') scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 4), mat(0x3b2c22, { roughness: 0.4 })), 0, 2.2, -2))
  if (kind === 'review') {
    scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 2.4), mat(0x2b3550)), 0, 2.2, -4))
    for (const x of [-5, 0, 5]) scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.1), new THREE.MeshBasicMaterial({ color: 0xa9c1d3 })), x, 3, -4.4))
  }
  if (kind === 'control' || kind === 'lab') {
    for (let r = 0; r < 2; r++) for (let i = -2; i <= 2; i++) {
      const z = -3 + r * 3.5
      scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 1.4), mat(0x222c45)), i * 4.2, 0.8, z))
      scene.add(at(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ color: (i + r) % 2 ? 0xa9c1d3 : 0x5cc8f0 })), i * 4.2, 2.2, z - 0.2).rotateX(-0.2))
    }
  }
  if (kind === 'hangar') {
    const sc = buildSpacecraft(SELENE); sc.scale.setScalar(1.6); sc.position.set(0, 4.2, -4); scene.add(sc)
    scene.add(at(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1, 32), mat(0x6e7688, { metalness: 0.6 })), 0, 0.5, -4))
    for (const x of [-8, 8]) { const s = new THREE.SpotLight(0xffffff, 120, 40, 0.5, 0.5); s.position.set(x, 13, 2); s.target = sc; scene.add(s) }
    return sc
  }
  return null
}

export function Backdrop3D({ id }: { id: SceneId }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => mountStage(host.current!, ({ scene, camera }) => {
    const rng = mulberry32(7)
    let spin: THREE.Object3D | null = null
    let orbiter: THREE.Object3D | null = null
    const space = ['void', 'space', 'moonOrbit', 'crater', 'launchpad'].includes(id)
    if (space) {
      scene.background = new THREE.Color(id === 'launchpad' ? 0x14223f : 0x03050b)
      scene.add(stars(rng, id === 'void' ? 900 : 2500, 900))
      scene.add(new THREE.AmbientLight(0x3a4260, 0.6))
      const sun = new THREE.DirectionalLight(0xfff3e0, 2.6); sun.position.set(8, 3, 4); scene.add(sun)
    }
    if (id === 'space' || id === 'moonOrbit') {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), new THREE.MeshStandardMaterial({ map: moonTexture(mulberry32(7)), roughness: 1 }))
      moon.position.set(id === 'space' ? 9 : 0, id === 'space' ? 2 : -11.5, id === 'space' ? -26 : -4); scene.add(moon); spin = moon
      if (id === 'moonOrbit') {
        const sc = buildSpacecraft(SELENE); sc.scale.setScalar(0.35); scene.add(sc); orbiter = sc
      } else {
        const earth = new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 32), new THREE.MeshStandardMaterial({ color: 0x3b74d6, emissive: 0x08183a, roughness: 0.7 }))
        earth.position.set(-14, -3, -30); scene.add(earth)
      }
    }
    if (id === 'crater') {
      const geo = new THREE.PlaneGeometry(200, 200, 120, 120); geo.rotateX(-Math.PI / 2)
      const p = geo.attributes.position
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, Math.sin(x * 0.08) * 1.2 + Math.cos(z * 0.11) * 1.4 + (Math.hypot(x, z + 40) < 30 ? -4 + Math.hypot(x, z + 40) / 7.5 : 0)) }
      geo.computeVertexNormals()
      scene.add(new THREE.Mesh(geo, mat(0x7a7c86, { roughness: 1 })))
      const earth = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 32), new THREE.MeshStandardMaterial({ color: 0x3b74d6, emissive: 0x0a1c44 }))
      earth.position.set(-30, 12, -90); scene.add(earth)
    }
    if (id === 'launchpad') {
      scene.add(at(new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(0x1c2233)), 0, 0, 0).rotateX(-Math.PI / 2))
      const body = at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 13, 24), mat(0xeef0f5)), 2, 6.5, -8)
      scene.add(body, at(new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 24), mat(0xd9a441, { metalness: 0.6 })), 2, 14.3, -8))
      scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 18, 1.2), mat(0x8a3a2e, { wireframe: true })), -1, 9, -8))
      const flood = new THREE.SpotLight(0xffe2b0, 200, 50, 0.5, 0.6); flood.position.set(10, 4, 4); flood.target = body; scene.add(flood)
    }
    if (!space) spin = room(scene, id)

    const base = space ? new THREE.Vector3(0, 2, 14) : new THREE.Vector3(0, 6, 16)
    const look = space ? new THREE.Vector3(0, 0, -6) : new THREE.Vector3(0, 5, -6)
    if (id === 'crater') { base.set(0, 6, 30); look.set(0, 2, -30) }
    if (id === 'launchpad') { base.set(-4, 4, 14); look.set(1, 7, -8) }
    let t = 0
    return (dt) => {
      t += dt
      if (spin) spin.rotation.y += dt * (id === 'hangar' ? 0.25 : 0.02)
      if (orbiter) {
        const a = t * 0.18 - 1
        orbiter.position.set(Math.cos(a) * 12, -1 + Math.sin(a) * 2.2, -4 + Math.sin(a) * 6)
        orbiter.lookAt(0, -11.5, -4)
      }
      camera.position.set(base.x + Math.sin(t * 0.1) * 1.2, base.y + Math.sin(t * 0.07) * 0.4, base.z)
      camera.lookAt(look)
    }
  }), [id])
  return <div ref={host} className="view3d backdrop" />
}
