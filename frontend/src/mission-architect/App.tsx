import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CRATER, defaultDesign, starterFor, MAX_ITERATIONS, MODE_MULT, ORBIT, SPECIAL } from './data/catalog'
import { judge, ROLES, soloTeam, type Team } from './engine/roles'
import { Launch3D } from './three/Launch3D'
import { MoonJourney3D } from './three/MoonJourney3D'
import { MissionPatch } from './ui/Patch'
import { Setup } from './ui/Setup'
import { gmatScript } from './gmat'
import { Descent3D, type Landing } from './three/Descent3D'
import { Finale3D, type FinaleResult } from './three/Finale3D'
import { DEFAULT_ROVER, Rover3D, type RoverEnding, type RoverResult, type RoverStart } from './three/Rover3D'
import './styles.css'
import type { Design } from './data/types'
import { computeStats, initialStress } from './engine/design'
import {
  createMission, failureScore, runLaunch, scoreMission, siteTier,
  type EndingId, type LaunchOutcome, type Mission, type ScoreBreakdown,
} from './engine/mission'
import { clamp, money, mulberry32, type Rng } from './engine/rng'
import { INTRO, endingLines, moonEpilogue } from './story/scripts'
import { Dialogue } from './ui/Dialogue'
import { STEP_NAMES, TopBar } from './ui/Hud'
import { Mapping } from './ui/Mapping'
import { Hangar, OrbitPick, Review, Title } from './ui/screens1'
import { Report, Site } from './ui/screens2'
import { MarsTest } from './ui/MarsTest'
import { PLANET, setPlanet, type PlanetId } from './data/planet'
import { MARS, MOON } from './three/world'
import { preloadBody } from './three/stage'
import { MARS_INTRO, marsEndingLines, marsEpilogue } from './story/mars'
import { CoreThumb } from './three/CoreSample'
import { ROCKS } from './data/samples'
import { Lab } from './ui/Lab'
import type { LabResult } from './data/lab'
import { EdlStatic } from './three/EdlStatic'
import { Edl3D } from './three/Edl3D'
import { MARS_SITES } from './data/mars'

type Phase =
  | 'title' | 'intro' | 'setup' | 'orbit' | 'hangar' | 'review'
  | 'launch' | 'mapping' | 'site' | 'ending' | 'descent' | 'land' | 'rover' | 'finale' | 'epilogue' | 'lab' | 'report' | 'mars' | 'edl'

const STEP_OF: Record<Phase, number> = {
  title: 0, intro: 0, setup: 0, orbit: 1, hangar: 2, review: 3,
  launch: 4, mapping: 5, site: 6, ending: 6, descent: 7, land: 7, rover: 8, finale: 9, epilogue: 9, lab: 9, report: 10, mars: 0, edl: 0,
}
// Pantalla anterior del botón "← Back". Solo antes del lanzamiento: después la partida ya tiró dados.
const PREV: Partial<Record<Phase, Phase>> = { intro: 'title', setup: 'title', orbit: 'setup', hangar: 'orbit', review: 'hangar' }
// Pasos de la barra a los que se puede saltar hacia atrás (mismas fases, sin repetir diálogos).
const STEP_PHASE: Partial<Record<number, Phase>> = { 0: 'setup', 1: 'orbit', 2: 'hangar', 3: 'review' }

