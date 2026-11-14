import { useState, type ReactNode } from 'react'
import { es } from '../i18n/es'
import type { Command, Mission } from '../model/mission'
import { TextField } from '../resources/Field'
import r from '../resources/Resources.module.css'
import { useApp } from '../store'
import {
  getAt, isBlock, lineOf, toText, updateAt,
  type Args, type AssignArgs, type BurnArgs, type PropArgs, type ReportArgs, type ToggleArgs,
} from './commands'
import s from './Mission.module.css'
import { ParamInput } from './ParamPicker'

const M = es.mission
const IDENT = /^[A-Za-z_]\w*$/
type FormProps<T> = { a: T; set: (a: T) => void; m: Mission }

/** "Sat1, Sat2" → lista de identificadores; null si alguno no es válido o está vacía. */
const names = (t: string) => {
  const out = t.split(/[\s,]+/).filter(Boolean)
  return out.length && out.every((x) => IDENT.test(x)) ? out : null
}
const ofType = (m: Mission, types: string[]) => m.resources.filter((x) => types.includes(x.type)).map((x) => x.name)

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={r.row}><label className={r.label} title={label}>{label}</label>{children}<span /></div>
)
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className={r.section}><legend className={r.legend}>{title}</legend>{children}</fieldset>
)

/** Select de recursos de ciertos tipos; conserva el valor actual aunque no exista en el modelo. */
function ResSelect({ value, options, label, onChange }: { value: string; options: string[]; label: string; onChange: (v: string) => void }) {
  return (
    <select className={r.input} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {[...new Set([value, ...options])].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

/** Lista de identificadores separados por coma, con sugerencias. */
function NamesField({ value, options, label, onChange }: { value: string[]; options: string[]; label: string; onChange: (v: string[]) => void }) {
  const id = `names-${label}`
  return (
    <>
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      <TextField key={value.join()} value={value.join(', ')} placeholder="Sat" list={id} label={label} help={label}
        onCommit={(t) => { const v = names(t); if (v) onChange(v); return !!v }} />
    </>
  )
}

const Del = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button className={r.btn} title={M.del} aria-label={`${M.del} ${label}`} onClick={onClick}>×</button>
)
const without = <T,>(l: T[], i: number) => l.filter((_, k) => k !== i)
const replace = <T,>(l: T[], i: number, v: T) => l.map((x, k) => (k === i ? v : x))

function PropagateForm({ a, set, m }: FormProps<PropArgs>) {
  const sats = ofType(m, ['Spacecraft', 'Formation'])
  return (
    <>
      <div className={r.checks}>
        <label><input type="checkbox" checked={a.mode === 'Synchronized'}
          onChange={(e) => set({ ...a, mode: e.target.checked ? 'Synchronized' : '' })} /> {M.synchronized}</label>
        <label><input type="checkbox" checked={a.backwards}
          onChange={(e) => set({ ...a, backwards: e.target.checked })} /> {M.backwards}</label>
      </div>
      <Section title={M.propagators}>
        <div className={s.list}>
          {a.props.map((p, i) => (
            <div key={i} className={s.listRow}>
              <ResSelect value={p.prop} options={ofType(m, ['Propagator'])} label={`${M.propagator} ${i + 1}`}
                onChange={(prop) => set({ ...a, props: replace(a.props, i, { ...p, prop }) })} />
              <NamesField value={p.sats} options={sats} label={`${M.sats} ${i + 1}`}
                onChange={(v) => set({ ...a, props: replace(a.props, i, { ...p, sats: v }) })} />
              {a.props.length > 1 && <Del label={p.prop} onClick={() => set({ ...a, props: without(a.props, i) })} />}
            </div>
          ))}
        </div>
        <button className={r.btn} onClick={() => set({ ...a, props: [...a.props, { ...a.props[a.props.length - 1] }] })}>
          {M.addProp}
        </button>
      </Section>
      <Section title={M.stops}>
        <div className={s.list}>
          {a.stops.map((st, i) => (
            <div key={i} className={s.listRow}>
              <ParamInput value={st.param} label={`${M.param} ${i + 1}`}
                onCommit={(param) => set({ ...a, stops: replace(a.stops, i, { ...st, param }) })} />
              <TextField key={st.value} value={st.value} placeholder={M.value} label={`${M.value} ${i + 1}`} help={M.value}
                onCommit={(t) => { set({ ...a, stops: replace(a.stops, i, { ...st, value: t.trim() }) }); return true }} />
              <Del label={st.param} onClick={() => set({ ...a, stops: without(a.stops, i) })} />
            </div>
          ))}
        </div>
        <button className={r.btn} onClick={() => set({ ...a, stops: [...a.stops,
          { param: `${a.props[0]?.sats[0] ?? 'Sat'}.ElapsedSecs`, value: '12000' }] })}>{M.addStop}</button>
      </Section>
    </>
  )
}

const burnForm = (types: string[]) => function BurnForm({ a, set, m }: FormProps<BurnArgs>) {
  return (
    <>
      <Row label={M.burn}><ResSelect value={a.burn} options={ofType(m, types)} label={M.burn}
        onChange={(burn) => set({ ...a, burn })} /></Row>
      <Row label={M.sats}><NamesField value={a.sats} options={ofType(m, ['Spacecraft'])} label={M.sats}
        onChange={(sats) => set({ ...a, sats })} /></Row>
    </>
  )
}

function ReportForm({ a, set, m }: FormProps<ReportArgs>) {
  return (
    <>
      <Row label={M.file}><ResSelect value={a.file} options={ofType(m, ['ReportFile'])} label={M.file}
        onChange={(file) => set({ ...a, file })} /></Row>
      <Section title={M.params}>
        <div className={s.list}>
          {a.params.map((p, i) => (
            <div key={i} className={s.listRow}>
              <ParamInput value={p} label={`${M.param} ${i + 1}`} onCommit={(v) => set({ ...a, params: replace(a.params, i, v) })} />
              <Del label={p} onClick={() => set({ ...a, params: without(a.params, i) })} />
            </div>
          ))}
        </div>
        <button className={r.btn} onClick={() => set({ ...a, params: [...a.params, a.params[a.params.length - 1] ?? 'Sat.A1ModJulian'] })}>
          {M.addParam}
        </button>
      </Section>
    </>
  )
}

function ToggleForm({ a, set, m }: FormProps<ToggleArgs>) {
  const subs = m.resources.filter((x) => /File|Plot|View|Report/.test(x.type)).map((x) => x.name)
  return (
    <>
      <Row label={M.subs}><NamesField value={a.subs} options={subs} label={M.subs} onChange={(v) => set({ ...a, subs: v })} /></Row>
      <Row label={M.state}><ResSelect value={a.state} options={['On', 'Off']} label={M.state}
        onChange={(state) => set({ ...a, state })} /></Row>
    </>
  )
}

function AssignForm({ a, set }: FormProps<AssignArgs>) {
  return (
    <>
      <Row label={M.lhs}><ParamInput value={a.lhs} label={M.lhs} onCommit={(lhs) => set({ ...a, lhs })} /></Row>
      <Row label={M.rhs}><TextField key={a.rhs} value={a.rhs} placeholder="0" label={M.rhs} help={M.rhs}
        onCommit={(t) => { const ok = !!t.trim() && !t.includes(';'); if (ok) set({ ...a, rhs: t.trim() }); return ok }} /></Row>
    </>
  )
}

// shortcut: Target/Vary/Achieve, Optimize/Minimize/NonlinearConstraint e If/While/For usan la línea de texto (Fase 5b).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FORMS: Partial<Record<string, (p: FormProps<any>) => ReactNode>> = {
  Propagate: PropagateForm, Maneuver: burnForm(['ImpulsiveBurn']), BeginFiniteBurn: burnForm(['FiniteBurn']),
  EndFiniteBurn: burnForm(['FiniteBurn']), Report: ReportForm, Toggle: ToggleForm, GMAT: AssignForm,
}

/** Editor de la línea completa: se analiza con el parser del backend al confirmar. */
function LineEditor({ c, onSave }: { c: Command; onSave: (patch: Partial<Command>) => void }) {
  const parseCommand = useApp((st) => st.parseCommand)
  const [text, setText] = useState(lineOf(c))
  const [bad, setBad] = useState(false)
  const commit = async () => {
    if (text.trim() === lineOf(c)) return setBad(false)
    const p = await parseCommand(text.trim().replace(/;$/, ''))
    const ok = !!p && isBlock(p) === isBlock(c) && !p.disabled
    setBad(!ok)
    if (ok) onSave({ cmd: p.cmd, label: p.label, text: p.text, args: p.args })
  }
  return (
    <textarea className={`${r.input} ${s.text}`} value={text} aria-label={M.line} title={M.lineHelp} aria-invalid={bad}
      onChange={(e) => setText(e.target.value)} onBlur={() => void commit()}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commit() } }} />
  )
}

