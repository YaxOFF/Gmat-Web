import { useEffect, useRef, useState } from 'react'
import { es } from '../i18n/es'
import { BODIES } from '../resources/value'
import r from '../resources/Resources.module.css'
import { TextField } from '../resources/Field'
import { useApp } from '../store'
import s from './Mission.module.css'

const P = es.mission.picker
// Sistemas que GMAT crea siempre (no aparecen como recursos del script).
const DEFAULT_CS = ['EarthMJ2000Eq', 'EarthMJ2000Ec', 'EarthFixed', 'EarthICRF']
const PARAM = /^[^\s,;{}%'=]+$/

/** Campo de texto con botón que abre el selector de parámetros del motor (`Obj[.Dep].Nombre`). */
export function ParamInput({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className={s.param}>
      <TextField key={value} value={value} placeholder="Sat.Earth.Altitude" label={label} help={label}
        onCommit={(t) => { const ok = PARAM.test(t.trim()); if (ok) onCommit(t.trim()); return ok }} />
      <button className={r.btn} title={P.open} aria-label={`${P.open} ${label}`} onClick={() => setOpen(true)}>…</button>
      {open && <Picker value={value} onClose={() => setOpen(false)} onPick={(v) => { onCommit(v); setOpen(false) }} />}
    </span>
  )
}

function Picker({ value, onClose, onPick }: { value: string; onClose: () => void; onPick: (v: string) => void }) {
  const { mission, parameters, fetchParameters } = useApp()
  const dlg = useRef<HTMLDialogElement>(null)
  useEffect(() => { dlg.current?.showModal(); void fetchParameters() }, [fetchParameters])
  const parts = value.split('.')
  const objects = mission.resources.filter((x) => x.type === 'Spacecraft').concat(
    mission.resources.filter((x) => x.type !== 'Spacecraft'))
  const [obj, setObj] = useState(parts.length > 1 ? parts[0] : objects[0]?.name ?? '')
  const [q, setQ] = useState(parts.length > 1 ? parts[parts.length - 1] : '')
  const [name, setName] = useState(parts.length > 1 ? parts[parts.length - 1] : '')
  const [dep, setDep] = useState(parts.length > 2 ? parts.slice(1, -1).join('.') : '')

  const list = Array.isArray(parameters) ? parameters : []
  const needle = q.toLowerCase()
  const shown = list.filter((p) => p.name.toLowerCase().includes(needle))
  const info = list.find((p) => p.name === name)
  const deps = info?.dep === 'CoordinateSystem'
    ? [...DEFAULT_CS, ...mission.resources.filter((x) => x.type === 'CoordinateSystem').map((x) => x.name)]
    : [...BODIES, ...mission.resources.filter((x) => /Point|Barycenter|Libration/.test(x.type)).map((x) => x.name)]
  const result = info && obj ? [obj, info.dep && (dep || info.depDefault), info.name].filter(Boolean).join('.') : ''
  const choose = (n: string) => {
    const p = list.find((x) => x.name === n)
    if (p?.dep !== info?.dep) setDep(p?.depDefault ?? '')  // otro tipo de dependencia: el default del motor
    setName(n)
  }

  return (
    <dialog ref={dlg} className={s.dialog} onClose={onClose} aria-label={P.title}>
      <div className={s.dialogHead}>
        <strong>{P.title}</strong>
        <select className={r.select} aria-label={P.object} value={obj} onChange={(e) => setObj(e.target.value)}>
          {objects.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.type})</option>)}
        </select>
        <input className={r.input} autoFocus placeholder={P.search} aria-label={P.search} value={q}
          onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className={s.dialogBody} role="listbox" aria-label={P.title}>
        {parameters === null && <p className={r.muted}>{P.loading}</p>}
        {parameters === 'error' && <p className={r.warn}>{P.error}</p>}
        {shown.map((p) => (
          <button key={p.name} role="option" aria-selected={p.name === name} className={s.option}
            onClick={() => choose(p.name)} onDoubleClick={() => { choose(p.name); if (!p.dep && obj) onPick(`${obj}.${p.name}`) }}>
            <span>{p.name}</span><small className={s.cmd}>{[p.dep && P[p.dep], p.unit].filter(Boolean).join(' · ')}</small>
          </button>
        ))}
      </div>
      <div className={s.dialogFoot}>
        {info?.dep && (
          <select className={r.select} aria-label={P[info.dep]} title={P[info.dep]} value={dep || info.depDefault}
            onChange={(e) => setDep(e.target.value)}>
            {[...new Set([dep || info.depDefault, ...deps])].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <code>{result}</code>
        <button className={r.btn} disabled={!result} onClick={() => onPick(result)}>{P.use}</button>
        <button className={r.btn} onClick={onClose}>{P.close}</button>
      </div>
    </dialog>
  )
}
