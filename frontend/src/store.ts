import { create } from 'zustand'
import { es } from './i18n/es'
import type { Command, Mission } from './model/mission'
import type { Results, SolverEvent, SolverRun } from './model/results'
import type { FieldSchema, ParamInfo, TypeInfo } from './model/schema'

export type LeftTab = 'resources' | 'mission'
export type CenterTab = 'editor' | 'resource' | 'command' | 'view3d' | 'results' | 'solver'
type Engine = { state: 'checking' | 'ready' | 'error'; version?: string; detail?: string }
export type LogLevel = 'info' | 'warning' | 'error' | 'system'
export type LogEntry = { level: LogLevel; text: string; line?: number }
export type Sample = { id: string; name: string; folder: string; description: string }
// rev cambia solo cuando el texto viene de fuera del editor (Nuevo/Abrir/Ejemplo).
type Doc = { text: string; name: string; rev: number }
type RunEvent =
  | { type: 'log'; level: LogLevel; text: string; line?: number }
  | { type: 'progress'; elapsed: number }
  | { type: 'done'; results: { elapsed: number; files: string[]; available?: boolean } }
  | { type: 'error'; message: string }
  | ({ type: 'solver' } & SolverEvent)

// shortcut: la consola guarda solo las últimas líneas; subir o virtualizar si hace falta el log completo.
const MAX_LOG = 5000
// shortcut: solo las últimas corridas de solver (un Target en un bucle puede dar cientos); subir si hace falta.
const MAX_SOLVERS = 200

type AppState = {
  leftTab: LeftTab
  centerTab: CenterTab
  engine: Engine
  doc: Doc
  samples: Sample[] | null
  runId: string | null
  elapsed: number
  logs: LogEntry[]
  /** Modelo del script; si el texto no se puede analizar queda la última versión buena. */
  mission: Mission
  parseError: string | null
  types: TypeInfo[] | null
  schemas: Record<string, FieldSchema[] | 'error'>
  selected: string | null
  /** Ruta del comando seleccionado en la secuencia (índices desde la raíz). */
  selectedCmd: number[] | null
  parameters: ParamInfo[] | 'error' | null
  /** Resultados de la última corrida terminada con datos (se vacía al correr de nuevo). */
  results: Results | null
  /** Corridas de solvers (Target/Optimize) de la corrida actual, en vivo. */
  solvers: SolverRun[]
  setLeftTab: (t: LeftTab) => void
  setCenterTab: (t: CenterTab) => void
  checkEngine: () => Promise<void>
  loadText: (text: string, name: string) => void
  editText: (text: string) => void
  fetchSamples: () => Promise<void>
  loadSample: (s: Sample) => Promise<void>
  run: () => Promise<void>
  stop: () => Promise<void>
  validate: () => Promise<void>
  fetchTypes: () => Promise<void>
  fetchSchema: (type: string) => Promise<void>
  select: (name: string | null) => void
  selectCmd: (path: number[] | null) => void
  /** GET /api/parameters (parámetros calculados del motor), una vez. */
  fetchParameters: () => Promise<void>
  /** Una línea de la secuencia → comando (con args) usando el parser del backend; null si no es un comando. */
  parseCommand: (line: string) => Promise<Command | null>
  /** Cambio hecho desde formularios/árbol: reescribe el script desde el modelo. */
  setMission: (m: Mission, selected?: string | null) => void
  /** POST /api/convert/{state|epoch} (lo calcula el motor). Lanza Error con el detalle si falla. */
  convert: (kind: 'state' | 'epoch', body: object) => Promise<{ elements?: Record<string, number>; epoch?: string }>
}

