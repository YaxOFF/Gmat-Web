import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Piezas solo de Marte para Rover3D (world.storms): cielo de atardecer, polvo de tormenta y afloramientos de roca.

const c = (hex: number) => new THREE.Color(hex) // THREE.Color guarda en lineal: el shader trabaja en lineal
export const DUST = 0xa8744c

/** Cúpula de cielo como el atardecer de Gale (Curiosity): rosa polvoso, lado naranja y halo azul alrededor del Sol.
 *  `uStorm` (0..1) lo lleva todo al color del polvo y apaga el halo. */
export function skyDome(sunDir: THREE.Vector3): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: sunDir.clone().normalize() }, uStorm: { value: 0 }, uWarn: { value: 0 }, uFrom: { value: new THREE.Vector2(0, 1) },
      uZen: { value: c(0x96786f) }, uHor: { value: c(0xbe968c) }, uSide: { value: c(0xe1a082) },
      uHalo: { value: c(0x8cc8f0) }, uLav: { value: c(0x9696c8) }, uDust: { value: c(DUST) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uZen, uHor, uSide, uHalo, uLav, uDust;
      uniform float uStorm, uWarn;
      uniform vec2 uFrom;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0), c = max(dot(d, uSun), 0.0);
        vec3 col = mix(uHor, uZen, pow(h, 0.55));
        float away = smoothstep(0.2, -0.7, dot(normalize(d.xz + 1e-5), normalize(uSun.xz))); // lejos del Sol en acimut
        col = mix(col, uSide, away * (1.0 - h) * 0.55);
        col = mix(col, uLav, pow(c, 3.0) * 0.45);
        col = mix(col, uHalo, clamp(pow(c, 14.0) * 1.1, 0.0, 0.92));
        // Aviso: el cielo se llena de polvo del lado de donde viene la tormenta (uFrom = dirección xz).
        col = mix(col, uDust, uWarn * smoothstep(0.2, 1.0, dot(normalize(d.xz + 1e-5), uFrom)) * (1.0 - h * 0.6) * 0.85);
        col = mix(col, uDust, uStorm);
        col += vec3(0.9, 0.97, 1.0) * smoothstep(0.99985, 0.99995, c) * (1.0 - uStorm) * 2.0; // disco del Sol
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  return new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat)
}

/** Frente de polvo que se ve venir durante el aviso: un tramo de cilindro abierto (110°) del color del polvo,
 *  más oscuro que el cielo, opaco abajo, con el borde de arriba ondulado y los laterales difuminados. `update` lo centra en el rover, lo gira hacia `(fx, fz)` (de
 *  dónde viene la tormenta) y lo acerca de 300 a 25 m con `p` (0 → 1). */
export function dustWall() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S
  const g = cv.getContext('2d')!, img = g.createImageData(S, S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // alphaMap lee el canal verde: gris = opacidad. Borde superior ondulado (nubes de polvo) y laterales difuminados.
    const up = 1 - y / (S - 1), top = 0.5 + 0.24 * Math.abs(Math.sin(x * 0.075)) + 0.12 * Math.abs(Math.sin(x * 0.19 + 0.7)) // lomos redondos
    const a = 255 * THREE.MathUtils.clamp((top - up) / 0.12, 0, 1) * Math.sin((Math.PI * x) / (S - 1)) ** 0.6
    img.data.set([a, a, a, 255], (y * S + x) * 4)
  }
  g.putImageData(img, 0, 0)
  // Más oscuro que el polvo del cielo: si no, el frente se pierde contra el horizonte ya empolvado.
  const mat = new THREE.MeshBasicMaterial({ color: 0x6e4129, transparent: true, opacity: 0, alphaMap: new THREE.CanvasTexture(cv), depthWrite: false, side: THREE.DoubleSide, fog: false })
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true, -0.96, 1.92), mat)
  wall.visible = false; wall.frustumCulled = false
  return {
    wall,
    update(at: THREE.Vector3, fx: number, fz: number, p: number, fade: number) {
      const op = 0.92 * THREE.MathUtils.smoothstep(p, 0, 0.12) * (1 - fade)
      wall.visible = op > 0.01
      if (!wall.visible) return
      mat.opacity = op
      const R = 300 - 275 * p
      wall.scale.set(R, 70, R); wall.position.set(at.x, at.y + 30, at.z); wall.rotation.y = Math.atan2(fx, fz)
    },
  }
}

/** Huella real de un objeto en el suelo: radio horizontal máximo en 32 sectores, con los vértices que quedan entre
 *  0.2 m bajo el suelo y `top` m sobre él (lo más alto no toca al rover). Devuelve (dx, dz) desde su centro → radio. */
