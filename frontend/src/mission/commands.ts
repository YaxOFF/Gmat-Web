// Secuencia de misión: rutas en el árbol, comandos nuevos y texto de comando desde `args`.
// `text` es lo que se escribe en el script; `args` es la vista que llena el parser (parser._args)
// y los formularios reescriben los dos juntos.
import type { Command, Mission } from '../model/mission'

/** Índices desde la raíz de `sequence` hasta el comando. */
export type Path = number[]

export const BLOCKS: Record<string, string> = {
  Target: 'EndTarget', Optimize: 'EndOptimize', If: 'EndIf', While: 'EndWhile', For: 'EndFor', BeginScript: 'EndScript',
}
export const isBlock = (c: Command) => c.cmd in BLOCKS
// Igual que parser.COMMENTABLE: lo que el parser reconoce como `% Cmd ...;` deshabilitado.
const COMMENTABLE = new Set(['Achieve', 'BeginFileThrust', 'BeginFiniteBurn', 'ClearPlot', 'EndFileThrust',
  'EndFiniteBurn', 'FindEvents', 'GMAT', 'Maneuver', 'MarkPoint', 'Minimize', 'NonlinearConstraint', 'PenDown',
  'PenUp', 'Propagate', 'Report', 'RunEstimator', 'RunSimulator', 'RunSmoother', 'Set', 'Stop', 'Toggle',
  'UpdateDynamicData', 'Vary', 'Write'])
export const canDisable = (c: Command) => COMMENTABLE.has(c.cmd)

/** Menú "agregar comando" por categoría (claves de es.mission.cats). */
export const MENU: Record<string, string[]> = {
  prop: ['Propagate', 'Maneuver', 'BeginFiniteBurn', 'EndFiniteBurn'],
  solver: ['Target', 'Vary', 'Achieve', 'Optimize', 'Minimize', 'NonlinearConstraint'],
  control: ['If', 'Else', 'While', 'For', 'Stop'],
  output: ['Report', 'Toggle', 'ClearPlot', 'MarkPoint', 'PenUp', 'PenDown'],
  script: ['GMAT', 'BeginScript'],
}

export type PropArgs = {
  mode: string; backwards: boolean
  props: { prop: string; sats: string[] }[]
  stops: { param: string; value: string }[]
}
export type BurnArgs = { burn: string; sats: string[] }
export type ReportArgs = { file: string; params: string[] }
export type ToggleArgs = { subs: string[]; state: string }
export type AssignArgs = { lhs: string; rhs: string }
/** Opciones `{K = v, ...}` en el orden del script; valores como texto. */
export type Opts = Record<string, string>
export type SolverArgs = { solver: string; opts: Opts } // Target, Optimize
export type RelArgs = { solver: string; lhs: string; op?: string; rhs?: string; opts?: Opts } // Vary, Achieve, Minimize, NonlinearConstraint
export type Cond = { join: string; lhs: string; op: string; rhs: string }
export type CondArgs = { conds: Cond[] } // If, While
export type ForArgs = { var: string; start: string; step: string; end: string }
export type Args = Record<string, unknown>

export const DC_TYPES = ['DifferentialCorrector']
export const OPT_TYPES = ['Yukon', 'SQPMatlab', 'FminconOptimizer', 'VF13ad']

const optsText = (o: Opts = {}) => {
  const items = Object.entries(o).filter(([, v]) => v !== '').map(([k, v]) => `${k} = ${v}`)
  return items.length ? `{${items.join(', ')}}` : ''
}

/** Texto del comando a partir de `args` (mismo formato que acepta el parser). */
export function toText(cmd: string, a: Args): string {
  if (cmd === 'Propagate') {
    const p = a as PropArgs
    const stops = p.stops.map((s) => (s.value ? `${s.param} = ${s.value}` : s.param)).join(', ')
    return [p.mode, p.backwards && 'BackProp', ...p.props.map((x) => `${x.prop}(${x.sats.join(', ')})`),
      stops && `{${stops}}`].filter(Boolean).join(' ')
  }
  if (cmd === 'Maneuver' || cmd === 'BeginFiniteBurn' || cmd === 'EndFiniteBurn') {
    const b = a as BurnArgs
    return `${b.burn}(${b.sats.join(', ')})`
  }
  if (cmd === 'Report') return [(a as ReportArgs).file, ...(a as ReportArgs).params].join(' ')
  if (cmd === 'Toggle') return [...(a as ToggleArgs).subs, (a as ToggleArgs).state].join(' ')
  if (cmd === 'GMAT') return `${(a as AssignArgs).lhs} = ${(a as AssignArgs).rhs}`
  if (cmd === 'Target' || cmd === 'Optimize') {
    const t = a as SolverArgs
    return [t.solver, optsText(t.opts)].filter(Boolean).join(' ')
  }
  if (cmd === 'Minimize') return `${(a as RelArgs).solver}(${(a as RelArgs).lhs})`
  if (cmd === 'NonlinearConstraint' || cmd === 'Vary' || cmd === 'Achieve') {
    const r = a as RelArgs
    const o = optsText(r.opts)
    return `${r.solver}(${r.lhs} ${r.op ?? '='} ${r.rhs}${o && `, ${o}`})`
  }
  if (cmd === 'If' || cmd === 'While')
    return (a as CondArgs).conds.map((c, i) => `${i ? ` ${c.join} ` : ''}${c.lhs} ${c.op} ${c.rhs}`).join('')
  if (cmd === 'For') {
    const f = a as ForArgs
    return `${f.var} = ${[f.start, f.step, f.end].filter(Boolean).join(':')}`
  }
  return ''
}

