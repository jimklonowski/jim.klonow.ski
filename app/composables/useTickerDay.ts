import { shiftDays } from '#shared/utils/dates'
import { loggedStreak } from '#shared/utils/journalLog'
import { isSluggish, latestRecovery, latestSleepMin } from '#shared/utils/petState'
import { nextPlannedDraw } from '#shared/utils/plannedDraws'
import type { PlannedDraw } from '#shared/utils/plannedDraws'
import { scheduledFor } from '#shared/utils/protocolRules'
import type { ProtocolRule } from '#shared/utils/protocolRules'
import { cycleProgress, cycleStatusOn, relevantCycle } from '#shared/utils/cycles'
import type { Cycle } from '#shared/utils/cycles'
import {
  birthdayOf, bowlFor, cobwebsFor, crusherWallOf, daySeedOf, doseDatesOf, doseKeysOf, entryOn, feverOf, hungerOf, isCleanWeek, isInjected,
  latestVital, mealDayOf, minutesOn as minutesOnDay, oldestOpenVial, paddleScaleFor, sodasInWeek, unloggedInWeek, walkDayOf, walkPropFor,
  weekTallyOf, workoutHrOf, workoutsOn as workoutsOnDay, worldDaysOf
} from '#shared/utils/tickerDay'
import type { DayDraw, DayVial } from '#shared/utils/tickerDay'
import {
  ageDays as ageDaysOf, buildOf, finasterideStreak as finasterideStreakOf, firstLoggedDay, leanGain as leanGainOf, loggedDayCount,
  maneTier as maneTierOf, nextManeTier, sortedScans, wearableMilestones
} from '#shared/utils/tickerWardrobe'
import type { WardrobeInputs, WardrobeScan } from '#shared/utils/tickerWardrobe'
import type { TickerBuild } from '#shared/utils/tickerSprite'
import type { HealthMetricsEntry, JournalEntry, WorkoutEntry } from '#shared/types/journal'

export interface TickerDaySources {
  entries: Ref<JournalEntry[]>
  health: Ref<HealthMetricsEntry[] | null | undefined>
  workouts: Ref<WorkoutEntry[] | null | undefined>
  labs: Ref<DayDraw[] | null | undefined>
  planned: Ref<PlannedDraw[] | null | undefined>
  cycles: Ref<Cycle[] | null | undefined>
  scans: Ref<WardrobeScan[] | null | undefined>
  /** Null for a role without a pantry to mention (the vial list is owner/demo only). */
  vials: Ref<DayVial[] | null | undefined> | null
  today: Ref<string>
  /** The standing schedule (useProtocol().rules): the protocol tables, or the code constants until seeded. */
  rules: Ref<ProtocolRule[]>
  /** The schedule applies. Not for the demo persona, whose dose dates drift across weekdays by design. */
  rulesApply: boolean
  /** The stage has gone dark (useTickerClock) — due doses still unlogged then make it hungry. */
  night: Ref<boolean>
}

/**
 * TICKER's day as computeds: the plate, the walk, the mood inputs, the schedule, the wardrobe,
 * the games' boards — every figure the /ticker page derives from the data, each a thin wrapper
 * over the pure functions in shared/utils/tickerDay.ts (and tickerWardrobe.ts, petState.ts). The
 * page keeps what depends on the memory and the actions.
 */
