import { useEffect } from 'react'
import { es } from './i18n/es'
import { useApp, type CenterTab, type LeftTab } from './store'
import s from './App.module.css'

function Tabs<T extends string>({ items, value, onChange }: {
  items: Record<T, string>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className={s.tabs} role="tablist">
      {(Object.keys(items) as T[]).map((k) => (
        <button key={k} role="tab" aria-selected={k === value}
          className={k === value ? s.tabActive : s.tab} onClick={() => onChange(k)}>
          {items[k]}
        </button>
      ))}
    </div>
  )
}

function EngineStatus() {
  const engine = useApp((st) => st.engine)
  const label = engine.state === 'ready' ? es.engine.ready(engine.version ?? '')
    : engine.state === 'error' ? es.engine.error : es.engine.checking
  return (
    <span className={s.status} data-state={engine.state} title={engine.detail} role="status">
      <span className={s.dot} />{label}
    </span>
  )
}

export default function App() {
  const { leftTab, centerTab, setLeftTab, setCenterTab, checkEngine } = useApp()
  useEffect(() => { void checkEngine() }, [checkEngine])

  return (
    <div className={s.app}>
      <header className={s.toolbar}>
        <strong className={s.brand}>{es.appName}</strong>
        {/* shortcut: botones sin acción hasta las fases de archivo/corrida */}
        {Object.values(es.toolbar).map((t) => <button key={t} className={s.btn}>{t}</button>)}
        <EngineStatus />
      </header>
      <aside className={s.left}>
        <Tabs<LeftTab> items={es.left} value={leftTab} onChange={setLeftTab} />
        <div className={s.pane}>{es.empty}</div>
      </aside>
      <main className={s.center}>
        <Tabs<CenterTab> items={es.center} value={centerTab} onChange={setCenterTab} />
        <div className={s.pane}>{es.empty}</div>
      </main>
      <section className={s.console}>
        <div className={s.consoleTitle}>{es.console}</div>
        <pre className={s.log} />
      </section>
    </div>
  )
}
