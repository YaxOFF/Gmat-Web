import { useEffect, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CRATERS } from '../data/catalog'
import { PLANET } from '../data/planet'
import { mulberry32 } from '../engine/rng'
import { bodyRadiusKm, orbitElements } from '../gmat'
import { buildSpacecraft } from './spacecraft'
import { bodyMaterial, mountStage, stars } from './stage'

/** Cómo se dibuja cada sitio en modo de selección: color del pin y texto de su etiqueta. */
export interface SiteMark { color: string; text: string }

/**
 * Vista de la órbita alrededor del cuerpo (la trayectoria exacta sale de GMAT).
 * Con `onPick` es además el mapa: cada sitio es un pin con etiqueta; clic (o clic en la etiqueta) lo elige,
 * pasar el mouse lo enfoca. El globo deja de girar solo para que se pueda apuntar con calma.
 */
export function Orbit3D({ orbitId, seed = 7, highlight, targets, partIds = [], marks, onPick, onHover }: {
  orbitId: string; seed?: number; highlight?: string | null; targets?: string[]; partIds?: string[]
  marks?: Record<string, SiteMark>; onPick?: (id: string) => void; onHover?: (id: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const pins = useRef<Record<string, { dot: THREE.Mesh; ring: THREE.Mesh; hit: THREE.Mesh }>>({})
  const labels = useRef<Record<string, HTMLButtonElement | null>>({})
  const cb = useRef({ onPick, onHover })
  useEffect(() => { cb.current = { onPick, onHover } })
  const picking = !!onPick

  // Objetivos y colores: se pintan sin rearmar la escena.
  useEffect(() => {
    for (const [id, { dot, ring }] of Object.entries(pins.current)) {
      const sel = !!targets?.includes(id), foc = id === highlight
      ;(dot.material as THREE.MeshBasicMaterial).color.set(marks?.[id]?.color ?? (sel || foc ? 0x5cc8f0 : 0x38e1ff))
      dot.scale.setScalar(sel ? 1.6 : foc ? 1.35 : 1)
      ring.visible = sel || foc
      ;(ring.material as THREE.MeshBasicMaterial).color.set(sel ? 0xef6f6c : 0xffffff)
    }
  }, [targets, highlight, marks])

  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer, el }) => {
    const rng = mulberry32(seed)
    scene.add(stars(rng))
    scene.add(new THREE.AmbientLight(0x404458, picking ? 1.1 : 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(5, 0.4, 2); scene.add(sun)
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), bodyMaterial(rng))
    scene.add(globe)
    // Atmósfera tenue en Marte.
    if (PLANET.id === 'mars') scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.025, 64, 48), new THREE.MeshBasicMaterial({ color: 0xe0a070, transparent: true, opacity: 0.08, side: THREE.BackSide })))
    // Sitios en su lat/lon real. En la UV de SphereGeometry lon 0 = +x y lon +90° = −z.
    // En la Luna los cinco cráteres caben en ±6° del polo: pines chicos; en Marte están repartidos.
    const R = picking ? (PLANET.id === 'mars' ? 0.036 : 0.0075) : 0.018
    pins.current = {}
    const dir = (lat: number, lon: number) => {
      const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180
      return new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b))
    }
    for (const c of CRATERS) {
      const n = dir(c.lat, c.lon)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14), new THREE.MeshBasicMaterial({ color: marks?.[c.id]?.color ?? 0x38e1ff }))
      dot.position.copy(n).multiplyScalar(1.004); dot.userData.id = c.id
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.9, R * 2.5, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }))
      ring.position.copy(n).multiplyScalar(1.006); ring.lookAt(n.clone().multiplyScalar(2)); ring.visible = false
      // Zona de clic invisible ~3× el pin: apuntar no tiene que ser de precisión.
      const hit = new THREE.Mesh(new THREE.SphereGeometry(R * 3, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
      hit.position.copy(dot.position); hit.userData.id = c.id
      globe.add(dot, ring, hit); pins.current[c.id] = { dot, ring, hit }
    }
    // Que los sitios queden de frente: rotación que lleva su longitud media hacia la cámara (+z = lon −90°).
    if (picking) {
      const lonMid = CRATERS.reduce((s, c) => s + c.lon, 0) / CRATERS.length
      globe.rotation.y = ((-90 - lonMid) * Math.PI) / 180
    }

    // Elipse en el plano polar x–y con el periapsis hacia el polo sur.
    const e = orbitElements(orbitId)
    const a = e.sma / bodyRadiusKm(), ecc = e.ecc, w = (e.aop * Math.PI) / 180
    const at = (nu: number) => {
      const r = (a * (1 - ecc * ecc)) / (1 + ecc * Math.cos(nu))
      return new THREE.Vector3(r * Math.cos(nu + w), r * Math.sin(nu + w), 0)
    }
    const pts = Array.from({ length: 361 }, (_, i) => at((i / 360) * Math.PI * 2))
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x5cc8f0, dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: picking ? 0.45 : 1 })).computeLineDistances())
    const sc = new THREE.Group()
    const model = buildSpacecraft(partIds.length ? partIds : ['bus_medium', 'panel_gaas', 'hga', 'tank_s', 'neutron', 'camera'])
    model.remove(...model.children.filter((c) => c.position.y < -1.2)) // sin el lander en órbita
    model.scale.setScalar(0.035); sc.add(model); scene.add(sc)
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.05, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide }))
    scene.add(beam)

    // Cámara: la Luna se mira desde el sur (el polo); Marte, de frente a los sitios, cerca del ecuador.
    if (picking && PLANET.id === 'mars') camera.position.set(0, 0.35, 3.1)
    else if (picking) { camera.position.set(0, -1.32, 0.02); camera.up.set(0, 0, -1) } // justo sobre el polo sur, de cerca
    else camera.position.set(0.6, -1.6, 4.2)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.minDistance = picking ? 1.12 : 1.4; controls.maxDistance = 20

    // Clic sobre un pin (sin arrastrar) = elegir; pasar el mouse = enfocar.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const hit = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      // El globo tapa los pines del otro lado; entre los de este lado gana el de centro más cercano al rayo.
      const hits = ray.intersectObjects([globe, ...Object.values(pins.current).map((p) => p.hit)])
      const wall = hits.find((x) => x.object === globe)?.distance ?? Infinity
      const near = hits.filter((x) => x.object !== globe && x.distance < wall + R * 3)
      if (!near.length) return null
      const c = new THREE.Vector3(), d = (x: THREE.Intersection) => ray.ray.distanceToPoint(x.object.getWorldPosition(c))
      return near.reduce((a, b) => (d(a) <= d(b) ? a : b)).object.userData.id as string
    }
    let downX = 0, downY = 0, hovered: string | null = null
    const onDown = (ev: PointerEvent) => { downX = ev.clientX; downY = ev.clientY }
    const onUp = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < 6) { const id = hit(ev); if (id) cb.current.onPick?.(id) } }
    const onMove = (ev: PointerEvent) => {
      const id = hit(ev); renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      if (id && id !== hovered) cb.current.onHover?.(id)
      hovered = id
    }
    if (picking) {
      renderer.domElement.addEventListener('pointerdown', onDown)
      renderer.domElement.addEventListener('pointerup', onUp)
      renderer.domElement.addEventListener('pointermove', onMove)
    }

    const wp = new THREE.Vector3(), toCam = new THREE.Vector3(), nrm = new THREE.Vector3()
    let M = 0
    const tick = (dt: number) => {
      if (!picking) globe.rotation.y += dt * 0.03
      // Anomalía media → verdadera (solo para animar el dibujo).
      M += dt * 0.6 * Math.pow(a, -1.5)
      let E = M; for (let i = 0; i < 6; i++) E = M + ecc * Math.sin(E)
      const nu = 2 * Math.atan2(Math.sqrt(1 + ecc) * Math.sin(E / 2), Math.sqrt(1 - ecc) * Math.cos(E / 2))
      const p = at(nu); sc.position.copy(p); sc.lookAt(0, 0, 0)
      const d = p.length() - 1
      beam.scale.set(1, d, 1); beam.position.copy(p.clone().multiplyScalar(1 - d / 2 / p.length()))
      beam.lookAt(0, 0, 0); beam.rotateX(-Math.PI / 2)
      controls.update()
      // Etiquetas HTML sobre cada pin; se esconden cuando el sitio queda detrás del globo.
      if (picking) {
        const W = el.clientWidth, H = el.clientHeight
        const placed: { x: number; y: number; w: number }[] = []
        const items = Object.entries(pins.current).map(([id, { dot, ring }]) => {
          dot.getWorldPosition(wp); nrm.copy(wp).normalize(); toCam.copy(camera.position).sub(wp)
          const front = nrm.dot(toCam) > 0
          wp.project(camera)
          if (ring.visible) ring.rotation.z += dt * 0.8
          return { id, front, x: ((wp.x + 1) / 2) * W, y: ((1 - wp.y) / 2) * H }
        }).sort((p, q) => p.y - q.y)
        for (const it of items) {
          const lab = labels.current[it.id]; if (!lab) continue
          // Si choca con una etiqueta ya puesta, baja un renglón (las etiquetas miden ~34 px de alto).
          const w = lab.offsetWidth || 120
          let y = it.y
          for (let k = 0; k < 6 && placed.some((p) => Math.abs(p.y - y) < 34 && it.x < p.x + p.w + 14 && p.x < it.x + w + 14); k++) y += 34
          if (it.front) placed.push({ x: it.x, y, w })
          lab.style.transform = `translate(${it.x}px, ${y}px)`
          lab.style.opacity = it.front ? '1' : '0'; lab.style.pointerEvents = it.front ? 'auto' : 'none'
        }
      }
    }
    return Object.assign(tick, { cleanup: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointermove', onMove)
      controls.dispose()
    } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [orbitId, seed, partIds.join(','), picking])

  return (
    <div className={`orbit-host${picking ? ' picking' : ''}`}>
      <div ref={host} className="view3d" />
      {picking && CRATERS.map((c) => (
        <button key={c.id} ref={(b) => { labels.current[c.id] = b }} type="button"
          className={`site-label${targets?.includes(c.id) ? ' sel' : ''}${highlight === c.id ? ' focus' : ''}`}
          style={{ '--pin': marks?.[c.id]?.color ?? '#38e1ff' } as CSSProperties}
          onClick={() => onPick?.(c.id)} onMouseEnter={() => onHover?.(c.id)}>
          <b>{c.name}</b><small>{marks?.[c.id]?.text ?? ''}</small>
        </button>
      ))}
    </div>
  )
}
