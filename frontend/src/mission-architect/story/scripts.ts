import { say, cap, sfx, tele, bg, title, type Line } from '../data/chars'
import { CARD } from '../data/cards'
import { CRATER, ORBIT } from '../data/catalog'
import type { ReviewItem } from '../engine/design'
import type { CycleReport, EndingId, LaunchOutcome } from '../engine/mission'
import { BEST_SITE, siteTier } from '../engine/mission'
import { LAYER_LABEL } from '../engine/observe'
import { pct } from '../engine/rng'

// ---------- Prólogo y briefing ----------

export const INTRO: Line[] = [
  bg('void'),
  title('MISSION ARCHITECT', 'Episode 1 · Water on the Moon'),
  bg('space'),
  cap('1998. A small NASA spacecraft called Lunar Prospector listens for neutrons above the Moon.'),
  cap('Near the poles it hears something odd: hydrogen. A lot of it, hiding in craters that never see sunlight.'),
  bg('moonOrbit'),
  sfx('2009'),
  cap('LCROSS slams a spent rocket stage into a crater named Cabeus. A plume of dust and vapor rises.'),
  tele('[LCROSS] PLUME DETECTED. SPECTRA INDICATE WATER.'),
  cap('Water. On the Moon. Frozen in the dark for billions of years.'),
  bg('boardroom'),
  say('elena', 'Sixteen years of data. Dozens of maps. And not one machine has ever touched that ice.', 'neutral'),
  say('elena', 'I am Dr. Elena Ríos. Welcome to the project office. You are the new mission architects.'),
  say('dev', 'Systems engineering, reporting in. I keep the spacecraft alive.', 'excited'),
  say('amara', 'Dr. Osei, science lead. I want to know where the water is. Not guess. Know.'),
  say('houston', 'Comms. Call me Houston. If it does not get home, it did not happen.'),
  say('elena', 'Here is the plan. Phase one: an orbiter named Selene maps the south pole and finds the best place to land.'),
  say('elena', 'Phase two, later: a rover drills into the dark and confirms the ice. Phase one decides whether phase two ever exists.'),
  say('dev', 'Budget?', 'worried'),
  say('elena', 'Two hundred sixty million dollars. And the review panel will not sign off on a design that spends all of it.'),
  say('amara', 'Five candidate craters. Shackleton, Cabeus, Haworth, de Gerlache, Faustini. We map what we can, then we pick one.'),
  say('elena', 'Every choice you make will cost you somewhere else. That is not a bug. That is the job.', 'excited'),
  say('elena', 'First question: which orbit?'),
]

export const ORBIT_TALK: Line[] = [
  bg('lab'),
  say('dev', 'The orbit sets the whole spacecraft. Fuel, power, how sharp the maps are.'),
  say('houston', 'It also sets how long Selene hides behind the Moon, away from Earth and away from the Sun.'),
  say('amara', 'I would take the low orbit for the resolution. Everything is sharper close to the ground.'),
  say('dev', 'Close to the ground means the orbit decays. Low needs the big tank. High needs less, but the maps blur.', 'worried'),
  say('elena', 'Pick one. You can change your mind at design review, but it will cost you.'),
]

export const HANGAR_TALK: Line[] = [
  bg('hangar'),
  say('dev', 'This is the hangar. Every part has mass, power, cost, and a risk.'),
  say('amara', 'The neutron spectrometer is non-negotiable. It is the whole reason we are going.', 'excited'),
  say('houston', 'And pick an antenna you can live with. Data you cannot send home is just weight.'),
  tele('[DEV] TIP: LOOK AT "SHIP\'S DECK". CHEAP CHOICES BECOME TROUBLE CARDS.'),
]

// ---------- Revisión de diseño (generada) ----------

