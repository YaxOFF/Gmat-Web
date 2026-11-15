import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { PlanetId } from '../data/planet'
import { mulberry32, type Rng } from '../engine/rng'
import { earthMesh, mountStage, moonTexture, RADIUS_KM, realMoon } from './stage'

/**
 * Fondo de la portada: estrellas de colores, nebulosas y la Tierra, la Luna y Marte con sus tamaños reales entre sí
 * (radios medios de la NASA). Los tres están a la misma distancia de la cámara, así la comparación es honesta
 * (las distancias reales no caben en pantalla). El planeta elegido lleva un anillo; la cámara no se acerca.
 */
const R = 1.25 // radio de la Tierra en la escena
const SIZE = { earth: R, moon: (R * RADIUS_KM.moon) / RADIUS_KM.earth, mars: (R * RADIUS_KM.mars) / RADIUS_KM.earth }
const LABELS = [
  { id: 'moon', name: 'Moon', km: RADIUS_KM.moon },
  { id: 'earth', name: 'Earth', km: RADIUS_KM.earth },
  { id: 'mars', name: 'Mars', km: RADIUS_KM.mars },
] as const

export function HomeScene({ planet }: { planet: PlanetId }) {
  const host = useRef<HTMLDivElement>(null)
  const sel = useRef(planet)
  const tags = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => { sel.current = planet }, [planet])
  useEffect(() => mountStage(host.current!, ({ scene, camera, el }) => {
    const rng = mulberry32(2027)
    scene.background = new THREE.Color(0x05070f)
    scene.add(starfield(rng))
    for (const n of nebulae(rng)) scene.add(n)
    scene.add(new THREE.AmbientLight(0x2a3354, 0.55))
    const sun = new THREE.DirectionalLight(0xfff4e6, 3); sun.position.set(-6, 2.5, 6); scene.add(sun)

    // Grupo a la derecha de la pantalla; se corre según el ancho para no quedar detrás del texto.
    const group = new THREE.Group(); scene.add(group)
    const earth = earthMesh(SIZE.earth); earth.position.set(0, -0.3, 0); group.add(earth)
    const moonMat = new THREE.MeshStandardMaterial({ map: moonTexture(rng), roughness: 1 }); realMoon(moonMat, 'moon')
    const moon = new THREE.Mesh(new THREE.SphereGeometry(SIZE.moon, 64, 48), moonMat); moon.position.set(-1.85, 1.15, 0); group.add(moon)
    const marsMat = new THREE.MeshStandardMaterial({ color: 0xc07048, roughness: 1 }); realMoon(marsMat, 'mars')
    const mars = new THREE.Mesh(new THREE.SphereGeometry(SIZE.mars, 64, 48), marsMat); mars.position.set(1.95, 1.35, 0); group.add(mars)
    mars.add(new THREE.Mesh(new THREE.SphereGeometry(SIZE.mars * 1.03, 48, 32), new THREE.MeshBasicMaterial({ color: 0xe0a070, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false })))
    const bodies: Record<string, THREE.Object3D> = { earth, moon, mars }

    // Anillo del planeta elegido (mira siempre a la cámara).
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 96), new THREE.MeshBasicMaterial({ color: 0x5cc8f0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    group.add(ring)

    // Teleobjetivo (fov 28, lejos): casi sin distorsión de perspectiva, las esferas se ven redondas en los bordes.
    const DIST = 15
    camera.fov = 28; camera.updateProjectionMatrix(); camera.position.set(0, 0.2, DIST); camera.lookAt(0, 0.2, 0)
    const wp = new THREE.Vector3()
    let t = 0
    return (dt: number) => {
      t += dt
      earth.rotation.y += dt * 0.05; mars.rotation.y += dt * 0.04; moon.rotation.y += dt * 0.02
      // Mitad derecha: el grupo se alinea al borde derecho del encuadre.
      const halfW = Math.tan((camera.fov * Math.PI) / 360) * DIST * camera.aspect
      group.position.x = halfW > 4.6 ? halfW - 3.0 : halfW * 0.3
      const b = sel.current === 'mars' ? mars : moon, r = sel.current === 'mars' ? SIZE.mars : SIZE.moon
      ring.position.lerp(b.position, 1 - Math.exp(-dt * 6))
      ring.scale.setScalar(r * 1.22 * (1 + Math.sin(t * 2) * 0.012))
      ring.lookAt(camera.position)
      // Etiquetas HTML con el radio oficial debajo de cada cuerpo.
      for (const L of LABELS) {
        const tag = tags.current[L.id]; if (!tag) continue
        const o = bodies[L.id], rad = SIZE[L.id]
        o.getWorldPosition(wp); wp.y -= rad + 0.18; wp.project(camera)
        tag.style.transform = `translate(-50%, 0) translate(${((wp.x + 1) / 2) * el.clientWidth}px, ${((1 - wp.y) / 2) * el.clientHeight}px)`
        tag.classList.toggle('on', L.id === sel.current)
      }
    }
  }), [])
  return (
    <div className="home-scene" aria-hidden="true">
      <div ref={host} className="view3d" />
      {LABELS.map((L) => (
        <div key={L.id} ref={(d) => { tags.current[L.id] = d }} className="home-tag">
          <b>{L.name}</b><small>radius {L.km.toLocaleString('en-US')} km</small>
        </div>
      ))}
      <p className="home-note">Sizes to scale (NASA mean radii). Distances are not.</p>
    </div>
  )
}

