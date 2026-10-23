// TICKER's day, read from the data — the pure half of app/pages/ticker.vue (audit #42 item 42).
// Every function here takes plain arrays and a date and returns a figure: the page's composable
// (app/composables/useTickerDay.ts) wraps them in computeds, the plain-node tests run them on
// fixtures, and nothing here knows about Vue, the DOM or the pet's memory. What the pet SAYS
// about these figures is tickerVoice.ts.
import { diffDays, monthDay, shiftDays, trailingDays } from './dates.ts'
import { isLoggedDay } from './journalLog.ts'
import { PROTOCOL_RULES, tallySchedule } from './protocolRules.ts'
import type { ProtocolRule } from './protocolRules.ts'
import { RECOVERY_RED_MAX, isPeakRecovery } from './recovery.ts'
import { sodaOunces } from './soda.ts'
import { MANE_TIERS, TIER_DAYS } from './tickerWardrobe.ts'
import type { Milestone } from './tickerWardrobe.ts'
import type { TickerPose, TickerProp } from './tickerSprite.ts'
import type { CanInput } from './tickerBreakout.ts'
import type { DayInput } from './tickerWorld.ts'
import type { PlannedDrawStatus } from './plannedDraws.ts'
import type { HealthMetricsEntry, JournalEntry, WorkoutEntry } from '../types/journal.ts'
import type { TickerGame, TickerRecord } from '../types/ticker.ts'

/** The slices of the stored rows the pet reads. */
export type DayWorkout = Pick<WorkoutEntry, 'date' | 'duration_min' | 'workout_type' | 'avg_hr'>
export type DayHealth = Pick<HealthMetricsEntry, 'date' | 'recovery_score' | 'sleep_total_min'>
export interface DayVial { compound: string, status: string, opened_date?: string | null }
export interface DayDraw { date: string, sources: string[], markers: Record<string, unknown> }

// --- the clock on the wall ----------------------------------------------------------------------
// The HOME timezone's hours: it is one pet in one place, so a friend visiting from another
// timezone finds it awake or asleep by its own evening, not theirs.

export const DUSK_HOUR = 19
export const BEDTIME_HOUR = 22
export const WAKE_HOUR = 6

export type Sky = 'day' | 'golden' | 'night'

/** The hour of an "HH:MM" clock reading; null before the clock has ticked. */
export function hourOf(now: string | null): number | null {
  return now == null ? null : Number(now.slice(0, 2))
}

export function isNight(hour: number | null): boolean {
  return hour != null && (hour >= DUSK_HOUR || hour < WAKE_HOUR)
}

export function isAsleep(hour: number | null): boolean {
  return hour != null && (hour >= BEDTIME_HOUR || hour < WAKE_HOUR)
}

/** What the window shows: the sun by day, amber around dawn and dusk, the moon and stars at night. */
export function skyFor(hour: number | null): Sky {
  if (hour == null) return 'day'
  if (isNight(hour)) return 'night'
  return hour < 8 || hour >= 17 ? 'golden' : 'day'
}

/** The clock under the window, 12-hour: "3:14 pm". */
export function clockLabel(now: string | null): string {
  const hour = hourOf(now)
  if (now == null || hour == null) return ''
  const h12 = hour % 12 || 12
  return `${h12}:${now.slice(3, 5)} ${hour < 12 ? 'am' : 'pm'}`
}

// --- today, as the pet experiences it ---------------------------------------------------------

export function entryOn(entries: JournalEntry[], date: string): JournalEntry | null {
  return entries.find(e => e.date === date) ?? null
}

/** Sodas over the trailing seven days, today included. */
export function sodasInWeek(entries: JournalEntry[], today: string): number {
  const from = shiftDays(today, -6)
  return entries
    .filter(e => e.date >= from && e.date <= today)
    .reduce((s, e) => s + (e.sodas?.length ?? 0), 0)
}

/**
 * The day whose plate FEED serves: today once a dose is logged, else yesterday if that had one.
 * Mornings start unlogged, and the demo persona's data always ends yesterday — a pet that can
 * never be fed is a sad showcase.
 */
