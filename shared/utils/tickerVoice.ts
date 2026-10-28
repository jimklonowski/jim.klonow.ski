// What TICKER says — every line the /ticker page can utter, as pure functions of the figures
// (audit #42 item 42). The page decides WHEN a thing is said and which pose or one-shot goes
// with it; this module decides the words, so a line can be tested without a browser and the
// pet's whole vocabulary reads in one place. The figures themselves are tickerDay.ts.
import { diffDays, monthDay } from './dates.ts'
import { formatDuration } from './duration.ts'
import { cycleProgress } from './cycles.ts'
import type { Cycle } from './cycles.ts'
import { longestLoggedStreak } from './journalLog.ts'
import { countdownLabel, drawLabel } from './plannedDraws.ts'
import type { PlannedDraw, PlannedDrawState } from './plannedDraws.ts'
import { isPeakRecovery, recoveryZone } from './recovery.ts'
import { LEAN_GAIN_LBS, MANE_TIERS, TIER_DAYS } from './tickerWardrobe.ts'
import type { Milestone } from './tickerWardrobe.ts'
import { WAKE_HOUR, best, recipeOf, unitLabel } from './tickerDay.ts'
import type { Achievement, CrusherWall, DayHealth, DayWorkout, DropGerms, Fever, Hunger, InvadersWave, MazeGhosts, WeekTally } from './tickerDay.ts'
import type { TickerBelly, TickerPose, TickerTier } from './tickerSprite.ts'
import type { HitBy, WorldSummary } from './tickerWorld.ts'
import type { JournalEntry, ReconstitutionEntry } from '../types/journal.ts'
import type { TickerBest, TickerGame, TickerRecord, TickerVisitsSummary } from '../types/ticker.ts'

