export type CharId = 'elena' | 'dev' | 'amara' | 'houston' | 'selene' | 'brooks' | 'tomas' | 'priya'
export type Mood = 'neutral' | 'worried' | 'excited' | 'angry'
export type HairStyle = 'short' | 'long' | 'bun' | 'bald' | 'cap'
export type Accessory = 'none' | 'glasses' | 'headset'

export interface Char {
  id: CharId
  name: string
  role: string
  color: string // color de acento (nameplate y luz de contorno)
  side: 'L' | 'R'
  skin: string
  hair: string
  hairStyle: HairStyle
  outfit: string
  acc: Accessory
}

export const CHARS: Record<CharId, Char> = {
  elena: { id: 'elena', name: 'Dr. Elena Ríos', role: 'Program Director', color: '#ef6f6c', side: 'R', skin: '#c68a62', hair: '#1b1220', hairStyle: 'bun', outfit: '#2a2f4a', acc: 'none' },
  dev: { id: 'dev', name: 'Dev', role: 'Systems Engineer', color: '#5cc8f0', side: 'L', skin: '#8d5a3b', hair: '#0e0e12', hairStyle: 'short', outfit: '#1f3b4d', acc: 'none' },
  amara: { id: 'amara', name: 'Dr. Amara Osei', role: 'Science Lead', color: '#62d394', side: 'R', skin: '#5a3825', hair: '#0d0a09', hairStyle: 'long', outfit: '#2c4a2e', acc: 'glasses' },
  houston: { id: 'houston', name: 'Houston', role: 'Comms Officer (DSN)', color: '#ffa94d', side: 'L', skin: '#e0b48f', hair: '#6b4a2b', hairStyle: 'cap', outfit: '#4a3a1c', acc: 'headset' },
  selene: { id: 'selene', name: 'SELENE', role: 'Orbiter', color: '#f4b942', side: 'R', skin: '#222', hair: '#222', hairStyle: 'bald', outfit: '#222', acc: 'none' },
  brooks: { id: 'brooks', name: 'Dr. Imani Brooks', role: 'Review Panel · Systems', color: '#a99cf0', side: 'L', skin: '#9a6a4a', hair: '#2a1a12', hairStyle: 'short', outfit: '#3a2a55', acc: 'glasses' },
  tomas: { id: 'tomas', name: 'Tomás Reyes', role: 'Review Panel · Power', color: '#ff7a59', side: 'R', skin: '#b9825d', hair: '#1a1410', hairStyle: 'bald', outfit: '#55301f', acc: 'none' },
  priya: { id: 'priya', name: 'Priya Nair', role: 'Review Panel · Cost & Science', color: '#5fd0c0', side: 'L', skin: '#a8714a', hair: '#0a0a10', hairStyle: 'long', outfit: '#1d4a45', acc: 'glasses' },
}

export type SceneId =
  | 'void' | 'boardroom' | 'lab' | 'hangar' | 'review' | 'launchpad' | 'space' | 'moonOrbit' | 'control' | 'crater'

export type Line =
  | { t: 'say'; who: CharId; text: string; mood?: Mood }
  | { t: 'cap'; text: string }
  | { t: 'sfx'; text: string; tone?: 'good' | 'bad' | 'neutral' }
  | { t: 'tele'; text: string }
  | { t: 'bg'; scene: SceneId }
  | { t: 'title'; text: string; sub?: string }

export const say = (who: CharId, text: string, mood: Mood = 'neutral'): Line => ({ t: 'say', who, text, mood })
export const cap = (text: string): Line => ({ t: 'cap', text })
export const sfx = (text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): Line => ({ t: 'sfx', text, tone })
export const tele = (text: string): Line => ({ t: 'tele', text })
export const bg = (scene: SceneId): Line => ({ t: 'bg', scene })
export const title = (text: string, sub?: string): Line => ({ t: 'title', text, sub })
