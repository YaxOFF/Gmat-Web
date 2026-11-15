import * as THREE from 'three'
import type { Rng } from '../engine/rng'

export interface Stage { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; el: HTMLElement }

/** Monta un renderer en `el`; `setup` arma la escena y devuelve el tick por frame. Devuelve el limpiador. */
export function mountStage(el: HTMLElement, setup: (s: Stage) => ((dt: number) => void) & { cleanup?: () => void }): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  el.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 8000)
  const s: Stage = { scene, camera, renderer, el }
  const fit = () => {
    const w = el.clientWidth, h = Math.max(el.clientHeight, 1)
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(fit); ro.observe(el); fit()
  const tick = setup(s)
  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => { tick(Math.min(clock.getDelta(), 0.1)); renderer.render(scene, camera) })
  return () => {
    renderer.setAnimationLoop(null); ro.disconnect(); tick.cleanup?.()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose() }
    })
    renderer.dispose(); renderer.domElement.remove()
  }
}

/** Campo de estrellas lejano. */
export function stars(rng: Rng, n = 2500, r = 3000): THREE.Points {
  const p = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1, t = rng() * Math.PI * 2, q = Math.sqrt(1 - u * u)
    p.set([r * q * Math.cos(t), r * u, r * q * Math.sin(t)], i * 3)
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }))
}

/** Textura equirectangular de Luna con cráteres aleatorios (sembrada). */
export function moonTexture(rng: Rng): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#8d8f97'; g.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 14; i++) { // mares
    g.fillStyle = `rgba(40,42,52,${0.25 + rng() * 0.3})`
    g.beginPath(); g.ellipse(rng() * 1024, 120 + rng() * 270, 40 + rng() * 110, 30 + rng() * 70, rng() * 3, 0, 7); g.fill()
  }
  drawCraters(g, rng, 1024, 512, 900, 26)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Ubica un objeto y lo devuelve (para armar grupos en una línea). */
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T { o.position.set(x, y, z); return o }

/** Cráteres con borde iluminado: el mismo trazo para la Luna 3D y el mapa polar 2D. */
export function drawCraters(g: CanvasRenderingContext2D, rng: Rng, w: number, h: number, n: number, rmax: number) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = Math.pow(rng(), 3) * rmax + 1.5
    g.fillStyle = `rgba(20,20,28,${0.15 + rng() * 0.25})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    g.strokeStyle = `rgba(230,230,240,${0.1 + rng() * 0.25})`; g.lineWidth = Math.max(1, r / 6)
    g.beginPath(); g.arc(x - r * 0.15, y - r * 0.15, r, 0, 7); g.stroke()
  }
}

let poleCache: string | null = null
/** Imagen del casquete polar sur con el estilo de la Luna 3D (mismo color base y cráteres), iluminada de lado. */
export function southPoleImage(rng: Rng): string {
  if (poleCache) return poleCache
  const S = 600, c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d')!
  g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.clip()
  g.fillStyle = '#8d8f97'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(40,42,52,${0.18 + rng() * 0.2})`
    g.beginPath(); g.ellipse(rng() * S, rng() * S, 40 + rng() * 90, 30 + rng() * 60, rng() * 3, 0, 7); g.fill()
  }
  drawCraters(g, rng, S, S, 280, 24)
  // Sol rasante: la luz entra por la izquierda y el polo queda en penumbra.
  const lit = g.createLinearGradient(0, 0, S, S * 0.4)
  lit.addColorStop(0, 'rgba(255,248,230,0.18)'); lit.addColorStop(0.55, 'rgba(0,0,0,0)'); lit.addColorStop(1, 'rgba(5,8,18,0.55)')
  g.fillStyle = lit; g.fillRect(0, 0, S, S)
  const rim = g.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S / 2)
  rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(5,8,18,0.6)')
  g.fillStyle = rim; g.fillRect(0, 0, S, S)
  g.restore()
  poleCache = c.toDataURL()
  return poleCache
}
