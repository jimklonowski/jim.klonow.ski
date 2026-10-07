<template>
  <div class="px-4 sm:px-6 py-4 max-w-3xl mx-auto">
    <TuiHeader
      label="TICKER · RESIDENT COMPANION"
      :dashes="8"
    >
      <span class="text-[10.5px] text-muted normal-case">it lives off the data you already log — nothing here to maintain</span>
    </TuiHeader>

    <!-- Stage. Tall enough for the lg figure with a hat on (19 sprite rows), its EKG and captions,
         the beat's upward stretch and the celebrate hop, with ~25px to spare above the hat. -->
    <div
      ref="stage"
      class="stage relative mt-3 h-68 bg-raised border border-line-soft overflow-hidden"
      :class="{ night }"
      @mousemove="glance"
      @mouseleave="unglance"
    >
      <!-- unlogged days this week gather cobwebs: one for a day or two, three for most of the week -->
      <svg
        v-for="n in cobwebs"
        :key="n"
        class="web"
        :class="`web-${n}`"
        viewBox="0 0 28 28"
        width="28"
        height="28"
        aria-hidden="true"
      >
        <title>{{ unloggedThisWeek }} unlogged day{{ unloggedThisWeek === 1 ? '' : 's' }} this week</title>
        <path d="M0 0L27 6M0 0L20 20M0 0L6 27M10 0A10 10 0 0 1 0 10M18 0A18 18 0 0 1 0 18M26 0A26 26 0 0 1 0 26" />
      </svg>

      <!-- the window: the sky by the hour (sun, golden hour, moon and stars), a clock under it -->
      <div
        class="window"
        :class="`sky-${sky}`"
        aria-hidden="true"
      >
        <span
          v-if="sky !== 'golden'"
          class="pane-glyph"
        >{{ sky === 'night' ? '☾' : '☼' }}</span>
        <template v-if="sky === 'night'">
          <span class="star star-1">·</span>
          <span class="star star-2">·</span>
        </template>
      </div>
      <p
        class="clock"
        aria-hidden="true"
      >
        {{ clock }}
      </p>

      <!-- the floor, measured from the figure's feet so the bowl and calendar stand on it too;
           the bed behind it after dusk (it sits on the mattress once it's asleep) -->
      <template v-if="floorY != null && !playing">
        <div
          class="floor"
          :style="{ bottom: `${floorY}px` }"
          aria-hidden="true"
        />
        <div
          v-if="night"
          class="bed"
          :style="{ bottom: `${floorY - 6}px` }"
          aria-hidden="true"
        >
          <span class="headboard" />
          <span class="pillow" />
        </div>
      </template>

      <!-- the runner takes the stage over for a game; the figure comes back when it quits -->
      <TickerRunner
        v-if="playing"
        ref="runner"
        :build="build"
        :accessories="worn"
        :night="night"
        :hi="runnerHi?.score ?? 0"
        @over="onRunOver"
        @quit="onRunQuit"
      />

      <div
        v-else
        class="absolute bottom-9 left-1/2 transition-none"
        :style="{ transform: `translateX(calc(-50% + ${x}px)) scaleX(${facing})` }"
      >
        <TickerCompanion
          ref="pet"
          size="lg"
          full
          :rhr="walkHr ?? rhr"
          :sluggish="sluggish && !poseOverride"
          :pose-override="poseOverride"
          :accessories="accessories"
          :build="build"
          :mood="talking ? 'talking' : null"
          aria-label="Pet TICKER"
          :caption="caption"
          @open="petIt"
        />
      </div>

      <!-- floating hearts from petting (and the birthday rain) -->
      <span
        v-for="h in heartParticles"
        :key="h.id"
        class="pet-heart"
        :style="{ left: `calc(50% + ${h.x}px)` }"
        aria-hidden="true"
      >♥</span>

      <!-- the pet's last remark -->
      <p
        class="absolute left-3 bottom-2.5 text-[11.5px] text-muted truncate max-w-[calc(100%-1.5rem)]"
        aria-live="polite"
      >
        {{ line }}
      </p>
    </div>

    <!-- Actions -->
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="tui-btn tui-btn-accent disabled:opacity-50"
        :disabled="busy"
        @click="petIt"
      >
        ♥ PET
      </button>
      <button
        type="button"
        class="tui-btn disabled:opacity-50"
        :disabled="busy"
        @click="talk"
      >
        ⊳ TALK
      </button>
      <button
        type="button"
        class="tui-btn disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="busy || !dosesToday.length"
        :title="dosesToday.length ? undefined : 'Nothing logged today yet — TICKER only eats what the journal says'"
        @click="feed"
      >
        ⊳ FEED{{ dosesToday.length ? ` · ${dosesToday.length}` : '' }}
      </button>
      <button
        type="button"
        class="tui-btn disabled:opacity-50"
        :disabled="busy"
        @click="walk"
      >
        ⊳ WALK{{ workoutMinutes ? ` · ${workoutMinutes}m` : '' }}
      </button>
      <button
        type="button"
        class="tui-btn disabled:opacity-50"
        :disabled="busy && !playing"
        @click="playing ? runner?.quit() : play()"
      >
        {{ playing ? '■ QUIT' : `⊳ PLAY${runnerHi ? ` · HI ${runnerHi.score}` : ''}` }}
      </button>
      <span class="ml-auto text-[10.5px] text-faint">derived from the journal — talking quotes it, feeding and walking replay what's logged; play is just play</span>
    </div>

    <!-- Stats -->
    <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 border border-line-soft divide-x divide-line-soft bg-raised text-center">
      <div
        v-for="s in stats"
        :key="s.label"
        class="px-2 py-2.5"
        :title="s.title"
      >
        <p class="tui-label">
          {{ s.label }}
        </p>
        <p class="mt-1 text-[13px] text-hi num-display">
          {{ s.value }}
        </p>
        <p
          v-if="s.hint"
          class="mt-0.5 text-[10px] text-faint"
        >
          {{ s.hint }}
        </p>
      </div>
    </div>

    <p class="mt-2.5 text-[11.5px] leading-[1.7] text-muted">
      TICKER's day, read from the data: {{ todaySummary }}
    </p>
  </div>
</template>

<script setup lang="ts">
// The resident companion as a pet. Everything it feels is DERIVED from streams that already
// exist — doses fed, workouts walked, sodas regretted, sleep slept — so there is nothing to
// forget to do. Petting is the one pure interaction; the only local state is its counter and the
// once-a-day stamps that keep the soda flinch and the birthday from replaying on every visit.
import { isLoggedDay, loggedStreak, longestLoggedStreak } from '#shared/utils/journalLog'
import { diffDays, shiftDays } from '#shared/utils/dates'
import { countdownLabel, drawLabel, nextPlannedDraw } from '#shared/utils/plannedDraws'
import { scheduledFor, tallySchedule } from '#shared/utils/protocolRules'
import { cycleProgress, cycleStatusOn, relevantCycle } from '#shared/utils/cycles'
import type { TickerBelly, TickerBuild, TickerPose, TickerProp, TickerTier } from '#shared/utils/tickerSprite'

useSeoMeta({ title: 'Ticker' })

const { role, canEdit } = await useAuth()
const { data: overview, latestDraw, flagCounts } = useOverviewSummary(role)
const { data: journalData } = await useJournalEntries()
const { data: healthData } = await useHealthMetricsEntries()
const { data: workoutsData } = await useWorkoutsEntries()
const { data: labsData } = await useLabsEntries()
const { data: plannedData } = await usePlannedDraws()
const { data: cyclesData } = await useCycles()
const { data: dexaData } = await useDexaEntries()
// The vial list is owner/demo only (the API says so); a friend's TICKER has no pantry to mention.
const vialsData = canEdit.value ? await useVials() : null
const today = useToday()

const entries = computed(() => journalData.value ?? [])
const rhr = computed(() => overview.value?.latestRhr ?? null)

// --- the clock on the wall --------------------------------------------------------------------
// The viewer's local time, not the home timezone: it is the viewer's evening the stage darkens
// for. Null until mounted, so the server and the first client paint agree on a daytime stage.

const DUSK_HOUR = 19
const BEDTIME_HOUR = 22
const WAKE_HOUR = 6

const now = ref<number | null>(null)
const hour = computed(() => now.value == null ? null : new Date(now.value).getHours())
const night = computed(() => hour.value != null && (hour.value >= DUSK_HOUR || hour.value < WAKE_HOUR))
const asleep = computed(() => hour.value != null && (hour.value >= BEDTIME_HOUR || hour.value < WAKE_HOUR))

/** What the window shows: the sun by day, amber around dawn and dusk, the moon and stars at night. */
const sky = computed<'day' | 'golden' | 'night'>(() => {
  const h = hour.value
  if (h == null) return 'day'
  if (night.value) return 'night'
  return h < 8 || h >= 17 ? 'golden' : 'day'
})
const clock = computed(() => now.value == null
  ? ''
  : new Date(now.value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase())

let clockTimer: ReturnType<typeof setTimeout> | undefined
let clockInterval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  const tick = () => {
    now.value = Date.now()
  }
  tick()
  // Then on the minute, so the clock under the window never lags.
  clockTimer = setTimeout(() => {
    tick()
    clockInterval = setInterval(tick, 60_000)
  }, 60_000 - (Date.now() % 60_000))
})
onUnmounted(() => {
  clearTimeout(clockTimer)
  clearInterval(clockInterval)
})

