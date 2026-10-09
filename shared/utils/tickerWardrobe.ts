// What TICKER wears and how it is built, read from the data: the four earned wearables, the
// finasteride mane, the tier by logged days, the arms and belly by DEXA. Shared by the /ticker
// page (where the achievements panel shows the same milestones with their progress) and the home
// dashboard's companion, so it is the same pet on both. Kept app-import-free (relative .ts
// imports, like cycles.ts) so the plain-node tests can run it.
import { doseStreak, isLoggedDay, longestLoggedStreak } from './journalLog.ts'
import type { LoggedDayFields } from './journalLog.ts'
import { diffDays } from './dates.ts'
import type { TickerBelly, TickerBuild, TickerProp, TickerTier } from './tickerSprite.ts'

export interface WardrobeEntry extends Omit<LoggedDayFields, 'peptides'> {
  date: string
  peptides?: Array<{ compound?: string | null }> | null
}
export interface WardrobeWorkout { duration_min?: number | null }
/** A DEXA scan's two figures the build reads; either can be missing from an older report format. */
export interface WardrobeScan { date: string, total: { body_fat_pct?: number, lean_mass_lbs?: number } }

export interface WardrobeInputs {
  /** Journal days, oldest first. */
  entries: WardrobeEntry[]
  workouts: WardrobeWorkout[]
  /** DEXA scans, any order. */
  scans: WardrobeScan[]
  today: string
}

// --- the figures ------------------------------------------------------------------------------

/** The first hand-logged day: the pet's hatch date. The watch's vitals go back further; that is its prehistory. */
export function firstLoggedDay(entries: WardrobeEntry[]): string | null {
  return entries.find(isLoggedDay)?.date ?? null
}

export function ageDays(entries: WardrobeEntry[], today: string): number | null {
  const first = firstLoggedDay(entries)
  return first ? diffDays(first, today) : null
}

export function loggedDayCount(entries: WardrobeEntry[]): number {
  return entries.filter(isLoggedDay).length
}

export function workoutMinutes(workouts: WardrobeWorkout[]): number {
  return Math.round(workouts.reduce((s, w) => s + (w.duration_min ?? 0), 0))
}

// --- the wearables: four milestones, each with a reward --------------------------------------

export interface Milestone {
  prop: TickerProp
  name: string
  goal: number
  progress: number
  unit: string
}

export function wearableMilestones(inputs: WardrobeInputs): Milestone[] {
  return [
    { prop: 'crown', name: 'the crown', goal: 100, progress: longestLoggedStreak(inputs.entries).days, unit: 'days logged in a row' },
    { prop: 'sweatband', name: 'the sweatband', goal: 6000, progress: workoutMinutes(inputs.workouts), unit: 'workout minutes' },
    { prop: 'shades', name: 'the shades', goal: 365, progress: ageDays(inputs.entries, inputs.today) ?? 0, unit: 'days old' },
    { prop: 'medal', name: 'the medal', goal: 250, progress: loggedDayCount(inputs.entries), unit: 'logged days' }
  ]
}

/** The wearables earned — derived, so never lost. */
export function earnedWearables(inputs: WardrobeInputs): TickerProp[] {
  return wearableMilestones(inputs).filter(m => m.progress >= m.goal).map(m => m.prop)
}

// --- the mane: by the finasteride streak -------------------------------------------------------

export const FINASTERIDE = 'Finasteride'

export const MANE_TIERS: ReadonlyArray<{ days: number, prop: TickerProp, name: string }> = [
  { days: 7, prop: 'mane-1', name: 'stubble' },
  { days: 30, prop: 'mane-2', name: 'a mane' },
  { days: 90, prop: 'mane-3', name: 'luscious' }
]

export function finasterideStreak(entries: WardrobeEntry[], today: string): number {
  return doseStreak(entries, FINASTERIDE, today)
}

