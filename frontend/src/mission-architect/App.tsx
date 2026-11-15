import { useMemo, useRef, useState } from 'react'
import { CRATER, defaultDesign, MAX_ITERATIONS, ORBIT } from './data/catalog'
import { gmatScript } from './gmat'
import { Rover3D, type RoverResult } from './three/Rover3D'
import './styles.css'
import type { Design } from './data/types'
import { computeStats, initialStress } from './engine/design'
import {
  createMission, failureScore, runLaunch, scoreMission, siteTier,
  type EndingId, type LaunchOutcome, type Mission, type ScoreBreakdown,
} from './engine/mission'
import { money, mulberry32, type Rng } from './engine/rng'
import { INTRO, endingLines, launchLines } from './story/scripts'
import { Dialogue } from './ui/Dialogue'
import { STEP_NAMES, TopBar } from './ui/Hud'
import { Mapping } from './ui/Mapping'
import { Hangar, OrbitPick, Review, Title } from './ui/screens1'
import { Report, Site } from './ui/screens2'

type Phase =
  | 'title' | 'intro' | 'orbit' | 'hangar' | 'review'
  | 'launch' | 'mapping' | 'site' | 'ending' | 'rover' | 'report'

const STEP_OF: Record<Phase, number> = {
  title: 0, intro: 0, orbit: 1, hangar: 2, review: 3,
  launch: 4, mapping: 5, site: 6, ending: 6, rover: 7, report: 8,
}

const urlSeed = () => Number(new URLSearchParams(location.search).get('seed')) || 0
// Atajo para probar el rover: ?rover=cabeus (y opcional &seed=123)
const urlRover = () => new URLSearchParams(location.search).get('rover')
const newSeed = () => Math.floor(Math.random() * 1e6)

export default function MissionArchitect({ onInspect, onExit }: {
  onInspect: (script: { name: string; text: string }) => void
  onExit: () => void
}) {
  const [seed, setSeed] = useState(() => urlSeed() || newSeed())
  const rng = useRef<Rng>(mulberry32(seed))
  const [rover, setRover] = useState<RoverResult | null>(null)
  const [phase, setPhase] = useState<Phase>(() => (urlRover() && CRATER[urlRover()!] ? 'rover' : 'title'))
  const [design, setDesign] = useState<Design>(defaultDesign())
  const [iterations, setIterations] = useState(0)
  const [forced, setForced] = useState(false)
  const [launch, setLaunch] = useState<LaunchOutcome | null>(null)
  const [mission, setMission] = useState<Mission | null>(null)
  const [site, setSite] = useState<string | null>(() => urlRover() && CRATER[urlRover()!] ? urlRover() : null)
  const [ending, setEnding] = useState<EndingId>('lead')
  const [score, setScore] = useState<ScoreBreakdown | null>(null)

  const stats = useMemo(() => computeStats(design, iterations), [design, iterations])
  const ctx = useMemo(() => ({ design, stats }), [design, stats])

  const reset = (keepDesign: boolean) => {
    const s = newSeed(); setSeed(s); rng.current = mulberry32(s)
    setIterations(0); setForced(false); setLaunch(null); setMission(null); setSite(null); setScore(null); setRover(null)
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
  const hasWater = site ? CRATER[site].h >= 1 : false
  const roverBonus = rover ? Math.round(rover.waterG / 5) + rover.wet * 10 : 0

  return (
    <div className="ma app">
      <button className="btn small ghost ma-exit" onClick={onExit}>← GMAT workspace</button>
      {phase !== 'title' && (
        <TopBar step={STEP_OF[phase]} steps={STEP_NAMES} right={<span className="hint">Budget left: {money(stats.budgetLeftM)} · seed {seed}</span>} />
      )}
      {phase === 'title' && <Title onStart={() => setPhase('intro')} />}
      {phase === 'intro' && <Dialogue lines={INTRO} startScene="void" onDone={() => setPhase('orbit')} />}
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
      {phase === 'launch' && launch && <Dialogue lines={launchLines(launch, forced)} startScene="launchpad" onDone={afterLaunch} />}
      {phase === 'mapping' && mission && (
        <Mapping ctx={ctx} mission={mission} setMission={setMission} rng={rng.current} onFinish={() => setPhase('site')} />
      )}
      {phase === 'site' && mission && <Site mission={mission} design={design} onPick={pickSite} />}
      {phase === 'ending' && mission && site && (
        <Dialogue lines={endingLines(site, (mission.quality[site]?.hydrogen ?? 0) >= 0.4)} startScene="crater" onDone={() => setPhase(hasWater ? 'rover' : 'report')} />
      )}
      {phase === 'rover' && site && (
        <Rover3D crater={CRATER[site]} quality={mission ? mission.quality[site]?.hydrogen ?? 0 : 0.6} seed={seed}
          onDone={(r) => { setRover(r); setPhase(score ? 'report' : 'title') }} />
      )}
      {phase === 'report' && score && (
        <Report ending={ending} mission={mission} score={{ ...score, total: score.total + roverBonus }} siteId={site}
          onRetry={() => reset(true)} onNew={() => reset(false)}
          extra={<div className="actions">
            {rover && <span className="hint">Rover: {rover.samples} samples, {rover.wet} with ice, {rover.waterG} g of water (best {rover.bestPct}%) · +{roverBonus} pts · seed {rover.seed}</span>}
            <button className="btn small ghost" onClick={() => inspect(design.orbitId)}>Inspect Selene's orbit in GMAT ↗</button>
          </div>} />
      )}
    </div>
  )
}
