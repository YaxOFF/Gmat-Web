// Respuesta de GET /api/runs/{id}/results (backend/app/engine/results.py).
export type Cell = number | string | null
export type ShipResult = { name: string; columns: Record<string, Cell[]> }
export type ReportResult = { name: string; file: string; headers: string[]; rows: Cell[][] }
export type Series = { name: string; data: Cell[] }
export type XYPlotResult = { name: string; x: Series; series: Series[] }
export type Results = { runId: string; ships: ShipResult[]; reports: ReportResult[]; xyplots: XYPlotResult[] }

// Eventos `solver` del WebSocket (backend/app/engine/solver.py): lo que imprime GMAT por iteración.
type Num = number | string
export type SolverGoal = { name: string; desired: Num; achieved: Num; variance: Num; tolerance: Num; met?: boolean }
export type SolverRow = {
  iteration: number; evaluation?: number; cost?: Num; state?: string
  variables: { name: string; value: Num }[]
  goals: SolverGoal[]
  constraints: { name: string; kind: 'eq' | 'ineq'; value: Num }[]
}
type SolverBase = { run: number; solver: string }
export type SolverEvent =
  | SolverBase & { event: 'start'; kind: 'Target' | 'Optimize'; algorithm: string }
  | SolverBase & SolverRow & { event: 'iteration' }
  | { event: 'silent'; solver: string }
  | SolverBase & { event: 'end'; status: 'converged' | 'failed' | 'initial'; converged: boolean; iterations?: number; message: string }
export type SolverRun = {
  run: number; solver: string; kind: 'Target' | 'Optimize'; algorithm: string; rows: SolverRow[]
  status: 'running' | 'converged' | 'failed' | 'initial'; iterations?: number; message?: string
}
