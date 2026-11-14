import { useEffect, useState } from 'react'
import { es } from '../i18n/es'
import type { Resource, Value } from '../model/mission'
import type { FieldSchema } from '../model/schema'
import { useApp } from '../store'
import s from './Resources.module.css'

const NUMERIC = new Set(['Real', 'Integer', 'UnsignedInt'])

const show = (v: Value | null | undefined): string =>
  v === null || v === undefined ? ''
    : Array.isArray(v) ? v.map(show).join(Array.isArray(v[0]) ? '; ' : ', ')
      : typeof v === 'object' ? v.ref : String(v)

/** Texto del formulario → valor del modelo. undefined = inválido; null = quitar (usar default). */
function parse(text: string, f: FieldSchema, names: Set<string>): Value | null | undefined {
  const t = text.trim()
  if (!t) return null
  const token = (x: string): Value => (names.has(x) ? { ref: x } : x)
  if (NUMERIC.has(f.type)) {
    const n = Number(t)
    return Number.isFinite(n) && (f.type === 'Real' || Number.isInteger(n)) ? n : undefined
  }
  if (f.type === 'Object') return token(t)
  if (f.type.includes('Array') || /^(Rvector|Rmatrix|Unsigned)/.test(f.type)) {
    // listas: "Sat1, Sat2" o "1 0 0"
    return t.replace(/^[[{]|[\]}]$/g, '').split(/[\s,]+/).filter(Boolean)
      .map((x) => (x !== '' && Number.isFinite(Number(x)) ? Number(x) : token(x)))
  }
  return t
}

function TextField({ value, placeholder, list, onCommit, label, help }: {
  value: string
  placeholder: string
  list?: string
  label: string
  help: string
  onCommit: (text: string) => boolean
}) {
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  const commit = () => { if (text !== value) setBad(!onCommit(text)) }
  return (
    <input className={s.input} value={text} placeholder={placeholder} list={list} aria-label={label} title={help}
      aria-invalid={bad} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }} />
  )
}

function Field({ f, r }: { f: FieldSchema; r: Resource }) {
  const { mission, types, setMission } = useApp()
  const names = new Set(mission.resources.map((x) => x.name))
  const set = r.fields[f.name] !== undefined
  const help = es.form.help(f.type, f.default, f.unit)

  const update = (v: Value | null) => {
    const fields = { ...r.fields }
    if (v === null) delete fields[f.name]
    else fields[f.name] = v
    setMission({ ...mission, resources: mission.resources.map((x) => (x === r ? { ...r, fields } : x)) })
  }
  const current = set ? r.fields[f.name] : f.default

  let input
  if (f.type === 'Boolean') {
    input = <input type="checkbox" checked={current === true} aria-label={f.name} title={help}
      onChange={(e) => update(e.target.checked)} />
  } else if (f.enum?.length) {
    const opts = f.enum.includes(show(current)) ? f.enum : [show(current), ...f.enum]
    input = (
      <select className={s.input} value={show(current)} aria-label={f.name} title={help}
        onChange={(e) => update(e.target.value)}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  } else {
    // referencias: objetos del modelo del tipo pedido (o todos si el tipo no se reconoce); se puede escribir otro (Earth…)
    let list: string | undefined
    if (f.refType !== undefined) {
      const ofType = new Set(types?.filter((t) => t.objectType === f.refType).map((t) => t.type))
      const cands = mission.resources.filter((x) => ofType.has(x.type))
      list = `refs-${f.name}`
      input = (
        <datalist id={list}>
          {(cands.length ? cands : mission.resources).map((x) => <option key={x.name} value={x.name} />)}
        </datalist>
      )
    }
    input = (
      <>
        {input}
        {/* key: si el valor cambia desde el script, el campo se reinicia */}
        <TextField key={show(r.fields[f.name])} value={set ? show(r.fields[f.name]) : ''} placeholder={show(f.default)} list={list}
          label={f.name} help={help} onCommit={(text) => {
            const v = parse(text, f, names)
            if (v !== undefined) update(v)
            return v !== undefined
          }} />
      </>
    )
  }

  return (
    <div className={s.row} data-set={set || undefined}>
      <label className={s.label} title={help}>{f.name}{f.unit && <small> ({f.unit})</small>}</label>
      {input}
      <button className={s.reset} disabled={!set} title={es.form.reset} aria-label={`${es.form.reset}: ${f.name}`}
        onClick={() => update(null)}>↺</button>
    </div>
  )
}

export default function ResourceForm() {
  const { mission, selected, schemas, fetchSchema } = useApp()
  const r = mission.resources.find((x) => x.name === selected)
  const type = r?.type
  useEffect(() => { if (type) void fetchSchema(type) }, [type, fetchSchema])

  if (!selected) return <div className={s.muted}>{es.form.pick}</div>
  if (!r) return <div className={s.muted}>{es.form.missing(selected)}</div>
  const schema = schemas[r.type]
  if (!schema) return <div className={s.muted}>{es.form.loading}</div>
  if (schema === 'error') return <div className={s.muted}>{es.form.error(r.type)}</div>

  // Spacecraft: solo los elementos de la representación activa (el motor convierte al cargar).
  const rep = show(r.fields.DisplayStateType ?? schema.find((f) => f.name === 'DisplayStateType')?.default)
  const fields = schema.filter((f) => !f.readOnly && (!f.stateType || f.stateType === rep))
  return (
    <div className={s.form}>
      <h2 className={s.title}>{r.name} <small>{r.type}</small></h2>
      {fields.map((f) => <Field key={f.name} f={f} r={r} />)}
    </div>
  )
}
