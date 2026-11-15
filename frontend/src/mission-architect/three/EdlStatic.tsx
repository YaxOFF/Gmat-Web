import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loadCuriosity } from './curiosity'
import { edlEnvironment, loadEdl, ROVER_BRIDLE, type EdlRig } from './edl'
import { mountStage } from './stage'

/** Vista de prueba `?screen=edl`: rover, SkyCrane y cápsula acoplados; el deslizador separa escudo y carcasa. */
export function EdlStatic() {
  const host = useRef<HTMLDivElement>(null)
  const sep = useRef(0)
  const [open, setOpen] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => mountStage(host.current!, ({ scene, camera, renderer }) => {
    const env = edlEnvironment(renderer)
    scene.environment = env
    scene.background = new THREE.Color(0x1a1210)
    scene.add(new THREE.HemisphereLight(0xffe2c8, 0x3a2418, 0.6))
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); sun.position.set(6, 10, 4); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 })
    scene.add(sun)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
    camera.position.set(6, 3.5, 7)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.target.set(0, 1.4, 0)

    let rig: EdlRig | null = null, dead = false
    Promise.all([loadCuriosity(), loadEdl()]).then(([rover, edl]) => {
      if (dead) return
      edl.root.add(rover.model)
      // Marcas de los 3 enganches del rover y cables rectos hasta el SkyCrane, para revisar las constantes.
      const dot = new THREE.MeshBasicMaterial({ color: 0x38e1ff })
      for (const p of ROVER_BRIDLE) edl.root.add(new THREE.Mesh(new THREE.SphereGeometry(0.03), dot).translateX(p.x).translateY(p.y).translateZ(p.z))
      edl.root.updateMatrixWorld(true)
      const pts = ROVER_BRIDLE.flatMap((p, i) => [p, edl.root.worldToLocal(edl.anchors[i].getWorldPosition(new THREE.Vector3()))])
      edl.root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xdddddd })))
      scene.add(edl.root); rig = edl
    }).catch((e: Error) => !dead && setErr(e.message))

    const tick = () => {
      if (rig) {
        const s = sep.current
        rig.heatshield.position.y = -s * 2.5
        rig.backshell.position.y = s * 3
      }
      controls.update()
    }
    return Object.assign(tick, { cleanup: () => { dead = true; env.dispose() } })
  }), [])

  return (
    <div className="mars-drive">
      <div ref={host} className="view3d" />
      <div className="ds-hud">
        <div>EDL · static view</div>
        <label>Separate <input type="range" min={0} max={1} step={0.01} value={open} onChange={(e) => { sep.current = +e.target.value; setOpen(sep.current) }} /></label>
        {err && <div style={{ color: 'tomato' }}>{err}</div>}
      </div>
    </div>
  )
}
