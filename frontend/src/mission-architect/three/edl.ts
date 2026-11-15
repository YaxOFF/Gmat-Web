import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/** Posición acoplada en el marco del rover (origen de `curiosity_rover.glb`, m): ver PLAN-EDL.md, Decisiones. */
export const SKYCRANE_Y = 2.17
export const AEROSHELL_Y = 0.77
/** Enganche de los 3 cables en la cubierta del rover (marco del rover, frente = +Z). El GLB no trae estos nodos. */
export const ROVER_BRIDLE: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 1.15, 0.55),
  new THREE.Vector3(-0.55, 1.15, -0.45),
  new THREE.Vector3(0.55, 1.15, -0.45),
]

const THRUSTERS = ['LF', 'LB', 'RF', 'RB'].flatMap((s) => [`Thruster_${s}_1`, `Thruster_${s}_2`])

export interface EdlRig {
  /** Grupo en el marco del rover: SkyCrane y cápsula ya acoplados. El rover se cuelga aquí aparte. */
  root: THREE.Group
  skycrane: THREE.Object3D
  /** 8 propulsores; el chorro va por su -Y local. */
  thrusters: THREE.Object3D[]
  /** Toberas, en el mismo orden que `thrusters`. */
  nozzles: THREE.Object3D[]
  /** `Bridle_Anchor_1..3`: salida de los cables. */
  anchors: THREE.Object3D[]
  aeroshell: THREE.Object3D
  backshell: THREE.Object3D
  heatshield: THREE.Object3D
}

/** Carga `skycrane.glb` y `aeroshell.glb` y los deja en la posición acoplada sobre el origen del rover. */
export async function loadEdl(): Promise<EdlRig> {
  const loader = new GLTFLoader(), base = `${import.meta.env.BASE_URL}models/`
  const [sc, ae] = await Promise.all([loader.loadAsync(base + 'skycrane.glb'), loader.loadAsync(base + 'aeroshell.glb')])
  const node = (root: THREE.Object3D, file: string, name: string) => {
    const o = root.getObjectByName(name)
    if (!o) throw new Error(`${file}: falta el nodo ${name}`)
    return o
  }
  const skycrane = node(sc.scene, 'skycrane.glb', 'SkyCrane'), aeroshell = node(ae.scene, 'aeroshell.glb', 'Aeroshell')
  // Buscar dentro de cada raíz: al colgarlas de `root` ya no están en `gltf.scene`.
  const n1 = (name: string) => node(skycrane, 'skycrane.glb', name), n2 = (name: string) => node(aeroshell, 'aeroshell.glb', name)
  const root = new THREE.Group()
  skycrane.position.set(0, SKYCRANE_Y, 0); aeroshell.position.set(0, AEROSHELL_Y, 0)
  root.add(skycrane, aeroshell)
  root.traverse((o) => { o.castShadow = true; o.receiveShadow = true })
  const thrusters = THRUSTERS.map(n1)
  return {
    root, skycrane, thrusters, aeroshell,
    nozzles: THRUSTERS.map((t) => n1(t.replace('Thruster', 'Nozzle'))),
    anchors: [1, 2, 3].map((i) => n1(`Bridle_Anchor_${i}`)),
    backshell: n2('Aeroshell_Backshell'), heatshield: n2('Aeroshell_Heatshield'),
  }
}

/** Entorno PMREM para `scene.environment`: sin él, el metal del SkyCrane y la cápsula no refleja nada y sale negro. */
export function edlEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return env
}
