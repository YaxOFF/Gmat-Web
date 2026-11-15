import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ROCKS, type RockKind } from '../data/samples'
import { mulberry32, type Rng } from '../engine/rng'
import { mountStage } from './stage'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Núcleo de roca perforado (como los de Perseverance: ~1.3 cm × 6 cm). La superficie se pinta por tipo de roca en
 * un canvas (color + relieve), así el mismo dibujo sirve para el modelo 3D y para las miniaturas del informe.
 */
const W = 512, H = 256 // el ancho envuelve el cilindro; el alto es su largo

export function coreCanvas(kind: RockKind, seed: number): { color: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const { look } = ROCKS[kind]
  const r = mulberry32(seed * 7919 + kind.length)
  const color = document.createElement('canvas'), bump = document.createElement('canvas')
  color.width = bump.width = W; color.height = bump.height = H
  const g = color.getContext('2d')!, b = bump.getContext('2d')!
  g.fillStyle = look.base; g.fillRect(0, 0, W, H)
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H)
  // Grano fino de toda roca.
  speckle(g, b, r, 5000, look.dark, look.accent)
  // Dibuja en las dos capas: color y relieve (blanco = alto).
  const both = (fn: (c: CanvasRenderingContext2D, isBump: boolean) => void) => { fn(g, false); fn(b, true) }
  switch (look.pattern) {
    case 'vesicles': // basalto: burbujas de gas, oscuras y hundidas, algunas con sal clara adentro
      for (let i = 0; i < 160; i++) {
        const x = r() * W, y = r() * H, rad = 1.5 + r() ** 2 * 7, salt = r() < 0.25
        both((c, bp) => { c.fillStyle = bp ? '#303030' : salt ? look.accent : look.dark; disc(c, x, y, rad) })
      }
      break
    case 'grains': // olivino: cristales verdes poligonales, en relieve
      for (let i = 0; i < 260; i++) {
        const x = r() * W, y = r() * H, s = 3 + r() * 8, a = r() * Math.PI
        const tone = r() < 0.75 ? look.accent : '#3a4a22'
        both((c, bp) => { c.fillStyle = bp ? '#c0c0c0' : tone; poly(c, x, y, s, a, 5 + Math.floor(r() * 2)) })
      }
      break
    case 'layers': // lodolita: láminas finas de lago, alternando tono
      layers(g, b, r, look.base, look.accent, look.dark, 3, 9)
      break
    case 'veins': // sulfato: láminas + vetas blancas de sulfato de calcio que cortan la roca
      layers(g, b, r, look.base, look.base, look.dark, 5, 14)
      for (let i = 0; i < 9; i++) {
        let x = r() * W, y = 0
        const dx = (r() - 0.5) * 3
        both((c, bp) => {
          c.strokeStyle = bp ? '#e0e0e0' : look.accent; c.lineWidth = 1.5 + r() * 3; c.beginPath(); c.moveTo(x, y)
          for (let k = 0; k < 24; k++) { y += H / 24; x += dx * 10 + (r() - 0.5) * 14; c.lineTo(x, y) }
          c.stroke()
        })
      }
      break
    case 'nodules': // carbonato: nódulos claros redondeados
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H, rad = 3 + r() * 9
        both((c, bp) => { c.fillStyle = bp ? '#b8b8b8' : look.accent; disc(c, x, y, rad) })
      }
      break
    case 'opal': // sílice opalina: lisa, nacarada, con poros
      for (let i = 0; i < 40; i++) {
        const grd = g.createRadialGradient(r() * W, r() * H, 0, r() * W, r() * H, 30 + r() * 60)
        grd.addColorStop(0, '#ffffff55'); grd.addColorStop(1, '#ffffff00'); g.fillStyle = grd; g.fillRect(0, 0, W, H)
      }
      for (let i = 0; i < 120; i++) { const x = r() * W, y = r() * H; both((c, bp) => { c.fillStyle = bp ? '#505050' : look.dark; disc(c, x, y, 0.8 + r() * 2) }) }
      break
    case 'crystals': // azufre: esquirlas amarillas angulosas
      for (let i = 0; i < 140; i++) {
        const x = r() * W, y = r() * H, s = 4 + r() * 12, a = r() * Math.PI
        both((c, bp) => { c.fillStyle = bp ? '#f0f0f0' : r() < 0.7 ? look.accent : '#fff7a8'; poly(c, x, y, s, a, 3 + Math.floor(r() * 2)) })
      }
      break
    case 'spots': // "manchas de leopardo": halo claro con borde oscuro (fosfato y sulfuro de hierro)
      layers(g, b, r, look.base, '#b05a3e', '#7a3424', 6, 16)
      for (let i = 0; i < 70; i++) {
        const x = r() * W, y = r() * H, rad = 3 + r() * 6
        both((c, bp) => {
          c.fillStyle = bp ? '#606060' : look.dark; disc(c, x, y, rad + 1.6)
          c.fillStyle = bp ? '#a0a0a0' : look.accent; disc(c, x, y, rad)
        })
      }
      break
    case 'powder': // polvo: casi sin estructura
      speckle(g, b, r, 9000, look.dark, look.accent)
      break
  }
  return { color, bump }
}