// --- today, as the pet experiences it ---------------------------------------------------------

const todayEntry = computed(() => entries.value.find(e => e.date === today.value) ?? null)
const sodasToday = computed(() => (todayEntry.value?.sodas ?? []).length)
const sodasThisWeek = computed(() => {
  const from = shiftDays(today.value, -6)
  return entries.value
    .filter(e => e.date >= from && e.date <= today.value)
    .reduce((s, e) => s + (e.sodas?.length ?? 0), 0)
})

// Meals and walks fall back ONE day when today is still empty: mornings start unlogged, and the
// demo persona's data always ends yesterday — a pet that can never be fed is a sad showcase.
const yesterday = computed(() => shiftDays(today.value, -1))
const mealDay = computed(() => {
  if (todayEntry.value?.peptides?.length) return today.value
  const y = entries.value.find(e => e.date === yesterday.value)
  return y?.peptides?.length ? yesterday.value : today.value
})
const mealIsYesterday = computed(() => mealDay.value !== today.value)
const dosesToday = computed(() => entries.value.find(e => e.date === mealDay.value)?.peptides ?? [])

const workoutsOn = (date: string) => (workoutsData.value ?? []).filter(w => w.date === date)
const minutesOn = (date: string) => Math.round(workoutsOn(date).reduce((s, w) => s + (w.duration_min ?? 0), 0))
const walkDay = computed(() => minutesOn(today.value) > 0 ? today.value : yesterday.value)
const walkIsYesterday = computed(() => walkDay.value !== today.value && minutesOn(walkDay.value) > 0)
const workoutMinutes = computed(() => minutesOn(walkDay.value))

/** The walk day's average HR, weighted by duration — the beat TICKER walks at. Null when no workout carried one. */
const workoutHr = computed(() => {
  const withHr = workoutsOn(walkDay.value).filter(w => w.avg_hr != null)
  const weight = (w: { duration_min: number | null }) => w.duration_min || 1
  const total = withHr.reduce((s, w) => s + weight(w), 0)
  return total ? Math.round(withHr.reduce((s, w) => s + w.avg_hr! * weight(w), 0) / total) : null
})

// What it carries on the walk, by the day's longest workout's type. Apple and Whoop between
// them emit a couple of dozen type strings, so these are families, like the workouts page's.
const WALK_PROPS: Array<{ match: RegExp, prop: TickerProp }> = [
  { match: /strength|weightlift|functional|core|crossfit|hiit/i, prop: 'dumbbell' },
  { match: /cycling|spin|bike/i, prop: 'helmet' },
  { match: /disc/i, prop: 'disc' },
  { match: /walk|run|jog|hik|elliptical|stair|tread|row/i, prop: 'cap' }
]
const walkProp = computed<TickerProp | null>(() => {
  const main = best(workoutsOn(walkDay.value), w => w.duration_min, 'max')?.item ?? workoutsOn(walkDay.value)[0]
  return WALK_PROPS.find(p => p.match.test(main?.workout_type ?? ''))?.prop ?? null
})

const latestHealth = computed(() => (healthData.value ?? []).at(-1) ?? null)
const recovery = computed(() => latestHealth.value?.recovery_score ?? null)
const sleepMin = computed(() => latestHealth.value?.sleep_total_min ?? null)
const sluggish = computed(() => (sleepMin.value ?? 420) < 420)
const fmtSleep = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
const recoveryZone = (r: number) => r >= 67 ? 'green' : r >= 34 ? 'yellow' : 'red'

const streak = computed(() => loggedStreak(entries.value, today.value))

/** The newest non-empty value of a vitals column. */
function latestJournal(key: 'weight_lbs' | 'hrv'): number | null {
  for (let i = entries.value.length - 1; i >= 0; i--) {
    const v = entries.value[i]?.[key]
    if (v != null) return v
  }
  return null
}
const weight = computed(() => latestJournal('weight_lbs'))
const latestHrv = computed(() => latestJournal('hrv'))

/** The first recorded anything: the pet's hatch date. */
const firstDate = computed(() => {
  const firsts = [entries.value[0]?.date, (healthData.value ?? [])[0]?.date, (workoutsData.value ?? [])[0]?.date]
    .filter((d): d is string => !!d)
  return firsts.sort()[0] ?? null
})
const ageDays = computed(() => firstDate.value ? diffDays(firstDate.value, today.value) : null)
/** How old it turns today, when today is the anniversary of the first data point; null otherwise. */
const birthday = computed(() => {
  const f = firstDate.value
  if (!f || f === today.value || f.slice(5) !== today.value.slice(5)) return null
  return Number(today.value.slice(0, 4)) - Number(f.slice(0, 4))
})

const drawDates = computed(() => (labsData.value ?? []).map(d => d.date).sort())
const nextDraw = computed(() => nextPlannedDraw(plannedData.value ?? [], drawDates.value, today.value))

/** The active vial that has been open longest, and for how many days. */
const oldestOpen = computed(() => {
  const open = (vialsData?.data.value ?? []).filter(v => v.status === 'active' && v.opened_date)
  if (!open.length) return null
  const v = open.reduce((a, b) => (a.opened_date! <= b.opened_date! ? a : b))
  return { compound: v.compound, days: diffDays(v.opened_date!, today.value) }
})

// --- fever: a resting heart rate well over its own two-week average ---------------------------
// The newest journal RHR against the mean of the readings in the fortnight before it, when there
// are enough of them to call an average and the reading is fresh (today or yesterday).

const FEVER_BPM = 7
const FEVER_WINDOW_DAYS = 14
const FEVER_MIN_READINGS = 5

const fever = computed(() => {
  const withRhr = entries.value.filter(e => e.rhr != null)
  const latest = withRhr.at(-1)
  if (!latest || diffDays(latest.date, today.value) > 1) return null
  const from = shiftDays(latest.date, -FEVER_WINDOW_DAYS)
  const prior = withRhr.filter(e => e.date >= from && e.date < latest.date).map(e => e.rhr!)
  if (prior.length < FEVER_MIN_READINGS) return null
  const baseline = Math.round(prior.reduce((s, v) => s + v, 0) / prior.length)
  const over = latest.rhr! - baseline
  return over >= FEVER_BPM ? { rhr: latest.rhr!, baseline, over } : null
})

