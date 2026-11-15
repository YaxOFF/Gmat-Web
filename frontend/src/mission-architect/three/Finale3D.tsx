import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../engine/rng'
import { buildSpacecraft } from './spacecraft'
import { mountStage, moonTexture, stars } from './stage'

export type FinaleKind = 'return' | 'planb'
export interface FinaleResult { choice: 'impact' | 'relay'; success: boolean; points: number; title: string; text: string }

/** Acto V: qué hacer con Selene cuando se queda sin combustible (o el impacto de rescate si falló el aterrizaje). */
export function Finale3D({ kind, crater, seed, partIds, onDone }: {
  kind: FinaleKind; crater: string; seed: number; partIds: string[]; onDone: (r: FinaleResult) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [res, setRes] = useState<FinaleResult | null>(null)
  const [shown, setShown] = useState(false)
  const anim = useRef<{ mode: 'idle' | 'impact' | 'relay'; t: number }>({ mode: 'idle', t: 0 })

  const choose = (choice: 'impact' | 'relay') => {
    const ok = choice === 'relay' || mulberry32(seed + 99)() < 0.7
    const r: FinaleResult = choice === 'relay'
      ? { choice, success: true, points: 20, title: 'A LIGHTHOUSE FOR ARTEMIS', text: 'Selene climbs to a high orbit and stays on as a relay. Future crews landing at the south pole will talk to Earth through her.' }
      : kind === 'planb'
        ? ok ? { choice, success: true, points: 50, title: 'PLAN B: PLUME CONFIRMS WATER', text: `Selene dives into ${crater} like LCROSS in 2009. The plume rises into sunlight and the spectra show water. Partial success, from orbit alone.` }
          : { choice, success: false, points: 10, title: 'PLAN B: NO PLUME', text: `Selene hits ${crater}, but the impact angle buries the plume in shadow. The data are inconclusive. The next team will have your maps.` }
        : ok ? { choice, success: true, points: 30, title: 'A FINAL GIFT OF SCIENCE', text: `Out of fuel, Selene is steered into ${crater}. The dust plume adds one more water reading to the rover's results.` }
          : { choice, success: false, points: 10, title: 'A QUIET END', text: `Selene impacts ${crater}, but the plume stays in shadow. The rover's samples are still the headline.` }
    anim.current = { mode: choice, t: 0 }
    setRes(r)
    setTimeout(() => setShown(true), 5200)
  }

  useEffect(() => mountStage(host.current!, ({ scene, camera }) => {
    const rng = mulberry32(seed)
    scene.add(stars(rng))
    scene.add(new THREE.AmbientLight(0x404458, 0.5))
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(5, 0.5, 2); scene.add(sun)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ map: moonTexture(rng), roughness: 1 }))
    scene.add(moon)
    const earth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshStandardMaterial({ color: 0x3d7bff, emissive: 0x0a1a40 }))
    earth.position.set(-9, 1.5, -14); scene.add(earth)
    const sc = buildSpacecraft(partIds.filter((id) => id !== 'lander')); sc.scale.setScalar(0.02)
    scene.add(sc)
    const trail: THREE.Vector3[] = []
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x5cc8f0 }))
    scene.add(line)
    // Pluma: partículas que salen del polo sur al impactar.
    const N = 600, pp = new Float32Array(N * 3), vel: THREE.Vector3[] = []
    for (let i = 0; i < N; i++) vel.push(new THREE.Vector3((rng() - 0.5) * 0.5, -(0.4 + rng() * 0.9), (rng() - 0.5) * 0.5))
    const plumeGeo = new THREE.BufferGeometry(); plumeGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3))
    const plume = new THREE.Points(plumeGeo, new THREE.PointsMaterial({ color: 0xe8f4ff, size: 0.012, transparent: true, opacity: 0.9 }))
    plume.visible = false; scene.add(plume)
    const flash = new THREE.PointLight(0xffe0a0, 0, 3); flash.position.set(0, -1.05, 0); scene.add(flash)

    camera.position.set(2.2, -1.4, 2.6); camera.lookAt(0, -0.4, 0)
    let ang = 0
    return (dt) => {
      const a = anim.current
      moon.rotation.y += dt * 0.01
      if (a.mode === 'idle') ang += dt * 0.5
      else a.t += dt
      let r = 1.06, inc = 0
      if (a.mode === 'impact') r = Math.max(1, 1.06 - a.t * 0.022)
      if (a.mode === 'relay') { r = 1.06 + Math.min(a.t, 5) * 0.5; inc = Math.min(a.t, 5) * 0.12 }
      ang += dt * (a.mode === 'impact' ? 1.2 : a.mode === 'relay' ? 0.6 / r : 0)
      // Órbita polar: el periapsis/impacto termina en el polo sur.
      const p = a.mode === 'impact' && r <= 1.001
        ? new THREE.Vector3(0, -1, 0)
        : new THREE.Vector3(Math.sin(ang) * r, -Math.cos(ang) * r, Math.sin(inc) * r * 0.3)
      if (a.mode === 'impact' && r <= 1.001 && !plume.visible) {
        plume.visible = true; sc.visible = false; flash.intensity = 40
        for (let i = 0; i < N; i++) pp.set([0, -1, 0], i * 3)
      }
      if (plume.visible) {
        const at = plumeGeo.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < N; i++) at.setXYZ(i, at.getX(i) + vel[i].x * dt * 0.2, at.getY(i) + vel[i].y * dt * 0.2, at.getZ(i) + vel[i].z * dt * 0.2)
        at.needsUpdate = true
        flash.intensity *= 0.96
        ;(plume.material as THREE.PointsMaterial).opacity = Math.max(0, (plume.material as THREE.PointsMaterial).opacity - dt * 0.12)
      } else {
        sc.position.copy(p); sc.lookAt(0, 0, 0)
        trail.push(p.clone()); if (trail.length > 400) trail.shift()
        line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(trail)
      }
      const target = a.mode === 'relay' ? new THREE.Vector3(5, -2, 7) : new THREE.Vector3(2.2, -1.4, 2.6)
      camera.position.lerp(target, dt * 0.4); camera.lookAt(0, -0.4, 0)
    }
  }), [seed, partIds])

  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      {!res && (
        <div className="end-text">
          {kind === 'return'
            ? <><h2>SELENE IS OUT OF FUEL</h2><p>The rover is safe in the sunlight. Your orbiter has a few m/s left. How does her story end?</p>
              <div className="actions">
                <button className="btn" onClick={() => choose('impact')}>Controlled impact into {crater}<small style={{ display: 'block' }}>LCROSS-style plume · +science (70% chance)</small></button>
                <button className="btn ghost" onClick={() => choose('relay')}>Park as a relay for Artemis<small style={{ display: 'block' }}>+confidence · safe</small></button>
              </div></>
            : <><h2>PLAN B</h2><p>No rover. Selene can still try what LCROSS did in 2009: crash into {crater} and read the plume from orbit.</p>
              <div className="actions"><button className="btn big" onClick={() => choose('impact')}>Commit to impact</button></div></>}
        </div>
      )}
      {res && shown && (
        <div className="end-text">
          <h2 style={{ color: res.success ? undefined : 'var(--amber)' }}>{res.title}</h2>
          <p>{res.text}</p>
          <button className="btn big" onClick={() => onDone(res)}>Mission report →</button>
        </div>
      )}
    </div>
  )
}
