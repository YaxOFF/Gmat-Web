import type { Char, Mood } from '../data/chars'

// Retratos vectoriales: estilo ilustración plana con sombreado suave (sin brillos neón).

/** Aclara (f > 1) u oscurece (f < 1) un color #rrggbb. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

function HairBack({ c }: { c: Char }) {
  if (c.hairStyle === 'long') return <path d="M52 112 C46 40 154 40 148 112 L156 232 Q100 250 44 232 Z" fill={shade(c.hair, 0.85)} />
  if (c.hairStyle === 'bun') return <circle cx="100" cy="30" r="22" fill={c.hair} />
  return null
}

function HairFront({ c }: { c: Char }) {
  const h = c.hair, hi = shade(c.hair, 1.6)
  switch (c.hairStyle) {
    case 'short':
      return <g><path d="M58 104 C54 52 84 38 104 40 C132 42 148 62 142 104 C138 84 126 70 104 68 C84 70 70 76 58 104 Z" fill={h} />
        <path d="M80 54 q14 -8 34 -2" stroke={hi} strokeWidth="3" fill="none" opacity=".5" strokeLinecap="round" /></g>
    case 'long':
      return <g><path d="M56 112 C52 48 90 38 104 40 C138 42 150 72 144 112 C136 82 120 66 98 66 C80 70 66 84 56 112 Z" fill={h} />
        <path d="M84 52 q16 -8 34 0" stroke={hi} strokeWidth="3" fill="none" opacity=".45" strokeLinecap="round" /></g>
    case 'bun':
      return <g><path d="M58 100 C56 54 86 42 102 42 C128 42 146 60 142 100 C134 76 120 64 100 64 C82 64 66 76 58 100 Z" fill={h} />
        <path d="M86 50 q14 -6 28 0" stroke={hi} strokeWidth="2.5" fill="none" opacity=".45" /></g>
    case 'cap':
      return <g><path d="M62 96 C62 56 82 42 102 42 C124 42 142 58 140 96 Z" fill={c.outfit} />
        <path d="M60 94 Q100 82 150 96 L152 104 Q104 92 58 102 Z" fill={shade(c.outfit, 0.7)} />
        <circle cx="100" cy="66" r="9" fill={c.color} opacity=".9" />
        <path d="M60 100 q-2 14 4 22 M140 100 q2 14 -4 22" stroke={h} strokeWidth="6" strokeLinecap="round" /></g>
    default:
      return <path d="M64 92 q36 -40 72 0" stroke={shade(c.skin, 1.12)} strokeWidth="6" fill="none" opacity=".5" />
  }
}

function Selene({ mood, active, c }: { mood: Mood; active: boolean; c: Char }) {
  const lens = mood === 'angry' ? '#ef6f6c' : mood === 'worried' ? '#ffa94d' : '#5cc8f0'
  return (
    <svg className={`portrait ${active ? 'on' : 'off'}`} viewBox="0 0 200 300" aria-label={c.name}>
      <defs>
        <linearGradient id="sel-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6d27a" /><stop offset=".5" stopColor="#c99a3e" /><stop offset="1" stopColor="#8a6424" /></linearGradient>
        <pattern id="sel-cells" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#16285e" /><path d="M0 0 H8 M0 0 V8" stroke="#4d6fc4" strokeWidth=".8" /></pattern>
      </defs>
      <path d="M100 110 v-34" stroke="#9aa0ad" strokeWidth="3" />
      <path d="M72 70 q28 -26 56 0 z" fill="#eef0f4" stroke="#b8bec9" strokeWidth="2" />
      <rect x="-6" y="150" width="70" height="34" fill="url(#sel-cells)" stroke="#2a3b70" strokeWidth="2" />
      <rect x="136" y="150" width="70" height="34" fill="url(#sel-cells)" stroke="#2a3b70" strokeWidth="2" />
      <path d="M64 167 h8 M128 167 h8" stroke="#9aa0ad" strokeWidth="3" />
      <rect x="70" y="108" width="60" height="118" rx="4" fill="url(#sel-foil)" />
      <path d="M70 140 h60 M70 190 h60" stroke="#8a6424" strokeWidth="1.5" opacity=".6" />
      <circle cx="100" cy="166" r="17" fill="#141a2a" stroke="#d9dde6" strokeWidth="3" />
      <circle cx="100" cy="166" r={mood === 'worried' ? 6 : 10} fill={lens} />
      <circle cx="95" cy="161" r="3" fill="#fff" opacity=".8" />
      <path d="M90 226 l-6 18 h32 l-6 -18 z" fill="#5a5f6b" />
    </svg>
  )
}

export function Portrait({ c, mood = 'neutral', active = true }: { c: Char; mood?: Mood; active?: boolean }) {
  if (c.id === 'selene') return <Selene mood={mood} active={active} c={c} />
  const id = `pt-${c.id}`, dark = shade(c.skin, 0.8), lip = shade(c.skin, 0.62)
  const browY = mood === 'angry' ? [104, 110] : mood === 'worried' ? [110, 102] : [104, 104]
  const lidDrop = mood === 'angry' ? 3 : mood === 'worried' ? 1.5 : 0
  const mouth =
    mood === 'excited' ? <path d="M86 156 Q100 174 114 156 Q100 162 86 156 Z" fill="#5a1f24" stroke={lip} strokeWidth="2" />
    : mood === 'worried' ? <path d="M89 162 Q100 154 111 162" stroke={lip} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    : mood === 'angry' ? <path d="M89 160 Q100 157 111 160" stroke={lip} strokeWidth="4" fill="none" strokeLinecap="round" />
    : <path d="M89 157 Q100 164 111 157" stroke={lip} strokeWidth="3.5" fill="none" strokeLinecap="round" />
  const eye = (x: number) => (
    <g>
      <path d={`M${x - 10} 120 Q${x} 110 ${x + 10} 120 Q${x} 127 ${x - 10} 120 Z`} fill="#f7f4ef" />
      <circle cx={x} cy={120} r="5" fill="#3b2618" /><circle cx={x} cy={120} r="2.4" fill="#0c0806" />
      <circle cx={x + 1.8} cy={118.2} r="1.3" fill="#fff" />
      <path d={`M${x - 11} ${119 + lidDrop} Q${x} ${109 + lidDrop} ${x + 11} ${119 + lidDrop}`} stroke={shade(c.skin, 0.55)} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  )
  return (
    <svg className={`portrait ${active ? 'on' : 'off'}`} viewBox="0 0 200 300" aria-label={c.name}>
      <defs>
        <linearGradient id={`${id}-skin`} x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stopColor={shade(c.skin, 1.1)} /><stop offset="1" stopColor={dark} /></linearGradient>
        <linearGradient id={`${id}-coat`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={shade(c.outfit, 1.35)} /><stop offset="1" stopColor={shade(c.outfit, 0.8)} /></linearGradient>
      </defs>
      <HairBack c={c} />
      {/* Hombros y chaqueta con solapas, camisa y parche de misión */}
      <path d="M14 300 C16 240 50 214 100 210 C150 214 184 240 186 300 Z" fill={`url(#${id}-coat)`} />
      <path d="M78 212 L100 250 L122 212 Q100 220 78 212 Z" fill="#eef1f6" />
      <path d="M78 212 L92 268 L100 250 Z M122 212 L108 268 L100 250 Z" fill={shade(c.outfit, 0.7)} />
      <circle cx="146" cy="250" r="11" fill={shade(c.outfit, 0.6)} stroke={c.color} strokeWidth="2.5" />
      <path d="M140 252 l6 -9 l6 9 z" fill={c.color} />
      <path d="M88 214 L70 270" stroke={c.color} strokeWidth="2.5" opacity=".8" />
      <rect x="60" y="268" width="20" height="26" rx="2" fill="#f2f4f8" /><rect x="63" y="272" width="14" height="5" fill={c.color} />
      {/* Cuello y cabeza */}
      <path d="M86 176 L86 214 Q100 222 114 214 L114 176 Z" fill={dark} />
      <ellipse cx="60" cy="124" rx="7" ry="11" fill={dark} /><ellipse cx="140" cy="124" rx="7" ry="11" fill={dark} />
      <path d="M62 112 C62 70 80 58 100 58 C120 58 138 70 138 112 C138 152 122 182 100 184 C78 182 62 152 62 112 Z" fill={`url(#${id}-skin)`} />
      <HairFront c={c} />
      <path d={`M78 ${browY[0]} Q86 ${browY[0] - 4} 94 ${browY[1]}`} stroke={shade(c.hair, 1.2)} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d={`M106 ${browY[1]} Q114 ${browY[0] - 4} 122 ${browY[0]}`} stroke={shade(c.hair, 1.2)} strokeWidth="4" fill="none" strokeLinecap="round" />
      {eye(86)}{eye(114)}
      <path d="M100 124 Q96 138 99 142 Q102 144 105 141" stroke={shade(c.skin, 0.68)} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <ellipse cx="78" cy="142" rx="7" ry="4" fill="#e0707a" opacity=".18" /><ellipse cx="122" cy="142" rx="7" ry="4" fill="#e0707a" opacity=".18" />
      {mouth}
      {c.acc === 'glasses' && <g stroke="#2a2f3c" strokeWidth="2.4" fill="#ffffff14"><rect x="73" y="110" width="26" height="20" rx="7" /><rect x="101" y="110" width="26" height="20" rx="7" /><path d="M99 118 h2 M73 116 l-10 -3 M127 116 l10 -3" /></g>}
      {c.acc === 'headset' && <g fill="none"><path d="M56 118 C56 60 144 60 144 118" stroke="#2c303a" strokeWidth="6" /><rect x="48" y="110" width="14" height="24" rx="6" fill="#2c303a" /><rect x="138" y="110" width="14" height="24" rx="6" fill="#2c303a" /><path d="M145 132 Q140 160 116 162" stroke="#2c303a" strokeWidth="3.5" /><circle cx="114" cy="162" r="4" fill={c.color} /></g>}
    </svg>
  )
}
