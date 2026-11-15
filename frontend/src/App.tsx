import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Palette, TemplateDialog, Tour, type Action } from './Dialogs'
import { en as es } from './i18n/en'
import { TEMPLATES } from './templates'
import { tourSeen, useApp, type CenterTab, type LeftTab, type Sample } from './store'
import s from './App.module.css'

// Monaco pesa: se carga aparte del shell.
const ScriptEditor = lazy(() => import('./editor/ScriptEditor'))
const ResourceTree = lazy(() => import('./resources/ResourceTree'))
const ResourceForm = lazy(() => import('./resources/ResourceForm'))
const MissionTree = lazy(() => import('./mission/MissionTree'))
const CommandForm = lazy(() => import('./mission/CommandForm'))
const Results = lazy(() => import('./results/Results'))
const SolverPanel = lazy(() => import('./results/SolverPanel'))
const View3D = lazy(() => import('./results/View3D')) // Cesium pesa varios MB: solo al abrir la pestaña 3D
const Game = lazy(() => import('./mission-architect/App')) // juego Mission Architect: three.js solo al abrirlo
const goto = (line: number) => import('./editor/gmat').then((m) => m.revealLine(line))
const history = (what: 'undo' | 'redo') => void import('./editor/gmat').then((m) => m.history(what))