// --- hunger: what the schedule says is due today, against what the journal says went down ----
// The standing rules merged with every cycle (effectiveRules), scored on today only — the
// yesterday fallback above is for the FEED replay, not for whether it has eaten. Due doses still
// unlogged once the stage goes dark make it hungry. Not for demo: the persona's dose dates drift
// across weekdays by design (see protocolRules.ts), so its TICKER is fed when anything is logged.

type Hunger = 'fed' | 'waiting' | 'hungry' | 'rest'

const rulesApply = role.value !== 'demo'
const rules = computed(() => rulesApply ? effectiveRules(cyclesData.value ?? []) : [])
const dueToday = computed(() => scheduledFor(today.value, rules.value))
const loggedCompounds = computed(() => new Set((todayEntry.value?.peptides ?? []).map(p => p.compound)))
const eaten = computed(() => dueToday.value.filter(r => loggedCompounds.value.has(r.compound)))
const missing = computed(() => dueToday.value.filter(r => !loggedCompounds.value.has(r.compound)))
const missingNames = computed(() => missing.value.map(r => r.compound).join(', '))

const hunger = computed<Hunger>(() => {
  if (!rulesApply) return dosesToday.value.length ? 'fed' : 'waiting'
  if (!dueToday.value.length) return loggedCompounds.value.size ? 'fed' : 'rest'
  if (!missing.value.length) return 'fed'
  return night.value ? 'hungry' : 'waiting'
})

// --- housekeeping: unlogged days gather cobwebs -----------------------------------------------

const unloggedThisWeek = computed(() => {
  const logged = new Set(entries.value.filter(isLoggedDay).map(e => e.date))
  let n = 0
  for (let i = 1; i <= 7; i++) if (!logged.has(shiftDays(today.value, -i))) n++
  return n
})
const cobwebs = computed(() => unloggedThisWeek.value >= 5 ? 3 : unloggedThisWeek.value >= 3 ? 2 : unloggedThisWeek.value >= 1 ? 1 : 0)

// --- the record book --------------------------------------------------------------------------

function best<T>(list: T[], value: (t: T) => number | null | undefined, pick: 'max' | 'min'): { item: T, value: number } | null {
  let out: { item: T, value: number } | null = null
  for (const item of list) {
    const v = value(item)
    if (v == null) continue
    if (!out || (pick === 'max' ? v > out.value : v < out.value)) out = { item, value: v }
  }
  return out
}

/** All-time bests, one sentence each, dated (with the year once it isn't this one). */
const records = computed(() => {
  const when = (d: string) => `${formatDate(d, 'monthDay')}${d.slice(0, 4) === today.value.slice(0, 4) ? '' : ` ${d.slice(0, 4)}`}`
  const health = healthData.value ?? []
  const lines: string[] = []
  const rec = best(health, h => h.recovery_score, 'max')
  if (rec) lines.push(`best recovery: ${rec.value}% on ${when(rec.item.date)}.`)
  const run = longestLoggedStreak(entries.value)
  if (run.days) lines.push(run.days === streak.value ? `longest streak: ${run.days} days — this one, still going.` : `longest streak: ${run.days} days, ending ${when(run.end!)}.`)
  const light = best(entries.value, e => e.weight_lbs, 'min')
  if (light) lines.push(`lightest: ${light.value} lb on ${when(light.item.date)}.`)
  const long = best(workoutsData.value ?? [], w => w.duration_min, 'max')
  if (long) lines.push(`longest workout: ${Math.round(long.value)} min${long.item.workout_type ? ` of ${long.item.workout_type}` : ''} on ${when(long.item.date)}.`)
  const night = best(health, h => h.sleep_total_min, 'max')
  if (night) lines.push(`best night: ${fmtSleep(night.value)} on ${when(night.item.date)}.`)
  const calm = best(entries.value, e => e.rhr, 'min')
  if (calm) lines.push(`lowest resting HR: ${calm.value} bpm on ${when(calm.item.date)}.`)
  if (runnerHi.value) lines.push(`best run: ${runnerHi.value.score} points on ${when(runnerHi.value.date)}.`)
  return lines
})

// --- earned accessories: milestones unlock things to wear -------------------------------------
// Derived like everything else, so they are never lost — localStorage only remembers which ones
// have been announced (see announceUnlocks).

interface Unlock { prop: TickerProp, name: string, goal: number, progress: number, unit: string }

const totalWorkoutMinutes = computed(() => Math.round((workoutsData.value ?? []).reduce((s, w) => s + (w.duration_min ?? 0), 0)))
const loggedDays = computed(() => entries.value.filter(isLoggedDay).length)

const unlocks = computed<Unlock[]>(() => [
  { prop: 'crown', name: 'the crown', goal: 100, progress: longestLoggedStreak(entries.value).days, unit: 'days logged in a row' },
  { prop: 'sweatband', name: 'the sweatband', goal: 6000, progress: totalWorkoutMinutes.value, unit: 'workout minutes' },
  { prop: 'shades', name: 'the shades', goal: 2000, progress: ageDays.value ?? 0, unit: 'days old' },
  { prop: 'medal', name: 'the medal', goal: 250, progress: loggedDays.value, unit: 'logged days' }
])
const earned = computed(() => unlocks.value.filter(u => u.progress >= u.goal))
/** The unearned one it is closest to, by share of the way there. */
const nextUnlock = computed(() => unlocks.value
  .filter(u => u.progress < u.goal)
  .sort((a, b) => (b.progress / b.goal) - (a.progress / a.goal))[0] ?? null)

// --- the build: tier by logged days, arms and belly by DEXA -----------------------------------
// A hatchling (no limbs yet) until a month of logged days, grown after, an elder with a cane
// from five hundred. The arms fill in once lean mass is up five pounds on the first scan; the
// belly reads the latest body-fat figure — soft from twenty percent, cut under thirteen.

const TIER_DAYS = { grown: 30, elder: 500 }
const tier = computed<TickerTier>(() => loggedDays.value >= TIER_DAYS.elder ? 'elder' : loggedDays.value >= TIER_DAYS.grown ? 'grown' : 'hatchling')

const LEAN_GAIN_LBS = 5
const SOFT_BF = 20
const CUT_BF = 13
const scans = computed(() => [...(dexaData.value ?? [])].sort((a, b) => a.date.localeCompare(b.date)))
const latestScan = computed(() => scans.value.at(-1) ?? null)
const leanGain = computed(() => {
  const first = scans.value[0]
  const latest = latestScan.value
  return first && latest && first !== latest ? Math.round((latest.total.lean_mass_lbs - first.total.lean_mass_lbs) * 10) / 10 : null
})
const arms = computed<'lean' | 'built'>(() => leanGain.value != null && leanGain.value >= LEAN_GAIN_LBS ? 'built' : 'lean')
const bellyRead = computed<TickerBelly>(() => {
  const bf = latestScan.value?.total.body_fat_pct
  if (bf == null) return 'lean'
  return bf >= SOFT_BF ? 'soft' : bf < CUT_BF ? 'cut' : 'lean'
})
const build = computed<TickerBuild>(() => ({ tier: tier.value, arms: arms.value, belly: bellyRead.value }))

// --- discipline: a clean week of doses earns the gold star ----------------------------------
// The trailing seven days scored against the same merged rules as the hunger meter; today only
// counts once logged (tallySchedule's rule), so a morning never reads as a miss.

const weekTally = computed(() => {
  if (!rulesApply) return null
  const doseDates = new Map<string, Set<string>>()
  for (const e of entries.value) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      let set = doseDates.get(p.compound)
      if (!set) doseDates.set(p.compound, set = new Set())
      set.add(e.date)
    }
  }
  const tallies = tallySchedule(rules.value, shiftDays(today.value, -6), today.value, doseDates, today.value)
  const hit = tallies.reduce((s, t) => s + t.hit.length, 0)
  const missed = tallies.flatMap(t => t.missed.map(date => ({ compound: t.rule.compound, date })))
  return { hit, missed }
})
const cleanWeek = computed(() => !!weekTally.value && weekTally.value.hit > 0 && weekTally.value.missed.length === 0)
/** "week 3 of 8 of <name>" while a cycle runs, for the adherence line. */
const cycleClause = computed(() => {
  const cycle = relevantCycle(cyclesData.value ?? [], today.value)
  if (!cycle || cycleStatusOn(cycle, today.value) !== 'active') return ''
  const p = cycleProgress(cycle, today.value)
  return ` — week ${p.week} of ${p.totalWeeks} of ${cycle.name}`
})