export function useTickerDay(s: TickerDaySources) {
  const { entries, today, rulesApply } = s
  const health = computed(() => s.health.value ?? [])
  const workouts = computed(() => s.workouts.value ?? [])

  // --- today, as the pet experiences it -------------------------------------------------------
  const todayEntry = computed(() => entryOn(entries.value, today.value))
  const sodasToday = computed(() => (todayEntry.value?.sodas ?? []).length)
  const sodasThisWeek = computed(() => sodasInWeek(entries.value, today.value))
  // Meals and walks fall back ONE day when today is still empty (tickerDay.ts mealDayOf / walkDayOf).
  const mealDay = computed(() => mealDayOf(entries.value, today.value))
  const mealIsYesterday = computed(() => mealDay.value !== today.value)
  const dosesToday = computed(() => entryOn(entries.value, mealDay.value)?.peptides ?? [])
  /** The vials reconstituted on the meal day — mixed before anything is eaten. */
  const mixesToday = computed(() => entryOn(entries.value, mealDay.value)?.reconstitutions ?? [])

  const workoutsOn = (date: string) => workoutsOnDay(workouts.value, date)
  const minutesOn = (date: string) => minutesOnDay(workouts.value, date)
  const walkDay = computed(() => walkDayOf(workouts.value, today.value))
  const walkIsYesterday = computed(() => walkDay.value !== today.value && minutesOn(walkDay.value) > 0)
  const workoutMinutes = computed(() => minutesOn(walkDay.value))
  /** The walk day's average HR, weighted by duration — the beat TICKER walks at. */
  const workoutHr = computed(() => workoutHrOf(workoutsOn(walkDay.value)))
  const walkProp = computed(() => walkPropFor(workoutsOn(walkDay.value)))

  // The pet's mood inputs come from the one shared read (shared/utils/petState.ts) so this page
  // and the home page agree: recovery = newest SCORED day, sluggish with the home page's hysteresis.
  const recovery = computed(() => latestRecovery(health.value))
  const sleepMin = computed(() => latestSleepMin(health.value))
  const sluggish = computed(() => isSluggish(health.value))

  const streak = computed(() => loggedStreak(entries.value, today.value))
  const weight = computed(() => latestVital(entries.value, 'weight_lbs'))
  const latestHrv = computed(() => latestVital(entries.value, 'hrv'))

  // The first hand-logged day is the pet's hatch date (tickerWardrobe.ts): the watch's vitals go
  // back years further, but that is its prehistory — it was born with the journal.
  const firstDate = computed(() => firstLoggedDay(entries.value))
  const ageDays = computed(() => ageDaysOf(entries.value, today.value))
  const birthday = computed(() => birthdayOf(firstDate.value, today.value))

  const drawDates = computed(() => (s.labs.value ?? []).map(d => d.date).sort())
  const nextDraw = computed(() => nextPlannedDraw(s.planned.value ?? [], drawDates.value, today.value))
  const oldestOpen = computed(() => oldestOpenVial(s.vials?.value ?? [], today.value))
  const fever = computed(() => feverOf(entries.value, today.value))

  // --- hunger: what the schedule says is due today, against what the journal says went down --
  // The standing rules merged with every cycle (effectiveRules), scored on today only — the
  // yesterday fallback above is for the FEED replay, not for whether it has eaten.
  const rules = computed(() => rulesApply ? effectiveRules(s.cycles.value ?? [], s.rules.value) : [])
  const dueToday = computed(() => scheduledFor(today.value, rules.value))
  const loggedCompounds = computed(() => new Set((todayEntry.value?.peptides ?? []).map(p => p.compound)))
  const eaten = computed(() => dueToday.value.filter(r => loggedCompounds.value.has(r.compound)))
  const missing = computed(() => dueToday.value.filter(r => !loggedCompounds.value.has(r.compound)))
  const missingNames = computed(() => missing.value.map(r => r.compound).join(', '))
  const hunger = computed(() => hungerOf({
    rulesApply,
    due: dueToday.value.length,
    missing: missing.value.length,
    logged: loggedCompounds.value.size,
    doses: dosesToday.value.length,
    night: s.night.value
  }))

  // --- housekeeping: unlogged days gather cobwebs -------------------------------------------
  const unloggedThisWeek = computed(() => unloggedInWeek(entries.value, today.value))
  const cobwebs = computed(() => cobwebsFor(unloggedThisWeek.value))

  // --- the wardrobe and the build (tickerWardrobe.ts) -----------------------------------------
  // The four wearables, the tier, the arms and the belly all come from the data through the module
  // the home dashboard's companion reads too, so it is the same pet on both pages.
  const wardrobeInputs = computed<WardrobeInputs>(() => ({
    entries: entries.value,
    workouts: workouts.value,
    scans: s.scans.value ?? [],
    today: today.value
  }))
  const loggedDays = computed(() => loggedDayCount(entries.value))
  const milestones = computed(() => wearableMilestones(wardrobeInputs.value))
  const earned = computed(() => milestones.value.filter(m => m.progress >= m.goal))
  const build = computed<TickerBuild>(() => buildOf(wardrobeInputs.value))
  const tier = computed(() => build.value.tier!)
  const arms = computed(() => build.value.arms!)
  const bellyRead = computed(() => build.value.belly!)
  const scans = computed(() => sortedScans(s.scans.value ?? []))
  const latestScan = computed(() => scans.value.at(-1) ?? null)
  const leanGain = computed(() => leanGainOf(scans.value))

  // --- discipline: a clean week of doses earns the gold star ----------------------------------
  const doseDates = computed(() => doseDatesOf(entries.value))
  const weekTally = computed(() => rulesApply ? weekTallyOf(rules.value, doseDates.value, today.value) : null)
  const cleanWeek = computed(() => isCleanWeek(weekTally.value))
  const activeCycle = computed(() => {
    const c = relevantCycle(s.cycles.value ?? [], today.value)
    return c && cycleStatusOn(c, today.value) === 'active' ? c : null
  })
  /** "week 3 of 8 of <name>" while a cycle runs, for the adherence line. */
  const cycleClause = computed(() => {
    const cycle = activeCycle.value
    if (!cycle) return ''
    const p = cycleProgress(cycle, today.value)
    return ` — week ${p.week} of ${p.totalWeeks} of ${cycle.name}`
  })

  // --- what the compounds leave on it ---------------------------------------------------------
  const finasterideStreak = computed(() => finasterideStreakOf(entries.value, today.value))
  /** 0–3: how many mane tiers the streak has reached. */
  const maneTier = computed(() => maneTierOf(entries.value, today.value))
  const nextMane = computed(() => nextManeTier(entries.value, today.value))
  const bandaged = computed(() => dosesToday.value.some(d => /bpc/i.test(d.compound)))
  /** A jab or a swallow, by the standing rule, the oral words, then the compound catalogue (app/utils/vialInventory.ts). */
  const injected = (compound: string) => isInjected(compound, defaultVialForm, s.rules.value)
  const bowl = computed(() => bowlFor(hunger.value, dosesToday.value, injected))
  const doseKeys = computed(() => doseKeysOf(dosesToday.value))

  // --- the games' boards ----------------------------------------------------------------------
  const crusherWall = computed(() => crusherWallOf(entries.value, today.value))
  const paddleScale = computed(() => paddleScaleFor(recovery.value))
  /** A workout today is a spare life. */
  const crusherLives = computed(() => 3 + (minutesOn(today.value) > 0 ? 1 : 0))
  const daySeed = computed(() => daySeedOf(today.value))
  const worldDays = computed(() => worldDaysOf({
    entries: entries.value,
    health: health.value,
    workouts: workouts.value,
    draws: s.labs.value ?? [],
    rules: rules.value,
    rulesApply,
    doseDates: doseDates.value,
    today: today.value
  }))

  return {
    todayEntry, sodasToday, sodasThisWeek, yesterday: computed(() => shiftDays(today.value, -1)), mealDay, mealIsYesterday, dosesToday, mixesToday,
    workoutsOn, minutesOn, walkDay, walkIsYesterday, workoutMinutes, workoutHr, walkProp,
    recovery, sleepMin, sluggish, streak, weight, latestHrv, firstDate, ageDays, birthday, drawDates, nextDraw, oldestOpen, fever,
    rules, dueToday, loggedCompounds, eaten, missing, missingNames, hunger, unloggedThisWeek, cobwebs,
    loggedDays, milestones, earned, build, tier, arms, bellyRead, scans, latestScan, leanGain,
    doseDates, weekTally, cleanWeek, activeCycle, cycleClause,
    finasterideStreak, maneTier, nextMane, bandaged, injected, bowl, doseKeys,
    crusherWall, paddleScale, crusherLives, daySeed, worldDays
  }
}