function Tabs<T extends string>({ items, value, onChange, label }: {
  label: string
  items: Record<T, string>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {(Object.keys(items) as T[]).map((k) => (
        <button key={k} role="tab" data-tab={k} aria-selected={k === value}
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

/** Estado de la validación en vivo: sin errores, o cuántos hay (clic: va al primero en el Editor). */
function IssueChip() {
  const { issues, checked, setCenterTab } = useApp()
  if (checked === null) return null
  const errors = issues.filter((i) => i.level === 'error')
  if (!errors.length) return <span className={s.chip} data-state="ok" role="status" title={es.issues.okHelp}>✓ {es.issues.ok}</span>
  const first = errors.find((i) => i.line)
  const list = errors.map((i) => `${i.line ? `${es.issues.line(i.line)}: ` : ''}${i.text}`).join('\n')
  return (
    <button className={s.chip} data-state="bad" title={`${list}\n\n${es.issues.goto}`}
      onClick={() => { setCenterTab('editor'); if (first?.line) void goto(first.line) }}>
      ⚠ {es.issues.count(errors.length)}
    </button>
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
    <section className={s.console} data-tour="console" aria-label={es.console}>
      <div className={s.consoleTitle}>
        {es.console}{runId && <span className={s.running}>{es.run.running(elapsed)}</span>}
      </div>
      <div className={s.log} role="log" tabIndex={0} aria-label={es.console}>
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
  const { leftTab, centerTab, setLeftTab, setCenterTab, checkEngine, doc, loadText, runId, run, stop, validate } = useApp()
  const resources = useApp((st) => st.mission.resources)
  const select = useApp((st) => st.select)
  const [gallery, setGallery] = useState(false)
  const [game, setGame] = useState<'off' | 'on' | 'hidden'>(() => /[?&](game|rover|landing|screen)\b/.test(location.search) ? 'on' : 'off') // 'hidden' conserva la partida
  const [templates, setTemplates] = useState<string | boolean>(false)  // true o el id de la plantilla a abrir
  const [palette, setPalette] = useState(false)
  const [tour, setTour] = useState(() => !tourSeen())
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { void checkEngine() }, [checkEngine])
  // Con el juego abierto, la zona de trabajo queda inerte: el editor no recibe teclas ni foco.
  const busy = game === 'on'
  useEffect(() => { if (busy) (document.activeElement as HTMLElement | null)?.blur?.() }, [busy])

  const save = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([doc.text], { type: 'text/plain' }))
    a.download = doc.name.endsWith('.script') ? doc.name : `${doc.name}.script`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const open = async (f: File | undefined) => { if (f) loadText(await f.text(), f.name) }
  const hasText = doc.text.trim() !== ''
  const K = es.toolbar.keys

  // Atajos globales, en fase de captura: Monaco se quedaría con Ctrl+K (acorde) y el navegador con Ctrl+S y F5.
  const keys = useRef<(e: KeyboardEvent) => void>(null)
  useEffect(() => {
    keys.current = (e) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      // el Editor (textarea de Monaco) y los campos de formulario tienen su propio deshacer
      const field = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')
      let did = true
      if (mod && k === 's') save()
      else if (mod && k === 'k') setPalette(true)
      else if (e.key === 'F5' && !mod) { if (!runId && hasText) void run() }
      else if (mod && k === 'z' && !e.shiftKey && !field) history('undo')
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey)) && !field) history('redo')
      else did = false
      if (did) { e.preventDefault(); e.stopPropagation() }
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e)
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  const actions: Action[] = [
    { label: es.toolbar.new, run: () => loadText('', 'mision.script') },
    { label: es.toolbar.open, run: () => file.current?.click() },
    { label: es.toolbar.templates, run: () => setTemplates(true) },
    ...TEMPLATES.map((t) => ({ label: es.palette.template(es.templates.items[t.id].title), run: () => setTemplates(t.id) })),
    { label: es.toolbar.samples, run: () => setGallery(true) },
    { label: es.toolbar.save, keys: K.save, run: save },
    { label: es.toolbar.undo, keys: K.undo, run: () => history('undo') },
    { label: es.toolbar.redo, keys: K.redo, run: () => history('redo') },
    ...(hasText ? [{ label: es.toolbar.validate, run: () => void validate() }] : []),
    ...(runId ? [{ label: es.toolbar.stop, run: () => void stop() }] : hasText ? [{ label: es.toolbar.run, keys: K.run, run: () => void run() }] : []),
    ...(Object.keys(es.center) as CenterTab[]).map((t) => ({ label: es.palette.goTab(es.center[t]), run: () => setCenterTab(t) })),
    ...(Object.keys(es.left) as LeftTab[]).map((t) => ({ label: es.palette.goTab(es.left[t]), run: () => setLeftTab(t) })),
    { label: es.toolbar.tour, run: () => setTour(true) },
    ...resources.map((r) => ({ label: es.palette.goResource(r.name, r.type), run: () => select(r.name) })),
  ]

  return (
    <div className={s.app}>
      <header className={s.toolbar} inert={busy}>
        <h1 className={s.brand}>{es.appName}</h1>
        <div className={s.tools} role="toolbar" aria-label={es.toolbar.main}>
          <button className={s.btn} onClick={() => loadText('', 'mision.script')}>{es.toolbar.new}</button>
          <button className={s.btn} onClick={() => file.current?.click()}>{es.toolbar.open}</button>
          <input ref={file} type="file" accept=".script,.txt" hidden aria-label={es.toolbar.open}
            onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
          <button className={s.btn} data-tour="templates" onClick={() => setTemplates(true)}>{es.toolbar.templates}</button>
          <button className={s.btn} onClick={() => setGallery(true)}>{es.toolbar.samples}</button>
          <button className={s.btnRun} onClick={() => setGame('on')}>{es.toolbar.game}</button>
          <button className={s.btn} title={K.save} onClick={save}>{es.toolbar.save}</button>
          <span className={s.sep} />
          <button className={s.btn} title={`${es.toolbar.undo} (${K.undo})`} aria-label={es.toolbar.undo} onClick={() => history('undo')}>↶</button>
          <button className={s.btn} title={`${es.toolbar.redo} (${K.redo})`} aria-label={es.toolbar.redo} onClick={() => history('redo')}>↷</button>
          <span className={s.sep} />
          <button className={s.btn} onClick={() => void validate()} disabled={!hasText}>{es.toolbar.validate}</button>
          {runId
            ? <button className={s.btnStop} data-tour="run" onClick={() => void stop()}>{es.toolbar.stop}</button>
            : <button className={s.btnRun} data-tour="run" title={K.run} onClick={() => void run()} disabled={!hasText}>{es.toolbar.run}</button>}
          <IssueChip />
        </div>
        <span className={s.docName}>{doc.name}</span>
        <button className={s.btn} title={K.palette} onClick={() => setPalette(true)}>{es.toolbar.palette}</button>
        <button className={s.btn} title={es.toolbar.tour} aria-label={es.toolbar.tour} onClick={() => setTour(true)}>?</button>
        <EngineStatus />
      </header>
      <aside className={s.left} inert={busy} data-tour="left" aria-label={`${es.left.resources} / ${es.left.mission}`}>
        <Tabs<LeftTab> label={`${es.left.resources} / ${es.left.mission}`} items={es.left} value={leftTab} onChange={setLeftTab} />
        {leftTab === 'resources'
          ? <Suspense fallback={null}><ResourceTree /></Suspense>
          : <Suspense fallback={null}><MissionTree /></Suspense>}
      </aside>
      <main className={s.center} inert={busy} data-tour="center">
        <Tabs<CenterTab> label={es.center.editor} items={es.center} value={centerTab} onChange={setCenterTab} />
        {/* el editor queda montado (oculto) para no perder deshacer/cursor al cambiar de pestaña */}
        <div className={s.editorPane} hidden={centerTab !== 'editor'}>
          <Suspense fallback={null}><ScriptEditor /></Suspense>
        </div>
        {centerTab === 'resource' && <Suspense fallback={null}><ResourceForm /></Suspense>}
        {centerTab === 'command' && <Suspense fallback={null}><CommandForm /></Suspense>}
        {centerTab === 'results' && <Suspense fallback={null}><Results /></Suspense>}
        {centerTab === 'solver' && <Suspense fallback={null}><SolverPanel /></Suspense>}
        {centerTab === 'view3d' && <Suspense fallback={null}><View3D /></Suspense>}
      </main>
      <Console />
      {gallery && <SampleGallery onClose={() => setGallery(false)} />}
      {game !== 'off' && (
        <div hidden={game === 'hidden'}>
          <Suspense fallback={null}>
            <Game onExit={() => setGame('hidden')}
              onInspect={({ text, name }) => { loadText(text, name); setGame('hidden'); void run() }} />
          </Suspense>
        </div>
      )}
      {templates && <TemplateDialog initial={typeof templates === 'string' ? templates : undefined} onClose={() => setTemplates(false)} />}
      {palette && <Palette actions={actions} onClose={() => setPalette(false)} />}
      {tour && !busy && <Tour onClose={() => setTour(false)} />}
    </div>
  )
}