export function footprint(mesh: THREE.Mesh, ground: (x: number, z: number) => number, top = 2.5): (dx: number, dz: number) => number {
  const B = 32, bins = new Float32Array(B), p = mesh.geometry.attributes.position, v = new THREE.Vector3()
  mesh.updateMatrix()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrix)
    const up = v.y - ground(v.x, v.z)
    if (up < -0.2 || up > top) continue
    const dx = v.x - mesh.position.x, dz = v.z - mesh.position.z
    const b = Math.floor(((Math.atan2(dz, dx) / (2 * Math.PI)) + 1) * B) % B
    bins[b] = Math.max(bins[b], Math.hypot(dx, dz))
  }
  // Sectores sin vértices: el menor radio conocido. Luego cada sector toma el máximo con sus vecinos (sin huecos).
  const known = Array.from(bins).filter((r) => r > 0), lo = known.length ? Math.min(...known) : 0
  const r0 = Array.from(bins, (r) => r || lo)
  const r = r0.map((x, i) => Math.max(x, r0[(i + 1) % B], r0[(i + B - 1) % B]))
  return (dx, dz) => {
    const f = ((Math.atan2(dz, dx) / (2 * Math.PI)) + 1) * B, i = Math.floor(f) % B, t = f - Math.floor(f)
    return r[i] * (1 - t) + r[(i + 1) % B] * t
  }
}

/** Polvo de tormenta: partículas en una caja alrededor de la cámara que el viento arrastra; opacidad = intensidad. */
export function dust() {
  const N = 3000, BX = 120, BY = 40, BZ = 120
  const p = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) p.set([(Math.random() - 0.5) * BX, Math.random() * BY, (Math.random() - 0.5) * BZ], i * 3)
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
  const mat = new THREE.PointsMaterial({ color: 0xc89668, size: 0.35, transparent: true, opacity: 0, depthWrite: false })
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.visible = false
  const wrap = (v: number, c0: number, b: number) => c0 + ((((v - c0 + b / 2) % b) + b) % b) - b / 2
  return {
    points,
    update(dt: number, cam: THREE.Vector3, wx: number, wz: number, storm: number) {
      mat.opacity = storm * 0.7; points.visible = storm > 0.02
      if (!points.visible) return
      for (let i = 0; i < N * 3; i += 3) {
        p[i] = wrap(p[i] + wx * 18 * dt, cam.x, BX)
        p[i + 1] = wrap(p[i + 1] - 0.6 * dt, cam.y + BY / 2 - 6, BY)
        p[i + 2] = wrap(p[i + 2] + wz * 18 * dt, cam.z, BZ)
      }
      geo.attributes.position.needsUpdate = true
    },
  }
}

/** Afloramiento de roca clara y porosa (como las que fotografía Perseverance), único por llamada: la forma sale de
 *  `rng` (sembrado), así la misma semilla da las mismas estructuras. Lóbulos, estiramiento, inclinación, terrazas de
 *  erosión, cima plana o en aguja y hoyos. Normalizada: x, z en [-1, 1] e y en [-0.3, 0.7] (0 = suelo, 30 % enterrado). */
