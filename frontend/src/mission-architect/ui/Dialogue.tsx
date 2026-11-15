import { useEffect, useMemo, useRef, useState } from 'react'
import { CHARS, type CharId, type Line, type Mood, type SceneId } from '../data/chars'
import { Portrait, SceneArt } from './Art'

interface Step {
  line: Exclude<Line, { t: 'bg' }>
  scene: SceneId
  L?: { id: CharId; mood: Mood }
  R?: { id: CharId; mood: Mood }
}

/** Convierte la lista de líneas en pasos: cada paso conoce el fondo y quién está en escena. */
function toSteps(lines: Line[], startScene: SceneId): Step[] {
  const steps: Step[] = []
  let scene = startScene
  let L: Step['L']
  let R: Step['R']
  for (const line of lines) {
    if (line.t === 'bg') { scene = line.scene; L = undefined; R = undefined; continue }
    if (line.t === 'say') {
      const side = CHARS[line.who].side
      const slot = { id: line.who, mood: line.mood ?? 'neutral' }
      if (side === 'L') L = slot
      else R = slot
    }
    steps.push({ line, scene, L, R })
  }
  return steps
}

interface Props {
  lines: Line[]
  onDone: () => void
  startScene?: SceneId
  skipLabel?: string
}

/** Reproductor de historieta: avanza con clic, Espacio, Enter o →. ← retrocede. */
export function Dialogue({ lines, onDone, startScene = 'void', skipLabel = 'Skip ▸▸' }: Props) {
  const steps = useMemo(() => toSteps(lines, startScene), [lines, startScene])
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(0)
  const done = useRef(false)

  const step = steps[Math.min(i, steps.length - 1)]
  const text = step && 'text' in step.line ? step.line.text : ''
  const typing = shown < text.length

  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(() => { if (!steps.length) finish() }, [steps.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setShown(0) }, [i])
  useEffect(() => {
    if (!typing) return
    const t = setTimeout(() => setShown((s) => Math.min(text.length, s + 2)), 14)
    return () => clearTimeout(t)
  }, [shown, typing, text.length])

  const advance = () => {
    if (typing) { setShown(text.length); return }
    if (i >= steps.length - 1) finish()
    else setI(i + 1)
  }
  const back = () => { if (i > 0) setI(i - 1) }

  const adv = useRef(advance)
  const bk = useRef(back)
  adv.current = advance
  bk.current = back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); adv.current() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); bk.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!step) return null
  const line = step.line
  const speaker = line.t === 'say' ? CHARS[line.who] : null
  const visible = text.slice(0, shown)

  return (
    <div className="dlg" onClick={advance}>
      <div className="dlg-scene" key={step.scene}>
        <SceneArt id={step.scene} />
        <div className="halftone" />
      </div>

      <div className="dlg-cast">
        <div className="slot left">{step.L && <Portrait c={CHARS[step.L.id]} mood={step.L.mood} active={speaker?.id === step.L.id} />}</div>
        <div className="slot right">{step.R && <Portrait c={CHARS[step.R.id]} mood={step.R.mood} active={speaker?.id === step.R.id} />}</div>
      </div>

      <div className="dlg-top">
        <span className="dlg-count">{i + 1} / {steps.length}</span>
        <button className="btn ghost small" onClick={(e) => { e.stopPropagation(); back() }} disabled={i === 0}>◂ Back</button>
        <button className="btn ghost small" onClick={(e) => { e.stopPropagation(); finish() }}>{skipLabel}</button>
      </div>

      {line.t === 'title' && (
        <div className="dlg-title" key={i}>
          <div className="t-main">{line.text}</div>
          {line.sub && <div className="t-sub">{line.sub}</div>}
        </div>
      )}

      {line.t === 'cap' && <div className="dlg-cap" key={i}>{visible}</div>}

      {line.t === 'sfx' && (
        <div className={`dlg-sfx ${line.tone ?? 'neutral'}`} key={i}>
          <span>{line.text}</span>
        </div>
      )}

      {line.t === 'tele' && <div className="dlg-tele" key={i}>{visible}<i className="caret" /></div>}

      {line.t === 'say' && speaker && (
        <div className={`dlg-box side-${speaker.side}`} key={i} style={{ ['--c' as string]: speaker.color }}>
          <div className="dlg-name"><b>{speaker.name}</b><em>{speaker.role}</em></div>
          <p>{visible}</p>
          {!typing && <span className="next">▶</span>}
        </div>
      )}
    </div>
  )
}

/** Tira de globos estática (sin avanzar): comentarios cortos del equipo dentro de un panel. */
export function Strip({ lines }: { lines: { who: CharId; text: string; mood?: Mood }[] }) {
  return (
    <div className="strip">
      {lines.map((l, k) => {
        const c = CHARS[l.who]
        return (
          <div className="strip-row" key={k} style={{ ['--c' as string]: c.color }}>
            <div className="strip-face"><Portrait c={c} mood={l.mood} /></div>
            <div className="strip-bubble"><b>{c.name}</b><p>{l.text}</p></div>
          </div>
        )
      })}
    </div>
  )
}
