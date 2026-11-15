// Tipos del dominio. Unidades explícitas en los nombres (Kg, W, M = millones, Gb).

export type Layer = 'hydrogen' | 'terrain' | 'slope' | 'temperature' | 'buriedIce'

export type Group =
  | 'bus' | 'panel' | 'battery' | 'thermal' | 'antenna'
  | 'recorder' | 'tank' | 'computer' | 'shield' | 'comms' | 'instrument'
  | 'lander' | 'rbattery' | 'wheels' | 'drill' | 'rtools'

export interface Part {
  id: string
  name: string
  group: Group
  massKg: number
  drawW: number
  genW?: number
  costM: number
  rel: number // confiabilidad 0..1
  note: string // frase corta para el tooltip
  slots?: number // ranuras de instrumento (solo bus)
  batteryWh?: number
  storageGb?: number
  downlinkGb?: number // Gb por ventana DSN
  dataGb?: number // Gb por ciclo y por objetivo mapeado
  dvMs?: number
  layer?: Layer
  cards?: string[] // cartas que esta pieza mete al mazo
}

export type CraterId = 'shackleton' | 'cabeus' | 'haworth' | 'gerlache' | 'faustini'

export interface Crater {
  id: CraterId
  name: string
  h: number // hidrógeno real (% en peso). Valores de juego.
  ice: number // hielo enterrado real (% en peso), lo que vería el radar
  tempC: number
  terrain: 'soft' | 'rocky' | 'steep' | 'very steep'
  risk: number // riesgo de aterrizaje 0..4
  slopeDeg: number
  x: number // posición en el mapa polar (0..100)
  y: number
  blurb: string
}

export interface Orbit {
  id: string
  name: string
  altitude: string
  periodMin: number
  res: number // resolución de mapeo relativa
  eclipseMin: number // minutos de eclipse por órbita
  dvInsertion: number
  dvKeeping: number // m/s para toda la misión
  relay: string
  note: string
}

export interface Launcher {
  id: string
  name: string
  capacityKg: number
  costM: number
  rel: number
}

/** A: solo orbitador ×1 · B: orbitador + rover ×2 · C: + taladro profundo y radar ×3 */
export type MissionMode = 'A' | 'B' | 'C'

export interface Design {
  mode: MissionMode
  orbitId: string
  launcherId: string
  partIds: string[]
}

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface Check {
  id: string
  label: string
  status: CheckStatus
  value: string
  why: string // explicación para principiantes
}
