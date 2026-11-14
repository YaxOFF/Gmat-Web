// Errores del motor (POST /api/script/validate) como avisos ubicados: línea, recurso y campo.
import { es } from '../i18n/es'

export type Issue = { level: 'warning' | 'error'; text: string; line?: number; resource?: string; field?: string }
type Raw = { level: string; text: string; line?: number | null }

/** Quita de un mensaje de GMAT el contador, la ruta temporal y las etiquetas, y lo pasa a español si se conoce. */
export function clean(text: string): string {
  const t = text.replace(/^.*\*{4} (ERROR|WARNING) \*{4}\s*/, '').replace(/^\w+ Exception( Thrown)?:\s*/, '')
    .replace(/^\S*mission\.script:\s*/, '').replace(/\s*in line:\s*$/, '').trim()
  for (const [re, to] of es.issues.known) {
    const m = re.exec(t)
    if (m) return to(m)
  }
  return t
}

/** Recurso y campo de la línea `Obj.Campo = ...` o `Create Tipo Obj` (solo en la zona de recursos). */
export function locate(script: string, line: number): { resource?: string; field?: string } {
  const lines = script.split('\n')
  const begin = lines.findIndex((l) => /^\s*BeginMissionSequence\b/.test(l))
  if (begin >= 0 && line - 1 >= begin) return {}
  const src = lines[line - 1] ?? ''
  const a = /^\s*(?:GMAT\s+)?([A-Za-z_]\w*)\.([\w.]+)\s*=/.exec(src)
  if (a) return { resource: a[1], field: a[2] }
  const c = /^\s*Create\s+\w+\s+([A-Za-z_]\w*)/.exec(src)
  return c ? { resource: c[1] } : {}
}

/** GMAT escribe el mensaje y, en la entrada siguiente, la línea citada: se unen en un solo aviso. */
export function toIssues(errors: Raw[], script: string): Issue[] {
  const out: Issue[] = []
  for (let i = 0; i < errors.length; i++) {
    const e = errors[i], next = errors[i + 1]
    const level = e.level === 'warning' ? 'warning' : 'error'
    if (e.line == null && next?.line != null) {
      out.push({ level, text: clean(e.text), line: next.line, ...locate(script, next.line) })
      i++
    } else if (e.line != null) out.push({ level, text: clean(e.text), line: e.line, ...locate(script, e.line) })
    else out.push({ level, text: clean(e.text) })
  }
  return out
}