export default function CommandForm() {
  const { mission, selectedCmd, setMission } = useApp()
  const c = selectedCmd ? getAt(mission.sequence, selectedCmd) : undefined
  if (!selectedCmd) return <div className={r.muted}>{M.pick}</div>
  if (!c) return <div className={r.muted}>{M.missing}</div>

  const save = (patch: Partial<Command>) =>
    setMission({ ...mission, sequence: updateAt(mission.sequence, selectedCmd, (x) => ({ ...x, ...patch })) })
  const Form = FORMS[c.cmd]
  const args = c.args && Object.keys(c.args).length ? c.args : null

  return (
    <div className={r.form}>
      <h2 className={r.title}>{c.cmd === 'GMAT' ? `${M.assign} (GMAT)` : c.cmd}{c.disabled && <small> ({M.disabled})</small>}</h2>
      <Row label={M.label}>
        <TextField key={c.label ?? ''} value={c.label ?? ''} placeholder="" label={M.label} help={M.badLabel}
          onCommit={(t) => { const ok = !t.includes("'"); if (ok) save({ label: t.trim() || undefined }); return ok }} />
      </Row>
      {Form && args
        ? <Form a={args} m={mission} set={(a: Args) => save({ args: a, text: toText(c.cmd, a) })} />
        : <p className={r.muted}>{Form ? M.noForm : c.text ? M.noForm : M.noArgs}</p>}
      <Section title={M.line}>
        {/* key: si el comando cambia desde el formulario o el script, el texto se reinicia */}
        <LineEditor key={`${selectedCmd.join('.')}|${lineOf(c)}`} c={c} onSave={save} />
      </Section>
    </div>
  )
}