const urlSeed = () => Number(new URLSearchParams(location.search).get('seed')) || 0
// ?planet=mars elige Marte antes de leer los atajos (así ?rover=jezero&planet=mars encuentra el sitio).
const URL_PLANET: PlanetId = new URLSearchParams(location.search).get('planet') === 'mars' ? 'mars' : 'moon'
setPlanet(URL_PLANET)
// Atajos de prueba: ?rover=cabeus o ?landing=cabeus (y opcional &seed=123); ?screen=mars abre la prueba de Marte; ?screen=edl, el aterrizaje en Marte (&site=<id>; &static=1, los modelos quietos)
const q = (k: string) => { const v = new URLSearchParams(location.search).get(k); return v && CRATER[v] ? v : null }
const urlRover = () => q('rover') ?? q('landing')
// Marte: el aterrizaje es la cinemática EDL (sin decisiones ni tirada), siempre exitoso.
const MARS_LANDING: Landing = { ok: true, batteryPct: 100, integrity: 100, sciMul: 1, label: 'Sky crane touchdown. The rover is on Mars, all systems nominal.' }
const SCREEN = new URLSearchParams(location.search).get('screen')
const DEMO_LAUNCH: LaunchOutcome = { status: 'ok', panel: 'success', loi: 'success', events: [
  { kind: 'info', label: 'Mass check', text: '812 kg of 1500 kg. Within capacity.' },
  { kind: 'roll', label: 'Launch', p: 0.97, roll: 0.41, result: 'success', text: 'Medium launcher reliability 97%.' },
  { kind: 'roll', label: 'Solar array deployment', p: 0.9, roll: 0.62, result: 'success', text: 'Array reliability × stress penalty.' },
  { kind: 'roll', label: 'Lunar orbit insertion', p: 0.88, roll: 0.3, result: 'success', text: 'The engine must fire at exactly the right moment.' },
] }
// Partida de ejemplo para revisar pantallas sueltas (?screen=review|mapping|site|report).
const EDL_STATIC = new URLSearchParams(location.search).has('static')
const EDL_SITE = MARS_SITES.find((s) => s.id === new URLSearchParams(location.search).get('site')) ?? MARS_SITES[0]
const DEMO = ['review', 'mapping', 'site', 'report'].includes(SCREEN ?? '')
const demoDesign = (): Design => ({ ...defaultDesign(), partIds: starterFor('B') })
const demoMission = () => {
  const d = demoDesign()
  return createMission({ design: d, stats: computeStats(d, 0) }, DEMO_LAUNCH, false, 0, mulberry32(1))
}
const ROVER_END: Record<RoverEnding, string> = {
  return: 'The Return — back in the light', last: 'The Last Message', frozen: 'Frozen in the dark', dead: 'Battery depleted',
}
const MARS_END: Record<RoverEnding, string> = {
  return: 'Cores sealed before the storm', last: 'The Last Message', frozen: 'Frozen in the storm', dead: 'Buried by the dust storm',
}
const newSeed = () => Math.floor(Math.random() * 1e6)