const PARSE_DELAY_MS = 400
const post = (url: string, body: unknown) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export const useApp = create<AppState>((set, get) => {
  const log = (...entries: LogEntry[]) => set((st) => ({ logs: [...st.logs, ...entries].slice(-MAX_LOG) }))
  // seq descarta respuestas viejas: gana el último cambio, venga del texto o del modelo.
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const parseLater = () => {
    clearTimeout(timer)
    const mine = ++seq
    timer = setTimeout(async () => {
      try {
        const r = await post('/api/script/parse', { script: get().doc.text })
        const body = await r.json()
        if (mine !== seq) return
        if (!r.ok) return set({ parseError: String(body.detail ?? r.status) })
        set({ mission: body, parseError: null })
      } catch (e) {
        if (mine === seq) set({ parseError: String(e) })
      }
    }, PARSE_DELAY_MS)
  }

  const onSolver = (ev: SolverEvent) => {
    if (ev.event === 'start') {
      const { event: _, ...rest } = ev
      return set((st) => ({ solvers: [...st.solvers, { ...rest, rows: [], status: 'running' as const }].slice(-MAX_SOLVERS) }))
    }
    if (ev.event === 'end' && ev.status === 'failed') log({ level: 'warning', text: es.solver.failedLog(ev.solver, ev.iterations) })
    set((st) => ({
      solvers: st.solvers.map((r) => {
        if (r.run !== ev.run) return r
        if (ev.event === 'end') return { ...r, status: ev.status, iterations: ev.iterations, message: ev.message }
        const { event: _, run: _r, solver: _s, ...row } = ev
        return { ...r, rows: [...r.rows, row] }
      }),
    }))
  }

  return {
    leftTab: 'resources',
    centerTab: 'editor',
    engine: { state: 'checking' },
    doc: { text: '', name: 'mision.script', rev: 0 },
    samples: null,
    runId: null,
    elapsed: 0,
    logs: [],
    mission: { resources: [], sequence: [], raw: [] },
    parseError: null,
    types: null,
    schemas: {},
    selected: null,
    selectedCmd: null,
    parameters: null,
    results: null,
    solvers: [],
    setLeftTab: (leftTab) => set({ leftTab }),
    setCenterTab: (centerTab) => set({ centerTab }),
    checkEngine: async () => {
      try {
        const r = await fetch('/api/health')
        const body = await r.json()
        set({
          engine: body.status === 'ok'
            ? { state: 'ready', version: body.version }
            : { state: 'error', detail: body.detail },
        })
      } catch (e) {
        set({ engine: { state: 'error', detail: String(e) } })
      }
    },
    loadText: (text, name) => {
      set((st) => ({ doc: { text, name, rev: st.doc.rev + 1 }, centerTab: 'editor', selected: null, selectedCmd: null, results: null, solvers: [] }))
      parseLater()
    },
    editText: (text) => {
      if (text === get().doc.text) return  // eco del editor tras setMission/loadText
      set((st) => ({ doc: { ...st.doc, text } }))
      parseLater()
    },
    fetchSamples: async () => {
      if (get().samples) return
      try {
        set({ samples: await (await fetch('/api/samples')).json() })
      } catch (e) {
        log({ level: 'error', text: `${es.samples.error}: ${e}` })
      }
    },
    loadSample: async (s) => {
      const r = await fetch(`/api/samples/${s.id}`)
      if (!r.ok) return log({ level: 'error', text: es.samples.error })
      get().loadText((await r.json()).text, s.id.split('/').pop()!)
    },
    run: async () => {
      if (get().runId) return
      set({ logs: [{ level: 'system', text: es.run.starting(get().doc.name) }], elapsed: 0, results: null, solvers: [] })
      let body
      try {
        const r = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: get().doc.text }),
        })
        body = await r.json()
        if (!r.ok) {
          return log({ level: 'error', text: `${es.run.rejected}: ${body.detail}`, line: body.line ?? undefined })
        }
      } catch (e) {
        return log({ level: 'error', text: `${es.run.failed}: ${e}` })
      }
      const runId: string = body.runId
      set({ runId })
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/runs/${runId}`)
      const finish = () => { if (get().runId === runId) set({ runId: null }) }
      ws.onmessage = (m) => {
        const ev: RunEvent = JSON.parse(m.data)
        if (ev.type === 'log') log({ level: ev.level, text: ev.text, line: ev.line })
        else if (ev.type === 'progress') set({ elapsed: ev.elapsed })
        else if (ev.type === 'solver') onSolver(ev)
        else if (ev.type === 'done') {
          log({ level: 'system', text: es.run.done(ev.results.elapsed, ev.results.files) })
          finish()
          if (ev.results.available) {
            fetch(`/api/runs/${runId}/results`)
              .then(async (r) => {
                if (!r.ok) throw new Error(String(r.status))
                set({ results: { runId, ...(await r.json()) } })
                log({ level: 'system', text: es.results.ready })
              })
              .catch((e) => log({ level: 'error', text: `${es.results.failed}: ${e}` }))
          }
        } else {
          log({ level: 'error', text: ev.message })
          finish()
        }
      }
      ws.onclose = () => {
        if (get().runId === runId) log({ level: 'error', text: es.run.lost })
        finish()
      }
    },
    stop: async () => {
      const { runId } = get()
      if (runId) await fetch(`/api/runs/${runId}`, { method: 'DELETE' })
    },
    validate: async () => {
      set({ logs: [{ level: 'system', text: es.validate.starting }] })
      try {
        const r = await post('/api/script/validate', { script: get().doc.text })
        const body: { ok: boolean; errors: LogEntry[] } = await r.json()
        if (!r.ok) return log({ level: 'error', text: `${es.validate.failed}: ${(body as { detail?: string }).detail}` })
        log(...body.errors.map((e) => ({ ...e, line: e.line ?? undefined })),
          { level: body.ok ? 'system' : 'error', text: body.ok ? es.validate.ok : es.validate.bad })
      } catch (e) {
        log({ level: 'error', text: `${es.validate.failed}: ${e}` })
      }
    },
    fetchTypes: async () => {
      if (get().types) return
      try {
        set({ types: await (await fetch('/api/schema')).json() })
      } catch (e) {
        log({ level: 'error', text: `${es.resources.schemaError}: ${e}` })
      }
    },
    fetchSchema: async (type) => {
      if (get().schemas[type]) return
      let fields: FieldSchema[] | 'error' = 'error'
      try {
        const r = await fetch(`/api/schema/${encodeURIComponent(type)}`)
        if (r.ok) fields = (await r.json()).fields ?? 'error'
      } catch { /* queda 'error' */ }
      set((st) => ({ schemas: { ...st.schemas, [type]: fields } }))
    },
    select: (selected) => set(selected ? { selected, centerTab: 'resource' } : { selected }),
    selectCmd: (selectedCmd) => set(selectedCmd ? { selectedCmd, centerTab: 'command' } : { selectedCmd }),
    fetchParameters: async () => {
      if (get().parameters) return
      try {
        const r = await fetch('/api/parameters')
        set({ parameters: r.ok ? await r.json() : 'error' })
      } catch {
        set({ parameters: 'error' })
      }
    },
    parseCommand: async (line) => {
      const r = await post('/api/script/parse', { script: `BeginMissionSequence;
${line};
` })
      if (!r.ok) return null
      const m: Mission = await r.json()
      return m.sequence.length === 1 && !m.raw.length ? m.sequence[0] : null
    },
    setMission: (mission, selected) => {
      clearTimeout(timer)
      const mine = ++seq
      set({ mission, parseError: null, ...(selected !== undefined && { selected }) })
      void (async () => {
        try {
          const r = await post('/api/script/serialize', mission)
          const body = await r.json()
          if (!r.ok) return log({ level: 'error', text: `${es.resources.serializeError}: ${body.detail}` })
          if (mine === seq) set((st) => ({ doc: { ...st.doc, text: body.script, rev: st.doc.rev + 1 } }))
        } catch (e) {
          log({ level: 'error', text: `${es.resources.serializeError}: ${e}` })
        }
      })()
    },
    convert: async (kind, body) => {
      const r = await post(`/api/convert/${kind}`, body)
      const out = await r.json()
      if (!r.ok) throw new Error(String(out.detail ?? r.status))
      return out
    },
  }
})