/** 0–3: how many mane tiers the streak has reached. */
export function maneTier(entries: WardrobeEntry[], today: string): number {
  const days = finasterideStreak(entries, today)
  return MANE_TIERS.filter(t => days >= t.days).length
}

export function nextManeTier(entries: WardrobeEntry[], today: string) {
  const days = finasterideStreak(entries, today)
  return MANE_TIERS.find(t => days < t.days) ?? null
}

// --- the build: tier by logged days, arms and belly by DEXA -----------------------------------
// A hatchling (no limbs yet) until a month of logged days, grown after, an elder with a cane from
// five hundred. The arms fill in once lean mass is up five pounds on the first scan; the belly
// reads the latest body-fat figure — soft from twenty percent, cut under thirteen.

export const TIER_DAYS = { grown: 30, elder: 500 }
export const LEAN_GAIN_LBS = 5
export const SOFT_BF = 20
export const CUT_BF = 13

export function tierOf(entries: WardrobeEntry[]): TickerTier {
  const days = loggedDayCount(entries)
  return days >= TIER_DAYS.elder ? 'elder' : days >= TIER_DAYS.grown ? 'grown' : 'hatchling'
}

export function sortedScans<T extends WardrobeScan>(scans: T[]): T[] {
  return [...scans].sort((a, b) => a.date.localeCompare(b.date))
}

/** Lean mass on the latest scan against the first, to a tenth of a pound; null with fewer than two scans. */
export function leanGain(scans: WardrobeScan[]): number | null {
  const sorted = sortedScans(scans)
  const first = sorted[0]?.total.lean_mass_lbs
  const latest = sorted.at(-1)?.total.lean_mass_lbs
  return sorted.length >= 2 && first != null && latest != null ? Math.round((latest - first) * 10) / 10 : null
}

export function armsOf(scans: WardrobeScan[]): 'lean' | 'built' {
  const gain = leanGain(scans)
  return gain != null && gain >= LEAN_GAIN_LBS ? 'built' : 'lean'
}

export function bellyOf(scans: WardrobeScan[]): TickerBelly {
  const bf = sortedScans(scans).at(-1)?.total.body_fat_pct
  if (bf == null) return 'lean'
  return bf >= SOFT_BF ? 'soft' : bf < CUT_BF ? 'cut' : 'lean'
}

export function buildOf(inputs: WardrobeInputs): TickerBuild {
  return { tier: tierOf(inputs.entries), arms: armsOf(inputs.scans), belly: bellyOf(inputs.scans) }
}

// --- the whole outfit --------------------------------------------------------------------------

/**
 * The worn set in paint order — the mane before the crown so the crown sits on the hair, then
 * the wearables — and the build. The /ticker page layers its own day props (the bowl, a walk's
 * prop, the party hat, the gold star, the vet's calendar) around this.
 */
export function wardrobeOf(inputs: WardrobeInputs): { accessories: TickerProp[], build: TickerBuild } {
  const worn = new Set(earnedWearables(inputs))
  const accessories: TickerProp[] = []
  const mane = maneTier(inputs.entries, inputs.today)
  if (mane) accessories.push(MANE_TIERS[mane - 1]!.prop)
  if (worn.has('crown')) accessories.push('crown')
  for (const p of ['sweatband', 'shades', 'medal'] as const) if (worn.has(p)) accessories.push(p)
  return { accessories, build: buildOf(inputs) }
}

/**
 * The outfit for where anyone can see it: the /ticker Open Graph card is fetched with no session
 * (server/routes/ticker/og.png.get.ts). Only the four wearables and the tier, which are counts of
 * logging and exercise. The mane is a finasteride streak and the arms and belly are DEXA readings
 * — a medication and a body-composition bracket, both documented in this public repo — so those
 * stay behind the login with the rest of the log.
 */
export function publicWardrobeOf(inputs: WardrobeInputs): { accessories: TickerProp[], build: TickerBuild } {
  return { accessories: earnedWearables(inputs), build: { tier: tierOf(inputs.entries) } }
}