// --- mood: the held pose between interactions -------------------------------------------------

const heldPose = computed<TickerPose | null>(() => {
  if (asleep.value) return 'asleep'
  if (fever.value) return 'feverish'
  if (nextDraw.value?.status === 'today') return 'nervous'
  if (hunger.value === 'hungry') return 'hungry'
  if (nextDraw.value?.status === 'overdue') return 'impatient'
  if (sluggish.value) return null // the sluggish prop draws the coffee slump itself
  if (sodasToday.value >= 3) return 'worried'
  if (recovery.value != null && recovery.value >= 80) return 'happy'
  if (recovery.value != null && recovery.value < 34) return 'worried'
  return null
})

const moodWord = computed(() => {
  if (asleep.value) return 'asleep'
  if (fever.value) return 'feverish'
  if (nextDraw.value?.status === 'today') return 'nervous'
  if (hunger.value === 'hungry') return 'hungry'
  if (nextDraw.value?.status === 'overdue') return 'impatient'
  if (sluggish.value) return 'sleepy'
  if (sodasToday.value >= 3) return 'queasy'
  if (recovery.value != null && recovery.value >= 80) return 'great'
  if (recovery.value != null && recovery.value < 34) return 'rough'
  return 'steady'
})

// --- actions ----------------------------------------------------------------------------------

const pet = useTemplateRef('pet')
const stage = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

// The floor is wherever the figure's feet are: the bottom of the sprite grid, measured once it
// has rendered and again on resize. The beat scales the grid about its bottom edge and a hat
// only adds rows above, so the line holds still through both.
const floorY = ref<number | null>(null)
function measureFloor() {
  const heart = (pet.value?.$el as HTMLElement | undefined)?.querySelector('.heart')
  if (!heart || !stage.value) return
  floorY.value = Math.round(stage.value.getBoundingClientRect().bottom - 1 - heart.getBoundingClientRect().bottom)
}
onMounted(() => {
  nextTick(measureFloor)
  window.addEventListener('resize', measureFloor)
})
onUnmounted(() => window.removeEventListener('resize', measureFloor))

const busy = ref(false)
const actionPose = ref<TickerPose | null>(null)
/** Sat down to wait (see fidgets); stands back up on any press. Never while asleep — that has its own seat. */
const sitting = ref(false)
const talking = ref(false)
const poseOverride = computed(() => actionPose.value ?? (sitting.value && !asleep.value ? 'sit' : heldPose.value))
/** True for the length of a walk with a workout behind it: the carried prop shows. */
const walking = ref(false)

/**
 * The props layer, in paint order. The bowl shows what has been served today; one thing on the
 * left lobe at a time (the party hat on its birthday, the cap on a walk, else the crown if
 * earned); the other walk props and the earned wearables; and the vet visit's calendar from
 * three days out, with the lab coat on the day.
 */
const accessories = computed<TickerProp[]>(() => {
  const out: TickerProp[] = [hunger.value === 'fed' ? 'bowl-full' : 'bowl-empty']
  const worn = new Set(earned.value.map(u => u.prop))
  const carried = walking.value ? walkProp.value : null
  if (birthday.value) out.push('party-hat')
  else if (carried === 'cap') out.push('cap')
  else if (worn.has('crown')) out.push('crown')
  if (carried && carried !== 'cap') out.push(carried)
  for (const p of ['sweatband', 'shades', 'medal'] as const) if (worn.has(p)) out.push(p)
  if (cleanWeek.value) out.push('gold-star')
  const d = nextDraw.value
  if (d && (d.status === 'today' || d.status === 'overdue' || d.inDays <= 3)) out.push('calendar')
  if (d?.status === 'today') out.push('lab-coat')
  return out
})
const x = ref(0)
const facing = ref(1)
const line = ref('')
/** Set for the length of a walk: the beat runs at the workout's average instead of the resting reading. */
const walkHr = ref<number | null>(null)
const caption = computed(() => {
  if (walkHr.value != null) return `♥ ${walkHr.value} bpm · workout avg`
  return rhr.value != null ? null : '♥ its own beat'
})

const timers: Array<ReturnType<typeof setTimeout>> = []
function wait(ms: number) {
  return new Promise<void>((resolve) => {
    timers.push(setTimeout(resolve, ms))
  })
}
onUnmounted(() => timers.forEach(clearTimeout))

// Petting: the counter is a per-viewer convenience, so localStorage is exactly enough.
const PETS_KEY = 'ticker:pets'
const pets = ref({ total: 0, today: 0 })
onMounted(() => {
  try {
    const raw = JSON.parse(localStorage.getItem(PETS_KEY) ?? '{}') as { total?: number, date?: string, today?: number }
    pets.value = { total: raw.total ?? 0, today: raw.date === today.value ? raw.today ?? 0 : 0 }
  }
  catch { /* private windows etc. — the counter just starts fresh */ }
})

const SQUEAKS = ['♥!', 'squeak!', 'hehe — ok', 'that\'s the spot', 'ok, that\'s plenty', '…there IS a digest to write, you know', '(happy wiggle)']

interface HeartParticle { id: number, x: number }
const heartParticles = ref<HeartParticle[]>([])
let particleId = 0

/** One floating heart, `dx` pixels off the pet's centre; gone again after its animation. */
function spawnHeart(dx: number) {
  const h = { id: ++particleId, x: x.value + dx }
  heartParticles.value = [...heartParticles.value.slice(-11), h]
  timers.push(setTimeout(() => {
    heartParticles.value = heartParticles.value.filter(p => p.id !== h.id)
  }, 1100))
}

async function petIt() {
  wake()
  pets.value = { total: pets.value.total + 1, today: pets.value.today + 1 }
  try {
    localStorage.setItem(PETS_KEY, JSON.stringify({ ...pets.value, date: today.value }))
  }
  catch { /* fine */ }

  spawnHeart(Math.random() * 36 - 18)
  line.value = asleep.value ? '(it stirs, smiles… and goes back to sleep)' : SQUEAKS[Math.min(pets.value.today - 1, SQUEAKS.length - 1)]!
  pet.value?.trigger('celebrate')
  if (busy.value) return // mid-walk pats are allowed; don't fight the walk's poses
  actionPose.value = 'petted'
  await wait(1300)
  if (actionPose.value === 'petted') actionPose.value = null
}

async function feed() {
  if (busy.value || !dosesToday.value.length) return
  busy.value = true
  wake()
  const menu = dosesToday.value
    .map(d => `${d.compound} ${d.dose} ${d.unit === 'iu' ? 'IU' : d.unit}`)
    .join(' · ')
  line.value = `fed: ${menu}${mealIsYesterday.value ? ' (yesterday\'s plate)' : ''}`
  actionPose.value = 'eating'
  await wait(2600)
  actionPose.value = null
  line.value = rulesApply && missing.value.length
    ? `${dosesToday.value.length} down. still waiting on ${missingNames.value}.`
    : `all ${dosesToday.value.length} dose${dosesToday.value.length === 1 ? '' : 's'} down. ♥`
  busy.value = false
}

