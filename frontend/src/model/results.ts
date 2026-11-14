// Respuesta de GET /api/runs/{id}/results (backend/app/engine/results.py).
export type Cell = number | string | null
export type ShipResult = { name: string; columns: Record<string, Cell[]> }
export type ReportResult = { name: string; file: string; headers: string[]; rows: Cell[][] }
export type Series = { name: string; data: Cell[] }
export type XYPlotResult = { name: string; x: Series; series: Series[] }
export type Results = { runId: string; ships: ShipResult[]; reports: ReportResult[]; xyplots: XYPlotResult[] }
