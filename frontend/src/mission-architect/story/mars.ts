import { say, cap, sfx, tele, bg, title, type Line } from '../data/chars'
import { CRATER } from '../data/catalog'
import { ROCKS, type RockKind } from '../data/samples'
import { BEST_SITE, siteTier, type EndingId } from '../engine/mission'
import type { EndingInfo } from './scripts'

/**
 * Historia de Marte (Episodio 2): misma estructura que la Luna (orbitador → sitio → rover), otra pregunta.
 * En la Luna se busca hielo en la sombra; aquí, rocas que estuvieron en agua y que podrían guardar rastros de vida.
 * Los hechos son reales (Viking, Mars Express, MRO, Curiosity, Perseverance, Opportunity); los números son de juego.
 */

export const MARS_INTRO: Line[] = [
  bg('void'),
  title('MISSION ARCHITECT', 'Episode 2 · Stones of Mars'),
  bg('space'),
  cap('1976. The Viking orbiters photograph Mars and find something nobody expected: dry riverbeds, deltas, flood channels.'),
  cap('Water once ran on Mars. Then the planet lost its air, and the rivers stopped.'),
  bg('moonOrbit'),
  sfx('2006'),
  cap('From orbit, spectrometers on Mars Express and MRO map clays and salts. Minerals that only form in water.'),
  tele('[CRISM] PHYLLOSILICATES DETECTED. JEZERO DELTA. GALE CRATER.'),
  cap('2013. Curiosity drills its first rock in Gale, "John Klein". Inside: clay from a calm lake you could have drunk.'),
  cap('2024. Perseverance finds "Cheyava Falls" in Jezero: a red rock with tiny leopard spots. On Earth, microbes leave spots like these.'),
  bg('boardroom'),
  say('elena', 'Mars was habitable. That part is settled. The question now is harder: did anything actually live there?', 'neutral'),
  say('elena', 'Welcome back, architects. Same office, new planet.'),
  say('dev', 'Systems, reporting in. Mars is further, colder, and dustier. I already love it.', 'excited'),
  say('amara', 'Science. On the Moon we looked for ice. Here we look for stones: the right rock can keep a fingerprint of life for billions of years.', 'excited'),
  say('houston', 'Comms. The signal takes up to twenty minutes each way. Nothing on Mars waits for us.'),
  say('elena', 'Phase one: an orbiter named Ares maps the old lakes and rivers and picks the best place to land.'),
  say('elena', 'Phase two: our rover Buscador drills cores from those rocks and seals the best ones in tubes.'),
  say('dev', 'And the weather?', 'worried'),
  say('amara', 'Dust storms. In 2018 one swallowed the whole planet and killed Opportunity. The rover must finish before the sky goes dark.', 'worried'),
  say('elena', 'Five candidate sites. Jezero, Gale, Gusev, Elysium Planitia and Hellas. Real places where real rovers worked.'),
  say('elena', 'Same rules as before: every choice costs you somewhere else. First question: which orbit?', 'excited'),
]

export const MARS_ACT1_INTRO: Line[] = [
  bg('moonOrbit'),
  title('ACT I', 'Mapping the old lakes · 4 cycles'),
  say('amara', 'Five sites, four cycles. Clays, sulfates and carbonates are what we are after: minerals made in water.'),
  say('dev', 'Each cycle: cards drop, you respond, you point the instruments. Watch the battery in the eclipses.'),
  say('houston', 'And a cycle only counts if the data gets home through the DSN. Mars is far, so the pipe is thin.'),
  tele('[ARES] INSTRUMENTS ONLINE. WAITING FOR TARGETS.'),
]

export const MARS_ECLIPSE_EVENT: Line[] = [
  bg('control'),
  cap('Cycle 3. Eclipse season, and the dust is rising.'),
  say('dev', 'Ares spends longer in the shadow of Mars now. Less sunlight for the panels.', 'worried'),
  say('amara', 'Down on the surface a regional dust storm is building. That is the clock our rover will race.', 'worried'),
  say('dev', 'You can switch the instruments off in eclipse. You lose some quality, but the battery thanks you.'),
]

export const MARS_SPECIAL_EVENT: Line[] = [
  bg('control'),
  cap('Cycle 4. A warm spot in the night.'),
  say('amara', 'Look at Jezero on the night pass. The delta front cools much slower than the plains around it.', 'excited'),
  say('houston', 'Dust cools fast. Solid rock holds heat. That is bare bedrock, not sand.'),
  say('amara', 'If we point the thermal imager at Jezero this cycle, we will know exactly where the outcrops are.', 'excited'),
]

export function marsSiteTalk(mapped: string[], minerals: Record<string, boolean>): Line[] {
  const L: Line[] = [
    bg('lab'),
    title('ACT II', 'Where do we land the rover?'),
    say('elena', 'Mapping is over. Pick the landing site for phase two. Buscador runs on solar panels, so it must finish before the dust storm.'),
  ]
  const knowsJezero = !!minerals.jezero
  L.push(say('amara', knowsJezero ? 'Jezero shows the strongest water minerals we measured. A delta is where a river dropped its mud.' : 'We never measured Jezero properly. Perseverance went there for a reason, though.', knowsJezero ? 'excited' : 'neutral'))
  L.push(say('dev', 'Boulders and cliffs kill landers. Gale has a flat floor. Hellas is a long, rocky way down.', 'worried'))
  L.push(say('houston', 'Elysium is the safest spot on Mars. InSight picked it because it is boring. Boring does not find life.'))
  if (mapped.length < 3) L.push(say('elena', `You only mapped ${mapped.length} site${mapped.length === 1 ? '' : 's'}. Choosing the rest means betting on a "?".`))
  L.push(say('elena', 'It is your call.'))
  return L
}