async function walk() {
  if (busy.value) return
  busy.value = true
  wake()
  const minutes = workoutMinutes.value

  if (!minutes) {
    // No workout logged: two sad shuffles, then it sits back down.
    line.value = 'no workout in the log today…'
    for (let i = 0; i < 2; i++) {
      actionPose.value = 'walk1'
      await wait(420)
      actionPose.value = 'walk2'
      await wait(420)
      if (reducedMotion.value !== 'reduce') x.value += 10
    }
    actionPose.value = 'sleepy'
    line.value = '…TICKER sat back down. (it walks when you do)'
    await wait(1900)
    actionPose.value = null
    x.value = 0
    busy.value = false
    return
  }

  // One lap per ~20 logged minutes, capped: across the stage and home again.
  const laps = Math.min(3, Math.max(1, Math.round(minutes / 20)))
  const range = Math.max(40, ((stage.value?.clientWidth ?? 480) / 2) - 110)

  // The heart beats at the workout's average HR for the lap and the trot keeps pace: ~220ms a
  // step at an easy 100 bpm down to ~120ms at 160. 190ms when no workout carried a heart rate.
  const hr = workoutHr.value
  walkHr.value = hr
  walking.value = true
  const stepMs = hr == null ? 190 : Math.round(Math.min(220, Math.max(120, 220 - (hr - 100) * (100 / 60))))
  line.value = `walking off ${minutes} min of workouts${hr != null ? ` at ${hr} bpm` : ''}${walkIsYesterday.value ? ' (yesterday\'s)' : ''}…`

  let frame: TickerPose = 'walk1'
  const animate = reducedMotion.value !== 'reduce'
  for (let lap = 0; lap < laps * 2; lap++) {
    const target = lap % 2 === 0 ? range : -range
    facing.value = target > x.value ? 1 : -1
    const steps = Math.max(4, Math.round(Math.abs(target - x.value) / 14))
    for (let s = 0; s < steps; s++) {
      frame = frame === 'walk1' ? 'walk2' : 'walk1'
      actionPose.value = frame
      if (animate) x.value += (target - x.value) / (steps - s)
      await wait(animate ? stepMs : 90)
    }
  }
  // trot home
  facing.value = x.value > 0 ? -1 : 1
  while (animate && Math.abs(x.value) > 10) {
    frame = frame === 'walk1' ? 'walk2' : 'walk1'
    actionPose.value = frame
    x.value -= Math.sign(x.value) * 14
    await wait(stepMs)
  }
  x.value = 0
  facing.value = 1
  walkHr.value = null
  actionPose.value = 'happy' // still carrying the prop — the dumbbell goes up overhead
  line.value = minutes >= 45 ? `${minutes} minutes — a proper outing. ♥` : `${minutes} minutes walked together.`
  await wait(1400)
  actionPose.value = null
  walking.value = false
  busy.value = false
}

// --- talk: one real number per press ----------------------------------------------------------
// Every line quotes a figure the page already holds; the list skips what the data lacks, and
// presses walk through it from a random start so two visits don't open on the same number.

