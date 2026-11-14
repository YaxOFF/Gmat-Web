import { useEffect, useRef, useState, type FormEvent } from 'react'
import { es } from '../i18n/es'
import type { Resource } from '../model/mission'
import { findRefs, IDENT, renameResource, uniqueName } from '../model/refs'
import { useApp } from '../store'
import s from './Resources.module.css'

// Categoría del motor (GET /api/schema) → grupo del árbol, en orden de aparición.
const GROUP: Record<string, string> = {
  SPACECRAFT: 'ships', FORMATION: 'ships', HARDWARE: 'hardware', ODE_MODEL: 'propagators',
  PROP_SETUP: 'propagators', BURN: 'burns', COORDINATE_SYSTEM: 'coords', CALCULATED_POINT: 'coords',
  SOLVER: 'solvers', PARAMETER: 'variables', SUBSCRIBER: 'outputs',
}
const ORDER = ['ships', 'hardware', 'propagators', 'burns', 'coords', 'solvers', 'variables', 'outputs', 'other']

type Ask = { kind: 'rename' | 'remove'; r: Resource }

/** Renombrar (con validación en el campo) o confirmar borrado, en un diálogo propio. */
function AskDialog({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const { mission, setMission } = useApp()
  const dlg = useRef<HTMLDialogElement>(null)
  const [to, setTo] = useState(ask.r.name)
  useEffect(() => { dlg.current?.showModal() }, [])
  const name = to.trim()
  const bad = ask.kind === 'rename' && name !== ask.r.name
    && (!IDENT.test(name) || mission.resources.some((x) => x.name === name))
  const ok = (e: FormEvent) => {
    e.preventDefault()
    if (bad) return
    if (ask.kind === 'remove') setMission({ ...mission, resources: mission.resources.filter((x) => x !== ask.r) }, null)
    else if (name !== ask.r.name) setMission(renameResource(mission, ask.r.name, name), name)
    dlg.current?.close()
  }
  const title = ask.kind === 'rename' ? es.resources.renamePrompt(ask.r.name) : es.resources.removeTitle(ask.r.name)
  return (
    <dialog ref={dlg} className={s.dialog} onClose={onClose} aria-label={title}>
      <form className={s.ask} onSubmit={ok}>
        <strong>{title}</strong>
        {ask.kind === 'rename'
          ? <>
              <input className={s.input} autoFocus value={to} onChange={(e) => setTo(e.target.value)}
                aria-label={es.resources.rename} aria-invalid={bad} />
              {bad && <p className={s.warn} role="alert">{es.resources.badName(name)}</p>}
            </>
          : <p className={s.askText}>{es.resources.confirmRemove(ask.r.name, findRefs(mission, ask.r.name))}</p>}
        <div className={s.askBar}>
          <button type="button" className={s.btn} onClick={() => dlg.current?.close()}>{es.resources.cancel}</button>
          <button type="submit" className={s.btn} disabled={bad}>
            {ask.kind === 'rename' ? es.resources.rename : es.resources.remove}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function ResourceTree() {
  const { mission, types, selected, parseError, fetchTypes, select, setMission, issues } = useApp()
  const bad = (name: string) => issues.filter((i) => i.resource === name).length
  const [newType, setNewType] = useState('Spacecraft')
  const [ask, setAsk] = useState<Ask | null>(null)
  useEffect(() => { void fetchTypes() }, [fetchTypes])

  const groupOf = (type: string) => GROUP[types?.find((t) => t.type === type)?.category ?? ''] ?? 'other'
  const groups = new Map<string, Resource[]>()
  for (const r of mission.resources) {
    const g = groupOf(r.type)
    groups.set(g, [...(groups.get(g) ?? []), r])
  }
  const current = mission.resources.find((r) => r.name === selected)

  const create = () => {
    const name = uniqueName(mission, newType)
    setMission({ ...mission, resources: [...mission.resources, { type: newType, name, fields: {} }] }, name)
  }
  const rename = (r: Resource) => setAsk({ kind: 'rename', r })
  const clone = (r: Resource) => {
    const name = uniqueName(mission, `${r.name}_`)
    const i = mission.resources.indexOf(r)
    const resources = [...mission.resources]
    resources.splice(i + 1, 0, { ...structuredClone(r), name, comments: [] })
    setMission({ ...mission, resources }, name)
  }
  const remove = (r: Resource) => setAsk({ kind: 'remove', r })

  return (
    <div className={s.tree}>
      <div className={s.bar}>
        <select className={s.select} aria-label={es.resources.newType} value={newType}
          onChange={(e) => setNewType(e.target.value)}>
          {ORDER.map((g) => {
            const opts = (types ?? []).filter((t) => (GROUP[t.category] ?? 'other') === g)
            return opts.length > 0 && (
              <optgroup key={g} label={es.resources.groups[g]}>
                {opts.map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
              </optgroup>
            )
          })}
          {!types && <option value="Spacecraft">Spacecraft</option>}
        </select>
        <button className={s.btn} onClick={create}>{es.resources.create}</button>
      </div>
      <div className={s.bar}>
        <button className={s.btn} disabled={!current} onClick={() => current && rename(current)}>{es.resources.rename}</button>
        <button className={s.btn} disabled={!current} onClick={() => current && clone(current)}>{es.resources.clone}</button>
        <button className={s.btn} disabled={!current} onClick={() => current && remove(current)}>{es.resources.remove}</button>
      </div>
      {parseError && <p className={s.warn} role="alert" title={parseError}>{es.resources.parseError}</p>}
      {mission.resources.length === 0 && <p className={s.muted}>{es.resources.none}</p>}
      <div className={s.list} role="tree" aria-label={es.left.resources}>
        {ORDER.filter((g) => groups.has(g)).map((g) => (
          <div key={g} role="group" aria-label={es.resources.groups[g]}>
            <div className={s.group} aria-hidden>{es.resources.groups[g]}</div>
            {groups.get(g)!.map((r) => (
              <button key={r.name} role="treeitem" aria-selected={r.name === selected}
                className={r.name === selected ? s.itemActive : s.item} onClick={() => select(r.name)}
                onDoubleClick={() => rename(r)}>
                <span>{r.name}{bad(r.name) > 0 && <span className={s.flag} title={es.issues.marker(bad(r.name))}> ⚠<span className={s.sr}>{es.issues.marker(bad(r.name))}</span></span>}</span>
                <small>{r.type}</small>
              </button>
            ))}
          </div>
        ))}
      </div>
      {ask && <AskDialog ask={ask} onClose={() => setAsk(null)} />}
    </div>
  )
}
