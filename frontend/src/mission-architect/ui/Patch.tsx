import type { MissionMode } from '../data/types'
import { PLANET } from '../data/planet'

/** Parche de misión bordado (reemplaza a la servilleta): cambia según la misión elegida. */
export function MissionPatch({ mode, size = 260 }: { mode: MissionMode; size?: number }) {
  const mars = PLANET.id === 'mars'
  const ring = mars ? `ARES · MISSION ${mode} · STONES OF MARS ·` : `SELENE · MISSION ${mode} · WATER ON THE MOON ·`
  return (
    <svg className="patch" width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={`Mission ${mode} patch`} key={mode + PLANET.id}>
      <defs>
        <radialGradient id="pt-sky" cx="50%" cy="35%"><stop offset="0" stopColor="#1f3566" /><stop offset="1" stopColor="#0a1228" /></radialGradient>
        <radialGradient id="pt-moon" cx="38%" cy="30%">{mars
          ? <><stop offset="0" stopColor="#e8a476" /><stop offset="1" stopColor="#8a3f22" /></>
          : <><stop offset="0" stopColor="#ece8dc" /><stop offset="1" stopColor="#7d7f8c" /></>}</radialGradient>
        <path id="pt-arc" d="M120 120 m-96 0 a96 96 0 1 1 192 0 a96 96 0 1 1 -192 0" />
        <clipPath id="pt-in"><circle cx="120" cy="120" r="82" /></clipPath>
      </defs>
      {/* Borde bordado */}
      <circle cx="120" cy="120" r="116" fill="#5cc8f0" />
      <circle cx="120" cy="120" r="111" fill="#121a30" />
      <circle cx="120" cy="120" r="111" fill="none" stroke="#5cc8f0" strokeWidth="1.5" strokeDasharray="2 3" opacity=".7" />
      <text fontSize="13" fontWeight="800" letterSpacing="2.2" fill="#f4efe1" fontFamily="Bahnschrift, Segoe UI, sans-serif">
        <textPath href="#pt-arc" startOffset="0" textLength="596" lengthAdjust="spacing">{ring}</textPath>
      </text>
      <circle cx="120" cy="120" r="84" fill="#5cc8f0" />
      {/* Interior */}
      <g clipPath="url(#pt-in)">
        <rect width="240" height="240" fill="url(#pt-sky)" />
        {[[70, 70], [160, 60], [176, 104], [88, 102], [140, 84], [64, 130]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2.4} fill="#f4efe1" />)}
        <circle cx="120" cy="226" r="92" fill="url(#pt-moon)" />
        {mars
          ? <>{/* capas de roca del delta y una piedra con núcleo */}<path d="M40 170 q40 -10 80 -4 t84 -2" stroke="#6e2f18" strokeWidth="3" fill="none" /><path d="M36 184 q46 -8 90 -2 t80 0" stroke="#c98a62" strokeWidth="3" fill="none" /><ellipse cx="150" cy="160" rx="10" ry="6" fill="#5a2a18" /></>
          : <><circle cx="96" cy="168" r="9" fill="#00000022" /><circle cx="148" cy="180" r="13" fill="#00000022" /><circle cx="122" cy="156" r="5" fill="#00000022" /></>}
        <ellipse cx="120" cy="122" rx="74" ry="24" fill="none" stroke="#5cc8f0" strokeWidth="3" transform="rotate(-14 120 122)" />
        {/* Selene */}
        <g transform="translate(170 96) rotate(-14)">
          <rect x="-7" y="-7" width="14" height="14" fill="#e3b04f" stroke="#7a5a1a" strokeWidth="1" />
          <rect x="-29" y="-3" width="20" height="6" fill="#2a4cff" /><rect x="9" y="-3" width="20" height="6" fill="#2a4cff" />
        </g>
        {mode === 'C' && <path d="M163 108 q-8 12 -2 26 M171 110 q-12 16 -4 34" stroke="#ef6f6c" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
        {mode !== 'A' && <g transform="translate(110 150)">
          <path d="M0 0 C 6 -18 30 -34 54 -50" stroke="#ef6f6c" strokeWidth="2" strokeDasharray="3 4" fill="none" />
          <rect x="-12" y="-4" width="24" height="9" rx="2" fill="#e8ecf6" /><rect x="-14" y="-7" width="28" height="3" fill="#2a4cff" />
          <circle cx="-8" cy="7" r="3.2" fill="#2c303a" /><circle cx="0" cy="7" r="3.2" fill="#2c303a" /><circle cx="8" cy="7" r="3.2" fill="#2c303a" />
          {mode === 'C' && <rect x="13" y="0" width="2.5" height="14" fill="#ef6f6c" />}
        </g>}
        <text x="120" y="208" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="1.5" fill="#1b2240" fontFamily="Bahnschrift, Segoe UI, sans-serif">
          {mode === 'A' ? 'ORBITER' : mode === 'B' ? 'ORBITER + ROVER' : 'RADAR + DEEP DRILL'}
        </text>
      </g>
    </svg>
  )
}