export function reviewLines(items: ReviewItem[], passed: boolean, iterations: number): Line[] {
  const L: Line[] = [
    bg('review'),
    title('DESIGN REVIEW', 'CML 4 · Point Design'),
    cap('Three reviewers. One checklist. No favors.'),
  ]
  for (const it of items) {
    L.push(say(it.reviewer, it.say, it.pass ? 'neutral' : 'worried'))
    L.push(tele(`[CHECK] ${it.label.toUpperCase()}: ${it.pass ? 'PASS' : 'FAIL'}`))
  }
  if (passed) {
    L.push(say('brooks', 'All criteria met. Approved. Go build it.', 'excited'))
    L.push(sfx('APPROVED', 'good'))
  } else {
    L.push(say('brooks', 'Not yet. This design is rejected.', 'angry'))
    L.push(say('brooks', iterations < 2
      ? 'Going back to the trade space is not failure. At JPL, iteration is part of the process.'
      : 'You have iterated twice already. You can still force the launch, but we will note it.', 'neutral'))
    L.push(sfx('REJECTED', 'bad'))
  }
  return L
}

// ---------- Lanzamiento (generado) ----------

export function launchLines(o: LaunchOutcome, forced: boolean): Line[] {
  const L: Line[] = [bg('launchpad'), title('LAUNCH', 'Selene is on the pad')]
  if (forced) L.push(say('dev', 'We are launching without approval. If anything goes wrong, this is on record.', 'worried'))
  L.push(say('elena', 'Go / No-Go poll. Systems?'))
  L.push(say('dev', 'Go.', 'worried'))
  L.push(say('amara', 'Science, go.'))
  L.push(say('houston', 'Comms, go.'))
  L.push(tele('T-MINUS 10... 9... 8... 7... 6... 5... 4... 3... 2... 1...'))
  for (const e of o.events) {
    if (e.kind === 'info') {
      L.push(tele(`[${e.label.toUpperCase()}] ${e.text}`))
      if (e.text.includes('cannot lift')) { L.push(sfx('NO LIFT-OFF', 'bad')); L.push(...lossEpilogue('launch_failure')); return L }
      continue
    }
    const tag = `[${e.label.toUpperCase()}] P ${pct(e.p ?? 0)} · ROLL ${Math.round((e.roll ?? 0) * 100)} → ${(e.result ?? '').toUpperCase()}`
    L.push(tele(tag))
    if (e.label === 'Launch') {
      L.push(e.result === 'success' ? sfx('LIFT-OFF!', 'good') : sfx('BOOM', 'bad'))
      if (e.result !== 'success') { L.push(...lossEpilogue('launch_failure')); return L }
      L.push(bg('space'))
      L.push(cap('Stage separation. Trans-lunar injection. Five days to the Moon.'))
    } else if (e.label === 'Solar array deployment') {
      L.push(bg('space'))
      if (e.result === 'success') L.push(say('dev', 'Arrays are open and locked. Power nominal.', 'excited'))
      else if (e.result === 'partial') L.push(say('dev', 'One wing opened halfway. We are running on less power than planned.', 'worried'))
      else L.push(say('dev', 'The arrays are stuck. We are on battery. That clock is ticking.', 'angry'))
    } else if (e.label === 'Lunar orbit insertion') {
      L.push(bg('moonOrbit'))
      L.push(cap('The most nervous minutes of the cruise. The engine fires on the far side, out of contact.'))
      if (e.result === 'success') {
        L.push(sfx('ORBIT ACHIEVED', 'good'))
        L.push(say('houston', 'Acquisition of signal. Selene is in lunar orbit. Perfect burn.', 'excited'))
      } else if (e.result === 'partial') {
        L.push(sfx('PARTIAL BURN', 'neutral'))
        L.push(say('houston', 'Signal is back. We are in orbit, but higher than planned. Maps will be softer.', 'worried'))
      } else {
        L.push(sfx('NO SIGNAL', 'bad'))
        L.push(say('houston', 'Silence. Selene should be back by now...', 'worried'))
        L.push(...lossEpilogue('lost'))
        return L
      }
    }
  }
  return L
}

