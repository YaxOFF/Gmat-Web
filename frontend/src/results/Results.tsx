import { useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { es } from '../i18n/es'
import type { Cell, ShipResult, XYPlotResult } from '../model/results'
import { useApp } from '../store'
import s from './Results.module.css'

const COLORS = ['#1f6feb', '#d1242f', '#1a7f37', '#9a6700', '#8250df', '#bf3989', '#0a7ea4']
// shortcut: la tabla muestra solo las primeras filas (el CSV lleva todas); virtualizar si hace falta.
const MAX_TABLE_ROWS = 500

function download(name: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

function downloadCsv(name: string, headers: string[], rows: Cell[][]) {
  const q = (v: Cell) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const text = [headers, ...rows].map((r) => r.map(q).join(',')).join('\n') + '\n'
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  download(name, url)
  URL.revokeObjectURL(url)
}

export function Table({ name, headers, rows, file }: { name: string; headers: string[]; rows: Cell[][]; file?: string }) {
  const runId = useApp((st) => st.results?.runId)
  const shown = rows.slice(0, MAX_TABLE_ROWS)
  return (
    <div className={s.view}>
      <div className={s.bar}>
        <button className={s.btn} onClick={() => downloadCsv(`${name}.csv`, headers, rows)}>{es.results.csv}</button>
        {file && <a className={s.btn} href={`/api/runs/${runId}/files/${encodeURIComponent(file)}`} download>{es.results.file}</a>}
        <span className={s.muted}>{es.results.rows(shown.length, rows.length)}</span>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{shown.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

export function XYChart({ plot, log }: { plot: XYPlotResult; log?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<uPlot | null>(null)
  useEffect(() => {
    const box = el.current!
    const color = getComputedStyle(box).color
    const grid = { stroke: 'rgba(128,128,128,.25)' }
    const num = (d: Cell[]) => d.map((v) => (typeof v === 'number' ? v : null))
    // shortcut: uPlot asume x creciente (tiempo); una gráfica X contra Y se dibuja en orden de filas.
    const u = new uPlot({
      width: box.clientWidth, height: 380,
      scales: { x: { time: false }, ...(log && { y: { distr: 3 } }) },
      cursor: { drag: { x: true, y: true } },
      // eje log: uPlot redondea a 3 decimales y rotula "0" lo menor de 0,001; se escribe en notación científica
      axes: [{ stroke: color, grid }, {
        stroke: color, grid,
        ...(log && { size: 60, values: (_u: uPlot, splits: (number | null)[]) => splits.map((v) => (v == null ? '' : v >= 0.001 && v < 1e5 ? String(v) : v.toExponential(0))) }),
      }],
      series: [{ label: plot.x.name }, ...plot.series.map((y, i) => ({ label: y.name, stroke: COLORS[i % COLORS.length] }))],
    }, [num(plot.x.data), ...plot.series.map((y) => num(y.data))] as uPlot.AlignedData, box)
    chart.current = u
    const ro = new ResizeObserver(() => u.setSize({ width: box.clientWidth, height: 380 }))
    ro.observe(box)
    return () => { ro.disconnect(); u.destroy(); chart.current = null }
  }, [plot, log])

  const png = () => {
    const src = chart.current?.ctx.canvas
    if (!src) return
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const ctx = c.getContext('2d')!
    ctx.fillStyle = getComputedStyle(el.current!).backgroundColor || '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(src, 0, 0)
    download(`${plot.name}.png`, c.toDataURL('image/png'))
  }
  const csv = () => downloadCsv(`${plot.name}.csv`, [plot.x.name, ...plot.series.map((y) => y.name)],
    plot.x.data.map((x, i) => [x, ...plot.series.map((y) => y.data[i])]))

  return (
    <div className={s.view}>
      <div className={s.bar}>
        <button className={s.btn} onClick={png}>{es.results.png}</button>
        <button className={s.btn} onClick={csv}>{es.results.csv}</button>
        <span className={s.muted}>{es.results.zoomHint}</span>
      </div>
      <div ref={el} className={s.chart} />
    </div>
  )
}

function GroundTrack({ ship }: { ship: ShipResult }) {
  const lat = ship.columns['Earth.Latitude'], lon = ship.columns['Earth.Longitude']
  // Corta la línea donde cruza ±180° para no atravesar el mapa.
  const parts: string[][] = [[]]
  lon.forEach((x, i) => {
    const y = lat[i]
    if (typeof x !== 'number' || typeof y !== 'number') return
    const prev = lon[i - 1]
    if (typeof prev === 'number' && Math.abs(x - prev) > 180) parts.push([])
    parts[parts.length - 1].push(`${x.toFixed(3)},${(-y).toFixed(3)}`)
  })
  const first = parts.find((p) => p.length)?.[0]
  const last = parts.at(-1)?.at(-1)
  const lines = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]
  return (
    <div className={s.view}>
      <div className={s.bar}><span className={s.muted}>{es.results.trackHint}</span></div>
      <svg className={s.track} viewBox="-180 -90 360 180" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={es.results.groundTrack(ship.name)}>
        <rect x={-180} y={-90} width={360} height={180} className={s.sea} />
        {lines.map((v) => <line key={`m${v}`} x1={v} x2={v} y1={-90} y2={90} className={v ? s.grid : s.axis} />)}
        {lines.filter((v) => Math.abs(v) < 90).map((v) => <line key={`p${v}`} x1={-180} x2={180} y1={v} y2={v} className={v ? s.grid : s.axis} />)}
        {parts.map((p, i) => p.length > 1 && <polyline key={i} points={p.join(' ')} className={s.path} />)}
        {first && <circle cx={first.split(',')[0]} cy={first.split(',')[1]} r={2} className={s.start} />}
        {last && <circle cx={last.split(',')[0]} cy={last.split(',')[1]} r={2} className={s.end} />}
      </svg>
    </div>
  )
}

export default function Results() {
  const results = useApp((st) => st.results)
  const [key, setKey] = useState('')
  if (!results) return <div className={s.empty}>{es.results.none}</div>

  const views: { key: string; label: string; render: () => React.ReactNode }[] = []
  for (const x of results.xyplots) views.push({ key: `xy:${x.name}`, label: es.results.xyplot(x.name), render: () => <XYChart plot={x} /> })
  for (const sh of results.ships) {
    views.push({ key: `gt:${sh.name}`, label: es.results.groundTrack(sh.name), render: () => <GroundTrack ship={sh} /> })
    const headers = Object.keys(sh.columns)
    const n = sh.columns[headers[0]]?.length ?? 0
    const rows = Array.from({ length: n }, (_, i) => headers.map((h) => sh.columns[h][i]))
    views.push({ key: `sc:${sh.name}`, label: es.results.shipTable(sh.name), render: () => <Table name={sh.name} headers={headers} rows={rows} /> })
  }
  for (const r of results.reports) {
    views.push({ key: `rf:${r.name}`, label: es.results.report(r.name), render: () => <Table name={r.name} headers={r.headers} rows={r.rows} file={r.file} /> })
  }
  if (!views.length) return <div className={s.empty}>{es.results.empty}</div>
  const view = views.find((v) => v.key === key) ?? views[0]

  return (
    <div className={s.root}>
      <label className={s.pick}>
        {es.results.pick}
        <select value={view.key} onChange={(e) => setKey(e.target.value)}>
          {views.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
      </label>
      {view.render()}
    </div>
  )
}
