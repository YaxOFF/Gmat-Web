import { create } from 'zustand'

export type LeftTab = 'resources' | 'mission'
export type CenterTab = 'editor' | 'view3d' | 'plots' | 'reports'
type Engine = { state: 'checking' | 'ready' | 'error'; version?: string; detail?: string }

type AppState = {
  leftTab: LeftTab
  centerTab: CenterTab
  engine: Engine
  setLeftTab: (t: LeftTab) => void
  setCenterTab: (t: CenterTab) => void
  checkEngine: () => Promise<void>
}

export const useApp = create<AppState>((set) => ({
  leftTab: 'resources',
  centerTab: 'editor',
  engine: { state: 'checking' },
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
}))