/** "Oct 3", with the year once it isn't this one — how the pet dates a record. */
export function dated(d: string, today: string): string {
  return `${monthDay(d)}${d.slice(0, 4) === today.slice(0, 4) ? '' : ` ${d.slice(0, 4)}`}`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// --- the record book --------------------------------------------------------------------------

export interface RecordInputs {
  entries: JournalEntry[]
  health: DayHealth[]
  workouts: DayWorkout[]
  streak: number
  hiScores: Record<TickerGame, TickerRecord | null>
  today: string
}

/** All-time bests, one sentence each, dated (with the year once it isn't this one). */
export function recordLines(i: RecordInputs): string[] {
  const when = (d: string) => dated(d, i.today)
  const lines: string[] = []
  const rec = best(i.health, h => h.recovery_score, 'max')
  if (rec) lines.push(`best recovery: ${rec.value}% on ${when(rec.item.date)}.`)
  const run = longestLoggedStreak(i.entries)
  if (run.days) lines.push(run.days === i.streak ? `longest streak: ${run.days} days — this one, still going.` : `longest streak: ${run.days} days, ending ${when(run.end!)}.`)
  const light = best(i.entries, e => e.weight_lbs, 'min')
  if (light) lines.push(`lightest: ${light.value} lb on ${when(light.item.date)}.`)
  const long = best(i.workouts, w => w.duration_min, 'max')
  if (long) lines.push(`longest workout: ${Math.round(long.value)} min${long.item.workout_type ? ` of ${long.item.workout_type}` : ''} on ${when(long.item.date)}.`)
  const nightBest = best(i.health, h => h.sleep_total_min, 'max')
  if (nightBest) lines.push(`best night: ${formatDuration(nightBest.value)} on ${when(nightBest.item.date)}.`)
  const calm = best(i.entries, e => e.rhr, 'min')
  if (calm) lines.push(`lowest resting HR: ${calm.value} bpm on ${when(calm.item.date)}.`)
  const { runner, crusher, world, maze, drop, invaders } = i.hiScores
  if (runner) lines.push(`best run: ${runner.score} points on ${when(runner.date)}.`)
  if (crusher) lines.push(`best crush: ${crusher.score} points on ${when(crusher.date)}${crusher.cleared ? ' — and a whole wall cleared, once.' : '.'}`)
  if (world) lines.push(`best month: ${world.score} points on ${when(world.date)}${world.cleared ? ' — and made it all the way home, once.' : '.'}`)
  if (maze) lines.push(`best maze: ${maze.score} points on ${when(maze.date)}${maze.cleared ? ' — and every capsule eaten, once.' : '.'}`)
  if (drop) lines.push(`best drop: ${drop.score} points on ${when(drop.date)}${drop.cleared ? ' — and a bottle scrubbed clean, once.' : '.'}`)
  if (invaders) lines.push(`best wave: ${invaders.score} points on ${when(invaders.date)}${invaders.cleared ? ' — and the sky cleared, once.' : '.'}`)
  return lines
}

// --- talk: one real number per press ----------------------------------------------------------
// Every line quotes a figure the page already holds; the list skips what the data lacks.

export interface QuoteInputs {
  weight: number | null
  recovery: number | null
  sleepMin: number | null
  fever: Fever | null
  rhr: number | null
  latestHrv: number | null
  latestDraw: { date: string } | null
  /** The newest draw's flag counts, when there is a draw. */
  flags: { high: number, low: number } | null
  nextDraw: PlannedDrawState | null
  rulesApply: boolean
  /** Rules due today / with a dose logged / without. */
  due: number
  eaten: number
  missing: number
  missingNames: string
  streak: number
  sodasThisWeek: number
  oldestOpen: { compound: string, days: number } | null
  mixes: ReconstitutionEntry[]
  mealIsYesterday: boolean
  finasterideStreak: number
  maneTier: number
  nextMane: { name: string, days: number } | null
  ageDays: number | null
  weekTally: WeekTally | null
  cycleClause: string
  tier: TickerTier
  loggedDays: number
  latestScan: { date: string, total: { body_fat_pct?: number } } | null
  belly: TickerBelly
  leanGain: number | null
  arms: 'lean' | 'built'
  earned: Milestone[]
  earnedCount: number
  achievementsTotal: number
  nextAchievement: { name: string, goal: number, progress: number, unit: string } | null
  keeper: boolean
  visits: TickerVisitsSummary | null
  visitorsBests: Partial<Record<TickerGame, TickerBest | null>>
  visitorLabel: string | null
  records: string[]
}

export function quoteLines(i: QuoteInputs): string[] {
  const r = i.recovery
  const draw = i.nextDraw
  const v = i.visits
  const lines: Array<string | null> = [
    i.weight != null ? `${i.weight} lb at the last weigh-in. it's holding that for you.` : null,
    r != null
      ? `recovery ${r}% — ${recoveryZone(r)}. ${recoveryZone(r) === 'green' ? 'go lift something.' : recoveryZone(r) === 'yellow' ? 'an ordinary day, then.' : 'it votes for a nap.'}`
      : null,
    i.sleepMin != null
      ? `${formatDuration(i.sleepMin)} of sleep last night.${i.sleepMin < 420 ? ' it felt that.' : ' it slept well too.'}`
      : null,
    i.fever
      ? `resting at ${i.fever.rhr} bpm — ${i.fever.over} over the two-week average of ${i.fever.baseline}. it's running hot.`
      : i.rhr != null ? `resting at ${i.rhr} bpm. that's the beat you're watching.` : null,
    i.latestHrv != null ? `hrv ${i.latestHrv} ms on the last reading.` : null,
    i.flags && i.latestDraw
      ? `${i.flags.high} high, ${i.flags.low} low on the ${monthDay(i.latestDraw.date)} draw.${i.flags.high + i.flags.low === 0 ? ' clean sheet.' : ''}`
      : null,
    draw ? `${draw.status === 'overdue' ? 'the' : 'next'} draw ${countdownLabel(draw.inDays)} — ${drawLabel(draw.plan)}.` : null,
    i.rulesApply && i.due
      ? i.missing
        ? `${i.eaten} of ${i.due} due doses down. still waiting on ${i.missingNames}.`
        : `all ${i.due} due doses down today. it's full.`
      : null,
    `${plural(i.streak, 'day')} logged in a row. it's keeping count.`,
    i.sodasThisWeek
      ? `${plural(i.sodasThisWeek, 'soda')} this week. it noticed every one.`
      : 'no sodas this week. it\'s proud of you.',
    i.oldestOpen ? `the ${i.oldestOpen.compound} vial has been open ${i.oldestOpen.days} days.` : null,
    i.mixes.length
      ? `reconstituted ${i.mixes.map(m => `${m.compound} (${recipeOf(m)})`).join(', ')}${i.mealIsYesterday ? ' yesterday' : ' today'}. FEED mixes it again.`
      : null,
    i.finasterideStreak
      ? i.maneTier
        ? `the mane: ${MANE_TIERS[i.maneTier - 1]!.name} — ${i.finasterideStreak} days of finasteride${i.nextMane ? `; ${i.nextMane.name} at ${i.nextMane.days}` : '. it combs it.'}`
        : `finasteride, day ${i.finasterideStreak}. the mane shows at ${MANE_TIERS[0]!.days}.`
      : null,
    i.ageDays != null ? `${i.ageDays.toLocaleString('en-US')} days since the first logged day. it remembers all of them.` : null,
    i.weekTally
      ? i.weekTally.missed.length
        ? `${i.weekTally.hit} of ${i.weekTally.hit + i.weekTally.missed.length} due doses this week — missed ${i.weekTally.missed.map(m => `${m.compound} ${new Date(`${m.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}`).join(', ')}${i.cycleClause}.`
        : i.weekTally.hit
          ? `${i.weekTally.hit} of ${i.weekTally.hit} due doses this week. a clean week — hence the star${i.cycleClause}.`
          : null
      : null,
    i.tier === 'elder'
      ? `${i.loggedDays.toLocaleString('en-US')} logged days — an elder now. it earned the cane.`
      : i.tier === 'grown'
        ? `${i.loggedDays} logged days — grown. an elder at ${TIER_DAYS.elder}; ${TIER_DAYS.elder - i.loggedDays} to go.`
        : `${i.loggedDays} logged days — still a hatchling. it grows limbs at ${TIER_DAYS.grown}.`,
    i.latestScan?.total.body_fat_pct != null
      ? `body fat ${i.latestScan.total.body_fat_pct}% on the ${monthDay(i.latestScan.date)} scan — ${i.belly === 'soft' ? 'a bit of belly, it admits' : i.belly === 'cut' ? 'cut. look at that' : 'lean'}.`
      : null,
    i.leanGain != null
      ? `lean mass ${i.leanGain >= 0 ? '+' : ''}${i.leanGain} lb since the first scan — ${i.arms === 'built' ? 'the arms show it' : `the arms fill in at +${LEAN_GAIN_LBS}`}.`
      : null,
    i.earned.length
      ? `wearing ${i.earned.map(m => m.name.replace(/^the /, '')).join(', ')} — earned at ${i.earned.map(m => `${m.goal.toLocaleString('en-US')} ${m.unit}`).join(', ')}.`
      : null,
    `achievements: ${i.earnedCount} of ${i.achievementsTotal}.${i.nextAchievement ? ` next: ${i.nextAchievement.name} — ${(i.nextAchievement.goal - i.nextAchievement.progress).toLocaleString('en-US')} ${i.nextAchievement.unit} to go.` : ' every one. there is nothing left to earn, only to keep.'}`,
    i.keeper && v?.total
      ? `visitors: ${plural(v.total, 'footprint')}${v.recent[0] ? ` — last ${v.recent[0].label ?? `a ${v.recent[0].role}`} on ${monthDay(v.recent[0].date)}` : ''}.`
      : null,
    // A guest is handed a holder's name only when it is their own; anyone else is "a friend".
    ...(['runner', 'crusher', 'world', 'maze', 'drop', 'invaders'] as TickerGame[]).map((g) => {
      const b = i.visitorsBests[g]
      const noun = g === 'runner' ? 'run' : g === 'crusher' ? 'crush' : g === 'world' ? 'month' : g === 'maze' ? 'maze' : g === 'drop' ? 'drop' : 'wave'
      return b ? `visitors' best ${noun}: ${!i.keeper && b.label ? 'you' : b.label ?? 'a friend'}, ${b.score} points.` : null
    }),
    !i.keeper ? `you're on file as ${i.visitorLabel ?? 'a friend'}. it's keeping a footprint.` : null,
    ...i.records.map(r => `for the record — ${r}`)
  ]
  return lines.filter((l): l is string => !!l)
}