export function outcropGeometry(n: (x: number, y: number) => number, rng: () => number): THREE.BufferGeometry {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 4).deleteAttribute('normal').deleteAttribute('uv'))
  const p = g.attributes.position, v = new THREE.Vector3(), d = new THREE.Vector3()
  const ox = rng() * 400, oy = rng() * 400, sx = 0.7 + rng() * 0.6, sy = 0.7 + rng() * 0.6
  const lobes = Array.from({ length: 2 + Math.floor(rng() * 4) }, () => ({
    dir: new THREE.Vector3(rng() - 0.5, (rng() - 0.25) * 1.2, rng() - 0.5).normalize(), w: 0.3 + rng() * 0.6, k: 2 + rng() * 3,
  }))
  const leanX = (rng() - 0.5) * 0.7, leanZ = (rng() - 0.5) * 0.7
  const flat = rng() < 0.45 ? Infinity : 0.4 + rng() * 0.5 // casi la mitad sin cima plana: agujas y lomos
  const steps = 4 + Math.floor(rng() * 5), stepK = rng() * 0.6 // terrazas suaves (capas sedimentarias)
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i)
    // El ruido de Rover3D divide su entrada por 22/9/3.5: en una esfera unitaria hay que multiplicar fuerte.
    let r = 0.5 + n(d.x * 28 * sx + d.z * 12 + ox, d.y * 28 * sy - d.z * 17 + oy) * 0.55
    r += (n(d.x * 60 - d.z * 25 + oy, d.y * 60 + d.z * 40 + ox) - 0.76) * 0.3 // octava media: superficie quebrada
    for (const L of lobes) r += L.w * Math.max(d.dot(L.dir), 0) ** L.k
    r -= Math.max(0, n(d.x * 110 + d.z * 50 + ox, d.y * 110 - d.z * 80 + oy) - 1.0) * 0.8 // hoyos de erosión
    v.copy(d).multiplyScalar(r)
    v.y = Math.min(v.y, flat)
    v.y += (Math.round(v.y * steps) / steps - v.y) * stepK
    v.x += v.y * leanX; v.z += v.y * leanZ
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeBoundingBox()
  const { min, max } = g.boundingBox!
  g.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2)
  g.scale(2 / (max.x - min.x), 1 / (max.y - min.y), 2 / (max.z - min.z))
  g.translate(0, -0.3, 0)
  g.computeVertexNormals()
  const nr = g.attributes.normal, col = new Float32Array(p.count * 3), side = c(0xb98c62), top = c(0xe8d6bd), m = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    m.copy(side).lerp(top, THREE.MathUtils.smoothstep(nr.getY(i), 0.3, 0.9))
    col.set([m.r, m.g, m.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

// Triplanar en el mundo (las rocas no tienen UV): 3 proyecciones mezcladas por la normal, una copia cada 1/TRI m.
// La densidad la fija la posición en el mundo: una piedra de 0.5 m y un afloramiento de 18 m muestran el grano igual
// de grande, piedras vecinas no repiten el mismo trozo de la imagen y no hay costuras de UV.
const TRI = 1 / 6
const TRI_GLSL = /* glsl */ `
uniform sampler2D uTriDiff, uTriNor, uTriOrm;
varying vec3 vTriPos, vTriN;
vec3 triW3(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec4 triTex(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
// Normal triplanar con mezcla "whiteout" (Golus): cada proyección se reorienta a su eje y se suman.
vec3 triNormal(vec3 p, vec3 n, vec3 w) {
  vec3 tx = texture2D(uTriNor, p.zy).xyz * 2.0 - 1.0, ty = texture2D(uTriNor, p.xz).xyz * 2.0 - 1.0, tz = texture2D(uTriNor, p.xy).xyz * 2.0 - 1.0;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}`

/** Carga diff/normal/orm de `base` (tools/mars/build_mars.py --rock) y parcha el material a triplanar. Hasta que
 *  cargan, el material se queda con su color liso. */
export function triplanarRock(mats: THREE.MeshStandardMaterial[], base: string, aniso: number): void {
  const loader = new THREE.TextureLoader()
  const get = (f: string) => loader.loadAsync(base + f).then((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t })
  void Promise.all([get('diff.jpg'), get('normal.jpg'), get('orm.jpg')]).then(([diff, nor, orm]) => {
    diff.colorSpace = THREE.SRGBColorSpace
    for (const mat of mats) {
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uTriDiff: { value: diff }, uTriNor: { value: nor }, uTriOrm: { value: orm } })
        sh.vertexShader = 'varying vec3 vTriPos, vTriN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 triW = vec4(transformed, 1.0); mat3 triM = mat3(modelMatrix);
          #ifdef USE_INSTANCING
            triW = instanceMatrix * triW; triM = triM * mat3(instanceMatrix);
          #endif
          vTriPos = (modelMatrix * triW).xyz * ${TRI.toFixed(6)};
          vTriN = normalize(transpose(inverse(triM)) * objectNormal);`)
        const f = (chunk: string, code: string) => {
          if (!sh.fragmentShader.includes(chunk)) console.warn(`triplanarRock: falta ${chunk} (¿cambió three.js?)`)
          sh.fragmentShader = sh.fragmentShader.replace(chunk, code)
        }
        f('#include <common>', '#include <common>\n' + TRI_GLSL)
        f('#include <map_fragment>', `vec3 triN0 = normalize(vTriN), triWt = triW3(triN0);
          vec4 triOrm = triTex(uTriOrm, vTriPos, triWt);
          diffuseColor.rgb *= triTex(uTriDiff, vTriPos, triWt).rgb * mix(1.0, triOrm.r, 0.8);`)
        f('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * triOrm.g;')
        f('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(triNormal(vTriPos, triN0, triWt), 0.0)).xyz);')
      }
      mat.needsUpdate = true
    }
  }).catch(() => {}) // sin texturas: rocas de color liso
}