export function mealDayOf(entries: JournalEntry[], today: string): string {
  if (entryOn(entries, today)?.peptides?.length) return today
  const yesterday = shiftDays(today, -1)
  return entryOn(entries, yesterday)?.peptides?.length ? yesterday : today
}

export function workoutsOn<T extends { date: string }>(workouts: T[], date: string): T[] {
  return workouts.filter(w => w.date === date)
}

export function minutesOn(workouts: DayWorkout[], date: string): number {
  return Math.round(workoutsOn(workouts, date).reduce((s, w) => s + (w.duration_min ?? 0), 0))
}

/** The day WALK replays: today with a workout, else yesterday (the same fallback as the plate). */
export function walkDayOf(workouts: DayWorkout[], today: string): string {
  return minutesOn(workouts, today) > 0 ? today : shiftDays(today, -1)
}

/** A day's average HR, weighted by duration — the beat TICKER walks at. Null when no workout carried one. */
export function workoutHrOf(workouts: DayWorkout[]): number | null {
  const withHr = workouts.filter(w => w.avg_hr != null)
  const weight = (w: DayWorkout) => w.duration_min || 1
  const total = withHr.reduce((s, w) => s + weight(w), 0)
  return total ? Math.round(withHr.reduce((s, w) => s + w.avg_hr! * weight(w), 0) / total) : null
}

// What it carries on the walk, by the day's longest workout's type. Apple and Whoop between
// them emit a couple of dozen type strings, so these are families, like the workouts page's.
export const WALK_PROPS: ReadonlyArray<{ match: RegExp, prop: TickerProp }> = [
  { match: /strength|weightlift|functional|core|crossfit|hiit/i, prop: 'dumbbell' },
  { match: /cycling|spin|bike/i, prop: 'helmet' },
  { match: /disc/i, prop: 'disc' },
  { match: /walk|run|jog|hik|elliptical|stair|tread|row/i, prop: 'cap' }
]

/** The prop for a day's workouts: by the longest session's type, or none it knows. */
export function walkPropFor(workouts: DayWorkout[]): TickerProp | null {
  const main = best(workouts, w => w.duration_min, 'max')?.item ?? workouts[0]
  return WALK_PROPS.find(p => p.match.test(main?.workout_type ?? ''))?.prop ?? null
}

/** The newest non-empty value of a vitals column (entries in date order). */
export function latestVital(entries: JournalEntry[], key: 'weight_lbs' | 'hrv'): number | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const v = entries[i]?.[key]
    if (v != null) return v
  }
  return null
}

/** How old it turns today, when today is the anniversary of the first logged day; null otherwise. */
export function birthdayOf(firstDate: string | null, today: string): number | null {
  if (!firstDate || firstDate === today || firstDate.slice(5) !== today.slice(5)) return null
  return Number(today.slice(0, 4)) - Number(firstDate.slice(0, 4))
}

/** The active vial that has been open longest, and for how many days. */
export function oldestOpenVial(vials: DayVial[], today: string): { compound: string, days: number } | null {
  const open = vials.filter(v => v.status === 'active' && v.opened_date)
  if (!open.length) return null
  const v = open.reduce((a, b) => (a.opened_date! <= b.opened_date! ? a : b))
  return { compound: v.compound, days: diffDays(v.opened_date!, today) }
}

// --- fever: a resting heart rate well over its own two-week average ---------------------------
// The newest journal RHR against the mean of the readings in the fortnight before it, when there
// are enough of them to call an average and the reading is fresh (today or yesterday).

export const FEVER_BPM = 7
export const FEVER_WINDOW_DAYS = 14
export const FEVER_MIN_READINGS = 5

export interface Fever { rhr: number, baseline: number, over: number }