function lossEpilogue(id: 'launch_failure' | 'lost'): Line[] {
  return id === 'launch_failure'
    ? [say('elena', 'The mission ended before it started. Mass margin is not optional.', 'angry')]
    : [
        bg('control'),
        say('elena', 'Selene flew past the Moon. She is in solar orbit now. She will never come back.', 'angry'),
        say('dev', 'The propulsion system needed more reliability behind it.', 'worried'),
      ]
}

// ---------- Acto I ----------

export const ACT1_INTRO: Line[] = [
  bg('moonOrbit'),
  title('ACT I', 'Mapping the south pole · 4 cycles'),
  say('amara', 'Five craters, four cycles. We cannot see them all sharply, so choose carefully.'),
  say('dev', 'Each cycle: cards drop, you respond, you point the instruments. Do not run out of battery.'),
  say('houston', 'And remember, a cycle of data only counts if I get it down through the DSN.'),
  tele('[SELENE] INSTRUMENTS ONLINE. WAITING FOR TARGETS.'),
]

export const ECLIPSE_EVENT: Line[] = [
  bg('control'),
  cap('Cycle 3. Eclipse season.'),
  say('dev', 'Long eclipses start now. Selene will spend more time behind the Moon, away from the Sun.', 'worried'),
  say('dev', 'You can switch the instruments off in eclipse. You will lose some quality, but the battery thanks you.'),
]

export const COLD_SPOT_EVENT: Line[] = [
  bg('control'),
  cap('Cycle 4. A strange reading.'),
  say('amara', 'Wait. Is anyone else seeing this? Something at Cabeus is colder than anything on the map.', 'excited'),
  say('houston', 'Cold enough for ice to last forever.'),
  say('amara', 'If we point at Cabeus this cycle, a thermal radiometer will see it. Maybe the best lead we will get.', 'excited'),
]

export function debrief(r: CycleReport, hasCards: boolean): { who: 'dev' | 'amara' | 'houston'; text: string; mood?: 'neutral' | 'worried' | 'excited' | 'angry' }[] {
  const out: { who: 'dev' | 'amara' | 'houston'; text: string; mood?: 'neutral' | 'worried' | 'excited' | 'angry' }[] = []
  if (r.calibrated) {
    out.push({ who: 'amara', text: 'Calibration done. No data this cycle, but every map from here on will be sharper.', mood: 'neutral' })
  } else if (r.safeMode) {
    out.push({ who: 'dev', text: r.lowBattery ? 'Battery hit the floor. Selene went to safe mode and we got no science.' : 'Selene is in safe mode. No science this cycle.', mood: 'worried' })
  } else if (r.revealed.length) {
    const top = r.revealed.find((x) => x.layer === 'hydrogen') ?? r.revealed[0]
    out.push({ who: 'amara', text: `${top.crater}: ${LAYER_LABEL[top.layer].toLowerCase()} ${top.known === 'exact' ? 'measured cleanly' : 'only roughly measured'}. ${r.revealed.length} new layer${r.revealed.length > 1 ? 's' : ''} total.`, mood: 'excited' })
  } else {
    out.push({ who: 'amara', text: 'We pointed the instruments but learned nothing new. The quality was too low.', mood: 'worried' })
  }
  if (r.lostGb > 0.01) out.push({ who: 'houston', text: `We lost ${r.lostGb.toFixed(1)} Gb. The recorder could not hold it.`, mood: 'angry' })
  else if (r.generatedGb > 0) out.push({ who: 'houston', text: `${r.downlinkedGb.toFixed(1)} Gb made it home through the DSN.`, mood: r.downlinkedGb < r.generatedGb ? 'worried' : 'neutral' })
  if (r.exploded.length) out.push({ who: 'dev', text: `We ran out of time on: ${r.exploded.join(', ')}. That is permanent now.`, mood: 'angry' })
  else if (!hasCards && !r.safeMode) out.push({ who: 'dev', text: 'Quiet cycle. I like quiet cycles.', mood: 'excited' })
  return out
}

// ---------- Acto II: elegir sitio ----------

