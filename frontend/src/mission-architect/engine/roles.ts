// Roles del equipo y misiones personales (diseño §5). En 1 jugador, una sola persona lleva los cuatro.

export type Role = 'Director' | 'Systems' | 'Science' | 'Comms'

export const ROLES: { id: Role; icon: string; color: string; title: string; main: [string, string]; secret: [string, string] }[] = [
  { id: 'Director', icon: 'DIR', color: 'var(--lime)', title: 'Mission Director',
    main: ['Within Budget', 'Finish with at least $30M left.'], secret: ['Press Hero', 'NASA confidence at 120% or more at the end.'] },
  { id: 'Systems', icon: 'SYS', color: 'var(--cyan)', title: 'Systems Engineer',
    main: ['Nobody Freezes', 'Orbiter battery never under 20% and the rover never under −40 °C.'], secret: ['Zero Exploded Timers', 'No trouble-card timer runs out.'] },
  { id: 'Science', icon: 'SCI', color: 'var(--pink)', title: 'Science Specialist',
    main: ['Confirm Water', 'At least one drill core with confirmed ice (needs the mass spectrometer).'], secret: ['Complete Map', 'Map all 5 candidate craters from orbit.'] },
  { id: 'Comms', icon: 'COM', color: 'var(--amber)', title: 'Communications Officer',
    main: ['Not a Single Bit Lost', 'Never fill the data recorder to capacity.'], secret: ['Live Broadcast', 'Downlink an ice discovery during a live relay pass.'] },
]

export interface Team { players: 1 | 4; names: Record<Role, string> }
export const soloTeam = (): Team => ({ players: 1, names: { Director: 'You', Systems: 'You', Science: 'You', Comms: 'You' } })

/** Lo que se mide durante la partida para juzgar las misiones personales. */
export interface Tracker {
  budgetLeftM: number; confidence: number; minOrbiterBat: number; roverMinTemp: number | null
  exploded: number; mapped: number; lostGb: number; confirmed: number; live: boolean; rover: boolean
}

/** true = cumplida, false = fallada, null = no aplica en esta misión. */
export function judge(t: Tracker): Record<Role, { main: boolean | null; secret: boolean | null }> {
  return {
    Director: { main: t.budgetLeftM >= 30, secret: t.confidence >= 120 },
    Systems: { main: t.minOrbiterBat >= 20 && (t.roverMinTemp === null || t.roverMinTemp >= -40), secret: t.exploded === 0 },
    Science: { main: t.rover ? t.confirmed > 0 : null, secret: t.mapped >= 5 },
    Comms: { main: t.lostGb <= 0, secret: t.rover ? t.live : null },
  }
}