export function feverOf(entries: JournalEntry[], today: string): Fever | null {
  const withRhr = entries.filter(e => e.rhr != null)
  const latest = withRhr.at(-1)
  if (!latest || diffDays(latest.date, today) > 1) return null
  const from = shiftDays(latest.date, -FEVER_WINDOW_DAYS)
  const prior = withRhr.filter(e => e.date >= from && e.date < latest.date).map(e => e.rhr!)
  if (prior.length < FEVER_MIN_READINGS) return null
  const baseline = Math.round(prior.reduce((s, v) => s + v, 0) / prior.length)
  const over = latest.rhr! - baseline
  return over >= FEVER_BPM ? { rhr: latest.rhr!, baseline, over } : null
}

// --- hunger: what the schedule says is due today, against what the journal says went down ----
// Due doses still unlogged once the stage goes dark make it hungry. Without rules (the demo
// persona's dose dates drift across weekdays by design) it is fed when anything is logged.

export type Hunger = 'fed' | 'waiting' | 'hungry' | 'rest'

export interface HungerInputs {
  rulesApply: boolean
  /** Rules due today. */
  due: number
  /** Due rules without a dose logged today. */
  missing: number
  /** Distinct compounds logged today. */
  logged: number
  /** Doses on the plate (the meal day's, which may be yesterday's). */
  doses: number
  night: boolean
}

export function hungerOf(i: HungerInputs): Hunger {
  if (!i.rulesApply) return i.doses ? 'fed' : 'waiting'
  if (!i.due) return i.logged ? 'fed' : 'rest'
  if (!i.missing) return 'fed'
  return i.night ? 'hungry' : 'waiting'
}

// --- housekeeping: unlogged days gather cobwebs -----------------------------------------------

/** Days of the last seven (yesterday back) with nothing hand-logged. */
export function unloggedInWeek(entries: JournalEntry[], today: string): number {
  const logged = new Set(entries.filter(isLoggedDay).map(e => e.date))
  let n = 0
  for (let i = 1; i <= 7; i++) if (!logged.has(shiftDays(today, -i))) n++
  return n
}

/** Cobwebs on the stage: one for a day or two, three for most of the week. */
export function cobwebsFor(unlogged: number): number {
  return unlogged >= 5 ? 3 : unlogged >= 3 ? 2 : unlogged >= 1 ? 1 : 0
}

// --- the record book --------------------------------------------------------------------------

export function best<T>(list: T[], value: (t: T) => number | null | undefined, pick: 'max' | 'min'): { item: T, value: number } | null {
  let out: { item: T, value: number } | null = null
  for (const item of list) {
    const v = value(item)
    if (v == null) continue
    if (!out || (pick === 'max' ? v > out.value : v < out.value)) out = { item, value: v }
  }
  return out
}

// --- discipline: a clean week of doses earns the gold star ----------------------------------

/** Which dates each compound was dosed on — what the schedule is scored against. */
export function doseDatesOf(entries: JournalEntry[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const e of entries) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      let set = out.get(p.compound)
      if (!set) out.set(p.compound, set = new Set())
      set.add(e.date)
    }
  }
  return out
}

export interface WeekTally {
  hit: number
  missed: Array<{ compound: string, date: string }>
}

/** The trailing seven days scored against the rules; today only counts once logged (tallySchedule's rule). */
export function weekTallyOf(rules: ProtocolRule[], doseDates: Map<string, Set<string>>, today: string): WeekTally {
  const tallies = tallySchedule(rules, shiftDays(today, -6), today, doseDates, today)
  const hit = tallies.reduce((s, t) => s + t.hit.length, 0)
  const missed = tallies.flatMap(t => t.missed.map(date => ({ compound: t.rule.compound, date })))
  return { hit, missed }
}

export function isCleanWeek(tally: WeekTally | null): boolean {
  return !!tally && tally.hit > 0 && tally.missed.length === 0
}

// --- mood: the held pose between interactions -------------------------------------------------
// One ladder, read twice: the pose the figure holds and the word the MOOD tile shows.

export interface MoodInputs {
  asleep: boolean
  fever: Fever | null
  drawStatus: PlannedDrawStatus | null
  hunger: Hunger
  sluggish: boolean
  sodasToday: number
  recovery: number | null
}

