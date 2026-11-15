import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { LaunchOutcome } from '../engine/mission'
import { mulberry32 } from '../engine/rng'
import { liftoff, mslCraft } from './liftoff'
import { bodyMaterial, mountStage } from './stage'

const T_LIFT = 5, T_EVENT = 2.4, T_SPACE = 13, T_END = 19

/** Lanzamiento y crucero: cuenta regresiva, ascenso y la inserción lunar, con las tiradas del motor del juego. */
export function Launch3D({ launch, seed, onDone }: { launch: LaunchOutcome; seed: number; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(0)
  const failAt = launch.status === 'launch_failure'
    ? (launch.events.length === 1 ? T_LIFT + 1 : T_LIFT + 0.6 + (launch.events.length - 1) * T_EVENT * 0.5)
    : Infinity
  const shown = launch.events.filter((_, i) => t >= T_LIFT - 2 + i * T_EVENT)

  useEffect(() => mountStage(host.current!, ({ scene, camera }) => {
    const rng = mulberry32(seed)
    const L = liftoff(scene, rng)
    const { sky, starMat, pad, rocket, fire, smoke } = L
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0 }))
    scene.add(boom)

    // Escena de espacio: Luna y la nave en crucero.
    const space = new THREE.Group(); space.visible = false; scene.add(space)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 48), bodyMaterial(rng))
    moon.position.set(0, 0, -120); space.add(moon)
    const craft = mslCraft(() => L.st.gone)
    const burn = craft.userData.burn as THREE.Mesh
    space.add(craft)

    let time = 0
    const tick = (dt: number) => {
      if (!L.st.ready) { camera.position.set(30, 9, 42); camera.lookAt(0, 13, 0); return } // la cuenta espera al modelo
      time += dt; setT(time)
      const fly = time > T_LIFT && time < failAt
      if (time < T_SPACE) {
        const k = Math.max(0, time - T_LIFT)
        const y = fly ? k * k * 1.6 : rocket.position.y
        const vy = fly ? k * 3.2 : 0
        rocket.position.y = y
        if (launch.status === 'launch_failure' && launch.events.length === 1 && time > T_LIFT) rocket.position.x = Math.sin(time * 40) * 0.08
        L.burn(dt, time > T_LIFT - 0.8 && time < failAt, vy)
        if (time >= failAt) {
          const b = time - failAt; rocket.visible = b < 0.12
          boom.position.copy(rocket.position).y += 14; boom.scale.setScalar(2 + b * 30); boom.material.opacity = Math.max(0, 1 - b / 1.6)
        }
        L.climb(y)
        camera.position.set(30, Math.max(9, y * 0.85 + 9), 42); camera.lookAt(0, y + 13, 0)
      } else if (launch.status !== 'launch_failure') {
        pad.visible = rocket.visible = fire.group.visible = smoke.group.visible = false; space.visible = true; sky.set(0x000000); scene.fog = null; starMat.opacity = 1
        const k = time - T_SPACE
        if (launch.status === 'ok') {
          craft.position.set(Math.sin(k * 0.5) * 42, 6 - k * 0.6, -120 + Math.cos(k * 0.5) * 42)
          burn.visible = k > 1.5 && k < 4
        } else { craft.position.set(-40 + k * 14, 8, -100 + k * 4); burn.visible = false }
        craft.lookAt(moon.position); craft.rotateY(Math.PI)
        const out = craft.position.clone().sub(moon.position).normalize()
        camera.position.copy(craft.position).addScaledVector(out, 9).add(new THREE.Vector3(3, 4, 0))
        camera.lookAt(craft.position)
      }
    }
    return Object.assign(tick, { cleanup: () => { L.st.gone = true } })
  }), [launch, seed, failAt])

  const end = launch.status === 'launch_failure' ? failAt + 2.5 : T_END
  const tag = t < T_LIFT ? `T−${Math.ceil(T_LIFT - t)}` : t < T_SPACE || t > T_SPACE + 3 || launch.status === 'launch_failure' ? '' : launch.status === 'ok' ? 'ORBIT ACHIEVED' : 'SIGNAL LOST'
  return (
    <div className="rover">
      <div ref={host} className="view3d" />
      {tag && <div className="dlg-sfx good"><span>{tag}</span></div>}
      {t >= failAt && <div className="dlg-sfx bad"><span>BOOM</span></div>}
      <div className="ds-hud" style={{ width: 360 }}>
        <div>MISSION CONTROL</div>
        {shown.map((e, i) => (
          <div key={i} className="hint" style={{ color: e.result === 'fail' ? 'var(--red)' : e.result === 'partial' ? 'var(--amber)' : 'var(--green)' }}>
            › {e.label}{e.p != null ? ` · ${Math.round(e.p * 100)}% chance → ${e.result?.toUpperCase()}` : ''}<br /><span style={{ color: 'var(--dim)' }}>{e.text}</span>
          </div>
        ))}
      </div>
      {t > end && <div className="rv-end"><button className="btn big" onClick={onDone}>{launch.status === 'ok' ? 'Begin mapping →' : 'Mission report →'}</button></div>}
    </div>
  )
}