/** Estrellas con tamaños y tintes variados (azuladas, blancas, amarillas, rojizas). */
function starfield(rng: Rng): THREE.Points {
  const n = 5000, p = new Float32Array(n * 3), c = new Float32Array(n * 3)
  const tints = [[0.7, 0.8, 1], [1, 1, 1], [1, 0.93, 0.78], [1, 0.75, 0.6]]
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = 60 + rng() * 40, s = Math.sqrt(1 - u * u)
    p.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3)
    const tn = tints[Math.floor(rng() * tints.length)], b = 0.35 + rng() ** 3 * 0.65
    c.set([tn[0] * b, tn[1] * b, tn[2] * b], i * 3)
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }))
}

/** Nubes de nebulosa: sprites aditivos pintados con manchas suaves en violeta, azul y rojo. */
function nebulae(rng: Rng): THREE.Sprite[] {
  const palette = [['#6a3bb0', '#2a4fae'], ['#b0406a', '#5a2d82'], ['#2d6fae', '#1a2f6a'], ['#c06a3a', '#7a2d4a']]
  return palette.map(([a, b], i) => {
    const c = document.createElement('canvas'); c.width = c.height = 512
    const g = c.getContext('2d')!
    for (let k = 0; k < 70; k++) {
      const x = 256 + (rng() - 0.5) * 300, y = 256 + (rng() - 0.5) * 220, r = 40 + rng() * 150
      const grd = g.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, (k % 2 ? a : b) + '30'); grd.addColorStop(1, (k % 2 ? a : b) + '00')
      g.fillStyle = grd; g.fillRect(0, 0, 512, 512)
    }
    // Bordes suaves: la mancha se desvanece hacia afuera (sin borde cuadrado del sprite).
    g.globalCompositeOperation = 'destination-in'
    const mask = g.createRadialGradient(256, 256, 60, 256, 256, 256); mask.addColorStop(0, '#fff'); mask.addColorStop(1, '#fff0')
    g.fillStyle = mask; g.fillRect(0, 0, 512, 512)
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }))
    const pos = [[-30, 12, -60], [40, -14, -70], [10, 25, -80], [-45, -20, -65]][i]
    s.position.set(pos[0], pos[1], pos[2]); s.scale.setScalar(55 + rng() * 30)
    return s
  })
}