export function heldPoseOf(i: MoodInputs): TickerPose | null {
  if (i.asleep) return 'asleep'
  if (i.fever) return 'feverish'
  if (i.drawStatus === 'today') return 'nervous'
  if (i.hunger === 'hungry') return 'hungry'
  if (i.drawStatus === 'overdue') return 'impatient'
  if (i.sluggish) return null // the sluggish prop draws the coffee slump itself
  if (i.sodasToday >= 3) return 'worried'
  if (isPeakRecovery(i.recovery)) return 'happy'
  if (i.recovery != null && i.recovery < RECOVERY_RED_MAX) return 'worried'
  return null
}

export function moodWordOf(i: MoodInputs): string {
  if (i.asleep) return 'asleep'
  if (i.fever) return 'feverish'
  if (i.drawStatus === 'today') return 'nervous'
  if (i.hunger === 'hungry') return 'hungry'
  if (i.drawStatus === 'overdue') return 'impatient'
  if (i.sluggish) return 'sleepy'
  if (i.sodasToday >= 3) return 'queasy'
  if (isPeakRecovery(i.recovery)) return 'great'
  if (i.recovery != null && i.recovery < RECOVERY_RED_MAX) return 'rough'
  return 'steady'
}

// --- what the compounds leave on it ---------------------------------------------------------

// Anything the compound catalogue doesn't know defaults to a vial, so the pills it has never heard
// of (the iron protocol, a vitamin) are named here rather than jabbed.
export const ORAL_WORDS = /iron|ferr|vitamin|magnesium|zinc|omega|creatine|berberine|melatonin|caffeine|aspirin|nac\b|tablet|capsule|gummy/i

/** A jab or a swallow: the standing rule says, else the oral words, else the catalogue's form (`defaultForm`). */
export function isInjected(compound: string, defaultForm: (compound: string) => string): boolean {
  if (PROTOCOL_RULES.some(r => r.compound === compound && r.injected)) return true
  if (ORAL_WORDS.test(compound)) return false
  return defaultForm(compound) === 'vial'
}

/** The bowl shows what the plate held once it is fed: capsules, syringes, or one of each. */
export function bowlFor(hunger: Hunger, doses: Array<{ compound: string }>, injected: (compound: string) => boolean): TickerProp {
  if (hunger !== 'fed') return 'bowl-empty'
  const shots = doses.some(d => injected(d.compound))
  const pills = doses.some(d => !injected(d.compound))
  return shots && pills ? 'bowl-mixed' : shots ? 'bowl-shots' : 'bowl-full'
}

/** Poses whose face is the point: the shades come off for them and go back on after. */
export const BARE_EYED: ReadonlySet<TickerPose> = new Set<TickerPose>(['eating', 'gulp', 'jab1', 'jab2', 'mixing', 'petted', 'asleep'])

export interface AccessoryInputs {
  bowl: TickerProp
  /** The earned wearables. */
  worn: ReadonlySet<TickerProp>
  /** The walk prop while a walk with a workout behind it plays; null otherwise. */
  carried: TickerProp | null
  /** 0–3: the mane tier on show. */
  mane: number
  birthday: boolean
  /** The pose showing, for the shades rule. */
  pose: TickerPose | null
  cleanWeek: boolean
  bandaged: boolean
  draw: { status: PlannedDrawStatus, inDays: number } | null
}

/**
 * The props layer, in paint order. The bowl shows what has been served today; one thing on the
 * left lobe at a time (the party hat on its birthday, the cap on a walk, else the crown if
 * earned); the other walk props and the earned wearables — the shades except where the eyes
 * matter; the gold star for a clean week; and the vet visit's calendar from three days out, with
 * the lab coat on the day.
 */
