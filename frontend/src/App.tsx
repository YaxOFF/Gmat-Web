import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { es } from './i18n/es'
import { useApp, type CenterTab, type LeftTab, type Sample } from './store'
import s from './App.module.css'

// Monaco pesa: se carga aparte del shell.
const ScriptEditor = lazy(() => import('./editor/ScriptEditor'))
const goto = (line: number) => import('./editor/gmat').then((m) => m.revealLine(line))

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

function SampleGallery({ onClose }: { onClose: () => void }) {
  const { samples, fetchSamples, loadSample } = useApp()
  const [q, setQ] = useState('')
  const dlg = useRef<HTMLDialogElement>(null)
  useEffect(() => { dlg.current?.showModal(); void fetchSamples() }, [fetchSamples])

  const needle = q.toLowerCase()
  const groups = new Map<string, Sample[]>()
  for (const x of samples ?? []) {
    if (needle && !`${x.id} ${x.description}`.toLowerCase().includes(needle)) continue
    groups.set(x.folder, [...(groups.get(x.folder) ?? []), x])
  }
  const pick = (x: Sample) => { void loadSample(x); onClose() }

  return (
    <dialog ref={dlg} className={s.dialog} onClose={onClose} aria-label={es.samples.title}>
      <div className={s.dialogHead}>
        <strong>{es.samples.title}</strong>
        <input className={s.input} autoFocus placeholder={es.samples.filter} value={q}
          onChange={(e) => setQ(e.target.value)} />
        <button className={s.btn} onClick={onClose}>{es.samples.close}</button>
      </div>
      <div className={s.dialogBody}>
        {!samples && es.samples.loading}
        {[...groups].map(([folder, items]) => (
          <section key={folder}>
            <h3 className={s.group}>{folder || es.samples.root}</h3>
            {items.map((x) => (
              <button key={x.id} className={s.sample} onClick={() => pick(x)}>
                <span>{x.name}</span><small>{x.description}</small>
              </button>
            ))}
          </section>
        ))}
      </div>
    </dialog>
  )
}

function Console() {
  const { logs, runId, elapsed } = useApp()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [logs])
  return (
    <section className={s.console}>
      <div className={s.consoleTitle}>
        {es.console}{runId && <span className={s.running}>{es.run.running(elapsed)}</span>}
      </div>
      <div className={s.log} role="log">
        {logs.map((l, i) => l.line
          ? <button key={i} className={s.logLine} data-level={l.level} title={es.run.gotoLine(l.line)}
              onClick={() => void goto(l.line!)}>{l.text}</button>
          : <div key={i} className={s.logLine} data-level={l.level}>{l.text}</div>)}
        <div ref={end} />
      </div>
    </section>
  )
}

export default function App() {
  const { leftTab, centerTab, setLeftTab, setCenterTab, checkEngine, doc, loadText, runId, run, stop } = useApp()
  const [gallery, setGallery] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { void checkEngine() }, [checkEngine])

  const save = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([doc.text], { type: 'text/plain' }))
    a.download = doc.name.endsWith('.script') ? doc.name : `${doc.name}.script`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const open = async (f: File | undefined) => { if (f) loadText(await f.text(), f.name) }

  return (
    <div className={s.app}>
      <header className={s.toolbar}>
        <strong className={s.brand}>{es.appName}</strong>
        <button className={s.btn} onClick={() => loadText('', 'mision.script')}>{es.toolbar.new}</button>
        <button className={s.btn} onClick={() => file.current?.click()}>{es.toolbar.open}</button>
        <input ref={file} type="file" accept=".script,.txt" hidden
          onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
        <button className={s.btn} onClick={() => setGallery(true)}>{es.toolbar.samples}</button>
        <button className={s.btn} onClick={save}>{es.toolbar.save}</button>
        {runId
          ? <button className={s.btnStop} onClick={() => void stop()}>{es.toolbar.stop}</button>
          : <button className={s.btnRun} onClick={() => void run()} disabled={!doc.text.trim()}>{es.toolbar.run}</button>}
        <span className={s.docName}>{doc.name}</span>
        <EngineStatus />
      </header>
      <aside className={s.left}>
        <Tabs<LeftTab> items={es.left} value={leftTab} onChange={setLeftTab} />
        <div className={s.pane}>{es.empty}</div>
      </aside>
      <main className={s.center}>
        <Tabs<CenterTab> items={es.center} value={centerTab} onChange={setCenterTab} />
        {/* el editor queda montado (oculto) para no perder deshacer/cursor al cambiar de pestaña */}
        <div className={s.editorPane} hidden={centerTab !== 'editor'}>
          <Suspense fallback={null}><ScriptEditor /></Suspense>
        </div>
        {centerTab !== 'editor' && <div className={s.pane}>{es.empty}</div>}
      </main>
      <Console />
      {gallery && <SampleGallery onClose={() => setGallery(false)} />}
    </div>
  )
}