export default function MissionArchitect({ onInspect, onExit }: {
  onInspect: (script: { name: string; text: string }) => void
  onExit: () => void
}) {
  const [seed, setSeed] = useState(() => urlSeed() || newSeed())
  const [planet, setPlanetState] = useState<PlanetId>(URL_PLANET)
  const mars = planet === 'mars'
  const choosePlanet = (p: PlanetId) => { setPlanet(p); setPlanetState(p); preloadBody(p) }
  useEffect(() => { preloadBody(URL_PLANET) }, [])
  const rng = useRef<Rng>(mulberry32(seed))
  // ?screen=lab&planet=mars: laboratorio con tres tubos de ejemplo.
  const [rover, setRover] = useState<RoverResult | null>(() => SCREEN === 'lab' ? { samples: 3, wet: 3, waterG: 0, lostG: 0, bestPct: 4, points: 0, ending: 'return', seed: 1, minTemp: 0, confirmed: 0, live: false, extended: false,
    cores: [{ kind: 'basalt', seed: 11, pct: 3 }, { kind: 'leopard', seed: 22, pct: 6 }, { kind: 'sulfate', seed: 33, pct: 4 }] } : null)
  const [team, setTeam] = useState<Team>(soloTeam)
  const minBat = useRef(100)
  const [landing, setLanding] = useState<Landing | null>(() => (q('landing') && URL_PLANET === 'mars' ? MARS_LANDING : null))
  const [finale, setFinale] = useState<FinaleResult | null>(null)
  const [lab, setLab] = useState<LabResult | null>(null)
  const [edlRun, setEdlRun] = useState(0)
  const [phase, setPhase] = useState<Phase>(() => (q('rover') ? 'rover' : q('landing') ? (URL_PLANET === 'mars' ? 'land' : 'descent') : SCREEN === 'setup' ? 'setup' : SCREEN === 'launch' ? 'launch' : SCREEN === 'hangar' ? 'hangar' : SCREEN === 'orbit' ? 'orbit' : SCREEN === 'mars' ? 'mars' : SCREEN === 'lab' ? 'lab' : SCREEN === 'edl' ? 'edl' : DEMO ? SCREEN as Phase : 'title'))
  const [design, setDesign] = useState<Design>(() => (DEMO ? demoDesign() : defaultDesign()))
  const [iterations, setIterations] = useState(0)
  const [forced, setForced] = useState(false)
  const [launch, setLaunch] = useState<LaunchOutcome | null>(SCREEN === 'launch' ? DEMO_LAUNCH : null)
  const [mission, setMissionRaw] = useState<Mission | null>(() => (DEMO && SCREEN !== 'review' ? demoMission() : null))
  // Systems: "Nobody Freezes" mira la batería mínima del orbitador en todo el mapeo.
  const setMission = (m: Mission | null) => { if (m) minBat.current = Math.min(minBat.current, m.batteryPct); setMissionRaw(m) }
  const [site, setSite] = useState<string | null>(() => urlRover() ?? (SCREEN === 'report' || SCREEN === 'lab' ? SPECIAL.site : null))
  const [ending, setEnding] = useState<EndingId>('lead')
  const [score, setScore] = useState<ScoreBreakdown | null>(() => (SCREEN === 'report' ? scoreMission(demoMission(), SPECIAL.site) : null))

  const stats = useMemo(() => computeStats(design, iterations), [design, iterations])
  const ctx = useMemo(() => ({ design, stats }), [design, stats])

  const reset = (keepDesign: boolean) => {
    const s = newSeed(); setSeed(s); rng.current = mulberry32(s)
    minBat.current = 100
    setIterations(0); setForced(false); setLaunch(null); setMission(null); setSite(null); setScore(null); setRover(null); setLanding(null); setFinale(null); setLab(null)
    if (!keepDesign) setDesign(defaultDesign())
    setPhase(keepDesign ? 'hangar' : 'title')
  }

  const startLaunch = (wasForced: boolean) => {
    setForced(wasForced)
    // Las tiradas de despliegue e inserción usan el estrés inicial del diseño.
    const outcome = runLaunch(ctx, initialStress(stats, wasForced, iterations), rng.current)
    setLaunch(outcome)
    setPhase('launch')
  }

  const afterLaunch = () => {
    if (!launch) return
    if (launch.status === 'launch_failure' || launch.status === 'lost') {
      setEnding(launch.status === 'lost' ? 'lost' : 'launch_failure')
      setScore(failureScore(stats))
      setMission(null)
      setPhase('report')
      return
    }
    setMission(createMission(ctx, launch, forced, iterations, rng.current))
    setPhase('mapping')
  }

  const pickSite = (id: string) => {
    if (!mission) return
    setSite(id)
    setEnding(siteTier(id))
    setScore(scoreMission(mission, id))
    setPhase('ending')
  }

  const iterationsLeft = MAX_ITERATIONS - iterations
  const inspect = (orbitId: string) => onInspect(gmatScript(orbitId, ORBIT[orbitId].name, stats.massKg))
  const has = (id: string) => design.partIds.includes(id)
  const stress = mission?.stress ?? 30
  const budgetLeft = mission?.budgetLeftM ?? stats.budgetLeftM
  const roverStart = useMemo<RoverStart>(() => q('rover') && !mission ? DEFAULT_ROVER : {
    batteryPct: landing?.batteryPct ?? 100, integrity: landing?.integrity ?? 100, sciMul: landing?.sciMul ?? 1,
    batteryKWh: design.partIds.includes('rbat_3') ? 3 : 6, mesh: design.partIds.includes('wheels_mesh'),
    deep: design.partIds.includes('drill_deep'), massSpec: design.partIds.includes('mass_spec'),
    autonav: design.partIds.includes('autonav'),
    canExtend: (mission?.budgetLeftM ?? 0) >= 20 && 100 - (mission?.stress ?? 0) >= 30,
  }, [landing, design.partIds, mission])
  const roverBonus = (rover?.points ?? 0) + (rover?.ending === 'return' ? 40 : 0) + (finale?.points ?? 0) + (lab?.points ?? 0)
  const confidence = Math.round(clamp(100 - stress / 2 + (rover?.confirmed ?? 0) * 10 + (rover?.ending === 'return' ? 15 : 0)
    + (finale ? (finale.choice === 'relay' ? 20 : finale.success ? 10 : 0) : 0), 0, 200))
  const verdicts = judge({
    budgetLeftM: budgetLeft, confidence, minOrbiterBat: minBat.current, roverMinTemp: rover ? rover.minTemp : null,
    exploded: mission?.log.filter((l) => l.text.includes('timer ran out')).length ?? 0,
    mapped: mission?.mapped.length ?? 0, lostGb: mission?.lostGb ?? 0, confirmed: rover?.confirmed ?? 0,
    live: rover?.live ?? false, rover: design.mode !== 'A' && !!landing?.ok,
  })
  const mark = (v: boolean | null) => (v === null ? <span className="na">Not played (needs the rover)</span> : v ? <span className="ok">Done</span> : <span className="bad">Missed</span>)
  const afterAct = () => setPhase(score ? 'report' : 'title')
  const summary: ReactNode[] = []
  if (landing) summary.push(<div key="l">{landing.label}</div>)
  if (rover?.extended) summary.push(<div key="x">⏱ Extended mission flown (+4 cycles)</div>)
  if (rover && mars) summary.push(<div key="r">{MARS_END[rover.ending]}: {rover.samples} cores drilled, {rover.cores.length} sent home{rover.lostG ? `, ${rover.lostG} lost in the storm` : ''} · seed {rover.seed}</div>)
  else if (rover) summary.push(<div key="r">{ROVER_END[rover.ending]}: {rover.samples} cores, {rover.wet} with ice, {rover.waterG} g of water sent{rover.lostG ? `, ${rover.lostG} g lost in the dark` : ''} (best {rover.bestPct}%) · seed {rover.seed}</div>)
  if (finale) summary.push(<div key="f">{finale.title}</div>)
  if (lab) summary.push(<div key="lab">Lab: {lab.title.toLowerCase()} ({lab.runs} tests, +{lab.points} pts)</div>)

  return (
    <div className="ma app">
      {phase === 'title' && <button className="btn small ghost ma-exit" onClick={onExit}>← Back to GMAT</button>}
      {phase !== 'title' && phase !== 'mars' && phase !== 'edl' && (
        <TopBar step={STEP_OF[phase]} steps={mars ? STEP_NAMES.map((n) => (n === 'Finale' ? 'Lab' : n)) : STEP_NAMES}
          canJump={(k) => !!PREV[phase] && !!STEP_PHASE[k]} onJump={(k) => setPhase(STEP_PHASE[k]!)} right={<><span className="hint">{money(budgetLeft)} left</span><span className="seed" title="Same seed = same sites and finds. Share it to replay this game.">seed {seed}</span>{PREV[phase] && <button className="btn small ghost ma-exit" onClick={() => setPhase(PREV[phase]!)}>← Back</button>}<button className="btn small ghost ma-exit" onClick={onExit}>← GMAT</button></>} />
      )}
      {phase === 'title' && <Title onStart={(p) => { choosePlanet(p); setPhase('intro') }} />}
      {phase === 'mars' && <MarsTest onExit={() => setPhase('title')} />}
      {phase === 'edl' && (EDL_STATIC ? <EdlStatic /> : <Edl3D key={edlRun} site={EDL_SITE} seed={7} onDone={() => setEdlRun((k) => k + 1)} />)}
      {phase === 'intro' && <Dialogue lines={mars ? MARS_INTRO : INTRO} startScene="void" onDone={() => setPhase('setup')} />}
      {phase === 'setup' && <Setup mode={design.mode} team={team} onDone={(mode, t) => { setTeam(t); setDesign({ ...design, mode, partIds: [] }); setPhase('orbit') }} />}
      {phase === 'orbit' && <OrbitPick design={design} onInspect={inspect} onPick={(orbitId) => { setDesign({ ...design, orbitId }); setPhase('hangar') }} />}
      {phase === 'hangar' && <Hangar design={design} setDesign={setDesign} iterations={iterations} onSubmit={() => setPhase('review')} />}
      {phase === 'review' && (
        <Review
          design={design}
          iterations={iterations}
          onApprove={() => startLaunch(false)}
          onIterate={() => { if (iterationsLeft > 0) { setIterations(iterations + 1); setPhase('hangar') } }}
          onForce={() => startLaunch(true)}
        />
      )}
      {phase === 'launch' && launch && (launch.status === 'launch_failure' || mars // Marte: crucero y llegada de Launch3D; el viaje GMAT es Tierra→Luna
        ? <Launch3D launch={launch} seed={seed} onDone={afterLaunch} />
        : <MoonJourney3D launch={launch} orbitId={design.orbitId} onDone={afterLaunch} />)}
      {phase === 'mapping' && mission && (
        <Mapping ctx={ctx} mission={mission} setMission={setMission} rng={rng.current} onFinish={() => setPhase('site')} />
      )}
      {phase === 'site' && mission && <Site mission={mission} design={design} onPick={pickSite} />}
      {phase === 'ending' && mission && site && (
        <Dialogue lines={(mars ? marsEndingLines : endingLines)(site, (mission.quality[site]?.hydrogen ?? 0) >= 0.4)} startScene="crater" onDone={() => { if (design.mode === 'A') setPhase('report'); else if (mars) { setLanding(MARS_LANDING); setPhase('land') } else setPhase('descent') }} />
      )}
      {phase === 'descent' && site && (
        <Descent3D crater={CRATER[site]} stress={stress} mapped={has('altimeter')} seed={seed} names={team.players === 4 ? team.names : undefined}
          onDone={(l) => { setLanding(l); setPhase(l.ok ? (mars ? 'land' : 'rover') : mars ? 'epilogue' : 'finale') }} />
      )}
      {phase === 'land' && site && ( // Marte: cinemática EDL (escudo, paracaídas, grúa) y el rover sigue donde tocó suelo
        <div className="mars-drive">
          <Edl3D site={CRATER[site]} seed={seed} start={roverStart} onDone={() => setPhase('rover')} />
          <button className="btn small mars-skip" onClick={() => setPhase('rover')}>Skip landing ▶</button>
        </div>
      )}
      {phase === 'rover' && site && (
        <Rover3D crater={CRATER[site]} quality={mission ? mission.quality[site]?.hydrogen ?? 0 : 0.6} seed={seed}
          orbitId={design.orbitId} start={roverStart} world={mars ? MARS : MOON}
          onDone={(r) => { setRover(r); setPhase('epilogue') }} />
      )}
      {phase === 'epilogue' && (mars
        ? <Dialogue lines={marsEpilogue(rover, !!landing?.ok)} startScene="control" onDone={() => (rover?.cores.length ? setPhase('lab') : afterAct())} />
        : <Dialogue lines={moonEpilogue(rover, has('mass_spec'))} startScene="control" onDone={() => (rover?.ending === 'return' ? setPhase('finale') : afterAct())} />)}
      {phase === 'lab' && rover && site && <Lab tubes={rover.cores} site={CRATER[site].name} onDone={(r) => { setLab(r); afterAct() }} />}
      {phase === 'finale' && site && (
        <Finale3D kind={landing && !landing.ok ? 'planb' : 'return'} crater={CRATER[site].name} seed={seed} partIds={design.partIds}
          onDone={(f) => { setFinale(f); afterAct() }} />
      )}
      {phase === 'report' && score && (
        <Report ending={ending} mission={mission} score={{ ...score, total: (score.total + roverBonus) * MODE_MULT[design.mode] }} siteId={site}
          onRetry={() => reset(true)} onNew={() => reset(false)}
          extra={<>
            <div className="glance">
              {mars
                ? <div><span></span><b>{rover ? `${rover.cores.length} cores` : design.mode === 'A' ? 'Orbit only' : '—'}</b><small>rock cores sent home</small></div>
                : <div><span></span><b>{rover ? `${rover.waterG} g` : design.mode === 'A' ? 'Orbit only' : '—'}</b><small>water confirmed on Earth</small></div>}
              <div><span></span><b>{mission?.mapped.length ?? 0} / 5</b><small>{PLANET.siteNoun}s mapped from orbit</small></div>
              <div><span></span><b>{money(budgetLeft)}</b><small>money left over</small></div>
              <div><span></span><b>{confidence}%</b><small>NASA confidence</small></div>
            </div>
            <ol className="journey">
              {[
                ['', 'Launch', launch ? launch.status === 'ok' ? `Reached ${PLANET.body}` : launch.status === 'lost' ? 'Lost in space' : 'Failed on the pad' : '—', launch?.status === 'ok'],
                ['', 'Mapping', mission ? `${mission.mapped.length} ${PLANET.siteNoun}s scanned` : 'Not reached', !!mission?.mapped.length],
                ['', 'Site', site ? CRATER[site].name : 'Not chosen', !!site],
                ...(design.mode === 'A' ? [] : [
                  ['', 'Landing', landing ? landing.ok ? 'Touchdown' : 'Failed' : 'Not reached', !!landing?.ok],
                  ['', 'Rover', rover ? (mars ? MARS_END : ROVER_END)[rover.ending] : 'Not reached', rover?.ending === 'return'],
                ]),
                ...(finale ? [['', 'Selene\'s end', finale.title.toLowerCase(), finale.success]] : []),
                ...(lab ? [['', 'Lab', lab.title.toLowerCase(), lab.points >= 120]] : []),
              ].map(([, step, what, good], i) => (
                <li key={i} className={good ? 'good' : 'meh'}><span>{String(i + 1).padStart(2, '0')}</span><b>{step as string}</b><small>{what as string}</small></li>
              ))}
            </ol>
            {mars && !!rover?.cores.length && (
              <div className="core-cache">
                <h3>Sealed sample tubes <small>waiting on Mars for a sample-return mission</small></h3>
                <ul>
                  {rover.cores.map((c, i) => (
                    <li key={i} className={`bio${ROCKS[c.kind].bio}`}>
                      <CoreThumb kind={c.kind} seed={c.seed} />
                      <b>{ROCKS[c.kind].name}</b><small>like {ROCKS[c.kind].real}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="team-row">
              <MissionPatch mode={design.mode} size={150} />
              <div className="roles-report">
                {ROLES.map((r) => (
                  <div key={r.id} style={{ borderColor: r.color }}>
                    <b><span className="code">{r.icon}</span> {r.main[0]}</b>{team.players === 4 ? <small> · {team.names[r.id]}</small> : null}<br />
                    {mark(verdicts[r.id].main)}
                    {team.players === 4 && <><br /><small>Secret · {r.secret[0]}: </small>{mark(verdicts[r.id].secret)}</>}
                  </div>
                ))}
              </div>
            </div>
            {summary.length > 0 && <details className="goals"><summary>Surface details (+{roverBonus} pts · mission ×{MODE_MULT[design.mode]})</summary><div className="report-summary">{summary}</div></details>}
            <div className="actions"><button className="btn small ghost" onClick={() => inspect(design.orbitId)}>See {PLANET.ship}'s real orbit in GMAT</button></div>
          </>} />
      )}
    </div>
  )
}