export function accessoriesFor(i: AccessoryInputs): TickerProp[] {
  const out: TickerProp[] = [i.bowl]
  if (i.mane) out.push(MANE_TIERS[i.mane - 1]!.prop) // before the hats, so a hat sits on the hair
  if (i.birthday) out.push('party-hat')
  else if (i.carried === 'cap') out.push('cap')
  else if (i.worn.has('crown')) out.push('crown')
  if (i.carried && i.carried !== 'cap') out.push(i.carried)
  if (i.worn.has('sweatband')) out.push('sweatband')
  if (i.worn.has('shades') && !BARE_EYED.has(i.pose ?? 'idle')) out.push('shades')
  if (i.worn.has('medal')) out.push('medal')
  if (i.cleanWeek) out.push('gold-star')
  if (i.bandaged) out.push('bandage')
  const d = i.draw
  if (d && (d.status === 'today' || d.status === 'overdue' || d.inDays <= 3)) out.push('calendar')
  if (d?.status === 'today') out.push('lab-coat')
  return out
}

// --- the plate --------------------------------------------------------------------------------

export const unitLabel = (u: string) => (u === 'iu' ? 'IU' : u)

export function recipeOf(m: { vial_amount: number, vial_unit: string, bac_water_ml: number }): string {
  return `${m.vial_amount} ${unitLabel(m.vial_unit)} in ${m.bac_water_ml} mL`
}

/** "Compound dose unit#n" per dose — by label and running number rather than index, which holds when a dose is logged later in the day. */
export function doseKeysOf(doses: Array<{ compound: string, dose: number | string, unit: string }>): string[] {
  const seen = new Map<string, number>()
  return doses.map((d) => {
    const base = `${d.compound} ${d.dose} ${unitLabel(d.unit)}`
    const nth = (seen.get(base) ?? 0) + 1
    seen.set(base, nth)
    return `${base}#${nth}`
  })
}

// --- the can crusher's wall ----------------------------------------------------------------------
// One can per soda logged in the trailing month, in rows by week, each as sturdy as its size. A
// clean month is the good ending — nothing to shoot — and offers last month's wall for practice.

export const CRUSHER_WINDOW_DAYS = 30

export function wallFor(entries: JournalEntry[], endDay: string): { cans: CanInput[], oz: number, from: string } {
  const from = shiftDays(endDay, -(CRUSHER_WINDOW_DAYS - 1))
  const cans: CanInput[] = []
  let oz = 0
  for (const e of entries) {
    if (e.date < from || e.date > endDay) continue
    const week = Math.floor(diffDays(e.date, endDay) / 7)
    for (const s of e.sodas ?? []) {
      const v = sodaOunces(s.size)
      cans.push({ oz: v, week })
      oz += v ?? 0
    }
  }
  return { cans, oz: Math.round(oz), from }
}

export interface CrusherWall {
  cans: CanInput[]
  count: number
  /** "OCT 1 – OCT 30 · 5 CANS · 60 OZ" */
  title: string
  /** Last month's wall, because this one is clean. */
  practice: boolean
}

export function crusherWallOf(entries: JournalEntry[], today: string): CrusherWall {
  const thisMonth = wallFor(entries, today)
  const practice = thisMonth.cans.length === 0
  const end = practice ? shiftDays(today, -CRUSHER_WINDOW_DAYS) : today
  const wall = practice ? wallFor(entries, end) : thisMonth
  const count = wall.cans.length
  const title = `${monthDay(wall.from)} – ${monthDay(end)} · ${count} can${count === 1 ? '' : 's'}${wall.oz ? ` · ${wall.oz} oz` : ''}`.toUpperCase()
  return { cans: wall.cans, count, title, practice: practice && count > 0 }
}

/** The paddle is today's recovery: a rough night narrows it, a great one widens it. */
export function paddleScaleFor(recovery: number | null): number {
  return recovery == null ? 1 : Math.max(0.7, Math.min(1.2, 0.7 + (recovery / 100) * 0.5))
}

/** Everyone plays the same board on a day. */
export function daySeedOf(today: string): number {
  return Number(today.replace(/-/g, ''))
}

// --- ticker world's month ---------------------------------------------------------------------
// The trailing thirty days as the level's days (tickerWorld.ts): logged or not, the doses and
// the sodas, the workout minutes, the recovery, a draw on file. The castle is today.

