import type { ReactNode } from 'react'
import { GLOSSARY } from '../data/catalog'

export function Meter({ label, value, max, text, tone, hint }: {
  label: string
  value: number
  max: number
  text?: string
  tone?: 'ok' | 'warn' | 'bad' | 'info'
  hint?: string
}) {
  const p = Math.max(0, Math.min(1, max > 0 ? value / max : 0))
  return (
    <div className="meter" title={hint}>
      <div className="meter-top"><span>{label}</span><b>{text ?? `${Math.round(value)} / ${Math.round(max)}`}</b></div>
      <div className="meter-bar"><i className={tone ?? 'ok'} style={{ width: `${p * 100}%` }} /></div>
    </div>
  )
}

export function StressMeter({ stress }: { stress: number }) {
  const tone = stress >= 85 ? 'bad' : stress >= 60 ? 'warn' : stress >= 30 ? 'info' : 'ok'
  return <Meter label="STRESS" value={stress} max={100} text={`${Math.round(stress)}`} tone={tone} hint={GLOSSARY.stress} />
}

/** Palabra con tooltip del glosario. */
export function Term({ k, children }: { k: keyof typeof GLOSSARY; children: ReactNode }) {
  return <span className="term" title={GLOSSARY[k]}>{children}</span>
}

export const statusIcon = (s: 'ok' | 'warn' | 'fail') => (s === 'ok' ? '' : s === 'warn' ? '▲' : '')

// onJump: si viene, los pasos anteriores que devuelva canJump se pueden clickear para volver.
export function TopBar({ step, steps, right, canJump, onJump }: {
  step: number; steps: string[]; right?: ReactNode; canJump?: (k: number) => boolean; onJump?: (k: number) => void
}) {
  return (
    <header className="topbar">
      <div className="brand">MISSION <b>ARCHITECT</b></div>
      <ol className="steps">
        {steps.map((s, k) => {
          const jump = k < step && !!onJump && (canJump?.(k) ?? true)
          return <li key={s} title={jump ? `Back to ${s}` : s} aria-current={k === step ? 'step' : undefined}
            className={(k === step ? 'cur' : k < step ? 'past' : '') + (jump ? ' jump' : '')}
            onClick={jump ? () => onJump!(k) : undefined}><span>{k + 1}</span><em className="lbl">{s}</em></li>
        })}
      </ol>
      <div className="topbar-right">{right}</div>
    </header>
  )
}

export const STEP_NAMES = ['Briefing', 'Orbit', 'Hangar', 'Review', 'Launch', 'Mapping', 'Site', 'Landing', 'Rover', 'Finale', 'Report']
