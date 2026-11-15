import * as THREE from 'three'
import type { Rng } from '../engine/rng'
import { PLANET } from '../data/planet'

export interface Stage { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; el: HTMLElement }

/** Monta un renderer en `el`; `setup` arma la escena y devuelve el tick por frame. Devuelve el limpiador. */
export function mountStage(el: HTMLElement, setup: (s: Stage) => ((dt: number) => void) & { cleanup?: () => void }, logDepth = false): () => void {
  // logDepth: escenas de metros a cientos de miles de km (Tierra–Luna) sin z-fighting.
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: logDepth })
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
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1)
    // Escena oculta (p. ej. el juego mientras se usa GMAT): no dibujar.
    if (!el.isConnected || el.offsetWidth === 0) return
    tick(dt); renderer.render(scene, camera)
  })
  return () => {
    renderer.setAnimationLoop(null); ro.disconnect(); tick.cleanup?.()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) { const m = (x as THREE.MeshStandardMaterial).map; if (m && !m.userData.shared) m.dispose(); x.dispose() }
    })
    renderer.dispose()
    renderer.forceContextLoss() // libera de verdad la memoria de video (si no, los contextos se acumulan)
    renderer.domElement.remove()
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

const TEX = `${import.meta.env.BASE_URL}cesium/Assets/Textures/`

/**
 * Cielo real: el mapa de estrellas Tycho-2 que trae Cesium (cubo en ejes ecuatoriales, con la Vía Láctea y las
 * constelaciones donde están de verdad). Va pegado a la cámara y al fondo de todo. El cubo se muestrea con la
 * dirección tal cual, como hace Cesium; `scene.background` de three invierte X y dejaría el cielo en espejo.
 * La matriz lleva el "arriba" del mundo al polo sur de la eclíptica, que es el cenit del polo sur lunar: el Sol
 * y la Tierra quedan cerca del horizonte, como allá. Si las imágenes no cargan, el fondo queda negro.
 */
export function realSky(gain = 1.5): THREE.Mesh {
  const tex = new THREE.CubeTextureLoader().load(['px', 'mx', 'py', 'my', 'pz', 'mz'].map((f) => `${TEX}SkyBox/tycho2t3_80_${f}.jpg`))
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    uniforms: {
      sky: { value: tex }, gain: { value: gain },
      // Columnas = ejes X, Y, Z del mundo vistos en el cielo ecuatorial (Y = polo sur de la eclíptica).
      toSky: { value: new THREE.Matrix3().set(1, 0, 0, 0, 0.3978, 0.9175, 0, -0.9175, 0.3978) },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 ); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform samplerCube sky; uniform float gain; uniform mat3 toSky; varying vec3 vDir;
      void main() { gl_FragColor = vec4( textureCube( sky, toSky * normalize( vDir ) ).rgb * gain, 1.0 );
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat)
  mesh.frustumCulled = false; mesh.renderOrder = -1000
  mesh.userData.dispose = () => tex.dispose()
  return mesh
}

/** Cambia la textura del material por el cuerpo real: Luna (color LROC + relieve LOLA, tools/moon/build_moon.py)
 *  o Marte con `dir = 'mars'` (Viking + HRSC/MOLA, tools/mars/build_mars.py). Si los archivos no cargan, se queda la procedural. */
export function realMoon(mat: THREE.MeshStandardMaterial, dir = 'moon'): void {
  const base = `${import.meta.env.BASE_URL}${dir}/`
  const color = (t: THREE.Texture) => { mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true }
  const bump = (t: THREE.Texture) => { mat.bumpMap = t; mat.bumpScale = 3; mat.needsUpdate = true }
  // Ya cargada (precarga o una escena anterior): se pone al instante, sin el cuadro de color liso.
  const c = texReady.get(base + 'color.jpg'), h = texReady.get(base + 'height.png')
  if (c) color(c); else void loadTex(base + 'color.jpg', true).then(color)
  if (h) bump(h); else void loadTex(base + 'height.png', false).then(bump)
}

// Texturas de los cuerpos compartidas por todas las escenas: se decodifican una sola vez.
const texCache = new Map<string, Promise<THREE.Texture>>()
const texReady = new Map<string, THREE.Texture>()
function loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
  if (!texCache.has(url)) {
    texCache.set(url, new Promise((resolve, reject) => new THREE.TextureLoader().load(url, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.userData.shared = true // mountStage no la libera al desmontar
      texReady.set(url, t); resolve(t)
    }, undefined, reject)))
  }
  return texCache.get(url)!
}
/** Radios medios volumétricos oficiales (km), NASA Planetary Fact Sheet. Toda escena que muestre dos cuerpos juntos los usa. */
export const RADIUS_KM = { earth: 6371.0, moon: 1737.4, mars: 3389.5 } as const

// Tierra: mosaico Natural Earth II que trae Cesium (public/cesium, TMS geodésico, nivel 2 = 8×4 teselas de 256 px).
let earthTex: Promise<THREE.Texture> | null = null
let earthReady: THREE.Texture | null = null
function loadEarth(): Promise<THREE.Texture> {
  earthTex ??= new Promise((resolve, reject) => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024
    const g = c.getContext('2d')!
    const base = `${import.meta.env.BASE_URL}cesium/Assets/Textures/NaturalEarthII/2`
    const jobs: Promise<void>[] = []
    for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) {
      jobs.push(new Promise((ok, bad) => {
        const im = new Image(); im.onload = () => { g.drawImage(im, x * 256, (3 - y) * 256); ok() }; im.onerror = bad // TMS: y = 0 es el sur
        im.src = `${base}/${x}/${y}.jpg`
      }))
    }
    Promise.all(jobs).then(() => {
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true
      earthReady = t; resolve(t)
    }, reject)
  })
  return earthTex
}

/** La Tierra con su imagen real y un halo de atmósfera. `r` en unidades de escena. */
export function earthMesh(r: number): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b74d6, roughness: 0.75, metalness: 0 })
  const put = (t: THREE.Texture) => { mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true }
  if (earthReady) put(earthReady); else void loadEarth().then(put).catch(() => {})
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), mat))
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.035, 48, 32), new THREE.MeshBasicMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false })))
  g.rotation.z = 0.41 // inclinación del eje (23.4°)
  return g
}

/** Precarga el globo de la Luna o de Marte (portada y al elegir planeta) para que ninguna escena parpadee. */
export function preloadBody(dir: 'moon' | 'mars'): void {
  const base = `${import.meta.env.BASE_URL}${dir}/`
  void loadTex(base + 'color.jpg', true).catch(() => {}); void loadTex(base + 'height.png', false).catch(() => {})
  void loadEarth().catch(() => {})
}
const bodyReady = (dir: string) => texReady.has(`${import.meta.env.BASE_URL}${dir}/color.jpg`)

/** Material del cuerpo de la partida (PLANET): la Luna o Marte, con los datos reales encima en cuanto cargan. */
export function bodyMaterial(rng: Rng): THREE.MeshStandardMaterial {
  const mars = PLANET.id === 'mars'
  // Sin textura real, Marte queda naranja liso y la Luna con cráteres procedurales.
  // (si la textura real ya está lista no se pinta la procedural: cuesta y se vería un instante)
  const mat = new THREE.MeshStandardMaterial(mars || bodyReady('moon') ? { color: 0xc07048, roughness: 1 } : { map: moonTexture(rng), roughness: 1 })
  realMoon(mat, mars ? 'mars' : 'moon')
  return mat
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
