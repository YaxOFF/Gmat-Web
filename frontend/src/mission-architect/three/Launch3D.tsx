import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { LaunchOutcome } from '../engine/mission'
import { mulberry32 } from '../engine/rng'
import { buildSpacecraft } from './spacecraft'
import { at, mountStage, moonTexture, stars } from './stage'

const T_LIFT = 5, T_EVENT = 2.4, T_SPACE = 13, T_END = 19

/** Lanzamiento y crucero: cuenta regresiva, ascenso y la inserción lunar, con las tiradas del motor del juego. */
export function Launch3D({ launch, seed, partIds, onDone }: { launch: LaunchOutcome; seed: number; partIds: string[]; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(0)
  const failAt = launch.status === 'launch_failure'
    ? (launch.events.length === 1 ? T_LIFT + 1 : T_LIFT + 0.6 + (launch.events.length - 1) * T_EVENT * 0.5)
    : Infinity
  const shown = launch.events.filter((_, i) => t >= T_LIFT - 2 + i * T_EVENT)

  useEffect(() => mountStage(host.current!, ({ scene, camera }) => {
    const rng = mulberry32(seed)
    const sky = new THREE.Color(0x0a1430); scene.background = sky
    const starField = stars(rng); (starField.material as THREE.PointsMaterial).transparent = true; scene.add(starField)
    scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x202020, 0.8))
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(30, 50, 20); scene.add(sun)

    const pad = new THREE.Group()
    pad.add(at(new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x3a3d45 })), 0, -0.25, 0))
    pad.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), new THREE.MeshStandardMaterial({ color: 0xb33a2a, wireframe: true })), -3.5, 11, 0))
    scene.add(pad)
    const rocket = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xeef0f5, roughness: 0.5 })
    rocket.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 14, 24), white), 0, 7, 0))
    rocket.add(at(new THREE.Mesh(new THREE.ConeGeometry(1, 3, 24), new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.6 })), 0, 15.5, 0))
    for (let i = 0; i < 4; i++) {
      const fin = at(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 1.6), new THREE.MeshStandardMaterial({ color: 0x222 })), Math.cos(i * 1.57) * 1.05, 1.2, Math.sin(i * 1.57) * 1.05)
      fin.rotation.y = -i * 1.57; rocket.add(fin)
    }
    const flame = at(new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85 })), 0, -3, 0)
    flame.rotation.x = Math.PI; rocket.add(flame)
    const glow = new THREE.PointLight(0xffa040, 0, 60); glow.position.y = -2; rocket.add(glow)
    scene.add(rocket)
    const smoke = new THREE.Group(); scene.add(smoke)
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0 }))
    scene.add(boom)

    // Escena de espacio: Luna y la nave en crucero.
    const space = new THREE.Group(); space.visible = false; scene.add(space)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 48), new THREE.MeshStandardMaterial({ map: moonTexture(rng), roughness: 1 }))
    moon.position.set(0, 0, -120); space.add(moon)
    const craft = new THREE.Group()
    const model = buildSpacecraft(partIds); model.scale.setScalar(0.8); model.rotation.x = -Math.PI / 2 // motor hacia −z
    craft.add(model)
    const burn = at(new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8 })), 0, 0, -1.6)
    burn.rotation.x = -Math.PI / 2; craft.add(burn); space.add(craft)

    let time = 0
    return (dt) => {
      time += dt; setT(time)
      const fly = time > T_LIFT && time < failAt
      if (time < T_SPACE) {
        const k = Math.max(0, time - T_LIFT)
        const y = fly ? k * k * 1.6 : rocket.position.y
        rocket.position.y = y
        if (launch.status === 'launch_failure' && launch.events.length === 1 && time > T_LIFT) rocket.position.x = Math.sin(time * 40) * 0.08
        flame.visible = time > T_LIFT - 0.8 && time < failAt; glow.intensity = flame.visible ? 40 + Math.random() * 30 : 0
        flame.scale.set(1, 0.8 + Math.random() * 0.4, 1)
        if (flame.visible && smoke.children.length < 80 && y < 30) {
          const puff = at(new THREE.Mesh(new THREE.SphereGeometry(1.5 + Math.random() * 2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xcfcfd4, transparent: true, opacity: 0.6 })), (Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6)
          smoke.add(puff)
        }
        for (const p of smoke.children) { p.scale.multiplyScalar(1 + dt * 0.4); p.position.x *= 1 + dt * 0.3 }
        if (time >= failAt) {
          const b = time - failAt; rocket.visible = b < 0.12
          boom.position.copy(rocket.position).y += 8; boom.scale.setScalar(2 + b * 30); boom.material.opacity = Math.max(0, 1 - b / 1.6)
        }
        sky.lerpColors(new THREE.Color(0x0a1430), new THREE.Color(0x000000), Math.min(1, y / 260))
        ;(starField.material as THREE.PointsMaterial).opacity = Math.min(1, 0.15 + y / 200)
        camera.position.set(28, Math.max(8, y * 0.85 + 6), 34); camera.lookAt(0, y + 6, 0)
      } else if (launch.status !== 'launch_failure') {
        pad.visible = rocket.visible = smoke.visible = false; space.visible = true; sky.set(0x000000)
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
  }), [launch, seed, failAt, partIds])

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
            › {e.label}{e.p != null ? ` · needed <${Math.round(e.p * 100)}, rolled ${Math.round((e.roll ?? 0) * 100)} → ${e.result?.toUpperCase()}` : ''}<br /><span style={{ color: 'var(--dim)' }}>{e.text}</span>
          </div>
        ))}
      </div>
      {t > end && <div className="rv-end"><button className="btn big" onClick={onDone}>{launch.status === 'ok' ? 'Begin mapping →' : 'Mission report →'}</button></div>}
    </div>
  )
}
