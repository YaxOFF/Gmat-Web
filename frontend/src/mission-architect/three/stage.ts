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
  renderer.setAnimationLoop(() => { tick(Math.min(clock.getDelta(), 0.05)); renderer.render(scene, camera) })
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
  for (let i = 0; i < 900; i++) {
    const x = rng() * 1024, y = rng() * 512, r = Math.pow(rng(), 3) * 26 + 1.5
    g.fillStyle = `rgba(20,20,28,${0.15 + rng() * 0.25})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    g.strokeStyle = `rgba(230,230,240,${0.1 + rng() * 0.25})`; g.lineWidth = Math.max(1, r / 6)
    g.beginPath(); g.arc(x - r * 0.15, y - r * 0.15, r, 0, 7); g.stroke()
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
