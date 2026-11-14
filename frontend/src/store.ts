import { create } from 'zustand'
import { es } from './i18n/es'

export type LeftTab = 'resources' | 'mission'
export type CenterTab = 'editor' | 'view3d' | 'plots' | 'reports'
type Engine = { state: 'checking' | 'ready' | 'error'; version?: string; detail?: string }
export type LogLevel = 'info' | 'warning' | 'error' | 'system'
export type LogEntry = { level: LogLevel; text: string; line?: number }
export type Sample = { id: string; name: string; folder: string; description: string }
// rev cambia solo cuando el texto viene de fuera del editor (Nuevo/Abrir/Ejemplo).
type Doc = { text: string; name: string; rev: number }
type RunEvent =
  | { type: 'log'; level: LogLevel; text: string; line?: number }
  | { type: 'progress'; elapsed: number }
  | { type: 'done'; results: { elapsed: number; files: string[] } }
  | { type: 'error'; message: string }

// shortcut: la consola guarda solo las últimas líneas; subir o virtualizar si hace falta el log completo.
const MAX_LOG = 5000

type AppState = {
  leftTab: LeftTab
  centerTab: CenterTab
  engine: Engine
  doc: Doc
  samples: Sample[] | null
  runId: string | null
  elapsed: number
  logs: LogEntry[]
  setLeftTab: (t: LeftTab) => void
  setCenterTab: (t: CenterTab) => void
  checkEngine: () => Promise<void>
  loadText: (text: string, name: string) => void
  editText: (text: string) => void
  fetchSamples: () => Promise<void>
  loadSample: (s: Sample) => Promise<void>
  run: () => Promise<void>
  stop: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => {
  const log = (...entries: LogEntry[]) => set((st) => ({ logs: [...st.logs, ...entries].slice(-MAX_LOG) }))

  return {
    leftTab: 'resources',
    centerTab: 'editor',
    engine: { state: 'checking' },
    doc: { text: '', name: 'mision.script', rev: 0 },
    samples: null,
    runId: null,
    elapsed: 0,
    logs: [],
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
    loadText: (text, name) => set((st) => ({ doc: { text, name, rev: st.doc.rev + 1 }, centerTab: 'editor' })),
    editText: (text) => set((st) => ({ doc: { ...st.doc, text } })),
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
      set({ logs: [{ level: 'system', text: es.run.starting(get().doc.name) }], elapsed: 0 })
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
        else if (ev.type === 'done') {
          log({ level: 'system', text: es.run.done(ev.results.elapsed, ev.results.files) })
          finish()
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
  }
})