// --- arrival ----------------------------------------------------------------------------------

export interface ArrivalInputs {
  today: string
  asleep: boolean
  birthday: number | null
  firstDate: string | null
  fever: Fever | null
  awayDays: number
  hunger: Hunger
  missing: number
  missingNames: string
  sluggish: boolean
  sleepMin: number | null
  nextDraw: PlannedDrawState | null
  recovery: number | null
  streak: number
  unloggedThisWeek: number
  oldestOpen: { compound: string, days: number } | null
  weight: number | null
  ageDays: number | null
  records: string[]
}

/** The greeting, read from the figures: the most notable thing first, an everyday line otherwise. */
export function arrivalLine(i: ArrivalInputs): string {
  if (i.asleep) return `(asleep — it's late. up at ${WAKE_HOUR})`
  if (i.birthday) {
    const hatched = `${monthDay(i.firstDate!)} ${i.firstDate!.slice(0, 4)}`
    return `happy birthday — TICKER turns ${i.birthday} today. (first logged day: ${hatched})`
  }
  if (i.fever) return `rhr ${i.fever.rhr} — ${i.fever.over} over its two-week average. it's running hot; go easy today`
  if (i.awayDays >= 7) return `it's been ${i.awayDays} days. it stopped counting at a week. (it didn't.)`
  if (i.awayDays >= 3) return `it's been ${i.awayDays} days. it sat down on day one and waited.`
  if (i.hunger === 'hungry') return `past dinner and ${i.missingNames} ${i.missing === 1 ? 'isn\'t' : 'aren\'t'} logged — TICKER is hungry`
  if (i.sluggish) {
    const slept = i.sleepMin != null ? `${formatDuration(i.sleepMin)} last night` : 'short night'
    return `(needs coffee — ${slept})`
  }
  const draw = i.nextDraw
  if (draw?.status === 'today') return 'draw day. TICKER is nervous on your behalf.'
  if (draw?.status === 'overdue') return `the ${draw.plan.lab ?? 'planned'} draw was ${countdownLabel(draw.inDays)} and nothing's on file — it keeps checking`
  if (draw && draw.inDays <= 3) return `draw ${countdownLabel(draw.inDays)}${draw.plan.fasting ? ' — fasting, remember' : ''}`
  const r = i.recovery
  if (isPeakRecovery(r)) return `recovery's at ${r}% — TICKER is thriving`
  if (r != null && recoveryZone(r) === 'red') return `recovery ${r}% — TICKER is taking it easy today`
  if (i.streak > 0 && i.streak % 50 === 0) return `${i.streak} days logged in a row. it counted.`
  if (i.unloggedThisWeek >= 3) return `${i.unloggedThisWeek} of the last 7 days unlogged — it's getting dusty in here`
  if (i.oldestOpen && i.oldestOpen.days >= 28) return `the ${i.oldestOpen.compound} vial has been open ${i.oldestOpen.days} days — it checked the date`
  // A quiet day: rotate by the date so tomorrow's greeting is still a different one.
  const everyday = [
    'TICKER looks up expectantly.',
    `${plural(i.streak, 'day')} in a row — it's keeping count.`,
    i.weight != null ? `borrowed your ${i.weight} lb again this morning.` : 'TICKER looks up expectantly.',
    i.ageDays != null ? `day ${i.ageDays.toLocaleString('en-US')} together.` : 'TICKER looks up expectantly.',
    ...i.records.map(r => `it remembers: ${r}`)
  ]
  return everyday[Number(i.today.slice(-2)) % everyday.length]!
}