function speckle(g: CanvasRenderingContext2D, b: CanvasRenderingContext2D, r: Rng, n: number, dark: string, light: string) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, s = 0.6 + r() * 1.6, up = r() < 0.5
    g.fillStyle = up ? light : dark; g.globalAlpha = 0.18 + r() * 0.25; g.fillRect(x, y, s, s)
    b.fillStyle = up ? '#a0a0a0' : '#606060'; b.globalAlpha = 0.5; b.fillRect(x, y, s, s)
  }
  g.globalAlpha = b.globalAlpha = 1
}

function layers(g: CanvasRenderingContext2D, b: CanvasRenderingContext2D, r: Rng, base: string, light: string, dark: string, min: number, max: number) {
  for (let y = 0; y < H;) {
    const h = min + r() * (max - min), t = r()
    g.fillStyle = t < 0.33 ? base : t < 0.66 ? light : dark; g.globalAlpha = 0.55; g.fillRect(0, y, W, h)
    b.fillStyle = t < 0.5 ? '#909090' : '#707070'; b.fillRect(0, y, W, h)
    y += h
  }
  g.globalAlpha = 1
}

const disc = (c: CanvasRenderingContext2D, x: number, y: number, rad: number) => { c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill() }
function poly(c: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, n: number) {
  c.beginPath()
  for (let i = 0; i < n; i++) { const t = a + (i / n) * Math.PI * 2; c.lineTo(x + Math.cos(t) * s, y + Math.sin(t) * s * 0.7) }
  c.closePath(); c.fill()
}

/** Etiqueta impresa del tubo (banda blanca alrededor del vidrio). */
function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 512, 64)
  g.fillStyle = '#1b2240'; g.font = 'bold 26px Consolas, monospace'; g.fillText(text.toUpperCase().slice(0, 30), 14, 42)
  g.fillStyle = '#ef6f6c'; g.fillRect(470, 14, 28, 36)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping
  return t
}

/**
 * Tubo de muestra: vidrio con el núcleo adentro, fondo redondeado, banda con etiqueta y tapa de titanio con anillo
 * azul anodizado. `userData.cap` es la tapa (la animación la baja al sellar); `userData.open` = altura abierta.
 */
export function buildTube(kind: RockKind, seed: number, label: string): THREE.Group {
  const g = new THREE.Group()
  const { color, bump } = coreCanvas(kind, seed)
  const map = new THREE.CanvasTexture(color); map.colorSpace = THREE.SRGBColorSpace
  const coreMat = new THREE.MeshStandardMaterial({ map, bumpMap: new THREE.CanvasTexture(bump), bumpScale: 2.5, roughness: kind === 'silica' ? 0.45 : 0.9 })
  // Núcleo con la boca rota (irregular), apoyado en el fondo del tubo.
  const geo = new THREE.CylinderGeometry(0.4, 0.4, 2.6, 48, 16)
  const pos = geo.attributes.position, rr = mulberry32(seed)
  const jag = Array.from({ length: 49 }, () => rr())
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i)
    if (y > 1.25) pos.setY(i, y - jag[Math.round(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 48)] * 0.3 * Math.min(1, Math.hypot(x, z) / 0.4 + 0.2))
  }
  geo.computeVertexNormals()
  const core = new THREE.Mesh(geo, coreMat); core.position.y = -0.25; g.add(core)
  // Vidrio: cilindro abierto + media esfera abajo. Brillo de entorno (RoomEnvironment) para que se lea como vidrio.
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false })
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.2, 64, 1, true), glass); wall.position.y = 0; g.add(wall)
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass); bottom.position.y = -1.6; g.add(bottom)
  // Banda con la etiqueta (deja ver el núcleo arriba y abajo).
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.505, 0.505, 0.42, 64, 1, true, -Math.PI * 0.55, Math.PI * 1.1), new THREE.MeshStandardMaterial({ map: labelTexture(label), roughness: 0.7, side: THREE.DoubleSide }))
  band.position.y = 0.55; g.add(band)
  // Tapa de titanio: cuerpo, estrías y anillo azul anodizado.
  const ti = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.28 })
  const cap = new THREE.Group()
  cap.add(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.55, 48), ti))
  for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.018, 8, 48), ti); r.rotation.x = Math.PI / 2; r.position.y = -0.18 + k * 0.12; cap.add(r) }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.575, 0.575, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0x2f6bff, metalness: 0.9, roughness: 0.25, emissive: 0x0a1a55 }))
  ring.position.y = 0.2; cap.add(ring)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 32), ti); knob.position.y = 0.36; cap.add(knob)
  cap.position.y = 1.85; g.add(cap)
  g.userData = { cap, open: 2.9, closed: 1.85 }
  return g
}