export const WORLD_DAYS = 30
/** The running kinds (the cap family plus the bike): their platform slides. */
export const CARDIO = /walk|run|jog|hik|elliptical|stair|tread|row|cycling|spin|bike|swim/i

export interface WorldInputs {
  entries: JournalEntry[]
  health: DayHealth[]
  workouts: DayWorkout[]
  draws: DayDraw[]
  rules: ProtocolRule[]
  rulesApply: boolean
  doseDates: Map<string, Set<string>>
  today: string
}

export function worldDaysOf(i: WorldInputs): DayInput[] {
  const byDate = new Map(i.entries.map(e => [e.date, e]))
  const recoveryOn = new Map(i.health.map(h => [h.date, h.recovery_score ?? null]))
  const sleepOn = new Map(i.health.map(h => [h.date, h.sleep_total_min ?? null]))
  const first = shiftDays(i.today, -(WORLD_DAYS - 1))
  // A draw's block says its lab and how many markers it read.
  const drawLabels = new Map(i.draws.map(d => [d.date, `${d.sources.length ? d.sources.join(' · ') : 'draw'} · ${Object.keys(d.markers).length} markers`]))
  // A gold-star day: every dose the schedule called for, logged, and none missed.
  const tallies = i.rulesApply ? tallySchedule(i.rules, first, i.today, i.doseDates, i.today) : []
  const hitDates = new Set(tallies.flatMap(t => t.hit))
  const missedDates = new Set(tallies.flatMap(t => t.missed))
  return trailingDays(i.today, WORLD_DAYS).map((date) => {
    const e = byDate.get(date)
    const workoutMin = minutesOn(i.workouts, date)
    return {
      date,
      logged: !!e && isLoggedDay(e),
      doses: e?.peptides?.length ?? 0,
      sodas: (e?.sodas ?? []).map(s => ({ oz: sodaOunces(s.size) })),
      workoutMin,
      cardio: workoutsOn(i.workouts, date).some(w => CARDIO.test(w.workout_type ?? '')),
      recovery: recoveryOn.get(date) ?? null,
      sleepMin: sleepOn.get(date) ?? null,
      draw: drawLabels.has(date),
      drawLabel: drawLabels.get(date) ?? null,
      goldStar: hitDates.has(date) && !missedDates.has(date) && workoutMin > 0
    }
  })
}

// --- achievements -------------------------------------------------------------------------------
// The four wearables are the rewards on four of these; the rest are just achievements. All are
// derived, so none can be lost; the page's memory holds the day each was first noticed.

export interface Achievement {
  id: string
  name: string
  desc: string
  icon: string
  goal: number
  progress: number
  unit: string
  reward?: TickerProp
}

export const WEARABLE_META: Partial<Record<TickerProp, { id: string, name: string, desc: string, icon: string }>> = {
  crown: { id: 'crown', name: 'Hundred Days', desc: 'a hundred logged days in a row — the crown', icon: 'i-lucide-crown' },
  sweatband: { id: 'sweatband', name: 'Hundred Hours', desc: 'six thousand workout minutes — the sweatband', icon: 'i-lucide-dumbbell' },
  shades: { id: 'shades', name: 'A Year Together', desc: 'a year since the first logged day — the shades', icon: 'i-lucide-glasses' },
  medal: { id: 'medal', name: 'Two Fifty', desc: 'two hundred and fifty logged days — the medal', icon: 'i-lucide-medal' }
}

// Achievements the demo persona can never earn, so they are not shown to it (audit #42 item 29):
// Clean Week needs schedule rules (the sandbox has none), Luscious ninety days of finasteride
// (not in the seed), Open House visits from friends (the sandbox gets none).
export const DEMO_UNREACHABLE: ReadonlySet<string> = new Set(['clean-week', 'luscious', 'open-house'])

export interface AchievementInputs {
  milestones: Milestone[]
  loggedDays: number
  cleanWeek: boolean
  finasterideStreak: number
  hiScores: Record<TickerGame, TickerRecord | null>
  /** Pats, all time. */
  pets: number
  /** Footprints on file. */
  visits: number
  draws: number
  scans: number
}