/** A friend's hello — TICKER is Jim's; be gentle. */
export function helloLine(name: string | null): string {
  return `a friend${name ? ` — ${name}` : ''}! TICKER waves. (it's Jim's; be gentle.)`
}

// --- what changed since its last look ---------------------------------------------------------
// A snapshot of the figures TICKER saw last visit, kept in its memory. On arrival the difference
// is its news — a broken streak, a new scan, a cycle under way, a draw booked, workouts, weight,
// days logged — at most three items, in that order of how much they matter.

export interface Snapshot {
  v: 1
  date: string
  streak: number
  loggedDays: number
  weight: number | null
  workouts: number
  scanDate: string | null
  arms: 'lean' | 'built'
  plannedIds: number[]
  activeCycleId: number | null
}

export interface News { line: string, pose?: TickerPose, event?: 'celebrate' | 'thump' }

export interface NewsInputs {
  today: string
  streak: number
  /** Scans in date order; the newest is the last. */
  scans: Array<{ date: string, total: { body_fat_pct?: number, lean_mass_lbs?: number } }>
  arms: 'lean' | 'built'
  activeCycle: Cycle | null
  planned: PlannedDraw[]
  workouts: DayWorkout[]
  weight: number | null
  loggedDays: number
}

export function newsSince(snap: Snapshot, i: NewsInputs): News[] {
  const news: News[] = []
  const broke = snap.streak >= 3 && i.streak < snap.streak
  if (broke) {
    news.push({ line: `the ${snap.streak}-day streak broke while it wasn't looking. ${i.streak} now — it'll count again.`, pose: 'worried' })
  }
  const scan = i.scans.at(-1)
  if (scan && scan.date !== snap.scanDate) {
    // Every scan figure is optional (an older report format can leave one out): compare what both scans carry.
    const prev = i.scans.at(-2)
    const bf = scan.total.body_fat_pct
    const prevBf = prev?.total.body_fat_pct
    const lean = scan.total.lean_mass_lbs
    const prevLean = prev?.total.lean_mass_lbs
    const parts = [`new scan ${monthDay(scan.date)}: body fat ${bf ?? '—'}%${prevBf != null ? ` (${prevBf}% before)` : ''}`]
    if (lean != null && prevLean != null) {
      const d = Math.round((lean - prevLean) * 10) / 10
      parts.push(`lean ${d >= 0 ? '+' : ''}${d} lb`)
    }
    const better = !prev || (bf != null && prevBf != null && bf < prevBf) || (lean != null && prevLean != null && lean > prevLean)
    const armsNews = i.arms === 'built' && snap.arms !== 'built' ? ' …and the arms filled in.' : ''
    news.push({ line: `${parts.join(', ')}.${armsNews}`, event: better ? 'celebrate' : undefined, pose: better ? undefined : 'thinking' })
  }
  const cycle = i.activeCycle
  if (cycle && cycle.id !== snap.activeCycleId) {
    const p = cycleProgress(cycle, i.today)
    news.push({ line: `the ${cycle.name} cycle is under way — week ${p.week} of ${p.totalWeeks}.`, event: 'celebrate' })
  }
  const booked = i.planned
    .filter(p => !snap.plannedIds.includes(p.id) && p.date >= i.today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (booked) {
    news.push({ line: `a draw's been booked — ${drawLabel(booked)}, ${countdownLabel(diffDays(i.today, booked.date))}. it marked the calendar.`, pose: 'nervous' })
  }
  const newWorkouts = i.workouts.length - snap.workouts
  if (newWorkouts >= 1) {
    const minutes = Math.round(i.workouts.filter(w => w.date >= snap.date).reduce((s, w) => s + (w.duration_min ?? 0), 0))
    news.push({ line: `${plural(newWorkouts, 'workout')} since its last look${minutes ? ` — ${minutes} min` : ''}. WALK walks it off.`, pose: 'happy' })
  }
  if (snap.weight != null && i.weight != null) {
    const d = Math.round((i.weight - snap.weight) * 10) / 10
    if (Math.abs(d) >= 1.5) news.push({ line: `${d < 0 ? 'down' : 'up'} ${Math.abs(d)} lb since its last look — ${snap.weight} → ${i.weight}.`, pose: 'thinking' })
  }
  const newDays = i.loggedDays - snap.loggedDays
  if (!broke && newDays >= 2) {
    news.push({ line: `${newDays} days logged since its last look — ${i.streak} in a row now.`, event: newDays >= 5 ? 'celebrate' : undefined })
  }
  return news.slice(0, 3)
}

/** New footprints since the owner's last look: who came by and what they left. */
export function visitorsNews(visits: TickerVisitsSummary | null, seen: number): News | null {
  if (!visits) return null
  const fresh = visits.total - seen
  if (fresh <= 0) return null
  const latest = visits.recent.slice(0, fresh)
  const who = [...new Set(latest.map(r => r.label ?? `a ${r.role}`))].join(', ')
  const petted = latest.reduce((s, r) => s + r.pets, 0)
  return {
    line: `${plural(fresh, 'visit')} since its last look — ${who}.${petted ? ` ${plural(petted, 'pet')} given.` : ''} it waved.`,
    event: 'celebrate'
  }
}

// --- the one-shots' lines ---------------------------------------------------------------------

export const SQUEAKS = ['♥!', 'squeak!', 'hehe — ok', 'that\'s the spot', 'ok, that\'s plenty', '…there IS a digest to write, you know', '(happy wiggle)']

/** What a pat gets: the nth squeak of the day, or a stir when it is asleep. */
export function squeakFor(petsToday: number, asleep: boolean): string {
  return asleep ? '(it stirs, smiles… and goes back to sleep)' : SQUEAKS[Math.min(petsToday - 1, SQUEAKS.length - 1)]!
}

/** The soda reaction's line, by today's count. */
export function flinchLine(n: number): string {
  return n >= 3
    ? `${n === 3 ? 'three' : n} sodas. it remembers.`
    : n === 2 ? 'two sodas. it winced.' : 'one soda. it noticed.'
}

export function resultsLandedLine(drawDate: string, flags: number): string {
  const when = monthDay(drawDate)
  return flags
    ? `results are in from the ${when} draw — ${plural(flags, 'flag')}. it read the report twice.`
    : `results are in from the ${when} draw — a clean sheet. ♥`
}

export function saluteLine(hit: number, cycleClause: string): string {
  return `clean week — ${hit} of ${hit} due doses logged${cycleClause}. (salute)`
}

/** Newly completed achievements, and the wearables they put on. */
export function achievementLine(fresh: Achievement[], rewards: string[]): string {
  return `achievement${fresh.length === 1 ? '' : 's'}: ${fresh.map(a => a.name).join(', ')}${rewards.length ? ` — it put on the ${rewards.join(' and the ')}` : ''}. ♥`
}

export const SAT_DOWN_LINE = '(TICKER sat down to wait.)'

// --- the plate --------------------------------------------------------------------------------

export const FEED_QUIPS: ReadonlyArray<{ match: RegExp, jab?: string, swallow?: string }> = [
  { match: /testosterone/i, jab: 'oil — it took a second to push.' },
  { match: /hgh|growth/i, jab: 'the small one. barely a pinch.' },
  { match: /hcg/i, jab: 'quick one. it didn\'t look.' },
  { match: /bpc/i, jab: 'right where it was sore.' },
  { match: /finasteride/i, swallow: 'the little one. for the mane, someday.' },
  { match: /tadalafil|cialis/i, swallow: 'the little yellow one. for the pipes.' }
]

export function doseLabel(d: { compound: string, dose: number | string, unit: string }): string {
  return `${d.compound} ${d.dose} ${unitLabel(d.unit)}`
}

export function doseStartLine(label: string, injected: boolean, note: string): string {
  return injected ? `${label} — jab…${note}` : `${label} — down the hatch…${note}`
}

/** After the jab or the swallow: a word for the compounds it knows, a stock one otherwise (`again` once something was fed this visit). */
export function doseDoneLine(label: string, compound: string, injected: boolean, again: boolean): string {
  const quip = FEED_QUIPS.find(q => q.match.test(compound))
  return injected
    ? `${label} — in. ${quip?.jab ?? (again ? 'still didn\'t flinch.' : 'didn\'t flinch.')}`
    : `${label} — swallowed. ${quip?.swallow ?? 'with water, like a grown-up.'}`
}

export function mixStartLine(m: ReconstitutionEntry, note: string): string {
  return `reconstituting ${m.compound} — ${recipeOf(m)}…${note}`
}

export function mixDoneLine(m: ReconstitutionEntry): string {
  return `${m.compound} mixed: ${recipeOf(m)}. swirled, didn't shake.`
}

/** What a compound does to it once it's in: a beat of theatre per family, nothing for the rest. */
export type AfterEffect = 'flex' | 'stretch' | 'proud' | 'bandage' | 'glow' | 'mane' | 'pump'

export function afterEffectOf(compound: string): { kind: AfterEffect, line: string } | null {
  if (/testosterone/i.test(compound)) return { kind: 'flex', line: 'testosterone. (flex)' }
  if (/tadalafil|cialis/i.test(compound)) return { kind: 'pump', line: 'tadalafil. every vessel wide open — full flow. (it stood a little taller.)' }
  if (/hgh|growth/i.test(compound)) return { kind: 'stretch', line: 'growth hormone. it felt taller for a second.' }
  if (/hcg/i.test(compound)) return { kind: 'proud', line: 'hCG. the heart beats a little prouder.' }
  if (/bpc/i.test(compound)) return { kind: 'bandage', line: 'BPC-157 — bandage on, right where it was sore.' }
  if (/ghk/i.test(compound)) return { kind: 'glow', line: 'GHK-Cu. skin glow. (the sparkles are not a metaphor.)' }
  if (/finasteride/i.test(compound)) return { kind: 'mane', line: '' }
  return null
}

/** The mane as it stands: "the mane: stubble. 9 days of finasteride — mane at 30." */
export function maneStandingLine(tier: number, days: number, next: { name: string, days: number } | null): string {
  return tier ? `the mane: ${MANE_TIERS[tier - 1]!.name}. ${days} days of finasteride${next ? ` — ${next.name} at ${next.days}` : ''}.` : ''
}

/** No mane yet: the streak broke since it last showed one, or it is simply early days. */
export function maneGoneLine(shownBefore: boolean, days: number): string {
  return shownBefore
    ? `the mane's gone — the streak broke. ${days ? `day ${days} of the next one` : 'it starts again'}; stubble at ${MANE_TIERS[0]!.days}.`
    : `finasteride. ${days ? `day ${days} — ` : ''}the mane takes a week to show.`
}

export function maneThinnedLine(tier: number, days: number): string {
  return `the mane thinned to ${MANE_TIERS[tier - 1]!.name} — the streak broke. ${days} days on the new one.`
}

export interface PlateInputs {
  doses: number
  fed: number
  rulesApply: boolean
  missing: number
  missingNames: string
}

/** What to say once the plate is (or isn't) clear. */
export function plateLine(i: PlateInputs): string {
  const left = i.doses - i.fed
  if (left > 0) return `${left} more on the plate.`
  return i.rulesApply && i.missing
    ? `plate clear. still waiting on ${i.missingNames}.`
    : `all ${plural(i.doses, 'dose')} down. ♥`
}

// --- the walk ---------------------------------------------------------------------------------

export const NO_WORKOUT_LINE = 'no workout in the log today…'
export const SAT_BACK_LINE = '…TICKER sat back down. (it walks when you do)'

export function walkStartLine(minutes: number, hr: number | null, yesterday: boolean): string {
  return `walking off ${minutes} min of workouts${hr != null ? ` at ${hr} bpm` : ''}${yesterday ? ' (yesterday\'s)' : ''}…`
}

export function walkEndLine(minutes: number): string {
  return minutes >= 45 ? `${minutes} minutes — a proper outing. ♥` : `${minutes} minutes walked together.`
}

// --- the games ----------------------------------------------------------------------------------

export function playIntroLine(game: TickerGame, wall: CrusherWall, maze?: MazeGhosts, drop?: DropGerms, invaders?: InvadersWave): string {
  return game === 'runner'
    ? 'space or tap to run. esc quits.'
    : game === 'world'
      ? 'the month, left to right — home is today. ← → run, space jumps (hold for height). esc quits.'
      : game === 'maze'
        ? `every capsule in the maze, ${maze?.title ?? 'vs the ghosts'}. arrows, wasd or a swipe steer; space or tap starts. esc quits.`
        : game === 'drop'
          ? `${drop?.title ?? 'germs in the bottle'}. ← → move, ↑ turns, ↓ drops; space or tap starts. esc quits.`
          : game === 'invaders'
            ? `${invaders?.title ?? 'the formation'}, in formation. ← → move, space fires — or a finger held; space or tap starts. esc quits.`
            : wall.count
              ? `${wall.count} cans on the wall${wall.practice ? ' (last month\'s — this one is clean)' : ''}. space or tap to launch; arrows or the pointer move. esc quits.`
              : 'nothing to shoot. good. (esc quits)'
}

export interface QuitInputs {
  game: TickerGame
  score: number
  /** The house record for the game, after this run. */
  best: TickerRecord | null
  /** The HI the HUD showed: the owner's record, or for a guest the house record whoever holds it. */
  house: number
  keeper: boolean
  /** This run set the caller's own record (the owner's, or a guest's own). */
  setRecord: boolean
  /** A guest's run topped the house record. */
  beatHouse: boolean
  /** The wall went / the month was finished, this game. */
  cleared: boolean
  /** The crusher had nothing to shoot. */
  wallEmpty: boolean
}

export interface QuitRemark {
  line: string
  event: 'celebrate' | 'bigbeat' | null
  /** Rain hearts with it. */
  hearts: boolean
}

/** The line a quit earns, and the one-shot that goes with it. */
export function quitRemark(i: QuitInputs): QuitRemark {
  const swept = i.cleared ? (i.game === 'crusher' ? 'wall cleared. ' : i.game === 'world' ? 'made it home. ' : i.game === 'maze' ? 'a maze eaten clean. ' : i.game === 'drop' ? 'bottle scrubbed. ' : i.game === 'invaders' ? 'sky cleared. ' : '') : ''
  // The keeper's record, or a guest topping the house: the celebration the HUD's NEW BEST promised.
  if (i.keeper ? i.setRecord : i.beatHouse) {
    return {
      line: i.keeper ? `${swept}new best: ${i.best?.score ?? i.score} points. ♥` : `${swept}new house record: ${i.score} points. ♥`,
      event: 'celebrate',
      hearts: true
    }
  }
  if (!i.keeper && i.setRecord) {
    // Their own best (the server's word), short of the house: a nod, not a party.
    return { line: `${swept}${i.score} points — your best yet. the house record is ${i.house}.`, event: 'bigbeat', hearts: false }
  }
  if (swept) return { line: `${swept}${i.score} points. ♥`, event: 'celebrate', hearts: false }
  if (i.score > 0 && i.keeper && i.best) {
    return { line: `${i.score} points. best ${i.best.score} on ${monthDay(i.best.date)} — it's still catching its breath.`, event: null, hearts: false }
  }
  if (i.score > 0 && i.house) return { line: `${i.score} points. the house record is ${i.house}.`, event: null, hearts: false }
  return { line: i.game === 'crusher' && i.wallEmpty ? 'nothing to shoot. good.' : 'next time.', event: null, hearts: false }
}

/** "sep 14 got me — two cans and the pit." from a world game's figures; "not a scratch." for a clean run home. */
export function gotLine(summary: WorldSummary): string {
  const worst = summary.worstDay
  if (!worst) return summary.cleared ? 'not a scratch.' : ''
  const word = (by: HitBy, n: number) => {
    const noun = by === 'can' || by === 'tall' ? 'can' : by === 'germ' ? 'germ' : by === 'needle' ? 'needle' : by === 'popper' ? 'question mark' : 'pit'
    const count = n === 1 ? (by === 'needle' || by === 'popper' || by === 'pit' ? 'the' : 'a') : n === 2 ? 'two' : n === 3 ? 'three' : `${n}`
    return `${count} ${noun}${n > 1 ? 's' : ''}`
  }
  const counts = new Map<HitBy, number>()
  for (const h of summary.hits) if (h.day === worst.day) counts.set(h.by, (counts.get(h.by) ?? 0) + 1)
  const parts = worst.by.map(by => word(by, counts.get(by) ?? 1))
  const causes = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  return `${monthDay(worst.date).toLowerCase()} got me — ${causes}.`
}

// --- the stats tiles --------------------------------------------------------------------------

export interface Stat { label: string, value: string, hint?: string, title?: string }

export function drawTile(d: PlannedDrawState | null): { value: string, hint: string } {
  if (!d) return { value: '—', hint: 'nothing booked' }
  const where = d.plan.lab ?? 'draw'
  if (d.status === 'today') return { value: 'today', hint: `${where} · ${d.plan.fasting ? 'fasting' : 'non-fasting'}` }
  if (d.status === 'overdue') return { value: `${-d.inDays}d late`, hint: `${where} · nothing on file` }
  return { value: `${d.inDays}d`, hint: `${where} · ${monthDay(d.plan.date)}` }
}

export interface FedTileInputs {
  rulesApply: boolean
  doses: number
  due: number
  logged: number
  missing: number
  eaten: number
  missingNames: string
  hunger: Hunger
}

/** The hunger meter as a tile: eaten over due, with the holdouts in the tooltip. */
export function fedTile(i: FedTileInputs): { value: string, hint: string, title?: string } {
  if (!i.rulesApply) return { value: i.doses ? 'fed' : '—', hint: `${i.doses} logged` }
  if (!i.due) return { value: i.logged ? 'fed' : 'rest day', hint: 'nothing due' }
  const n = i.missing
  return {
    value: `${i.eaten}/${i.due}`,
    hint: !n ? 'all down' : i.hunger === 'hungry' ? `hungry · ${n} to come` : `${n} to come`,
    title: n ? `still to log: ${i.missingNames}` : undefined
  }
}

export interface StatInputs {
  ageDays: number | null
  birthday: number | null
  firstDate: string | null
  weight: number | null
  streak: number
  fed: ReturnType<typeof fedTile>
  draw: ReturnType<typeof drawTile>
  moodWord: string
  fever: Fever | null
  recovery: number | null
  petsToday: number
  petsTotal: number
  visitorPets: number | null | undefined
}

// Hints are a few words — seven tiles leave ~100px each — with the longer wording as the tooltip.
export function statTiles(i: StatInputs): Stat[] {
  return [
    {
      label: 'AGE',
      value: i.ageDays != null ? `${i.ageDays.toLocaleString('en-US')}d` : '—',
      hint: i.birthday ? `turns ${i.birthday} ♥` : 'since day one',
      title: i.firstDate ? `days since the first logged day, ${monthDay(i.firstDate)} ${i.firstDate.slice(0, 4)}` : undefined
    },
    { label: 'WEIGHT', value: i.weight != null ? `${i.weight} lb` : '—', hint: 'borrowed', title: 'yours — it borrows the number' },
    { label: 'STREAK', value: `${i.streak}d`, hint: 'logged days' },
    { label: 'FED', ...i.fed },
    { label: 'NEXT DRAW', value: i.draw.value, hint: i.draw.hint },
    {
      label: 'MOOD',
      value: i.moodWord,
      hint: i.fever
        ? `rhr ${i.fever.rhr} vs ${i.fever.baseline}`
        : i.recovery != null ? `recovery ${i.recovery}%` : undefined,
      title: i.fever ? `resting HR ${i.fever.rhr} against a two-week average of ${i.fever.baseline}` : undefined
    },
    {
      label: 'PETS',
      value: String(i.petsToday),
      hint: `${i.petsTotal.toLocaleString('en-US')} all-time`,
      title: i.visitorPets ? `${i.visitorPets} of them from visitors` : undefined
    }
  ]
}

export interface SummaryInputs {
  doses: number
  rulesApply: boolean
  due: number
  missing: number
  eaten: number
  missingNames: string
  workoutMinutes: number
  sodasToday: number
}

/** "TICKER's day, read from the data: …" */
export function todaySummaryLine(i: SummaryInputs): string {
  const plate = i.doses ? `${plural(i.doses, 'dose')} to eat` : 'nothing served yet'
  const parts = [
    i.rulesApply && i.due
      ? i.missing
        ? `${i.eaten} of ${i.due} due doses down (${i.missingNames} to come)`
        : `all ${i.due} due doses down`
      : plate,
    i.workoutMinutes ? `${i.workoutMinutes} min walked` : 'no walk yet',
    i.sodasToday ? `${plural(i.sodasToday, 'soda')} (it noticed)` : 'no sodas (it approves)'
  ]
  return `${parts.join(', ')}.`
}