export function siteTalk(mapped: string[], hasHydrogen: Record<string, boolean>): Line[] {
  const L: Line[] = [
    bg('lab'),
    title('ACT II', 'Where do we land the rover?'),
    say('elena', 'Mapping is over. Pick the landing site for phase two. The rover will need the sunlit rim of the crater to recharge.'),
  ]
  const knowsCabeus = !!hasHydrogen.cabeus
  L.push(say('amara', knowsCabeus ? 'Cabeus has the strongest hydrogen signal we measured.' : 'We never measured Cabeus properly. LCROSS flew there for a reason, though.', knowsCabeus ? 'excited' : 'neutral'))
  L.push(say('dev', 'Steep walls and boulders kill landers. Hydrogen is no use if we crash first.', 'worried'))
  L.push(say('houston', 'And a shallow crater is easier to relay from orbit. Keep that in mind.'))
  if (mapped.length < 3) L.push(say('elena', `You only mapped ${mapped.length} crater${mapped.length === 1 ? '' : 's'}. Choosing the rest means betting on a "?".`))
  L.push(say('elena', 'It is your call.'))
  return L
}

// ---------- Finales ----------

export interface EndingInfo { id: EndingId; icon: string; name: string; blurb: string }

export const ENDINGS: Record<EndingId, EndingInfo> = {
  launch_failure: { id: 'launch_failure', icon: '💥', name: 'Launch failure', blurb: 'The mission ended before it started. The mass margin is not optional.' },
  lost: { id: 'lost', icon: '❌', name: 'Mission lost', blurb: 'Selene missed the Moon. Physics does not forgive. Check the cause line.' },
  lead: { id: 'lead', icon: '🎯', name: 'Strong lead', blurb: 'You found the best place to look. Phase two now has a real chance of touching lunar ice.' },
  bold: { id: 'bold', icon: '⚠️', name: 'Bold bet', blurb: 'A solid lead, but the terrain or the hydrogen is not the best on the map. Phase two will earn its data.' },
  poor: { id: 'poor', icon: '🌑', name: 'Safe but poor', blurb: 'The rover would land safely and find very little. The next mission will pay for this pick.' },
}

export function endingLines(siteId: string, mapped: boolean): Line[] {
  const c = CRATER[siteId]
  const tier = siteTier(siteId)
  const L: Line[] = [bg('crater'), title('THE VERDICT', `${c.name} crater`)]
  L.push(cap(mapped ? `You chose ${c.name} with data in hand.` : `You chose ${c.name} without mapping it. Pure instinct.`))
  L.push(tele(`[TRUTH] ${c.name.toUpperCase()}: HYDROGEN ${c.h} WT% · TERRAIN ${c.terrain.toUpperCase()} · ${c.tempC} °C`))
  if (tier === 'lead') {
    L.push(sfx('JACKPOT', 'good'))
    L.push(say('amara', 'That is the one. The hydrogen is rich and the floor is smooth enough to reach it.', 'excited'))
    L.push(say('elena', 'LCROSS saw water here from a distance. Now we will put a drill on it.', 'excited'))
  } else if (tier === 'bold') {
    L.push(sfx('HIGH RISK', 'neutral'))
    L.push(say('amara', `There is real hydrogen here, but ${BEST_SITE === 'cabeus' ? 'Cabeus' : 'another crater'} was the better target.`, 'worried'))
    L.push(say('dev', 'The landing will be tense. Nothing we cannot plan for.', 'worried'))
  } else {
    L.push(sfx('DRY RUN', 'bad'))
    L.push(say('amara', 'It is safe. It is also nearly empty.', 'worried'))
    L.push(say('elena', 'Safe is not the same as right. Look at the report and see what the map was telling you.', 'neutral'))
  }
  L.push(say('elena', 'Phase two will need a rover, a drill, and a relay radio. That is a story for the next episode.', 'neutral'))
  return L
}

export function failureEnding(id: 'launch_failure' | 'lost'): Line[] {
  return [bg('control'), title(ENDINGS[id].name.toUpperCase(), ENDINGS[id].blurb)]
}

export const cardName = (id: string) => CARD[id]?.name ?? id
export const orbitName = (id: string) => ORBIT[id]?.name ?? id
