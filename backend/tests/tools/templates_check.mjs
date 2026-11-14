// Corre cada plantilla (valores por defecto y extremos) por la API del backend y resume el resultado.
// Uso (backend en marcha): API=http://127.0.0.1:8000 node --experimental-strip-types backend/tests/tools/templates_check.mjs [id]
import { TEMPLATES, invalid } from '../../../frontend/src/templates.ts'
const B = process.env.API ?? 'http://127.0.0.1:8001'
const call = async (p, d) => {
  const r = await fetch(B + p, d === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const run = async (script) => {
  const { body } = await call('/api/runs', { script })
  if (!body?.runId) return { err: body }
  const t = Date.now()
  for (;;) {
    const r = await call(`/api/runs/${body.runId}/results`)
    if (r.status === 200) return { ...r.body, secs: (Date.now() - t) / 1000 }
    if (r.status !== 409 || Date.now() - t > 250e3) return { err: r.status, body: r.body, secs: (Date.now() - t) / 1000 }
    await new Promise((ok) => setTimeout(ok, 700))
  }
}
const only = process.argv[2]
for (const t of TEMPLATES) {
  if (only && t.id !== only) continue
  const def = Object.fromEntries(t.params.map((q) => [q.key, q.def]))
  const cases = [def]
  for (const q of t.params) if (!q.date) cases.push({ ...def, [q.key]: q.min }, { ...def, [q.key]: q.max })
  if (t.id === 'luna') for (const date of ['2025-01-01', '2027-07-04', '2030-10-10', '2026-12-25', '2028-02-29']) cases.push({ ...def, date })
  for (const c of cases) {
    if (invalid(t, c).length) { console.log(t.id, JSON.stringify(c), 'INVALID PARAMS', invalid(t, c)); continue }
    const s = t.build(c)
    if (/[^\x00-\x7f]/.test(s)) { console.log(t.id, 'NON ASCII'); continue }
    const v = await call('/api/script/validate', { script: s })
    if (!v.body.ok) { console.log(t.id, JSON.stringify(c), 'NO VALIDA', v.body.errors.map((e) => e.text)); continue }
    const r = await run(s)
    if (r.err) { console.log(t.id, JSON.stringify(c), 'ERROR', JSON.stringify(r)); continue }
    const rep = r.reports[0]
    console.log(t.id, JSON.stringify(c), `${r.secs.toFixed(1)}s`, 'ships', r.ships.map((x) => `${x.name}:${x.columns.A1ModJulian.length}`).join(),
      'xy', r.xyplots.map((x) => `${x.name}:${x.x.data.length}`).join(), '|', rep ? rep.headers.join(' ') + ' => ' + rep.rows.at(-1).join(' ') : 'sin reporte')
  }
}