export const MARS_ENDINGS: Partial<Record<EndingId, Partial<EndingInfo>>> = {
  lost: { blurb: 'Ares missed Mars. Like Mars Climate Orbiter in 1999, a small error is enough. Check the cause line.' },
  lead: { blurb: 'You found the best rocks to drill. Phase two has a real chance of sealing a core that answers the big question.' },
  bold: { blurb: 'Good rocks, but not the best on the map, or a dangerous landing. Phase two will have to earn its cores.' },
  poor: { blurb: 'The rover would land safely and drill very little. The next mission will pay for this pick.' },
}

export function marsEndingLines(siteId: string, mapped: boolean): Line[] {
  const c = CRATER[siteId]
  const tier = siteTier(siteId)
  const L: Line[] = [bg('crater'), title('THE VERDICT', c.name)]
  L.push(cap(mapped ? `You chose ${c.name} with data in hand.` : `You chose ${c.name} without mapping it. Pure instinct.`))
  L.push(tele(`[TRUTH] ${c.name.toUpperCase()}: HYDRATED MINERALS ${c.h} · TERRAIN ${c.terrain.toUpperCase()} · ${c.tempC} °C`))
  if (tier === 'lead') {
    L.push(sfx('JACKPOT', 'good'))
    L.push(say('amara', 'That is the one. Mud, salts and carbonates, all laid down in water, and a floor we can drive on.', 'excited'))
    L.push(say('elena', 'Perseverance proved it is worth it. Now we go and drill our own.', 'excited'))
  } else if (tier === 'bold') {
    L.push(sfx('HIGH RISK', 'neutral'))
    L.push(say('amara', `There are real water rocks here, but ${CRATER[BEST_SITE]?.name ?? 'another site'} was the better target.`, 'worried'))
    L.push(say('dev', 'The landing will be tense. Nothing we cannot plan for.', 'worried'))
  } else {
    L.push(sfx('DRY RUN', 'bad'))
    L.push(say('amara', 'It is safe. It is also mostly lava and dust.', 'worried'))
    L.push(say('elena', 'Safe is not the same as right. Look at the report and see what the map was telling you.', 'neutral'))
  }
  L.push(say('dev', 'Rover checks complete. Buscador is ready for the sky crane.', 'neutral'))
  return L
}

/** Epílogo de Marte (en lugar del final de Selene): qué pasa con los núcleos y con Ares. */
export function marsEpilogue(r: { cores: { kind: RockKind }[]; ending: string } | null, landed: boolean): Line[] {
  const L: Line[] = [bg('control'), title('EPILOGUE', 'What the stones said')]
  if (!landed) {
    L.push(say('houston', 'Buscador is gone. The sky crane came down too hard.', 'angry'))
    L.push(say('elena', 'Ares is still up there. Its maps will guide the next lander. That is not nothing.', 'neutral'))
    L.push(say('dev', 'Ares stays on as a relay. Every rover after us will talk to Earth through it.', 'neutral'))
    return L
  }
  const cores = r?.cores ?? []
  const best = cores.map((c) => ROCKS[c.kind]).sort((a, b) => b.bio - a.bio || b.value - a.value)[0]
  if (!cores.length) {
    L.push(say('amara', 'Not a single core made it home. The storm won this time.', 'worried'))
  } else {
    L.push(tele(`[DSN] ${cores.length} CORE${cores.length === 1 ? '' : 'S'} RECEIVED. BEST: ${best.name.toUpperCase()}.`))
    if (best.bio >= 3) {
      L.push(sfx('POTENTIAL BIOSIGNATURE', 'good'))
      L.push(say('amara', 'Leopard spots, like Cheyava Falls. It is not proof of life. It is the best reason we have ever had to bring a rock home.', 'excited'))
    } else if (best.bio >= 2) {
      L.push(sfx('HABITABLE', 'good'))
      L.push(say('amara', `${best.name}. Rock that sat in water for a long time. If anything lived on Mars, this is where it would leave a trace.`, 'excited'))
    } else {
      L.push(say('amara', `${best.name}. Real Mars science, but not the rock that answers the big question.`, 'neutral'))
    }
  }
  if (r?.ending === 'dead') L.push(say('houston', 'Buscador did not wake up after the storm. Opportunity did not either, in 2018.', 'worried'))
  L.push(say('elena', cores.length ? 'The sealed tubes wait on the surface, like Perseverance\'s, until a sample-return mission carries them home. Then the lab takes over.' : 'No tubes were sealed. There is nothing for the lab this time.', 'neutral'))
  L.push(say('dev', 'And Ares stays in orbit as the relay for whoever comes next.', 'excited'))
  return L
}

export const MARS_REAL = [
  ['Viking 1 and 2 (1976)', 'the orbiters saw old riverbeds and deltas from above, the same job as your Ares.'],
  ['MRO and CRISM (2006–)', 'mapped clays and sulfates from orbit, which is how Jezero and Gale were picked.'],
  ['Curiosity (2012–)', 'drilled "John Klein" in Gale and showed the crater once held a drinkable lake.'],
  ['Perseverance (2021–)', 'cored "Cheyava Falls" in Jezero, called a potential biosignature in 2025.'],
  ['Opportunity (2004–2018)', 'lasted 14 years until a planet-wide dust storm covered its solar panels.'],
]