const quotes = computed(() => {
  const r = recovery.value
  const draw = nextDraw.value
  const flags = latestDraw.value ? flagCounts.value : null
  const lines: Array<string | null> = [
    weight.value != null ? `${weight.value} lb at the last weigh-in. it's holding that for you.` : null,
    r != null
      ? `recovery ${r}% — ${recoveryZone(r)}. ${r >= 67 ? 'go lift something.' : r >= 34 ? 'an ordinary day, then.' : 'it votes for a nap.'}`
      : null,
    sleepMin.value != null
      ? `${fmtSleep(sleepMin.value)} of sleep last night.${sleepMin.value < 420 ? ' it felt that.' : ' it slept well too.'}`
      : null,
    fever.value
      ? `resting at ${fever.value.rhr} bpm — ${fever.value.over} over the two-week average of ${fever.value.baseline}. it's running hot.`
      : rhr.value != null ? `resting at ${rhr.value} bpm. that's the beat you're watching.` : null,
    latestHrv.value != null ? `hrv ${latestHrv.value} ms on the last reading.` : null,
    flags && latestDraw.value
      ? `${flags.high} high, ${flags.low} low on the ${formatDate(latestDraw.value.date, 'monthDay')} draw.${flags.high + flags.low === 0 ? ' clean sheet.' : ''}`
      : null,
    draw ? `${draw.status === 'overdue' ? 'the' : 'next'} draw ${countdownLabel(draw.inDays)} — ${drawLabel(draw.plan)}.` : null,
    rulesApply && dueToday.value.length
      ? missing.value.length
        ? `${eaten.value.length} of ${dueToday.value.length} due doses down. still waiting on ${missingNames.value}.`
        : `all ${dueToday.value.length} due doses down today. it's full.`
      : null,
    `${streak.value} day${streak.value === 1 ? '' : 's'} logged in a row. it's keeping count.`,
    sodasThisWeek.value
      ? `${sodasThisWeek.value} soda${sodasThisWeek.value === 1 ? '' : 's'} this week. it noticed every one.`
      : 'no sodas this week. it\'s proud of you.',
    oldestOpen.value ? `the ${oldestOpen.value.compound} vial has been open ${oldestOpen.value.days} days.` : null,
    ageDays.value != null ? `${ageDays.value.toLocaleString('en-US')} days since the first data point. it remembers all of them.` : null,
    weekTally.value
      ? weekTally.value.missed.length
        ? `${weekTally.value.hit} of ${weekTally.value.hit + weekTally.value.missed.length} due doses this week — missed ${weekTally.value.missed.map(m => `${m.compound} ${new Date(`${m.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}`).join(', ')}${cycleClause.value}.`
        : weekTally.value.hit
          ? `${weekTally.value.hit} of ${weekTally.value.hit} due doses this week. a clean week — hence the star${cycleClause.value}.`
          : null
      : null,
    tier.value === 'elder'
      ? `${loggedDays.value.toLocaleString('en-US')} logged days — an elder now. it earned the cane.`
      : tier.value === 'grown'
        ? `${loggedDays.value} logged days — grown. an elder at ${TIER_DAYS.elder}; ${TIER_DAYS.elder - loggedDays.value} to go.`
        : `${loggedDays.value} logged days — still a hatchling. it grows limbs at ${TIER_DAYS.grown}.`,
    latestScan.value
      ? `body fat ${latestScan.value.total.body_fat_pct}% on the ${formatDate(latestScan.value.date, 'monthDay')} scan — ${bellyRead.value === 'soft' ? 'a bit of belly, it admits' : bellyRead.value === 'cut' ? 'cut. look at that' : 'lean'}.`
      : null,
    leanGain.value != null
      ? `lean mass ${leanGain.value >= 0 ? '+' : ''}${leanGain.value} lb since the first scan — ${arms.value === 'built' ? 'the arms show it' : `the arms fill in at +${LEAN_GAIN_LBS}`}.`
      : null,
    earned.value.length
      ? `wearing ${earned.value.map(u => u.name.replace(/^the /, '')).join(', ')} — earned at ${earned.value.map(u => `${u.goal.toLocaleString('en-US')} ${u.unit}`).join(', ')}.`
      : null,
    nextUnlock.value
      ? `next unlock: ${nextUnlock.value.name} at ${nextUnlock.value.goal.toLocaleString('en-US')} ${nextUnlock.value.unit} — ${(nextUnlock.value.goal - nextUnlock.value.progress).toLocaleString('en-US')} to go.`
      : 'every accessory earned. there is nothing left to unlock, only to keep.',
    ...records.value.map(r => `for the record — ${r}`)
  ]
  return lines.filter((l): l is string => !!l)
})

let quoteIdx = 0

async function talk() {
  if (busy.value) return
  busy.value = true
  wake()
  const list = quotes.value
  const said = list[quoteIdx++ % list.length]!
  line.value = asleep.value ? `(mumbling) ${said}` : said
  talking.value = true
  actionPose.value = 'talking'
  await wait(Math.min(3400, 1200 + said.length * 30))
  talking.value = false
  if (actionPose.value === 'talking') actionPose.value = null
  busy.value = false
}

// --- play: the runner ------------------------------------------------------------------------
// The one thing on the page that is not read from the data. The runner takes the stage over,
// the pet counts as busy for the duration (no fidgets, the other buttons wait), and the high
// score lives in this browser like the pet counter — a new one gets the hop and a line.

const runner = useTemplateRef('runner')
const playing = ref(false)
const RUNNER_KEY = 'ticker:runner'
const runnerHi = ref<{ score: number, date: string } | null>(null)
let runSetRecord = false

onMounted(() => {
  try {
    const raw = JSON.parse(localStorage.getItem(RUNNER_KEY) ?? 'null') as { score?: number, date?: string } | null
    if (raw?.score && raw.date) runnerHi.value = { score: raw.score, date: raw.date }
  }
  catch { /* no storage — no record to beat, then */ }
})

/** What it runs in: the wearables and the hat, not the floor props or the vet's coat. */
const worn = computed(() => accessories.value.filter(a => !['bowl-empty', 'bowl-full', 'calendar', 'lab-coat'].includes(a)))

function play() {
  if (busy.value) return
  wake()
  busy.value = true
  runSetRecord = false
  playing.value = true
  line.value = 'space or tap to run. esc quits.'
}

function onRunOver(score: number) {
  if (score > (runnerHi.value?.score ?? 0)) {
    runnerHi.value = { score, date: today.value }
    record(RUNNER_KEY, JSON.stringify(runnerHi.value))
    runSetRecord = true
  }
}

async function onRunQuit(score: number) {
  playing.value = false
  busy.value = false
  await nextTick()
  measureFloor()
  const best = runnerHi.value
  if (runSetRecord && best) {
    line.value = `new best: ${best.score} points. ♥`
    pet.value?.trigger('celebrate')
    for (let i = 0; i < 5; i++) timers.push(setTimeout(() => spawnHeart(Math.random() * 120 - 60), i * 150))
  }
  else if (score > 0 && best) {
    line.value = `${score} points. best ${best.score} on ${formatDate(best.date, 'monthDay')} — it's still catching its breath.`
  }
  else {
    line.value = 'next time.'
  }
}

// --- fidgets: what it does when nobody is doing anything --------------------------------------
// A loose timer, never during an action or while asleep: mostly a double blink (which also knocks
// the regular blink cycle off its metronome), sometimes a chin scratch or a look over its
// shoulder; and after a minute without a press it sits down to wait.

const SIT_AFTER_MS = 60_000
let lastInteraction = 0
let fidgetTimer: ReturnType<typeof setTimeout> | undefined

function wake() {
  lastInteraction = Date.now()
  sitting.value = false
}

function scheduleFidget() {
  clearTimeout(fidgetTimer)
  fidgetTimer = setTimeout(fidget, 5000 + Math.random() * 7000)
}

async function fidget() {
  const free = !busy.value && !actionPose.value && !asleep.value && document.visibilityState === 'visible'
  if (free && !sitting.value && Date.now() - lastInteraction > SIT_AFTER_MS) {
    sitting.value = true
    line.value = '(TICKER sat down to wait.)'
  }
  else if (free) {
    const roll = Math.random()
    if (roll < 0.55) {
      pet.value?.blink()
    }
    else if (roll < 0.8 && !sitting.value) {
      actionPose.value = 'thinking' // the chin scratch
      await wait(1100)
      if (actionPose.value === 'thinking') actionPose.value = null
    }
    else {
      facing.value = -1 // a look over its shoulder
      await wait(700 + Math.random() * 600)
      if (!busy.value) facing.value = 1
    }
  }
  scheduleFidget()
}

// It turns to face the cursor while one is on the stage, and back to centre when it leaves.
function glance(e: MouseEvent) {
  if (busy.value || !stage.value) return
  const rect = stage.value.getBoundingClientRect()
  const dx = e.clientX - (rect.left + rect.width / 2 + x.value)
  if (Math.abs(dx) > 30) facing.value = dx < 0 ? -1 : 1
}
function unglance() {
  if (!busy.value) facing.value = 1
}

onMounted(() => {
  wake()
  scheduleFidget()
})
onUnmounted(() => clearTimeout(fidgetTimer))

// --- stats ------------------------------------------------------------------------------------

const drawTile = computed(() => {
  const d = nextDraw.value
  if (!d) return { value: '—', hint: 'nothing booked' }
  const where = d.plan.lab ?? 'draw'
  if (d.status === 'today') return { value: 'today', hint: `${where} · ${d.plan.fasting ? 'fasting' : 'non-fasting'}` }
  if (d.status === 'overdue') return { value: `${-d.inDays}d late`, hint: `${where} · nothing on file` }
  return { value: `${d.inDays}d`, hint: `${where} · ${formatDate(d.plan.date, 'monthDay')}` }
})

/** The hunger meter as a tile: eaten over due, with the holdouts in the tooltip. */
const fedTile = computed(() => {
  if (!rulesApply) return { value: dosesToday.value.length ? 'fed' : '—', hint: `${dosesToday.value.length} logged` }
  const due = dueToday.value.length
  if (!due) return { value: loggedCompounds.value.size ? 'fed' : 'rest day', hint: 'nothing due' }
  const n = missing.value.length
  return {
    value: `${eaten.value.length}/${due}`,
    hint: !n ? 'all down' : hunger.value === 'hungry' ? `hungry · ${n} to come` : `${n} to come`,
    title: n ? `still to log: ${missingNames.value}` : undefined
  }
})

interface Stat { label: string, value: string, hint?: string, title?: string }

const stats = computed<Stat[]>(() => [
  {
    label: 'AGE',
    value: ageDays.value != null ? `${ageDays.value.toLocaleString('en-US')}d` : '—',
    hint: birthday.value ? `turns ${birthday.value} today ♥` : 'since the first data point'
  },
  { label: 'WEIGHT', value: weight.value != null ? `${weight.value} lb` : '—', hint: 'yours, borrowed' },
  { label: 'STREAK', value: `${streak.value}d`, hint: 'logged days' },
  { label: 'FED', ...fedTile.value },
  { label: 'NEXT DRAW', value: drawTile.value.value, hint: drawTile.value.hint },
  {
    label: 'MOOD',
    value: moodWord.value,
    hint: fever.value
      ? `rhr ${fever.value.rhr} vs ${fever.value.baseline} avg`
      : recovery.value != null ? `recovery ${recovery.value}%` : undefined
  },
  { label: 'PETS', value: String(pets.value.today), hint: `${pets.value.total.toLocaleString('en-US')} all-time` }
])

const todaySummary = computed(() => {
  const plate = dosesToday.value.length ? `${dosesToday.value.length} dose${dosesToday.value.length === 1 ? '' : 's'} to eat` : 'nothing served yet'
  const parts = [
    rulesApply && dueToday.value.length
      ? missing.value.length
        ? `${eaten.value.length} of ${dueToday.value.length} due doses down (${missingNames.value} to come)`
        : `all ${dueToday.value.length} due doses down`
      : plate,
    workoutMinutes.value ? `${workoutMinutes.value} min walked` : 'no walk yet',
    sodasToday.value ? `${sodasToday.value} soda${sodasToday.value === 1 ? '' : 's'} (it noticed)` : 'no sodas (it approves)'
  ]
  return `${parts.join(', ')}.`
})

// --- arrival ----------------------------------------------------------------------------------

/** The greeting, read from the figures: the most notable thing first, an everyday line otherwise. */
function arrivalLine(): string {
  if (asleep.value) return `(asleep — it's late. up at ${WAKE_HOUR})`
  if (birthday.value) {
    const hatched = `${formatDate(firstDate.value!, 'monthDay')} ${firstDate.value!.slice(0, 4)}`
    return `happy birthday — TICKER turns ${birthday.value} today. (first data point: ${hatched})`
  }
  if (fever.value) return `rhr ${fever.value.rhr} — ${fever.value.over} over its two-week average. it's running hot; go easy today`
  if (awayDays.value >= 7) return `it's been ${awayDays.value} days. it stopped counting at a week. (it didn't.)`
  if (awayDays.value >= 3) return `it's been ${awayDays.value} days. it sat down on day one and waited.`
  if (hunger.value === 'hungry') return `past dinner and ${missingNames.value} ${missing.value.length === 1 ? 'isn\'t' : 'aren\'t'} logged — TICKER is hungry`
  if (sluggish.value) {
    const slept = sleepMin.value != null ? `${fmtSleep(sleepMin.value)} last night` : 'short night'
    return `(needs coffee — ${slept})`
  }
  const draw = nextDraw.value
  if (draw?.status === 'today') return 'draw day. TICKER is nervous on your behalf.'
  if (draw?.status === 'overdue') return `the ${draw.plan.lab ?? 'planned'} draw was ${countdownLabel(draw.inDays)} and nothing's on file — it keeps checking`
  if (draw && draw.inDays <= 3) return `draw ${countdownLabel(draw.inDays)}${draw.plan.fasting ? ' — fasting, remember' : ''}`
  const r = recovery.value
  if (r != null && r >= 80) return `recovery's at ${r}% — TICKER is thriving`
  if (r != null && r < 34) return `recovery ${r}% — TICKER is taking it easy today`
  if (streak.value > 0 && streak.value % 50 === 0) return `${streak.value} days logged in a row. it counted.`
  if (unloggedThisWeek.value >= 3) return `${unloggedThisWeek.value} of the last 7 days unlogged — it's getting dusty in here`
  if (oldestOpen.value && oldestOpen.value.days >= 28) return `the ${oldestOpen.value.compound} vial has been open ${oldestOpen.value.days} days — it checked the date`
  // A quiet day: rotate by the date so tomorrow's greeting is still a different one.
  const everyday = [
    'TICKER looks up expectantly.',
    `${streak.value} day${streak.value === 1 ? '' : 's'} in a row — it's keeping count.`,
    weight.value != null ? `borrowed your ${weight.value} lb again this morning.` : 'TICKER looks up expectantly.',
    ageDays.value != null ? `day ${ageDays.value.toLocaleString('en-US')} together.` : 'TICKER looks up expectantly.',
    ...records.value.map(r => `it remembers: ${r}`)
  ]
  return everyday[Number(today.value.slice(-2)) % everyday.length]!
}

// The one-shots below each play once per thing-that-happened: a stamp in localStorage says what
// has already been reacted to. No storage (a private window) means every visit is a first.
function firstTime(key: string, stamp: string): boolean {
  try {
    return localStorage.getItem(key) !== stamp
  }
  catch {
    return true
  }
}
function record(key: string, stamp: string) {
  try {
    localStorage.setItem(key, stamp)
  }
  catch { /* fine */ }
}

// The soda reaction. The home digest's flatline fires on the live count crossing three; here the
// count is whatever was logged before the visit, so the one-shot plays once per count per day —
// a fresh soda earns a fresh flinch, a second look at the same tally only gets the line.
const FLINCH_KEY = 'ticker:flinched'

async function flinch() {
  const n = sodasToday.value
  line.value = n >= 3
    ? `${n === 3 ? 'three' : n} sodas. it remembers.`
    : n === 2 ? 'two sodas. it winced.' : 'one soda. it noticed.'
  const stamp = `${today.value}:${n}`
  if (!firstTime(FLINCH_KEY, stamp)) return
  record(FLINCH_KEY, stamp)

  if (n >= 3) {
    pet.value?.trigger('flatline')
    return
  }
  if (busy.value) return
  actionPose.value = 'worried'
  await wait(1300)
  if (actionPose.value === 'worried') actionPose.value = null
}

// The birthday: the celebrate hop and a rain of hearts, once per visit-day (the greeting says it
// every time).
const BIRTHDAY_KEY = 'ticker:birthday'

function celebrateBirthday() {
  record(BIRTHDAY_KEY, today.value)
  pet.value?.trigger('celebrate')
  for (let i = 0; i < 9; i++) timers.push(setTimeout(() => spawnHeart(Math.random() * 160 - 80), i * 140))
}

// Results landing: the newest draw on file is a week old or less and hasn't been reacted to —
// the thump if anything is flagged (it read the report twice), the hop for a clean sheet.
const LANDED_KEY = 'ticker:landed'
const landedPending = computed(() => latestDraw.value != null && diffDays(latestDraw.value.date, today.value) <= 7 && firstTime(LANDED_KEY, latestDraw.value.date))

function resultsLanded() {
  const draw = latestDraw.value
  if (!draw) return
  record(LANDED_KEY, draw.date)
  const flags = flagCounts.value.high + flagCounts.value.low
  const when = formatDate(draw.date, 'monthDay')
  line.value = flags
    ? `results are in from the ${when} draw — ${flags} flag${flags === 1 ? '' : 's'}. it read the report twice.`
    : `results are in from the ${when} draw — a clean sheet. ♥`
  pet.value?.trigger(flags ? 'thump' : 'celebrate')
}

// --- what changed since its last look ---------------------------------------------------------
// A snapshot of the figures TICKER saw last visit, kept per browser. On arrival the difference
// is its news — a broken streak, a new scan, a cycle under way, a draw booked, workouts, weight,
// days logged — at most three items, in that order of how much they matter. Absence shows too:
// three days unseen and it has sat down to wait.

interface Snapshot {
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
const SNAPSHOT_KEY = 'ticker:snapshot'

const activeCycle = computed(() => {
  const c = relevantCycle(cyclesData.value ?? [], today.value)
  return c && cycleStatusOn(c, today.value) === 'active' ? c : null
})

function snapshotNow(): Snapshot {
  return {
    v: 1,
    date: today.value,
    streak: streak.value,
    loggedDays: loggedDays.value,
    weight: weight.value,
    workouts: (workoutsData.value ?? []).length,
    scanDate: latestScan.value?.date ?? null,
    arms: arms.value,
    plannedIds: (plannedData.value ?? []).map(p => p.id),
    activeCycleId: activeCycle.value?.id ?? null
  }
}

function loadSnapshot(): Snapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null') as Snapshot | null
    return s?.v === 1 ? s : null
  }
  catch {
    return null
  }
}

