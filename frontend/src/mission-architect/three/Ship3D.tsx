import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mulberry32 } from '../engine/rng'
import { buildSpacecraft } from './spacecraft'
import { mountStage, stars } from './stage'

/** Selene en el hangar: gira sola, se puede rotar, y se rearma con cada pieza que se agrega o quita. */
export function Ship3D({ partIds }: { partIds: string[] }) {
  const host = useRef<HTMLDivElement>(null)
  const slot = useRef<THREE.Group | null>(null)
  const key = partIds.join(',')

  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer }) => {
    scene.background = new THREE.Color(0x05060b)
    scene.add(stars(mulberry32(3), 800, 60))
    scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x202028, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 5, 6); scene.add(key)
    const rim = new THREE.DirectionalLight(0x8fa8ff, 0.7); rim.position.set(-5, -2, -4); scene.add(rim)
    const holder = new THREE.Group(); scene.add(holder); slot.current = holder
    camera.position.set(3.3, 1.6, 4.1)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.2
    controls.minDistance = 3; controls.maxDistance = 14; controls.target.set(0, -0.4, 0)
    return () => controls.update()
  }), [])

  useEffect(() => {
    const h = slot.current
    if (!h) return
    for (const c of [...h.children]) {
      h.remove(c)
      c.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose() })
    }
    if (partIds.some((id) => id.startsWith('bus_'))) h.add(buildSpacecraft(partIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (
    <div className="ship3d">
      <div ref={host} className="view3d" />
      {!partIds.some((id) => id.startsWith('bus_')) && <span className="ship3d-empty">Pick a bus to begin</span>}
      <span className="ship3d-tag">SELENE · drag to rotate</span>
    </div>
  )
}
