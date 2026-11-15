import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CRATERS } from '../data/catalog'
import { mulberry32 } from '../engine/rng'
import { MOON_R_KM, ORBIT_ELEMENTS } from '../gmat'
import { buildSpacecraft } from './spacecraft'
import { mountStage, moonTexture, realMoon, stars } from './stage'

/** Vista esquemática de la órbita alrededor de la Luna (la trayectoria exacta sale de GMAT). */
export function Orbit3D({ orbitId, seed = 7, highlight, targets, partIds = [] }: { orbitId: string; seed?: number; highlight?: string | null; targets?: string[]; partIds?: string[] }) {
  const host = useRef<HTMLDivElement>(null)
  const dots = useRef<Record<string, THREE.Mesh>>({})
  // Objetivos del ciclo: se pintan sin rearmar la escena.
  useEffect(() => {
    for (const [id, d] of Object.entries(dots.current)) {
      const on = id === highlight || !!targets?.includes(id)
      ;(d.material as THREE.MeshBasicMaterial).color.set(on ? 0xd7ff3a : 0x38e1ff); d.scale.setScalar(on ? 1.8 : 1)
    }
  }, [targets, highlight])
  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer }) => {
    const rng = mulberry32(seed)
    scene.add(stars(rng))
    scene.add(new THREE.AmbientLight(0x404458, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(5, 0.4, 2); scene.add(sun)
    const mat = new THREE.MeshStandardMaterial({ map: moonTexture(rng), roughness: 1 })
    realMoon(mat)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat)
    scene.add(moon)
    // Cráteres candidatos en su lat/lon real. En la UV de SphereGeometry lon 0 = +x y lon +90° = −z.
    for (const c of CRATERS) {
      const lat = (c.lat * Math.PI) / 180, lon = (c.lon * Math.PI) / 180
      const p = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
      const on = c.id === highlight || !!targets?.includes(c.id)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018), new THREE.MeshBasicMaterial({ color: on ? 0xd7ff3a : 0x38e1ff }))
      dot.scale.setScalar(on ? 1.8 : 1); dot.position.copy(p.multiplyScalar(1.003)); moon.add(dot); dots.current[c.id] = dot
    }
    // Elipse en el plano polar x–y con el periapsis hacia el polo sur.
    const e = ORBIT_ELEMENTS[orbitId] ?? ORBIT_ELEMENTS.polar_high
    const a = e.sma / MOON_R_KM, ecc = e.ecc, w = (e.aop * Math.PI) / 180
    const at = (nu: number) => {
      const r = (a * (1 - ecc * ecc)) / (1 + ecc * Math.cos(nu))
      return new THREE.Vector3(r * Math.cos(nu + w), r * Math.sin(nu + w), 0)
    }
    const pts = Array.from({ length: 361 }, (_, i) => at((i / 360) * Math.PI * 2))
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xd7ff3a, dashSize: 0.04, gapSize: 0.03 })).computeLineDistances())
    const sc = new THREE.Group()
    const model = buildSpacecraft(partIds.length ? partIds : ['bus_medium', 'panel_gaas', 'hga', 'tank_s', 'neutron', 'camera'])
    model.remove(...model.children.filter((c) => c.position.y < -1.2)) // sin el lander en órbita
    model.scale.setScalar(0.035); sc.add(model); scene.add(sc)
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.05, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide }))
    scene.add(beam)

    camera.position.set(0.6, -1.6, 4.2)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.minDistance = 1.4; controls.maxDistance = 20
    let M = 0
    return (dt) => {
      moon.rotation.y += dt * 0.03
      // Anomalía media → verdadera (solo para animar el dibujo).
      M += dt * 0.6 * Math.pow(a, -1.5)
      let E = M; for (let i = 0; i < 6; i++) E = M + ecc * Math.sin(E)
      const nu = 2 * Math.atan2(Math.sqrt(1 + ecc) * Math.sin(E / 2), Math.sqrt(1 - ecc) * Math.cos(E / 2))
      const p = at(nu); sc.position.copy(p); sc.lookAt(0, 0, 0)
      const d = p.length() - 1
      beam.scale.set(1, d, 1); beam.position.copy(p.clone().multiplyScalar(1 - d / 2 / p.length()))
      beam.lookAt(0, 0, 0); beam.rotateX(-Math.PI / 2)
      controls.update()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [orbitId, seed, partIds.join(',')])
  return <div ref={host} className="view3d" />
}