const lastVisit = ref<Snapshot | null>(null)
const awayDays = computed(() => lastVisit.value ? diffDays(lastVisit.value.date, today.value) : 0)

interface News { line: string, pose?: TickerPose, event?: 'celebrate' | 'thump' }

function newsSince(snap: Snapshot): News[] {
  const news: News[] = []
  const broke = snap.streak >= 3 && streak.value < snap.streak
  if (broke) {
    news.push({ line: `the ${snap.streak}-day streak broke while it wasn't looking. ${streak.value} now — it'll count again.`, pose: 'worried' })
  }
  const scan = latestScan.value
  if (scan && scan.date !== snap.scanDate) {
    const prev = scans.value.at(-2)
    const bf = scan.total.body_fat_pct
    const parts = [`new scan ${formatDate(scan.date, 'monthDay')}: body fat ${bf}%${prev ? ` (${prev.total.body_fat_pct}% before)` : ''}`]
    if (prev) {
      const d = Math.round((scan.total.lean_mass_lbs - prev.total.lean_mass_lbs) * 10) / 10
      parts.push(`lean ${d >= 0 ? '+' : ''}${d} lb`)
    }
    const better = !prev || bf < prev.total.body_fat_pct || scan.total.lean_mass_lbs > prev.total.lean_mass_lbs
    const armsNews = arms.value === 'built' && snap.arms !== 'built' ? ' …and the arms filled in.' : ''
    news.push({ line: `${parts.join(', ')}.${armsNews}`, event: better ? 'celebrate' : undefined, pose: better ? undefined : 'thinking' })
  }
  const cycle = activeCycle.value
  if (cycle && cycle.id !== snap.activeCycleId) {
    const p = cycleProgress(cycle, today.value)
    news.push({ line: `the ${cycle.name} cycle is under way — week ${p.week} of ${p.totalWeeks}.`, event: 'celebrate' })
  }
  const booked = (plannedData.value ?? [])
    .filter(p => !snap.plannedIds.includes(p.id) && p.date >= today.value)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (booked) {
    news.push({ line: `a draw's been booked — ${drawLabel(booked)}, ${countdownLabel(diffDays(today.value, booked.date))}. it marked the calendar.`, pose: 'nervous' })
  }
  const workouts = workoutsData.value ?? []
  const newWorkouts = workouts.length - snap.workouts
  if (newWorkouts >= 1) {
    const minutes = Math.round(workouts.filter(w => w.date >= snap.date).reduce((s, w) => s + (w.duration_min ?? 0), 0))
    news.push({ line: `${newWorkouts} workout${newWorkouts === 1 ? '' : 's'} since its last look${minutes ? ` — ${minutes} min` : ''}. WALK walks it off.`, pose: 'happy' })
  }
  if (snap.weight != null && weight.value != null) {
    const d = Math.round((weight.value - snap.weight) * 10) / 10
    if (Math.abs(d) >= 1.5) news.push({ line: `${d < 0 ? 'down' : 'up'} ${Math.abs(d)} lb since its last look — ${snap.weight} → ${weight.value}.`, pose: 'thinking' })
  }
  const newDays = loggedDays.value - snap.loggedDays
  if (!broke && newDays >= 2) {
    news.push({ line: `${newDays} days logged since its last look — ${streak.value} in a row now.`, event: newDays >= 5 ? 'celebrate' : undefined })
  }
  return news.slice(0, 3)
}