/** Miniatura plana del tubo (listas e informe): vidrio redondeado con el núcleo adentro y tapa metálica. */
export function tubeImage(kind: RockKind, seed: number): string {
  const c = document.createElement('canvas'); c.width = 360; c.height = 84
  const g = c.getContext('2d')!
  const core = coreCanvas(kind, seed).color
  // Vidrio
  g.fillStyle = '#cfe3ff22'; g.strokeStyle = '#cfe3ffaa'; g.lineWidth = 2
  g.beginPath(); g.roundRect(6, 12, 290, 60, 30); g.fill(); g.stroke()
  // Núcleo adentro
  g.save(); g.beginPath(); g.roundRect(16, 20, 250, 44, 22); g.clip(); g.drawImage(core, 16, 20, 250, 44)
  const sh = g.createLinearGradient(0, 20, 0, 64); sh.addColorStop(0, '#ffffff55'); sh.addColorStop(0.45, '#ffffff00'); sh.addColorStop(1, '#00000088')
  g.fillStyle = sh; g.fillRect(16, 20, 250, 44); g.restore()
  // Reflejo del vidrio
  g.fillStyle = '#ffffff40'; g.beginPath(); g.roundRect(30, 17, 230, 6, 3); g.fill()
  // Tapa de titanio con anillo azul
  const ti = g.createLinearGradient(0, 8, 0, 76); ti.addColorStop(0, '#f2f4f8'); ti.addColorStop(0.5, '#9ea4b0'); ti.addColorStop(1, '#5d636e')
  g.fillStyle = ti; g.beginPath(); g.roundRect(288, 8, 58, 68, 8); g.fill()
  g.fillStyle = '#2f6bff'; g.fillRect(328, 8, 7, 68)
  g.fillStyle = '#00000030'; for (let k = 0; k < 4; k++) g.fillRect(296 + k * 7, 8, 2, 68)
  return c.toDataURL('image/png')
}

/** Miniatura del tubo para listas e informe. */
export function CoreThumb({ kind, seed }: { kind: RockKind; seed: number }) {
  const src = useMemo(() => tubeImage(kind, seed), [kind, seed])
  return <img className="core-thumb tube" src={src} alt={ROCKS[kind].name} title={ROCKS[kind].name} />
}

/** Libera geometrías, materiales y texturas propias de un objeto que sale de la escena. */
function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh
    m.geometry?.dispose()
    for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
      const sm = mat as THREE.MeshStandardMaterial
      sm.map?.dispose(); sm.bumpMap?.dispose(); mat.dispose()
    }
  })
}

/**
 * Visor 3D del tubo: un solo renderer que vive todo el rato (el rover lo monta oculto al empezar). Cambiar de
 * núcleo solo cambia el tubo; los sombreadores se compilan al montar con un tubo de prueba, así sellar o
 * perforar no da tirones. Al sellar, la tapa baja girando.
 */
export function CoreSample({ kind, seed, sealed = false, label }: { kind: RockKind | null; seed: number; sealed?: boolean; label?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const want = useRef({ kind, seed, sealed, label })
  useEffect(() => { want.current = { kind, seed, sealed, label } })
  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer }) => {
    const pm = new THREE.PMREMGenerator(renderer)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.background = new THREE.Color(0x0b1020)
    scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x201810, 0.6))
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(3, 4, 5); scene.add(key)
    camera.position.set(0, 0.2, 4.1); camera.lookAt(0, 0, 0)
    let tube: THREE.Group | null = null, shown = ''
    const place = (k: RockKind, sd: number, lb: string, closed: boolean) => {
      if (tube) { scene.remove(tube); disposeTree(tube) }
      tube = buildTube(k, sd, lb); tube.rotation.z = Math.PI / 2.3; scene.add(tube)
      ;(tube.userData.cap as THREE.Group).position.y = closed ? tube.userData.closed : tube.userData.open
    }
    // Precalentado: compila los programas de vidrio, titanio y roca antes de que haga falta.
    place('basalt', 1, 'warm-up', false); renderer.compile(scene, camera)
    return (dt: number) => {
      const w = want.current
      const id = `${w.kind}:${w.seed}:${w.label ?? ''}`
      if (w.kind && id !== shown) { place(w.kind, w.seed, w.label ?? `${ROCKS[w.kind].name} · #${w.seed % 1000}`, w.sealed); shown = id }
      if (!tube) return
      tube.rotation.y += dt * 0.6
      const cap = tube.userData.cap as THREE.Group, target = w.sealed ? tube.userData.closed : tube.userData.open
      cap.position.y += (target - cap.position.y) * (1 - Math.exp(-dt * 6))
      if (w.sealed && Math.abs(target - cap.position.y) > 0.02) cap.rotation.y += dt * 8
    }
  }), [])
  return <div ref={host} className="core-view" />
}
