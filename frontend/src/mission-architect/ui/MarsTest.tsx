import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MARS_SITES } from '../data/mars'
import { mulberry32 } from '../engine/rng'
import { DEFAULT_ROVER, Rover3D } from '../three/Rover3D'
import { MARS } from '../three/world'
import { mountStage, realMoon, stars } from '../three/stage'

/** Vista de prueba de Marte (aún sin misión): globo real y rover libre en un sitio con relieve real. */
export function MarsTest({ onExit }: { onExit: () => void }) {
  const [sel, setSel] = useState(MARS_SITES[0].id)
  const [driving, setDriving] = useState(false)
  const site = MARS_SITES.find((s) => s.id === sel)!
  if (driving) return (
    <div className="mars-drive">
      <Rover3D crater={site} world={MARS} quality={0.8} seed={7} orbitId="polar_high" start={DEFAULT_ROVER} onDone={() => setDriving(false)} />
      <button className="btn small ghost mars-back" onClick={() => setDriving(false)}>← Mars globe</button>
    </div>
  )
  return (
    <div className="mars">
      <MarsGlobe sel={sel} />
      <aside className="mars-side">
        <button className="btn small ghost" onClick={onExit}>← Title</button>
        <h2>Mars <small>test · real data</small></h2>
        <p className="hint">Viking color mosaic + HRSC/MOLA relief (NASA/USGS). Drag to rotate, scroll to zoom.</p>
        {MARS_SITES.map((s) => (
          <button key={s.id} className={`card orbit ${s.id === sel ? 'sel' : ''}`} onClick={() => setSel(s.id)}>
            <h3>{s.name}</h3>
            <div className="alt">{Math.abs(s.lat).toFixed(1)}°{s.lat >= 0 ? 'N' : 'S'} · {s.lon.toFixed(1)}°E{s.ice > 0 ? ' · water ice' : ''}</div>
            <p className="note">{s.blurb}</p>
          </button>
        ))}
        <button className="btn big" onClick={() => setDriving(true)}>Drive at {site.name} ▶</button>
      </aside>
    </div>
  )
}

function MarsGlobe({ sel }: { sel: string }) {
  const host = useRef<HTMLDivElement>(null)
  const dots = useRef<Record<string, THREE.Mesh>>({})
  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer }) => {
    scene.add(stars(mulberry32(11)))
    scene.add(new THREE.AmbientLight(0x50443c, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(5, 1.2, 3); scene.add(sun)
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 })
    realMoon(mat, 'mars')
    const mars = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat)
    scene.add(mars)
    // Misma convención que Orbit3D: en la UV de SphereGeometry lon 0 = +x y lon +90° = −z.
    for (const s of MARS_SITES) {
      const lat = (s.lat * Math.PI) / 180, lon = (s.lon * Math.PI) / 180
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018), new THREE.MeshBasicMaterial({ color: 0x38e1ff }))
      dot.position.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).multiplyScalar(1.003)
      mars.add(dot); dots.current[s.id] = dot
    }
    camera.position.set(0, 0.9, 3.4)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.minDistance = 1.3; controls.maxDistance = 12
    return (dt) => { mars.rotation.y += dt * 0.04; controls.update() }
  }), [])
  // Después del montaje (los efectos corren en orden): así el sitio inicial ya sale resaltado.
  useEffect(() => {
    for (const [id, d] of Object.entries(dots.current)) {
      ;(d.material as THREE.MeshBasicMaterial).color.set(id === sel ? 0xd7ff3a : 0x38e1ff); d.scale.setScalar(id === sel ? 1.8 : 1)
    }
  }, [sel])
  return <div ref={host} className="view3d" />
}