async function tell(item: News) {
  line.value = item.line
  if (item.event) pet.value?.trigger(item.event)
  if (!item.pose || busy.value) return
  actionPose.value = item.pose
  await wait(1500)
  if (actionPose.value === item.pose) actionPose.value = null
}

// A clean week: one salute a day while it lasts (the gold star stays on regardless).
const SALUTE_KEY = 'ticker:saluted'

async function salute() {
  record(SALUTE_KEY, today.value)
  const n = weekTally.value?.hit ?? 0
  line.value = `clean week — ${n} of ${n} due doses logged${cycleClause.value}. (salute)`
  if (busy.value) return
  actionPose.value = 'salute'
  await wait(1700)
  if (actionPose.value === 'salute') actionPose.value = null
}

// Newly earned accessories: announced once each, then simply worn.
const UNLOCKS_KEY = 'ticker:unlocks'
const freshUnlocks = computed(() => {
  let seen: string[] = []
  try {
    seen = JSON.parse(localStorage.getItem(UNLOCKS_KEY) ?? '[]') as string[]
  }
  catch { /* every unlock is news, then */ }
  return earned.value.filter(u => !seen.includes(u.prop))
})

function announceUnlocks() {
  const fresh = freshUnlocks.value
  if (!fresh.length) return
  record(UNLOCKS_KEY, JSON.stringify(earned.value.map(u => u.prop)))
  line.value = `TICKER earned ${fresh.map(u => u.name).join(', ')} — ${fresh.map(u => `${u.goal.toLocaleString('en-US')} ${u.unit}`).join('; ')}. ♥`
  pet.value?.trigger('celebrate')
}

// Greet (the clock above has ticked by now, so a late visit finds it asleep), then react to each
// thing that has happened in turn once it has settled in — the home digest's stagger, then a
// beat between reactions so each line gets read. The snapshot is written last, so the next
// visit's news starts from what it saw today.
onMounted(() => {
  quoteIdx = Math.floor(Math.random() * 1000)
  lastVisit.value = loadSnapshot()
  if (awayDays.value >= 3) sitting.value = true // it sat down to wait; any press stands it up
  line.value = arrivalLine()
  const reactions: Array<() => void> = []
  if (sodasToday.value) reactions.push(flinch)
  if (lastVisit.value) for (const item of newsSince(lastVisit.value)) reactions.push(() => tell(item))
  if (birthday.value && firstTime(BIRTHDAY_KEY, today.value)) reactions.push(celebrateBirthday)
  if (landedPending.value) reactions.push(resultsLanded)
  if (cleanWeek.value && firstTime(SALUTE_KEY, today.value)) reactions.push(salute)
  if (freshUnlocks.value.length) reactions.push(announceUnlocks)
  reactions.forEach((react, i) => timers.push(setTimeout(react, 800 + i * 2200)))
  record(SNAPSHOT_KEY, JSON.stringify(snapshotNow()))
})
</script>

<style scoped>
.stage {
  transition: background-color 0.6s ease;
}
.stage.night {
  background: var(--color-bg);
}

/* The window: a four-pane frame on the left wall whose glass follows the hour. */
.window {
  position: absolute;
  top: 22px;
  left: 44px;
  width: 46px;
  height: 38px;
  border: 2px solid var(--color-line-accent);
  background: var(--sky);
  pointer-events: none;
  transition: background-color 0.6s ease;
}
.window::before,
.window::after {
  content: '';
  position: absolute;
  background: var(--color-line-accent);
}
.window::before { left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; }
.window::after { top: 50%; left: 0; right: 0; height: 2px; margin-top: -1px; }
.sky-day { --sky: #1c3a47; }
.sky-golden { --sky: #4a3418; }
.sky-night { --sky: #0a1020; }
.pane-glyph {
  position: absolute;
  top: 1px;
  left: 5px;
  font-size: 13px;
  line-height: 1;
  color: var(--color-warn);
}
.sky-night .pane-glyph {
  left: auto;
  right: 5px;
  color: var(--color-faint);
}
.star {
  position: absolute;
  font-size: 12px;
  line-height: 1;
  color: var(--color-ghost);
  animation: star-twinkle 3.4s ease-in-out infinite;
}
.star-1 { top: 2px; left: 6px; }
.star-2 { bottom: 3px; right: 7px; animation-delay: 1.4s; }
@keyframes star-twinkle {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
.clock {
  position: absolute;
  top: 64px;
  left: 44px;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--color-ghost);
  pointer-events: none;
}

/* The floor line, and the bed that stands on it at night: a mattress the feet rest on, a pillow
   at the head end, a headboard. */
.floor {
  position: absolute;
  left: 14px;
  right: 14px;
  height: 0;
  border-top: 1px dashed var(--color-line-accent);
  pointer-events: none;
}
.bed {
  position: absolute;
  left: 50%;
  width: 120px;
  height: 6px;
  transform: translateX(-50%);
  background: #22303d;
  pointer-events: none;
}
.bed .headboard {
  position: absolute;
  left: -3px;
  bottom: 0;
  width: 3px;
  height: 28px;
  background: var(--color-line-accent);
}
.bed .pillow {
  position: absolute;
  left: 4px;
  bottom: 6px;
  width: 22px;
  height: 6px;
  border-radius: 2px;
  background: #6f8aa0;
}

/* Corner cobwebs: spokes and three sagging strands, drawn once and flipped into each corner. */
.web {
  position: absolute;
  fill: none;
  stroke: var(--color-ghost);
  stroke-width: 0.8;
  opacity: 0.7;
}
.web-1 { top: 0; left: 0; }
.web-2 { bottom: 0; right: 0; transform: rotate(180deg); }
.web-3 { top: 0; right: 0; transform: scaleX(-1); }

.pet-heart {
  position: absolute;
  bottom: 150px;
  font-size: 13px;
  color: var(--color-danger);
  pointer-events: none;
  animation: pet-heart-float 1.05s ease-out forwards;
}
@keyframes pet-heart-float {
  0% { opacity: 0; transform: translateY(6px) scale(0.6); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-26px) scale(1.15); }
}
@media (prefers-reduced-motion: reduce) {
  .stage,
  .window { transition: none; }
  .star { animation: none; opacity: 0.7; }
  .pet-heart { animation: none; opacity: 0.8; }
}
</style>
