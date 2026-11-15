import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { SceneId } from '../data/chars'
import { mulberry32 } from '../engine/rng'
import { buildSpacecraft } from './spacecraft'
import { at, bodyMaterial, earthMesh, mountStage, RADIUS_KM, stars } from './stage'
import { PLANET } from '../data/planet'
import { coreCanvas } from './CoreSample'
import { ROCKS, type RockKind } from '../data/samples'

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
  if (PLANET.id === 'mars') { marsScreen(g, kind); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }
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

/** Pantallas de las salas en la campaña de Marte: espectros de minerales, núcleos de roca reales, telemetría de Ares. */
function marsScreen(g: CanvasRenderingContext2D, kind: SceneId) {
  const mars = (x: number, y: number, r: number) => {
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    grd.addColorStop(0, '#e6a070'); grd.addColorStop(0.7, '#a4532f'); grd.addColorStop(1, '#5a2a18'); g.fillStyle = grd
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    g.fillStyle = '#5a2c1c88' // mares oscuros (Syrtis, Acidalia) y casquete polar
    for (const [dx, dy, rx, ry] of [[-0.3, -0.1, 0.35, 0.18], [0.25, 0.25, 0.3, 0.14], [0.1, -0.45, 0.25, 0.1]]) { g.beginPath(); g.ellipse(x + dx * r, y + dy * r, rx * r, ry * r, 0.3, 0, 7); g.fill() }
    g.fillStyle = '#f3efe6'; g.beginPath(); g.ellipse(x, y - r * 0.9, r * 0.32, r * 0.09, 0, 0, 7); g.fill()
  }
  const core = (kind: RockKind, x: number, y: number, w: number, h: number, seed: number) => {
    g.save(); g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.clip(); g.drawImage(coreCanvas(kind, seed).color, x, y, w, h)
    const sh = g.createLinearGradient(0, y, 0, y + h); sh.addColorStop(0, '#ffffff40'); sh.addColorStop(0.5, '#ffffff00'); sh.addColorStop(1, '#00000080')
    g.fillStyle = sh; g.fillRect(x, y, w, h); g.restore()
  }
  const rows = (list: string[], x: number, y: number) => { g.font = '24px Consolas, monospace'; g.fillStyle = '#a9c1d3'; list.forEach((r, i) => g.fillText(r, x, y + i * 52)) }
  if (kind === 'control' || kind === 'boardroom') {
    mars(300, 260, 150)
    g.strokeStyle = '#5cc8f0'; g.lineWidth = 4; g.setLineDash([14, 10])
    g.beginPath(); g.ellipse(300, 260, 230, 80, -0.3, 0, 7); g.stroke(); g.setLineDash([])
    g.fillStyle = '#5cc8f0'; g.fillText(kind === 'control' ? 'ARES · LIVE TELEMETRY' : 'STONES OF MARS', 560, 90)
    rows(kind === 'control' ? ['ALT   400.1 km', 'VEL   3.36 km/s', 'DUST  τ 0.6 rising', 'LINK  DSN CANBERRA'] : ['PHASE 1  ORBITER MAP', 'PHASE 2  ROVER CORES', 'TARGET   OLD LAKES', 'THREAT   DUST STORMS'], 560, 160)
  } else if (kind === 'lab') {
    // Espectro de reflectancia con las bandas de agua de las arcillas (1.9 y 2.3 µm), como los de CRISM.
    g.fillStyle = '#5cc8f0'; g.fillText('MINERAL SPECTRA · 1.0–2.6 µm', 40, 60)
    const X = (um: number) => 40 + ((um - 1) / 1.6) * 560
    g.strokeStyle = '#a9c1d3'; g.lineWidth = 4; g.beginPath()
    for (let um = 1; um <= 2.6; um += 0.01) {
      const dip = 120 * Math.exp(-(((um - 1.92) / 0.05) ** 2)) + 70 * Math.exp(-(((um - 2.3) / 0.035) ** 2)) + 40 * Math.exp(-(((um - 1.42) / 0.04) ** 2))
      g.lineTo(X(um), 150 + (um - 1) * 40 + dip)
    }
    g.stroke()
    g.font = 'bold 22px Segoe UI, sans-serif'; g.fillStyle = '#ef6f6c'
    g.fillText('▼ water 1.9 µm', X(1.92) - 70, 360); g.fillText('▼ clay 2.3 µm', X(2.3) - 60, 300)
    g.font = '20px Consolas, monospace'; g.fillStyle = '#a9c1d3'; g.fillText('Fe/Mg smectite · Jezero delta', 40, 460)
    // Núcleos de referencia en la mesa de luz.
    g.font = 'bold 24px Segoe UI, sans-serif'; g.fillStyle = '#5cc8f0'; g.fillText('REFERENCE CORES', 660, 60)
    ;(['mudstone', 'sulfate', 'leopard', 'basalt'] as RockKind[]).forEach((k, i) => {
      core(k, 660, 90 + i * 100, 320, 48, 11 + i)
      g.font = '18px Segoe UI, sans-serif'; g.fillStyle = '#e8ecf6'; g.fillText(ROCKS[k].name, 660, 160 + i * 100)
    })
  } else if (kind === 'review') {
    g.fillStyle = '#5cc8f0'; g.fillText('DESIGN REVIEW · CHECKLIST', 40, 60)
    g.font = '28px Segoe UI, sans-serif'
    ;['Mass margin', 'Power margin', 'Budget reserve', 'Science traceability', 'Data vs downlink'].forEach((r, i) => {
      g.fillStyle = i === 2 ? '#ffa94d' : '#62d394'; g.fillRect(40, 110 + i * 72, 26, 26)
      g.fillStyle = '#e8ecf6'; g.fillText(r, 90, 133 + i * 72)
    })
    core('sulfate', 600, 330, 380, 56, 5)
    g.font = '20px Segoe UI, sans-serif'; g.fillStyle = '#a9c1d3'; g.fillText('Goal: cores like this one', 600, 420)
  } else {
    g.fillStyle = '#5cc8f0'; g.fillText('CLEAN ROOM · ARES + BUSCADOR', 40, 60)
    g.font = '22px Consolas, monospace'; g.fillStyle = '#a9c1d3'
    ;['SAMPLE TUBES   43 · STERILE', 'CORING DRILL   TESTED', 'ORGANICS SPEC  CALIBRATED'].forEach((r, i) => g.fillText(r, 40, 120 + i * 44))
    for (let i = 0; i < 7; i++) { g.fillStyle = '#c9d2de'; g.beginPath(); g.roundRect(560 + i * 60, 140, 24, 220, 12); g.fill() }
  }
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
      const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), bodyMaterial(mulberry32(7)))
      moon.position.set(0, -11.5, -4); scene.add(moon); spin = moon
      // "space": el cuerpo y la Tierra a la misma distancia de la cámara, en su proporción real (radios NASA).
      const EARTH_R = 12
      if (id === 'space') { moon.scale.setScalar((EARTH_R * RADIUS_KM[PLANET.id]) / RADIUS_KM.earth / 10); moon.position.set(13, 3, -38) }
      if (id === 'moonOrbit') {
        const sc = buildSpacecraft(SELENE); sc.scale.setScalar(0.35); scene.add(sc); orbiter = sc
      } else {
        const earth = earthMesh(EARTH_R); earth.position.set(-15, -2, -38); scene.add(earth)
      }
    }
    if (id === 'crater') {
      const geo = new THREE.PlaneGeometry(200, 200, 120, 120); geo.rotateX(-Math.PI / 2)
      const p = geo.attributes.position
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, Math.sin(x * 0.08) * 1.2 + Math.cos(z * 0.11) * 1.4 + (Math.hypot(x, z + 40) < 30 ? -4 + Math.hypot(x, z + 40) / 7.5 : 0)) }
      geo.computeVertexNormals()
      const mars = PLANET.id === 'mars'
      scene.add(new THREE.Mesh(geo, mat(mars ? 0xa05a3a : 0x7a7c86, { roughness: 1 })))
      if (mars) {
        scene.background = new THREE.Color(0xc9a27c); scene.fog = new THREE.FogExp2(0xc9a27c, 0.012)
        // Afloramiento con capas (como el frente del delta de Jezero o el monte Sharp) y bloques sueltos.
        const tones = [0x8a4e34, 0xb07a5a, 0x6e3c28, 0xc09070, 0x9a5c40]
        for (let i = 0; i < 9; i++) scene.add(at(new THREE.Mesh(new THREE.CylinderGeometry(15 - i * 1.1, 15.6 - i * 1.1, 1.6, 7), mat(tones[i % tones.length], { roughness: 1, flatShading: true })), 22, 0.8 + i * 1.6, -55))
        const r = mulberry32(3)
        for (let i = 0; i < 40; i++) {
          const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + r() * 1.4, 0), mat(r() < 0.5 ? 0x5a3424 : 0x8a5238, { roughness: 1, flatShading: true }))
          b.position.set((r() - 0.5) * 60, 0.8, -10 - r() * 50); b.rotation.set(r() * 3, r() * 3, 0); scene.add(b)
        }
      }
      const earth = earthMesh(1.7) // vista desde la Luna: ~2° de diámetro aparente
      earth.position.set(-30, 12, -90); if (!mars) scene.add(earth)
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
