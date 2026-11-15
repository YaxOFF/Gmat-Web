import type { Char, Mood, SceneId } from '../data/chars'

// Arte 100 % vectorial (sin imágenes externas): escenas y retratos de estilo historieta.

const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 137.5) % 1000,
  y: (i * 71.3 + (i % 7) * 40) % 560,
  r: 0.8 + ((i * 13) % 5) * 0.35,
}))

function Stars({ o = 1 }: { o?: number }) {
  return (
    <g opacity={o}>
      {STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={0.35 + (i % 4) * 0.15} />)}
    </g>
  )
}

function Moon({ cx, cy, r, tint = '#b9bdc9' }: { cx: number; cy: number; r: number; tint?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={tint} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.25} r={r * 0.18} fill="#9aa0b0" />
      <circle cx={cx + r * 0.35} cy={cy + r * 0.1} r={r * 0.25} fill="#9aa0b0" />
      <circle cx={cx - r * 0.1} cy={cy + r * 0.45} r={r * 0.12} fill="#9aa0b0" />
      <circle cx={cx} cy={cy} r={r} fill="url(#shade)" />
    </g>
  )
}

export function SceneArt({ id }: { id: SceneId }) {
  return (
    <svg className="scene-svg" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="shade" cx="30%" cy="30%" r="80%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.65" />
        </radialGradient>
        <linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0e24" /><stop offset="1" stopColor="#1b1030" />
        </linearGradient>
        <linearGradient id="glowY" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb020" stopOpacity="0.7" /><stop offset="1" stopColor="#ffb020" stopOpacity="0" />
        </linearGradient>
      </defs>
      {id === 'void' && (<><rect width="1000" height="560" fill="#05060b" /><Stars /></>)}

      {id === 'space' && (
        <>
          <rect width="1000" height="560" fill="url(#sky1)" /><Stars />
          <circle cx="170" cy="400" r="150" fill="#1d4f91" /><circle cx="170" cy="400" r="150" fill="url(#shade)" />
          <path d="M60 360 q60 -30 120 0 t110 30" stroke="#3fa66a" strokeWidth="14" fill="none" opacity="0.7" />
          <Moon cx={800} cy={170} r={70} />
        </>
      )}

      {id === 'moonOrbit' && (
        <>
          <rect width="1000" height="560" fill="#05060b" /><Stars />
          <Moon cx={500} cy={720} r={480} />
          <ellipse cx="500" cy="330" rx="470" ry="110" fill="none" stroke="#d7ff3a" strokeWidth="3" strokeDasharray="14 10" />
          <g transform="translate(330 262) rotate(-12)">
            <rect x="-14" y="-8" width="28" height="16" fill="#e8eaf2" />
            <rect x="-46" y="-4" width="28" height="8" fill="#38e1ff" /><rect x="18" y="-4" width="28" height="8" fill="#38e1ff" />
          </g>
        </>
      )}

      {id === 'boardroom' && (
        <>
          <rect width="1000" height="560" fill="#12141f" />
          <rect x="120" y="60" width="760" height="300" fill="#05060b" stroke="#2a2f4a" strokeWidth="10" />
          <Stars o={0.8} /><Moon cx={640} cy={200} r={90} />
          <rect x="0" y="400" width="1000" height="160" fill="#0b0c13" />
          <path d="M60 420 L940 420 L1000 560 L0 560 Z" fill="#1c1f30" />
          <rect x="0" y="0" width="1000" height="560" fill="#ff3d81" opacity="0.04" />
        </>
      )}

      {id === 'lab' && (
        <>
          <rect width="1000" height="560" fill="#0d1218" />
          <rect x="90" y="70" width="820" height="330" fill="#e9eef2" opacity="0.93" />
          <g stroke="#38566b" strokeWidth="3" fill="none" opacity="0.8">
            <circle cx="260" cy="240" r="80" /><ellipse cx="260" cy="240" rx="150" ry="40" strokeDasharray="8 6" />
            <path d="M480 300 q80 -160 160 0 t160 0" /><path d="M470 130 h330 M470 160 h260 M470 190 h300" />
          </g>
          <rect x="0" y="420" width="1000" height="140" fill="#080b10" />
        </>
      )}

      {id === 'hangar' && (
        <>
          <rect width="1000" height="560" fill="#0b0f16" />
          <g stroke="#1a2230" strokeWidth="2">{Array.from({ length: 14 }, (_, i) => <line key={i} x1={i * 80} y1="0" x2={i * 80} y2="560" />)}</g>
          <ellipse cx="500" cy="500" rx="360" ry="50" fill="url(#glowY)" opacity="0.5" />
          <g transform="translate(500 330)">
            <rect x="-34" y="-60" width="68" height="120" fill="#cfd4e0" stroke="#8a90a2" strokeWidth="3" />
            <rect x="-170" y="-14" width="125" height="28" fill="#38e1ff" opacity="0.85" /><rect x="45" y="-14" width="125" height="28" fill="#38e1ff" opacity="0.85" />
            <circle cx="0" cy="-78" r="22" fill="none" stroke="#ffb020" strokeWidth="5" />
          </g>
        </>
      )}

      {id === 'review' && (
        <>
          <rect width="1000" height="560" fill="#14111f" />
          <rect x="140" y="80" width="720" height="230" fill="#1d1a2e" stroke="#b794ff" strokeWidth="4" />
          <g fill="#b794ff" opacity="0.5">{Array.from({ length: 6 }, (_, i) => <rect key={i} x={170 + i * 115} y={110} width="90" height="14" />)}</g>
          <g fill="#38e1ff" opacity="0.45">{Array.from({ length: 5 }, (_, i) => <rect key={i} x={170 + i * 135} y={150} width="100" height="90" />)}</g>
          <rect x="0" y="420" width="1000" height="140" fill="#0a0813" />
        </>
      )}

      {id === 'launchpad' && (
        <>
          <rect width="1000" height="560" fill="url(#sky1)" /><Stars />
          <rect x="0" y="470" width="1000" height="90" fill="#0b0b10" />
          <ellipse cx="500" cy="480" rx="260" ry="34" fill="url(#glowY)" />
          <g transform="translate(500 250)">
            <path d="M0 -150 q40 60 40 150 v110 h-80 v-110 q0 -90 40 -150z" fill="#e8eaf2" stroke="#8a90a2" strokeWidth="3" />
            <path d="M-40 70 l-34 50 h34z M40 70 l34 50 h-34z" fill="#ff3d81" />
            <circle cx="0" cy="-30" r="14" fill="#38e1ff" />
          </g>
          <rect x="620" y="200" width="26" height="280" fill="#3a3f55" /><rect x="560" y="230" width="70" height="10" fill="#3a3f55" />
        </>
      )}

      {id === 'control' && (
        <>
          <rect width="1000" height="560" fill="#080b12" />
          <g>
            {Array.from({ length: 4 }, (_, r) => Array.from({ length: 6 }, (_, c) => (
              <rect key={`${r}-${c}`} x={70 + c * 150} y={50 + r * 100} width="130" height="80" fill="#0e2a2a" stroke="#38e1ff" strokeWidth="2" opacity={0.5 + ((r * 3 + c) % 4) * 0.12} />
            )))}
          </g>
          <path d="M70 330 q130 -90 260 0 t260 0 t260 0" stroke="#7dff6b" strokeWidth="3" fill="none" opacity="0.7" transform="translate(0 -230)" />
          <rect x="0" y="450" width="1000" height="110" fill="#05070c" />
        </>
      )}

      {id === 'crater' && (
        <>
          <rect width="1000" height="560" fill="#030409" /><Stars o={0.5} />
          <path d="M0 420 L180 340 L330 400 L500 470 L670 400 L830 330 L1000 410 V560 H0Z" fill="#14161f" />
          <path d="M330 400 L500 470 L670 400 L600 520 L400 520Z" fill="#05060b" />
          <circle cx="500" cy="480" r="150" fill="#38e1ff" opacity="0.05" />
        </>
      )}
      <rect width="1000" height="560" fill="url(#shade)" opacity="0.5" />
    </svg>
  )
}

