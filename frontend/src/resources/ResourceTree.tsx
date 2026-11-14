import { useEffect, useState } from 'react'
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

export default function ResourceTree() {
  const { mission, types, selected, parseError, fetchTypes, select, setMission } = useApp()
  const [newType, setNewType] = useState('Spacecraft')
  useEffect(() => { void fetchTypes() }, [fetchTypes])

  const groupOf = (type: string) => GROUP[types?.find((t) => t.type === type)?.category ?? ''] ?? 'other'
  const groups = new Map<string, Resource[]>()
  for (const r of mission.resources) {
    const g = groupOf(r.type)
    groups.set(g, [...(groups.get(g) ?? []), r])
  }
  const current = mission.resources.find((r) => r.name === selected)
  const validName = (n: string) => IDENT.test(n) && !mission.resources.some((r) => r.name === n)

  const create = () => {
    const name = uniqueName(mission, newType)
    setMission({ ...mission, resources: [...mission.resources, { type: newType, name, fields: {} }] }, name)
  }
  const rename = (r: Resource) => {
    const to = prompt(es.resources.renamePrompt(r.name), r.name)?.trim()
    if (!to || to === r.name) return
    if (!validName(to)) return alert(es.resources.badName(to))
    setMission(renameResource(mission, r.name, to), to)
  }
  const clone = (r: Resource) => {
    const name = uniqueName(mission, `${r.name}_`)
    const i = mission.resources.indexOf(r)
    const resources = [...mission.resources]
    resources.splice(i + 1, 0, { ...structuredClone(r), name, comments: [] })
    setMission({ ...mission, resources }, name)
  }
  const remove = (r: Resource) => {
    if (!confirm(es.resources.confirmRemove(r.name, findRefs(mission, r.name)))) return
    setMission({ ...mission, resources: mission.resources.filter((x) => x !== r) }, null)
  }

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
      <div className={s.list} role="tree" aria-label={es.left.resources}>
        {mission.resources.length === 0 && <p className={s.muted}>{es.resources.none}</p>}
        {ORDER.filter((g) => groups.has(g)).map((g) => (
          <div key={g} role="group" aria-label={es.resources.groups[g]}>
            <h3 className={s.group}>{es.resources.groups[g]}</h3>
            {groups.get(g)!.map((r) => (
              <button key={r.name} role="treeitem" aria-selected={r.name === selected}
                className={r.name === selected ? s.itemActive : s.item} onClick={() => select(r.name)}
                onDoubleClick={() => rename(r)}>
                {r.name}<small>{r.type}</small>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
