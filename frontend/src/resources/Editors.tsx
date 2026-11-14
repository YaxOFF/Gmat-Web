// Editores dedicados (Spacecraft, ForceModel, Propagator): agrupan los campos del motor y agregan los que
// el motor no lista (GravityField.*, Drag.*, pasos del integrador). Las conversiones las hace el motor.
import { useState, type ReactNode } from 'react'
import { es } from '../i18n/es'
import type { Resource, Value } from '../model/mission'
import type { FieldSchema } from '../model/schema'
import { useApp } from '../store'
import { Field } from './Field'
import s from './Resources.module.css'
import { show } from './value'

type Props = { r: Resource; schema: FieldSchema[] }

const BODIES = ['Earth', 'Luna', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
const DATE_FORMATS = ['A1', 'TAI', 'UTC', 'TT', 'TDB'].flatMap((t) => [`${t}ModJulian`, `${t}Gregorian`])
const ATMOSPHERES = ['None', 'Exponential', 'MSISE86', 'MSISE90', 'JacchiaRoberts', 'NRLMSISE00']
const INTEGRATORS = ['RungeKutta89', 'RungeKutta68', 'RungeKutta56', 'PrinceDormand45', 'PrinceDormand78',
  'AdamsBashforthMoulton', 'BulirschStoer']
// Cartesian no trae stateType en el esquema: son parámetros normales del Spacecraft.
const CART = ['X', 'Y', 'Z', 'VX', 'VY', 'VZ']

/** Campo que el motor no lista como parámetro; valores por defecto de GMAT R2026a. */
const syn = (name: string, type: string, def: FieldSchema['default'], extra?: Partial<FieldSchema>): FieldSchema =>
  ({ name, type, readOnly: false, default: def, ...extra })

const pick = (schema: FieldSchema[], name: string, extra?: Partial<FieldSchema>): FieldSchema =>
  ({ ...(schema.find((f) => f.name === name) ?? syn(name, 'String', null)), ...extra })

/** Aplica cambios al recurso (null = quitar). Lo cambiado va al final, así el orden del script queda bien
 *  (DisplayStateType antes que los elementos, DateFormat antes que Epoch). */
function patch(name: string, changes: Record<string, Value | null>) {
  const { mission, setMission } = useApp.getState()
  setMission({
    ...mission, resources: mission.resources.map((x) => {
      if (x.name !== name) return x
      const fields = { ...x.fields }
      for (const [k, v] of Object.entries(changes)) {
        delete fields[k]
        if (v !== null) fields[k] = v
      }
      return { ...x, fields }
    }),
  })
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className={s.section}><legend className={s.legend}>{title}</legend>{children}</fieldset>
)

const Rows = ({ r, fields }: { r: Resource; fields: FieldSchema[] }) =>
  <>{fields.map((f) => <Field key={f.name} f={f} r={r} />)}</>

function Others({ r, schema, used }: Props & { used: string[] }) {
  const rest = schema.filter((f) => !f.readOnly && !f.stateType && !used.includes(f.name))
  if (!rest.length) return null
  return (
    <details className={s.section}>
      <summary className={s.legend}>{es.editors.others}</summary>
      <Rows r={r} fields={rest} />
    </details>
  )
}

/** Select cuyo cambio pasa por el motor (representación del estado, formato de época). */
function ConvertSelect({ label, value, options, onPick }: {
  label: string; value: string; options: string[]; onPick: (to: string) => Promise<void>
}) {
  const [msg, setMsg] = useState<string | null>(null)
  const busy = msg === es.editors.converting
  const opts = options.includes(value) ? options : [value, ...options]
  return (
    <div className={s.row} data-set>
      <label className={s.label}>{label}</label>
      <select className={s.input} value={value} aria-label={label} disabled={busy} onChange={async (e) => {
        setMsg(es.editors.converting)
        try {
          await onPick(e.target.value)
          setMsg(null)
        } catch (err) {
          setMsg(es.editors.convertError(err instanceof Error ? err.message : String(err)))
        }
      }}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span />
      {msg && <small className={busy ? s.note : `${s.note} ${s.warn}`}>{msg}</small>}
    </div>
  )
}

/** Lista de casillas que escribe un campo lista ({T1, T2} o {Sun, Luna}). */
function Checks({ r, field, options, empty, asRef }: {
  r: Resource; field: string; options: string[]; empty?: string; asRef?: boolean
}) {
  const cur = r.fields[field]
  const on = new Set((Array.isArray(cur) ? cur : []).map(show))
  const all = [...new Set([...options, ...on])]
  if (!all.length) return <div className={s.note}>{empty}</div>
  const toggle = (name: string) => {
    const next = all.filter((n) => (n === name ? !on.has(n) : on.has(n)))
    patch(r.name, { [field]: next.length ? next.map((n) => (asRef ? { ref: n } : n)) : null })
  }
  return (
    <div className={s.checks} role="group" aria-label={field}>
      <span className={s.label}>{field}</span>
      {all.map((n) => (
        <label key={n}><input type="checkbox" checked={on.has(n)} onChange={() => toggle(n)} /> {n}</label>
      ))}
    </div>
  )
}

function SpacecraftEditor({ r, schema }: Props) {
  const { mission, convert } = useApp()
  const val = (name: string) => r.fields[name] ?? schema.find((f) => f.name === name)?.default
  const rep = show(val('DisplayStateType'))
  const stateOf = (t: string) => schema.filter((f) => (t === 'Cartesian' ? CART.includes(f.name) : f.stateType === t))
  const repOptions = schema.find((f) => f.name === 'DisplayStateType')?.enum ?? []

  const toRep = async (to: string) => {
    const from = stateOf(rep)
    const elements = Object.fromEntries(from.map((f) => [f.name, Number(show(val(f.name)))]))
    if (!from.length || Object.values(elements).some((v) => !Number.isFinite(v))) throw new Error(rep)
    // shortcut: /convert/state usa EarthMJ2000Eq (mu terrestre); con otro cuerpo central la conversión no aplica,
    // mandar CoordinateSystem al endpoint cuando haya misiones fuera de la Tierra.
    const out = await convert('state', { fromType: rep, toType: to, elements })
    patch(r.name, {
      DisplayStateType: to, ...Object.fromEntries(from.map((f) => [f.name, null])), ...out.elements,
    })
  }
  const toFormat = async (to: string) => {
    const out = await convert('epoch', { fromFormat: show(val('DateFormat')), toFormat: to, epoch: show(val('Epoch')) })
    patch(r.name, { DateFormat: to, Epoch: out.epoch ?? null })
  }
  const named = (re: RegExp) => mission.resources.filter((x) => re.test(x.type)).map((x) => x.name)
  const mass = ['DryMass', 'Cd', 'Cr', 'DragArea', 'SRPArea']

  return (
    <>
      <Section title={es.editors.state}>
        <ConvertSelect label="DisplayStateType" value={rep} options={repOptions} onPick={toRep} />
        <Rows r={r} fields={[pick(schema, 'CoordinateSystem'), ...stateOf(rep)]} />
      </Section>
      <Section title={es.editors.epoch}>
        <ConvertSelect label="DateFormat" value={show(val('DateFormat'))} options={DATE_FORMATS} onPick={toFormat} />
        <Rows r={r} fields={[pick(schema, 'Epoch')]} />
      </Section>
      <Section title={es.editors.mass}>
        <Rows r={r} fields={mass.map((n) => pick(schema, n))} />
      </Section>
      <Section title={es.editors.hardware}>
        <Checks r={r} field="Tanks" options={named(/Tank$/)} empty={es.editors.none(es.editors.tanks)} asRef />
        <Checks r={r} field="Thrusters" options={named(/Thruster$/)} empty={es.editors.none(es.editors.thrusters)} asRef />
      </Section>
      <Others r={r} schema={schema}
        used={[...CART, 'DisplayStateType', 'StateType', 'CoordinateSystem', 'DateFormat', 'Epoch', ...mass, 'Tanks', 'Thrusters']} />
    </>
  )
}

function ForceModelEditor({ r, schema }: Props) {
  const central = show(r.fields.CentralBody ?? pick(schema, 'CentralBody').default) || 'Earth'
  const primaries = Array.isArray(r.fields.PrimaryBodies) ? r.fields.PrimaryBodies.map(show)
    : show(r.fields.PrimaryBodies ?? pick(schema, 'PrimaryBodies').default).replace(/[{}]/g, '').split(/[\s,]+/).filter(Boolean)
  const atm = show(r.fields['Drag.AtmosphereModel'] ?? r.fields.Drag ?? 'None')
  // GMAT rechaza Drag.* / SRP.* con el modelo apagado: al cambiarlo se quitan (GMAT pone sus defaults al volver)
  const drop = (base: string) =>
    Object.fromEntries(Object.keys(r.fields).filter((k) => k === base || k.startsWith(`${base}.`)).map((k) => [k, null]))
  const setAtm = (to: string) =>
    patch(r.name, to === 'None' ? drop('Drag') : { ...drop('Drag'), 'Drag.AtmosphereModel': to })
  const srp = show(r.fields.SRP ?? 'Off')
  return (
    <>
      <Section title={es.editors.central}>
        <Rows r={r} fields={[pick(schema, 'CentralBody', { enum: BODIES }), pick(schema, 'PrimaryBodies')]} />
      </Section>
      <Section title={es.editors.gravity}>
        {primaries.length ? primaries.map((b) => (
          <Rows key={b} r={r} fields={[
            syn(`GravityField.${b}.Degree`, 'Integer', 4),
            syn(`GravityField.${b}.Order`, 'Integer', 4),
            syn(`GravityField.${b}.PotentialFile`, 'Filename', ''),
          ]} />
        )) : <div className={s.note}>{es.editors.gravityNone}</div>}
      </Section>
      <Section title={es.editors.thirdBodies}>
        <Checks r={r} field="PointMasses" options={BODIES.filter((b) => b !== central && !primaries.includes(b))} />
      </Section>
      <Section title={es.editors.drag}>
        <div className={s.row} data-set={atm !== 'None' || undefined}>
          <label className={s.label}>Drag.AtmosphereModel</label>
          <select className={s.input} value={atm} aria-label="Drag.AtmosphereModel" onChange={(e) => setAtm(e.target.value)}>
            {(ATMOSPHERES.includes(atm) ? ATMOSPHERES : [atm, ...ATMOSPHERES]).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </Section>
      <Section title={es.editors.srp}>
        <div className={s.row} data-set={srp === 'On' || undefined}>
          <label className={s.label}>SRP</label>
          <select className={s.input} value={srp} aria-label="SRP"
            onChange={(e) => patch(r.name, { ...drop('SRP'), SRP: e.target.value })}>
            {['On', 'Off'].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <Rows r={r} fields={[pick(schema, 'RelativisticCorrection')]} />
      </Section>
      <Others r={r} schema={schema}
        used={['CentralBody', 'PrimaryBodies', 'PointMasses', 'Drag', 'SRP', 'RelativisticCorrection']} />
    </>
  )
}

function PropagatorEditor({ r, schema }: Props) {
  const fms = useApp((st) => st.mission.resources).filter((x) => x.type === 'ForceModel').map((x) => x.name)
  return (
    <>
      <Section title={es.editors.integrator}>
        <Rows r={r} fields={[pick(schema, 'Type', { enum: INTEGRATORS }), pick(schema, 'FM', fms.length ? { enum: fms } : {})]} />
      </Section>
      <Section title={es.editors.steps}>
        <Rows r={r} fields={[
          syn('InitialStepSize', 'Real', 60, { unit: 's' }),
          syn('Accuracy', 'Real', 1e-11),
          syn('MinStep', 'Real', 0.001, { unit: 's' }),
          syn('MaxStep', 'Real', 2700, { unit: 's' }),
          syn('MaxStepAttempts', 'Integer', 50),
          syn('StopIfAccuracyIsViolated', 'Boolean', true),
        ]} />
      </Section>
      <Others r={r} schema={schema} used={['Type', 'FM']} />
    </>
  )
}

/** Editor dedicado según el tipo; el resto, formulario genérico con todos los campos del motor. */
export default function Editor({ r, schema }: Props) {
  if (r.type === 'Spacecraft') return <SpacecraftEditor r={r} schema={schema} />
  if (r.type === 'ForceModel') return <ForceModelEditor r={r} schema={schema} />
  if (r.type === 'Propagator') return <PropagatorEditor r={r} schema={schema} />
  return <Rows r={r} fields={schema.filter((f) => !f.readOnly)} />
}
