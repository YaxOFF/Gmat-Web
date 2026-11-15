import { useState } from 'react'
import { en as es } from '../i18n/en'
import type { Cell, SolverRun } from '../model/results'
import { useApp } from '../store'
import { Table, XYChart } from './Results'
import s from './Results.module.css'

const abs = (v: Cell) => (typeof v === 'number' && v !== 0 ? Math.abs(v) : null) // log: sin ceros
const num = (v: Cell) => (typeof v === 'number' ? v : null)

function table(r: SolverRun) {
  const first = r.rows[0]
  const vars = first?.variables.map((v) => v.name) ?? []
  const goals = first?.goals.map((g) => g.name) ?? []
  const cons = first?.constraints.map((c) => c.name) ?? []
  const opt = r.kind === 'Optimize'
  const headers = [es.solver.iteration, ...(opt ? [es.solver.evaluation, es.solver.cost] : []), ...vars,
    ...goals.flatMap((g) => [g, es.solver.delta(g)]), ...cons.map(es.solver.delta), ...(goals.length ? [es.solver.inTol] : []),
    ...(opt ? [es.solver.state] : [])]
  const rows: Cell[][] = r.rows.map((x) => [x.iteration, ...(opt ? [x.evaluation ?? null, x.cost ?? null] : []),
    ...x.variables.map((v) => v.value), ...x.goals.flatMap((g) => [g.achieved, g.variance]), ...x.constraints.map((c) => c.value),
    ...(goals.length ? [x.goals.every((g) => g.met) ? es.solver.yes : es.solver.no] : []), ...(opt ? [x.state ?? ''] : [])])
  return { headers, rows }
}

function chart(r: SolverRun) {
  const opt = r.kind === 'Optimize'
  const first = r.rows[0]
  const series = opt
    ? [{ name: es.solver.cost, data: r.rows.map((x) => num(x.cost ?? null)) },
       ...(first?.constraints ?? []).map((c, i) => ({ name: es.solver.delta(c.name), data: r.rows.map((x) => num(x.constraints[i]?.value ?? null)) }))]
    : (first?.goals ?? []).map((g, i) => ({ name: es.solver.delta(g.name), data: r.rows.map((x) => abs(x.goals[i]?.variance ?? null)) }))
  return { name: `${r.solver}-${r.run}`, x: { name: opt ? es.solver.evaluation : es.solver.iteration, data: r.rows.map((_, i) => i + 1) }, series }
}

export default function SolverPanel() {
  const solvers = useApp((st) => st.solvers)
  const [pick, setPick] = useState<number | null>(null)
  if (!solvers.length) return <div className={s.empty}>{es.solver.none}</div>
  const r = solvers.find((x) => x.run === pick) ?? solvers[solvers.length - 1]
  const msg = r.status === 'running' ? es.solver.running(r.solver)
    : r.status === 'converged' ? es.solver.converged(r.solver, r.iterations)
    : r.status === 'failed' ? es.solver.failed(r.solver, r.iterations) : es.solver.initial(r.solver)
  const t = table(r)
  const tols = r.rows[0]?.goals.map((g) => es.solver.tolerance(g.name, g.tolerance)).join(' · ')

  return (
    <div className={s.root}>
      {solvers.length > 1 && (
        <label className={s.pick}>
          {es.solver.pick}
          <select value={r.run} onChange={(e) => setPick(Number(e.target.value))}>
            {solvers.map((x) => <option key={x.run} value={x.run}>
              {es.solver.runLabel(x.run, x.solver, x.kind)}{x.status === 'failed' ? ' ⚠' : ''}</option>)}
          </select>
        </label>
      )}
      <div className={s.banner} data-status={r.status} role={r.status === 'failed' ? 'alert' : 'status'}>
        {r.status === 'failed' && '⚠ '}{msg}
        {r.message && <div className={s.muted}>GMAT: {r.message}</div>}
      </div>
      {r.rows.length > 0 && <>
        <div className={s.muted}>{r.kind === 'Optimize' ? es.solver.chartOptimize : es.solver.chartTarget}{tols && ` · ${tols}`}</div>
        <XYChart plot={chart(r)} log={r.kind === 'Target'} />
        <Table name={`${r.solver}-${r.run}`} headers={t.headers} rows={t.rows} />
      </>}
    </div>
  )
}
