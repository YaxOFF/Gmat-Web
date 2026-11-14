import './cesiumBase'
import {
  ArcType, BoundingSphere, Cartesian2, Cartesian3, ClockRange, Color, ColorGeometryInstanceAttribute, GeometryInstance,
  HorizontalOrigin, ImageryLayer, Ion, JulianDate, LabelStyle, Matrix4, PerInstanceColorAppearance, Primitive,
  ReferenceFrame, SampledPositionProperty, SceneMode, SimplePolylineGeometry, TileMapServiceImageryProvider, Transforms,
  Viewer, buildModuleUrl,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'
import { es } from '../i18n/es'
import type { ShipResult } from '../model/results'
import { useApp } from '../store'
import s from './Results.module.css'

Ion.defaultAccessToken = '' // sin Cesium ion: nada de imágenes ni terreno remotos

const COLORS = ['#58a6ff', '#ff7b72', '#3fb950', '#d29922', '#bc8cff', '#f778ba', '#39c5cf']
const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec'

// "01 Jan 2000 11:59:28.000" (UTCGregorian de GMAT) -> JulianDate.
function utc(g: string) {
  const [d, mon, y, hms] = g.trim().split(/\s+/)
  const m = String(MONTHS.indexOf(mon) / 3 + 1).padStart(2, '0')
  return JulianDate.fromIso8601(`${y}-${m}-${d.padStart(2, '0')}T${hms}Z`)
}

// Fechas: UTC de GMAT en la primera fila + segundos A1 transcurridos (escala uniforme, sin segundos intercalares).
// Posiciones: EarthMJ2000Eq de GMAT en metros (Cesium lo trata como ICRF).
function track(ship: ShipResult) {
  const c = ship.columns
  const [a1, g, X, Y, Z] = ['A1ModJulian', 'UTCGregorian', 'EarthMJ2000Eq.X', 'EarthMJ2000Eq.Y', 'EarthMJ2000Eq.Z'].map((k) => c[k] ?? [])
  const times: JulianDate[] = [], pos: Cartesian3[] = []
  let t0: JulianDate | undefined, a10 = 0
  for (let i = 0; i < a1.length; i++) {
    const t = a1[i], x = X[i], y = Y[i], z = Z[i], gi = g[i]
    if (typeof t !== 'number' || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') continue
    if (!t0) { if (typeof gi !== 'string') continue; t0 = utc(gi); a10 = t }
    times.push(JulianDate.addSeconds(t0, (t - a10) * 86400, new JulianDate()))
    pos.push(new Cartesian3(x * 1000, y * 1000, z * 1000))
  }
  return { times, pos }
}

// Rotación ICRF -> fija de Cesium (solo para pintar); sin datos EOP cae a la aproximación TEME.
const toFixed = (t: JulianDate) => Transforms.computeIcrfToFixedMatrix(t) ?? Transforms.computeTemeToPseudoFixedMatrix(t)

function Globe({ ships }: { ships: ShipResult[] }) {
  const el = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer>(null)
  const inertialRef = useRef(false)
  const [follow, setFollow] = useState('')
  const [inertial, setInertial] = useState(false)

  useEffect(() => {
    const v = new Viewer(el.current!, {
      baseLayer: ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'))),
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      fullscreenButton: false, infoBox: false, selectionIndicator: false, scene3DOnly: true,
      // sin ion no hay crédito que dar; NaturalEarthII es dominio público. Créditos a un div fuera del DOM.
      creditContainer: document.createElement('div'),
    })
    viewer.current = v
    const instances: GeometryInstance[] = [], all: Cartesian3[] = []
    let start: JulianDate | undefined, stop: JulianDate | undefined
    ships.forEach((ship, i) => {
      const { times, pos } = track(ship)
      if (pos.length < 2) return
      const color = Color.fromCssColorString(COLORS[i % COLORS.length])
      // Trayectoria: una línea estática en ICRF; el primitive gira con la Tierra vía modelMatrix (no se reconstruye).
      instances.push(new GeometryInstance({
        geometry: new SimplePolylineGeometry({ positions: pos, arcType: ArcType.NONE }),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
      }))
      const p = new SampledPositionProperty(ReferenceFrame.INERTIAL)
      p.addSamples(times, pos)
      v.entities.add({
        id: ship.name, name: ship.name, position: p,
        point: { pixelSize: 8, color, outlineColor: Color.WHITE, outlineWidth: 1 },
        label: {
          text: ship.name, font: '12px sans-serif', fillColor: color, outlineColor: Color.BLACK, outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: HorizontalOrigin.LEFT, pixelOffset: new Cartesian2(10, 0),
        },
      })
      for (const t of [times[0], times[times.length - 1]]) {
        if (!start || JulianDate.lessThan(t, start)) start = t
        if (!stop || JulianDate.greaterThan(t, stop)) stop = t
      }
      for (const q of pos) all.push(q) // sin spread: 50k argumentos desbordan la pila
    })
    if (instances.length && start && stop) {
      const lines = v.scene.primitives.add(new Primitive({
        geometryInstances: instances, asynchronous: false,
        appearance: new PerInstanceColorAppearance({ flat: true, translucent: false }),
      }))
      v.scene.preUpdate.addEventListener((_, time) => { Matrix4.fromRotationTranslation(toFixed(time), Cartesian3.ZERO, lines.modelMatrix) })
      v.clock.startTime = start.clone()
      v.clock.stopTime = stop.clone()
      v.clock.currentTime = start.clone()
      v.clock.clockRange = ClockRange.LOOP_STOP
      v.clock.multiplier = Math.max(1, JulianDate.secondsDifference(stop, start) / 60) // corrida completa en ~1 min
      v.clock.shouldAnimate = false
      v.timeline.zoomTo(start, stop)
      v.camera.viewBoundingSphere(BoundingSphere.fromPoints(all))
      v.camera.lookAtTransform(Matrix4.IDENTITY)
    }
    // Cámara inercial: re-ancla la cámara al marco ICRF en cada cuadro (ejemplo "ICRF" de Cesium).
    v.scene.postUpdate.addEventListener((scene, time) => {
      if (!inertialRef.current || scene.mode !== SceneMode.SCENE3D) return
      scene.camera.lookAtTransform(Matrix4.fromRotationTranslation(toFixed(time)), Cartesian3.clone(scene.camera.position))
    })
    v.trackedEntityChanged.addEventListener((e) => setFollow(e?.id ?? ''))
    return () => { viewer.current = null; v.destroy() }
  }, [ships])

  const pickFollow = (id: string) => {
    const v = viewer.current
    if (!v) return
    if (id) toggleInertial(false)
    v.trackedEntity = id ? v.entities.getById(id) : undefined
  }
  const toggleInertial = (on: boolean) => {
    const v = viewer.current
    if (!v) return
    inertialRef.current = on
    setInertial(on)
    if (on) v.trackedEntity = undefined
    else v.camera.lookAtTransform(Matrix4.IDENTITY)
  }

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <label>{es.view3d.follow}{' '}
          <select value={follow} onChange={(e) => pickFollow(e.target.value)}>
            <option value="">{es.view3d.noFollow}</option>
            {ships.map((sh) => <option key={sh.name} value={sh.name}>{sh.name}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={inertial} onChange={(e) => toggleInertial(e.target.checked)} /> {es.view3d.inertial}</label>
        <span className={s.muted}>{es.view3d.hint}</span>
      </div>
      <div ref={el} className={s.globe} />
    </div>
  )
}

export default function View3D() {
  const results = useApp((st) => st.results)
  if (!results) return <div className={s.empty}>{es.results.none}</div>
  if (!results.ships.length) return <div className={s.empty}>{es.results.empty}</div>
  return <Globe key={results.runId} ships={results.ships} />
}
