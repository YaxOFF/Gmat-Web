// Diálogos del shell: asistente de plantillas, paleta de comandos (Ctrl+K) y recorrido guiado.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import s from './App.module.css'
import { es } from './i18n/es'
import { tourSeen, useApp } from './store'
import { invalid, TEMPLATES, type Values } from './templates'

const defaults = (id: string): Values =>
  Object.fromEntries(TEMPLATES.find((t) => t.id === id)!.params.map((p) => [p.key, p.def]))

export function TemplateDialog({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const loadText = useApp((st) => st.loadText)
  const dlg = useRef<HTMLDialogElement>(null)
  const [id, setId] = useState(initial ?? TEMPLATES[0].id)
  const [values, setValues] = useState<Values>(() => defaults(initial ?? TEMPLATES[0].id))
  useEffect(() => { dlg.current?.showModal() }, [])
  const t = TEMPLATES.find((x) => x.id === id)!
  const T = es.templates.items[id]
  const bad = invalid(t, values)
  const pick = (next: string) => { setId(next); setValues(defaults(next)) }
  const create = () => {
    if (bad.length) return
    loadText(t.build(values), t.file)
    dlg.current?.close()
  }

  return (
    <dialog ref={dlg} className={s.dialog} onClose={onClose} aria-label={es.templates.title}>
      <div className={s.dialogHead}>
        <strong className={s.grow}>{es.templates.title}</strong>
        <button className={s.btn} onClick={() => dlg.current?.close()}>{es.templates.close}</button>
      </div>
      <div className={s.dialogBody}>
        <p className={s.hint}>{es.templates.intro}</p>
        <div className={s.cards} role="radiogroup" aria-label={es.templates.title}>
          {TEMPLATES.map((x) => (
            <button key={x.id} role="radio" aria-checked={x.id === id} className={s.card} onClick={() => pick(x.id)}>
              <strong>{es.templates.items[x.id].title}</strong>
              <small>{es.templates.items[x.id].desc}</small>
            </button>
          ))}
        </div>
        <form className={s.params} onSubmit={(e) => { e.preventDefault(); create() }}>
          {t.params.map((p) => (
            <label key={p.key} className={s.param}>
              <span>{T.params[p.key]}</span>
              <input className={s.input} type={p.date ? 'date' : 'number'} min={p.min} max={p.max} step={p.step} required
                value={values[p.key]} aria-invalid={bad.includes(p.key)}
                onChange={(e) => setValues({ ...values, [p.key]: e.target.value })} />
              <small className={bad.includes(p.key) ? s.paramBad : s.paramHelp} role={bad.includes(p.key) ? 'alert' : undefined}>
                {p.date ? (bad.includes(p.key) ? es.templates.badDate : '') : es.templates.outOfRange(p.min!, p.max!)}
              </small>
            </label>
          ))}
          <div className={s.paramsFoot}>
            <span className={s.hint}>{es.templates.after}</span>
            <button type="submit" className={s.btnRun} disabled={bad.length > 0}>{es.templates.create}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

export type Action = { label: string; keys?: string; run: () => void }
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Palette({ actions, onClose }: { actions: Action[]; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  useEffect(() => { dlg.current?.showModal() }, [])
  const words = fold(q).split(/\s+/).filter(Boolean)
  const shown = actions.filter((a) => words.every((w) => fold(a.label).includes(w)))
  const cur = Math.min(at, shown.length - 1)
  const go = (a: Action | undefined) => {
    if (!a) return
    dlg.current?.close()
    a.run()
  }

  return (
    <dialog ref={dlg} className={s.palette} onClose={onClose} aria-label={es.palette.title}>
      <input className={s.input} autoFocus placeholder={es.palette.filter} value={q} role="combobox" aria-expanded
        aria-controls="palette-list" aria-activedescendant={shown.length ? `palette-${cur}` : undefined} aria-label={es.palette.title}
        onChange={(e) => { setQ(e.target.value); setAt(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(cur + 1, shown.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(cur - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); go(shown[cur]) }
        }} />
      <div id="palette-list" className={s.paletteList} role="listbox" aria-label={es.palette.title}>
        {shown.length === 0 && <p className={s.hint}>{es.palette.none}</p>}
        {shown.map((a, i) => (
          <div key={a.label} id={`palette-${i}`} role="option" aria-selected={i === cur} className={s.paletteItem}
            ref={i === cur ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
            onMouseMove={() => setAt(i)} onClick={() => go(a)}>
            <span>{a.label}</span>{a.keys && <kbd>{a.keys}</kbd>}
          </div>
        ))}
      </div>
      <div className={s.paletteFoot}>{es.palette.hint}</div>
    </dialog>
  )
}

export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<DOMRect | null>(null)
  const steps = es.tour.steps
  const step = steps[i]
  const card = useRef<HTMLDivElement>(null)
  const end = () => { tourSeen(true); onClose() }
  // Marco sobre la zona del paso; se recalcula si cambia el tamaño de la ventana. Zona oculta (móvil): sin marco.
  useLayoutEffect(() => {
    const place = () => {
      const r = document.querySelector(`[data-tour="${step.sel}"]`)?.getBoundingClientRect()
      setBox(r && r.width > 0 ? r : null)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [step.sel])
  useEffect(() => { card.current?.focus() }, [i])

  return (
    <>
      {box && <div className={s.tourBox} style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />}
      <div ref={card} className={s.tourCard} role="dialog" aria-label={es.tour.title} tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape') end() }}>
        <strong>{step.title}</strong>
        <p>{step.text}</p>
        <div className={s.tourBar}>
          <span className={s.hint}>{es.tour.step(i + 1, steps.length)}</span>
          <button className={s.btn} onClick={end}>{es.tour.skip}</button>
          <button className={s.btn} disabled={i === 0} onClick={() => setI(i - 1)}>{es.tour.prev}</button>
          {i < steps.length - 1
            ? <button className={s.btnRun} onClick={() => setI(i + 1)}>{es.tour.next}</button>
            : <button className={s.btnRun} onClick={end}>{es.tour.done}</button>}
        </div>
      </div>
    </>
  )
}