/** Every achievement there is, with its progress. */
export function achievementsOf(i: AchievementInputs): Achievement[] {
  const { runner, crusher, world } = i.hiScores
  const worldFeat = (feat: string) => (world?.feats?.includes(feat) ? 1 : 0)
  return [
    ...i.milestones.map(m => ({ ...WEARABLE_META[m.prop]!, goal: m.goal, progress: m.progress, unit: m.unit, reward: m.prop })),
    { id: 'grown', name: 'Hatched', desc: 'thirty logged days — it grew limbs', icon: 'i-lucide-egg', goal: TIER_DAYS.grown, progress: i.loggedDays, unit: 'logged days' },
    { id: 'elder', name: 'Elder', desc: 'five hundred logged days — the cane', icon: 'i-lucide-hourglass', goal: TIER_DAYS.elder, progress: i.loggedDays, unit: 'logged days' },
    { id: 'clean-week', name: 'Clean Week', desc: 'seven days with every due dose logged', icon: 'i-lucide-star', goal: 1, progress: i.cleanWeek ? 1 : 0, unit: 'clean week' },
    { id: 'luscious', name: 'Luscious', desc: 'ninety days of finasteride — the full mane', icon: 'i-lucide-sparkles', goal: 90, progress: i.finasterideStreak, unit: 'days of finasteride' },
    { id: 'runner-500', name: 'Runner', desc: 'five hundred points on the runner', icon: 'i-lucide-footprints', goal: 500, progress: runner?.score ?? 0, unit: 'points' },
    { id: 'runner-1000', name: 'Marathon', desc: 'a thousand points on the runner', icon: 'i-lucide-trophy', goal: 1000, progress: runner?.score ?? 0, unit: 'points' },
    { id: 'crusher-300', name: 'Can Crusher', desc: 'three hundred points on the can crusher', icon: 'i-lucide-cup-soda', goal: 300, progress: crusher?.score ?? 0, unit: 'points' },
    { id: 'clean-sweep', name: 'Clean Sweep', desc: 'every can on the wall, cleared', icon: 'i-lucide-check-check', goal: 1, progress: crusher?.cleared ? 1 : 0, unit: 'wall' },
    { id: 'made-it-home', name: 'Made It Home', desc: 'the whole month, left to right, to the castle', icon: 'i-lucide-castle', goal: 1, progress: world?.cleared ? 1 : 0, unit: 'month' },
    { id: 'clean-month', name: 'Clean Month', desc: 'every soda can in the month, crushed', icon: 'i-lucide-cup-soda', goal: 1, progress: worldFeat('clean-month'), unit: 'month' },
    { id: 'no-hit-week', name: 'No-Hit Week', desc: 'a whole week of the month without a scratch', icon: 'i-lucide-shield', goal: 1, progress: worldFeat('no-hit-week'), unit: 'week' },
    { id: 'chain-3', name: 'Chain of Three', desc: 'a kicked can that crushed three in a row', icon: 'i-lucide-link', goal: 1, progress: worldFeat('chain-3'), unit: 'chain' },
    { id: 'petted', name: 'Well Petted', desc: 'a hundred pats, all time', icon: 'i-lucide-hand-heart', goal: 100, progress: i.pets, unit: 'pets' },
    { id: 'open-house', name: 'Open House', desc: 'five visits from friends', icon: 'i-lucide-door-open', goal: 5, progress: i.visits, unit: 'visits' },
    { id: 'pincushion', name: 'Pincushion', desc: 'ten blood draws on file', icon: 'i-lucide-test-tube', goal: 10, progress: i.draws, unit: 'draws' },
    { id: 'before-after', name: 'Before and After', desc: 'two DEXA scans to compare', icon: 'i-lucide-scan', goal: 2, progress: i.scans, unit: 'scans' }
  ]
}

/** The list a pet shows: everything, less what the demo persona can never reach. */
export function reachableAchievements(all: Achievement[], demo: boolean): Achievement[] {
  return demo ? all.filter(a => !DEMO_UNREACHABLE.has(a.id)) : all
}