/** Línea del script sin ';' (como la escribe el serializer). */
export function lineOf(c: Command): string {
  const head = [c.cmd, c.label !== undefined ? `'${c.label}'` : ''].filter(Boolean).join(' ')
  return head + (c.text && !c.text.startsWith('(') ? ' ' : '') + c.text
}

/** Comando nuevo con recursos del modelo (o los nombres por defecto de GMAT si no hay). */
export function newCommand(cmd: string, m: Mission): Command {
  const first = (types: string[], fallback: string) => m.resources.find((r) => types.includes(r.type))?.name ?? fallback
  const sat = first(['Spacecraft'], 'DefaultSC')
  const dc = first(DC_TYPES, 'DC')
  const opt = first(OPT_TYPES, 'Optimizer')
  const variable = first(['Variable'], '')
  const plot = first(['XYPlot'], 'XYPlot1')
  const args: Record<string, Args> = {
    Propagate: { mode: '', backwards: false, props: [{ prop: first(['Propagator'], 'DefaultProp'), sats: [sat] }],
      stops: [{ param: `${sat}.ElapsedSecs`, value: '12000' }] },
    Maneuver: { burn: first(['ImpulsiveBurn'], 'DefaultIB'), sats: [sat] },
    BeginFiniteBurn: { burn: first(['FiniteBurn'], 'DefaultFB'), sats: [sat] },
    EndFiniteBurn: { burn: first(['FiniteBurn'], 'DefaultFB'), sats: [sat] },
    Report: { file: first(['ReportFile'], 'ReportFile1'), params: [`${sat}.A1ModJulian`] },
    Toggle: { subs: [first(['ReportFile', 'XYPlot', 'OrbitView', 'GroundTrackPlot', 'EphemerisFile'], 'ReportFile1')],
      state: 'On' },
    GMAT: variable ? { lhs: variable, rhs: '0' } : { lhs: `${sat}.SMA`, rhs: '7000' },
    Target: { solver: dc, opts: { SolveMode: 'Solve', ExitMode: 'DiscardAndContinue' } },
    Vary: { solver: dc, lhs: `${first(['ImpulsiveBurn'], 'DefaultIB')}.Element1`, rhs: '0.5',
      opts: { Perturbation: '0.0001', Lower: '0', Upper: '3.14159', MaxStep: '0.2' } },
    Achieve: { solver: dc, lhs: `${sat}.Earth.RMAG`, rhs: '42165', opts: { Tolerance: '0.1' } },
    Optimize: { solver: opt, opts: { SolveMode: 'Solve', ExitMode: 'DiscardAndContinue' } },
    Minimize: { solver: opt, lhs: variable || 'Cost' },
    NonlinearConstraint: { solver: opt, lhs: `${sat}.Earth.SMA`, op: '=', rhs: '7000' },
    If: { conds: [{ join: '', lhs: `${sat}.ElapsedDays`, op: '<', rhs: '1' }] },
    While: { conds: [{ join: '', lhs: `${sat}.ElapsedDays`, op: '<', rhs: '1' }] },
    For: { var: variable || 'I', start: '1', step: '1', end: '10' },
  }
  const text: Record<string, string> = { ClearPlot: plot, MarkPoint: plot, PenUp: plot, PenDown: plot }
  const c: Command = { cmd, text: args[cmd] ? toText(cmd, args[cmd]) : text[cmd] ?? '', args: args[cmd] ?? {}, comments: [] }
  if (cmd in BLOCKS) c.children = []
  return c
}

// ---------- operaciones inmutables sobre el árbol ----------

export function getAt(seq: Command[], path: Path): Command | undefined {
  let list = seq
  let c: Command | undefined
  for (const i of path) {
    c = list[i]
    if (!c) return undefined
    list = c.children ?? []
  }
  return c
}

/** Copia de `seq` con la lista de hijos de `parent` reemplazada por fn(lista). */
function editList(seq: Command[], parent: Path, fn: (l: Command[]) => Command[]): Command[] {
  if (!parent.length) return fn(seq)
  const [i, ...rest] = parent
  return seq.map((c, k) => (k === i ? { ...c, children: editList(c.children ?? [], rest, fn) } : c))
}

const parentOf = (p: Path) => p.slice(0, -1)
const last = (p: Path) => p[p.length - 1]

export const updateAt = (seq: Command[], path: Path, fn: (c: Command) => Command) =>
  editList(seq, parentOf(path), (l) => l.map((c, k) => (k === last(path) ? fn(c) : c)))
export const removeAt = (seq: Command[], path: Path) =>
  editList(seq, parentOf(path), (l) => l.filter((_, k) => k !== last(path)))
export const insertAt = (seq: Command[], path: Path, c: Command) =>
  editList(seq, parentOf(path), (l) => [...l.slice(0, last(path)), c, ...l.slice(last(path))])

/** Mueve `from` a la posición de inserción `to` (contada antes de quitarlo). null si cae dentro de sí mismo. */
export function move(seq: Command[], from: Path, to: Path): [Command[], Path] | null {
  if (to.length >= from.length && from.every((x, i) => to[i] === x)) return null
  const c = getAt(seq, from)
  if (!c) return null
  const t = [...to]
  const d = from.length - 1
  if (t.length > d && from.slice(0, d).every((x, i) => t[i] === x) && t[d] > from[d]) t[d]--
  return [insertAt(removeAt(seq, from), t, c), t]
}