// ---------- Retratos ----------

function Hair({ c }: { c: Char }) {
  switch (c.hairStyle) {
    case 'short': return <path d="M62 78 q4 -52 38 -52 q36 0 38 52 q-16 -26 -38 -26 q-26 0 -38 26z" fill={c.hair} />
    case 'long': return <path d="M58 100 q-6 -78 42 -76 q48 -2 42 76 l4 80 h-24 l-2 -80 q-20 -24 -40 -24 q-20 0 -22 24 l-2 80 h-24z" fill={c.hair} />
    case 'bun': return <g fill={c.hair}><circle cx="100" cy="22" r="18" /><path d="M62 82 q4 -54 38 -54 q36 0 38 54 q-18 -26 -38 -26 q-22 0 -38 26z" /></g>
    case 'cap': return <g fill={c.hair}><path d="M60 80 q2 -54 40 -54 q38 0 40 54 q-20 -18 -40 -18 q-20 0 -40 18z" /><path d="M56 80 h96 v10 h-96z" fill="#222" /></g>
    default: return null
  }
}

export function Portrait({ c, mood = 'neutral', active = true }: { c: Char; mood?: Mood; active?: boolean }) {
  if (c.id === 'selene') {
    return (
      <svg className={`portrait ${active ? 'on' : 'off'}`} viewBox="0 0 200 300" aria-label={c.name}>
        <g style={{ filter: `drop-shadow(0 0 10px ${c.color})` }}>
          <rect x="62" y="80" width="76" height="110" rx="8" fill="#cfd4e0" stroke={c.color} strokeWidth="3" />
          <rect x="-4" y="122" width="62" height="26" fill="#38e1ff" opacity="0.85" /><rect x="142" y="122" width="62" height="26" fill="#38e1ff" opacity="0.85" />
          <circle cx="100" cy="132" r="18" fill="#05060b" stroke={c.color} strokeWidth="3" />
          <circle cx="100" cy="132" r={mood === 'worried' ? 5 : 9} fill={mood === 'angry' ? '#ff3d81' : c.color} />
          <path d="M100 80 v-30 m-14 0 h28" stroke={c.color} strokeWidth="4" fill="none" />
        </g>
      </svg>
    )
  }
  const brow = mood === 'angry' ? 'M76 92 l20 8 M124 92 l-20 8' : mood === 'worried' ? 'M76 98 l20 -8 M124 98 l-20 -8' : 'M76 94 h20 M104 94 h20'
  const mouth =
    mood === 'excited' ? <path d="M88 130 q12 16 24 0z" fill="#3a0f1c" />
    : mood === 'worried' ? <path d="M90 134 q10 -8 20 0" stroke="#3a0f1c" strokeWidth="3" fill="none" />
    : mood === 'angry' ? <path d="M90 134 h20" stroke="#3a0f1c" strokeWidth="4" />
    : <path d="M90 132 q10 6 20 0" stroke="#3a0f1c" strokeWidth="3" fill="none" />
  return (
    <svg className={`portrait ${active ? 'on' : 'off'}`} viewBox="0 0 200 300" aria-label={c.name}>
      <g style={{ filter: `drop-shadow(0 0 8px ${c.color})` }}>
        <path d="M10 300 q4 -96 90 -100 q86 4 90 100z" fill={c.outfit} stroke={c.color} strokeWidth="3" />
        <path d="M84 196 l16 30 l16 -30z" fill="#e8eaf2" opacity="0.9" />
        <rect x="86" y="160" width="28" height="42" fill={c.skin} />
        {c.hairStyle === 'long' && <Hair c={c} />}
        <ellipse cx="100" cy="106" rx="40" ry="50" fill={c.skin} />
        {c.hairStyle !== 'long' && <Hair c={c} />}
        <circle cx="86" cy="108" r="4.5" fill="#111" /><circle cx="114" cy="108" r="4.5" fill="#111" />
        <path d={brow} stroke="#111" strokeWidth="4" strokeLinecap="round" fill="none" />
        {mouth}
        {c.acc === 'glasses' && <g stroke="#111" strokeWidth="3" fill="rgba(255,255,255,.12)"><circle cx="86" cy="108" r="12" /><circle cx="114" cy="108" r="12" /><path d="M98 108 h4" /></g>}
        {c.acc === 'headset' && <g stroke={c.color} strokeWidth="5" fill="none"><path d="M58 104 q0 -56 42 -56 q42 0 42 56" /><path d="M142 106 q0 26 -24 34" /></g>}
      </g>
    </svg>
  )
}
