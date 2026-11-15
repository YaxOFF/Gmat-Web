import type { Layer } from './types'

export type Level = 'minor' | 'major' | 'critical'

export interface CardEffect {
  qMul?: number // multiplica la calidad de mapeo
  downMul?: number // multiplica la capacidad de bajada
  batCapMul?: number // multiplica la capacidad de la batería
  genMul?: number // multiplica la generación solar
  safeMode?: boolean // sin ciencia este ciclo
  dataLoss?: number // fracción de datos guardados que se pierde
  layerMul?: Partial<Record<Layer, number>>
  disable?: Layer // un instrumento queda inutilizable
  dvMul?: number // multiplica el combustible restante
}

export interface CardDef {
  id: string
  name: string
  level: Level
  source: string // de dónde sale (para la línea de causas)
  text: string
  effect: CardEffect
  /** cycle: dura 1 ciclo · until: hasta resolverla · perm: se aplica ya y queda */
  duration: 'cycle' | 'until' | 'perm'
  response?: { label: string; role: string; p: number }
  timer?: number // ciclos antes de que explote si no se resuelve
  explode?: CardEffect & { stress?: number; text: string }
}

export const CARDS: CardDef[] = [
  // Mazo base
  { id: 'telemetry_noise', name: 'Telemetry noise', level: 'minor', source: 'Base deck', duration: 'cycle',
    text: 'Static in the data stream. Data quality −10% this cycle.', effect: { qMul: 0.9 } },
  { id: 'pointing_drift', name: 'Pointing drift', level: 'minor', source: 'Base deck', duration: 'until',
    text: 'The instruments are looking a little off target. Mapping −20%.', effect: { qMul: 0.8 },
    response: { label: 'Recalibrate', role: 'Science', p: 0.9 } },
  { id: 'solar_heating', name: 'Solar heating', level: 'minor', source: 'Base deck (no premium MLI)', duration: 'until', timer: 2,
    text: 'The avionics are running hot. Fix it or it degrades the instruments.', effect: {},
    response: { label: 'Re-aim radiator', role: 'Systems', p: 0.85 },
    explode: { qMul: 0.85, stress: 5, text: 'Heat soaked the instruments. Mapping −15% from now on.' } },
  { id: 'star_tracker', name: 'Star tracker glitch', level: 'minor', source: 'Base deck', duration: 'cycle',
    text: 'The ship loses track of the stars for a while. Downlink −20% this cycle.', effect: { downMul: 0.8 } },

  // Por componente
  { id: 'weak_link', name: 'Weak link', level: 'minor', source: 'Low-gain antenna', duration: 'until',
    text: 'The small antenna barely hears Earth. Downlink −50%.', effect: { downMul: 0.5 },
    response: { label: 'Re-point antenna', role: 'Comms', p: 0.8 } },
  { id: 'cold_battery', name: 'Cold battery', level: 'minor', source: 'No battery heaters', duration: 'until',
    text: 'The cold shrinks the battery. Capacity −30% in eclipse.', effect: { batCapMul: 0.7 },
    response: { label: 'Manual heaters (+30 W)', role: 'Systems', p: 0.85 } },
  { id: 'cell_degradation', name: 'Cell degradation', level: 'minor', source: 'Silicon solar array', duration: 'perm',
    text: 'Radiation eats the silicon cells. Power −5% for good.', effect: { genMul: 0.95 } },
  { id: 'optical_contamination', name: 'Optical contamination', level: 'major', source: 'Context camera', duration: 'until',
    text: 'Dust or outgassing fogs the camera. Terrain maps −40%.', effect: { layerMul: { terrain: 0.6 } },
    response: { label: 'Bake-out (1 cycle off)', role: 'Systems', p: 0.9 } },
  { id: 'radar_overheat', name: 'Radar overheating', level: 'major', source: 'SAR radar', duration: 'until', timer: 2,
    text: 'The radar runs too hot. Buried-ice data −50%.', effect: { layerMul: { buriedIce: 0.5 } },
    response: { label: 'Lower radar power', role: 'Systems', p: 0.8 },
    explode: { disable: 'buriedIce', stress: 5, text: 'The radar burned out. No more buried-ice data.' } },
  { id: 'stuck_antenna', name: 'Stuck antenna', level: 'major', source: 'High-gain antenna', duration: 'until',
    text: 'The dish is jammed. No downlink at all.', effect: { downMul: 0 },
    response: { label: 'Shake command', role: 'Comms', p: 0.6 } },
  { id: 'seu', name: 'SEU in the computer', level: 'major', source: 'No shielding / commercial computer', duration: 'cycle',
    text: 'A radiation hit flips a bit. The ship goes into safe mode: no science this cycle.', effect: { safeMode: true },
    response: { label: 'Recovery command', role: 'Comms', p: 0.85 } },
  { id: 'battery_overheat', name: 'Battery overheating', level: 'major', source: 'Thin power margin', duration: 'until', timer: 2,
    text: 'With so little margin the battery runs hot. Reduce the load or lose capacity.', effect: {},
    response: { label: 'Reduce load', role: 'Systems', p: 0.8 },
    explode: { batCapMul: 0.7, stress: 5, text: 'The battery lost 30% of its capacity permanently.' } },
  { id: 'corrupt_recorder', name: 'Corrupt recorder', level: 'major', source: '64 Gb recorder', duration: 'until', timer: 1,
    text: 'Cheap memory is corrupting stored files. Downlink them fast!', effect: { dataLoss: 0.2 },
    response: { label: 'Downlink early', role: 'Comms', p: 0.85 },
    explode: { stress: 5, text: 'The corrupted files are gone.' } },

  // Despliegue (solo tras el lanzamiento)
  { id: 'panel_partial', name: 'Half-open solar panel', level: 'major', source: 'Cruise: array deployment', duration: 'until',
    text: 'One wing opened halfway. Power −25%.', effect: { genMul: 0.75 },
    response: { label: 'Repair deployment', role: 'Systems', p: 0.7 } },
  { id: 'panel_failed', name: 'Solar panel failed to deploy', level: 'major', source: 'Cruise: array deployment', duration: 'until', timer: 3,
    text: 'The arrays are stuck. Power −50% and the battery is draining.', effect: { genMul: 0.5 },
    response: { label: 'Try wiggling the wings', role: 'Systems', p: 0.5 },
    explode: { batCapMul: 0.7, stress: 5, text: 'The battery suffered from deep discharges. Capacity −30%.' } },

  // Críticas (solo con estrés ≥ 85)
  { id: 'propellant_leak', name: 'Propellant leak', level: 'critical', source: 'Stress above 85', duration: 'perm',
    text: 'A valve is leaking. 30% of the remaining fuel is gone.', effect: { dvMul: 0.7 } },
  { id: 'attitude_loss', name: 'Loss of attitude', level: 'critical', source: 'Stress above 85', duration: 'cycle',
    text: 'The ship tumbles. No power, no comms, no science this cycle.', effect: { safeMode: true, downMul: 0 },
    response: { label: 'All hands recovery', role: 'Everyone', p: 0.5 } },
]

export const CARD: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]))
export const BASE_DECK = ['telemetry_noise', 'pointing_drift', 'solar_heating', 'star_tracker']
export const CRITICAL_POOL = ['propellant_leak', 'attitude_loss']
