// Referencias por nombre dentro del modelo: renombrar, buscar usos y nombres libres.
import type { Command, Mission, Value } from './mission'

export const IDENT = /^[A-Za-z]\w*$/

// El nombre como token suelto: no precedido de '.' (eso sería un campo, p. ej. Prop.FM).
const token = (name: string) => new RegExp(`(?<![\\w.])${name}(?!\\w)`, 'g')

function mapValue(v: Value, f: (s: string) => string): Value {
  if (Array.isArray(v)) return v.map((x) => mapValue(x, f))
  if (typeof v === 'object') return { ref: f(v.ref) }
  return v
}

function mapCmd(c: Command, f: (s: string) => string): Command {
  return {
    ...c,
    text: f(c.text),
    ...(c.endText !== undefined && { endText: f(c.endText) }),
    ...(c.children && { children: c.children.map((x) => mapCmd(x, f)) }),
  }
}

/** Aplica `f` a todo texto que puede nombrar recursos (refs de campos, comandos, líneas crudas). */
function mapText(m: Mission, f: (s: string) => string): Mission {
  return {
    resources: m.resources.map((r) => ({
      ...r,
      fields: Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, mapValue(v, f)])),
    })),
    sequence: m.sequence.map((c) => mapCmd(c, f)),
    raw: m.raw.map(f),
  }
}

export function renameResource(m: Mission, from: string, to: string): Mission {
  const re = token(from)
  const out = mapText(m, (s) => s.replace(re, to))
  out.resources = out.resources.map((r) => (r.name === from ? { ...r, name: to } : r))
  return out
}

/** Lugares que nombran `name` (sin contar su propio Create). */
export function findRefs(m: Mission, name: string): string[] {
  const re = token(name)
  const hits: string[] = []
  const has = (s: string) => s.search(re) >= 0
  const inValue = (v: Value): boolean =>
    Array.isArray(v) ? v.some(inValue) : typeof v === 'object' && has(v.ref)
  for (const r of m.resources) {
    for (const [k, v] of Object.entries(r.fields)) if (inValue(v)) hits.push(`${r.name}.${k}`)
  }
  const walk = (cs: Command[]) => cs.forEach((c) => {
    if (has(c.text) || has(c.endText ?? '')) hits.push(`${c.cmd} ${c.label ? `'${c.label}'` : c.text}`.trim())
    if (c.children) walk(c.children)
  })
  walk(m.sequence)
  hits.push(...m.raw.filter(has))
  return hits
}

export function uniqueName(m: Mission, base: string): string {
  const taken = new Set(m.resources.map((r) => r.name))
  let i = 1
  while (taken.has(`${base}${i}`)) i++
  return `${base}${i}`
}
