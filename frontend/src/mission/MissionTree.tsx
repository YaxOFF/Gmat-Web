import { useState, type DragEvent } from 'react'
import { en as es } from '../i18n/en'
import type { Command } from '../model/mission'
import r from '../resources/Resources.module.css'
import { useApp } from '../store'
import { BLOCKS, canDisable, getAt, insertAt, isBlock, MENU, move, newCommand, removeAt, updateAt, type Path } from './commands'
import s from './Mission.module.css'

type Where = 'before' | 'after' | 'inside'
const same = (a: Path | null, b: Path) => !!a && a.length === b.length && a.every((x, i) => x === b[i])

export default function MissionTree() {
  const { mission, selectedCmd, parseError, selectCmd, setMission } = useApp()
  const [add, setAdd] = useState('Propagate')
  const [armed, setArmed] = useState(false)  // borrar pide un segundo clic
  const [drag, setDrag] = useState<Path | null>(null)
  const [over, setOver] = useState<{ key: string; where: Where } | null>(null)
  const seq = mission.sequence
  const cur = selectedCmd ? getAt(seq, selectedCmd) : undefined
  const sel = cur ? selectedCmd : null

  const apply = (sequence: Command[], path: Path | null) => {
    setMission({ ...mission, sequence })
    selectCmd(path)
    setArmed(false)
  }
  const addCmd = () => {
    // dentro del bloque seleccionado (al final), si no después del seleccionado, si no al final
    const at = !sel ? [seq.length]
      : isBlock(cur!) ? [...sel, cur!.children?.length ?? 0]
      : [...sel.slice(0, -1), sel[sel.length - 1] + 1]
    apply(insertAt(seq, at, newCommand(add, mission)), at)
  }
  const moveTo = (from: Path, to: Path) => {
    const out = move(seq, from, to)
    if (out) apply(...out)
  }
  const shift = (d: -1 | 1) => {
    if (!sel) return
    const i = sel[sel.length - 1] + (d < 0 ? -1 : 2)
    if (i >= 0) moveTo(sel, [...sel.slice(0, -1), i])
  }
  const remove = () => {
    if (!sel) return
    if (!armed) return setArmed(true)
    apply(removeAt(seq, sel), null)
  }
  const toggle = () => {
    if (sel) apply(updateAt(seq, sel, (c) => ({ ...c, disabled: !c.disabled || undefined })), sel)
  }

  const dragOver = (e: DragEvent, key: string, where: Where) => {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (over?.key !== key || over.where !== where) setOver({ key, where })
  }
  const drop = (e: DragEvent, to: Path) => {
    e.preventDefault()
    if (drag) moveTo(drag, to)
    setDrag(null)
    setOver(null)
  }

  const node = (c: Command, path: Path) => {
    const key = path.join('.')
    const parent = path.slice(0, -1)
    const after = [...parent, path[path.length - 1] + 1]
    const whereAt = (e: DragEvent): Where => {
      const b = e.currentTarget.getBoundingClientRect()
      const y = (e.clientY - b.top) / b.height
      return isBlock(c) ? (y < 0.35 ? 'before' : 'inside') : y < 0.5 ? 'before' : 'after'
    }
    const target = (w: Where) => (w === 'before' ? path : w === 'after' ? after : [...path, 0])
    return (
      <div key={key} role="none">
        <div role="treeitem" tabIndex={0} draggable aria-level={path.length} aria-selected={same(sel, path)}
          aria-expanded={isBlock(c) || undefined} className={s.node} data-disabled={c.disabled || undefined}
          data-over={over?.key === key ? over.where : undefined} style={{ paddingLeft: 8 + (path.length - 1) * 16 }}
          title={c.text} onClick={() => selectCmd(path)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCmd(path) } }}
          onDragStart={(e) => { setDrag(path); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key) }}
          onDragEnd={() => { setDrag(null); setOver(null) }}
          onDragOver={(e) => dragOver(e, key, whereAt(e))} onDrop={(e) => drop(e, target(whereAt(e)))}>
          <span className={s.cmd}>{c.cmd === 'GMAT' ? es.mission.assign : c.cmd}</span>
          <span>{c.label ?? c.text}</span>
        </div>
        {isBlock(c) && (
          <>
            {c.children?.map((x, i) => node(x, [...path, i]))}
            <div className={s.end} role="none" style={{ paddingLeft: 8 + (path.length - 1) * 16 }}
              data-over={over?.key === `${key}/end` ? 'before' : undefined}
              onDragOver={(e) => dragOver(e, `${key}/end`, 'before')}
              onDrop={(e) => drop(e, [...path, c.children?.length ?? 0])}>
              {BLOCKS[c.cmd]}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={r.tree}>
      <div className={r.bar}>
        <select className={r.select} aria-label={es.mission.newCmd} title={es.mission.addHelp} value={add}
          onChange={(e) => setAdd(e.target.value)}>
          {Object.entries(MENU).map(([cat, cmds]) => (
            <optgroup key={cat} label={es.mission.cats[cat]}>
              {cmds.map((c) => <option key={c} value={c}>{c === 'GMAT' ? `${es.mission.assign} (GMAT)` : c}</option>)}
            </optgroup>
          ))}
        </select>
        <button className={r.btn} title={es.mission.addHelp} onClick={addCmd}>{es.mission.add}</button>
      </div>
      <div className={r.bar}>
        <button className={r.btn} disabled={!sel} title={es.mission.up} aria-label={es.mission.up} onClick={() => shift(-1)}>↑</button>
        <button className={r.btn} disabled={!sel} title={es.mission.down} aria-label={es.mission.down} onClick={() => shift(1)}>↓</button>
        <button className={r.btn} disabled={!cur || !canDisable(cur)} title={es.mission.disableHelp} onClick={toggle}>
          {cur?.disabled ? es.mission.enable : es.mission.disable}
        </button>
        <button className={r.btn} disabled={!sel} onClick={remove} onBlur={() => setArmed(false)}>
          {armed ? es.mission.confirmRemove : es.mission.remove}
        </button>
      </div>
      {parseError && <p className={r.warn} role="alert" title={parseError}>{es.resources.parseError}</p>}
      {seq.length === 0 && <p className={r.muted}>{es.mission.none}</p>}
      <div className={r.list} role="tree" aria-label={es.left.mission}>
        {seq.map((c, i) => node(c, [i]))}
        <div className={s.tail} role="none" title={drag ? es.mission.dropEnd : undefined} data-over={over?.key === 'tail' || undefined}
          onDragOver={(e) => dragOver(e, 'tail', 'before')} onDrop={(e) => drop(e, [seq.length])} />
      </div>
    </div>
  )
}
