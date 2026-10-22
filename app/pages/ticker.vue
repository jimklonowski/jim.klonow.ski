<template>
  <div class="px-4 sm:px-6 py-4 max-w-3xl mx-auto">
    <TuiHeader
      label="TICKER · RESIDENT COMPANION"
      :dashes="8"
    >
      <!-- The tagline is wider than a phone; the header keeps its title there and the hint under the buttons says the same. -->
      <span class="hidden sm:inline text-label text-muted normal-case">it lives off the data you already log — nothing here to maintain</span>
    </TuiHeader>

    <!-- Stage. Tall enough for the lg figure with a hat on (19 sprite rows), its EKG and captions,
         the beat's upward stretch and the celebrate hop, with ~25px to spare above the hat. -->
    <div
      ref="stage"
      class="stage relative mt-3 h-68 bg-raised border border-line-soft overflow-hidden"
      :class="{ night, 'in-game': playing }"
      :style="playing && playing !== 'runner' && gameHeight ? { height: `${gameHeight}px` } : undefined"
      @mousemove="glance"
      @mouseleave="unglance"
      @contextmenu="e => playing && e.preventDefault()"
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

      <!-- the window: the sky by the hour (sun, golden hour, moon and stars), a clock under it.
           Not during the crusher: its wall takes the width, and on a phone the widest row ran
           behind them. -->
      <div
        v-if="!playing || playing === 'runner'"
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
        v-if="!playing || playing === 'runner'"
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

      <!-- a game takes the stage over; the figure comes back when it quits -->
      <TickerRunner
        v-if="playing === 'runner'"
        ref="runner"
        :build="build"
        :accessories="worn"
        :night="night"
        :hi="houseBestOf('runner')"
        @over="score => onGameOver('runner', score, false)"
        @quit="onGameQuit"
      />
      <TickerBreakout
        v-else-if="playing === 'crusher'"
        ref="runner"
        :build="build"
        :accessories="worn"
        :night="night"
        :hi="houseBestOf('crusher')"
        :cans="crusherWall.cans"
        :seed="daySeed"
        :paddle-scale="paddleScale"
        :lives="crusherLives"
        :title="crusherWall.title"
        :practice="crusherWall.practice"
        @fit="h => gameHeight = h"
        @over="(score, cleared) => onGameOver('crusher', score, cleared)"
        @quit="onGameQuit"
      />
      <TickerWorld
        v-else-if="playing === 'world'"
        ref="runner"
        :build="build"
        :accessories="worn"
        :night="night"
        :hi="houseBestOf('world')"
        :days="worldDays"
        :seed="daySeed"
        :lives="crusherLives"
        @fit="h => gameHeight = h"
        @over="(score, cleared, feats, summary) => onGameOver('world', score, cleared, feats, summary)"
        @quit="onGameQuit"
      />

      <div
        v-else
        class="absolute bottom-9 left-1/2 origin-bottom"
        :class="stretching ? 'transition-transform duration-300 ease-out' : 'transition-none'"
        :style="{ transform: `translateX(calc(-50% + ${x}px)) scaleX(${facing}) scaleY(${stretch})` }"
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
          :mood="mixing ? 'mixing' : talking ? 'talking' : null"
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
        class="absolute left-3 bottom-2.5 text-small text-muted truncate max-w-[calc(100%-1.5rem)]"
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
      <!-- FEED opens the plate: one row per dose (and per vial to mix), each fed on its own, or
           all of them in order. Rows fed this visit carry a check. -->
      <UDropdownMenu
        :items="feedItems"
        :content="{ align: 'start' }"
        :disabled="busy || !dosesToday.length"
        :ui="{ content: 'min-w-60 font-mono', itemLabel: 'text-small' }"
      >
        <button
          type="button"
          class="tui-btn disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="busy || !dosesToday.length"
          :title="dosesToday.length ? 'Pick a dose to feed, or feed the whole plate' : 'Nothing logged today yet — TICKER only eats what the journal says'"
        >
          ⊳ FEED{{ dosesToday.length ? ` · ${fedThisVisit.size ? `${fedThisVisit.size}/` : ''}${dosesToday.length}` : '' }}
        </button>
      </UDropdownMenu>
      <button
        type="button"
        class="tui-btn disabled:opacity-50"
        :disabled="busy"
        @click="walk"
      >
        ⊳ WALK{{ workoutMinutes ? ` · ${workoutMinutes}m` : '' }}
      </button>
      <!-- PLAY opens the games, each row with its house record; QUIT while one is on. -->
      <button
        v-if="playing"
        type="button"
        class="tui-btn"
        @click="runner?.quit()"
      >
        ■ QUIT
      </button>
      <UDropdownMenu
        v-else
        :items="playItems"
        :content="{ align: 'start' }"
        :disabled="busy"
        :ui="{ content: 'min-w-60 font-mono', itemLabel: 'text-small' }"
      >
        <button
          type="button"
          class="tui-btn disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="busy"
        >
          ⊳ PLAY
        </button>
      </UDropdownMenu>
      <span class="ml-auto text-label text-faint">derived from the journal — talking quotes it, feed picks a dose (or the whole plate), walking replays what's logged; play is just play</span>
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
        <p class="mt-1 text-prose text-hi num-display">
          {{ s.value }}
        </p>
        <p
          v-if="s.hint"
          class="mt-0.5 text-micro leading-tight text-faint"
        >
          {{ s.hint }}
        </p>
      </div>
    </div>

    <p class="mt-2.5 text-small leading-[1.7] text-muted">
      TICKER's day, read from the data: {{ todaySummary }}
    </p>

    <!-- Achievements: every milestone it can reach, earned (dated) or with its progress; the four
         wearables are the rewards on four of them. All derived, none can be lost. -->
    <section
      class="mt-4"
      aria-label="TICKER's achievements"
    >
      <TuiHeader
        label="TICKER · ACHIEVEMENTS"
        :dashes="4"
      >
        <span class="text-label text-faint">{{ earnedCount }} of {{ achievementCards.length }}</span>
      </TuiHeader>
      <ul class="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px bg-line-soft border border-line-soft">
        <li
          v-for="a in achievementCards"
          :key="a.id"
          class="bg-raised px-2.5 py-2 flex gap-2.5 min-w-0"
          :class="a.earned ? '' : 'opacity-75'"
          :title="a.earned ? `${a.name} — ${a.desc}` : `${a.progress.toLocaleString('en-US')} of ${a.goal.toLocaleString('en-US')} ${a.unit}`"
        >
          <UIcon
            :name="a.icon"
            class="size-4 shrink-0 mt-0.5"
            :class="a.earned ? 'text-accent' : 'text-faint'"
          />
          <div class="min-w-0 flex-1">
            <p class="text-small text-hi flex items-baseline gap-1.5 min-w-0">
              <span class="truncate">{{ a.name }}</span>
              <span
                v-if="a.reward"
                class="tui-label text-[8.5px] shrink-0"
              >wearable</span>
            </p>
            <p class="text-label leading-tight text-faint">
              {{ a.desc }}
            </p>
            <p
              v-if="a.earned"
              class="mt-1 text-micro text-accent"
            >
              earned{{ a.date ? ` ${formatDate(a.date, 'monthDay')}${a.date.slice(0, 4) !== today.slice(0, 4) ? ` ${a.date.slice(0, 4)}` : ''}` : '' }}
            </p>
            <template v-else>
              <UProgress
                :model-value="a.progress"
                :max="a.goal"
                size="2xs"
                class="mt-1.5"
              />
              <p class="mt-0.5 text-micro text-faint tabular-nums">
                {{ a.progress.toLocaleString('en-US') }} / {{ a.goal.toLocaleString('en-US') }} {{ a.unit }}
              </p>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <!-- The log: the remark line above truncates and each line replaces the last, so the last ten
         are kept here in full, newest first, for a quote that ran long or a reaction you missed. -->
    <section
      v-if="log.length"
      class="mt-4"
      aria-label="TICKER's recent remarks"
    >
      <TuiHeader
        label="TICKER · LOG"
        :dashes="4"
      >
        <span class="text-label text-faint">last {{ log.length }} of today</span>
      </TuiHeader>
      <ol class="mt-2 border-l border-line-soft pl-3 text-meta leading-[1.6]">
        <li
          v-for="(entry, i) in log"
          :key="entry.id"
          class="flex gap-2.5"
          :class="i === 0 ? 'text-dim' : 'text-faint'"
        >
          <span class="shrink-0 tabular-nums text-ghost">{{ entry.at }}</span>
          <span>{{ entry.text }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
// The resident companion as a pet. Everything it feels is DERIVED from streams that already
// exist — doses fed, workouts walked, sodas regretted, sleep slept — so there is nothing to
// forget to do. Petting is the one pure interaction. What it remembers (the pet counter, the
// runner's record, which things it has already reacted to) lives in the database for the owner
// and in the browser for the demo pet — see the memory section.
import { isLoggedDay, loggedStreak, longestLoggedStreak } from '#shared/utils/journalLog'
import { diffDays, shiftDays } from '#shared/utils/dates'
import { localTimeNow } from '#shared/utils/time'
import { isSluggish, latestRecovery, latestSleepMin } from '#shared/utils/petState'
import { formatDuration } from '~/data/health-metrics'
import { countdownLabel, drawLabel, nextPlannedDraw } from '#shared/utils/plannedDraws'
import { PROTOCOL_RULES, scheduledFor, tallySchedule } from '#shared/utils/protocolRules'
import { cycleProgress, cycleStatusOn, relevantCycle } from '#shared/utils/cycles'
import { mergePatch } from '#shared/utils/mergePatch'
import { sodaOunces } from '#shared/utils/soda'
import type { CanInput } from '#shared/utils/tickerBreakout'
import type { DayInput, HitBy, WorldFeat, WorldSummary } from '#shared/utils/tickerWorld'
import {
  LEAN_GAIN_LBS, MANE_TIERS, TIER_DAYS, ageDays as ageDaysOf, buildOf, firstLoggedDay,
  finasterideStreak as finasterideStreakOf, leanGain as leanGainOf, loggedDayCount, maneTier as maneTierOf,
  nextManeTier, sortedScans, wearableMilestones
} from '#shared/utils/tickerWardrobe'
import type { WardrobeInputs } from '#shared/utils/tickerWardrobe'
import type { TickerBuild, TickerPose, TickerProp } from '#shared/utils/tickerSprite'
import type { TickerBest, TickerGame, TickerPets, TickerRecord, TickerRunResponse, TickerStateResponse } from '#shared/types/ticker'
import type { DropdownMenuItem } from '@nuxt/ui'

// The card a pasted link shows (crawlers actually read it off /labs/login?for=ticker, where a
// signed-out /ticker lands); the image is drawn live by server/routes/ticker/og.png.get.ts.
useSeoMeta({
  title: 'Ticker',
  ogTitle: 'TICKER · resident companion',
  ogDescription: 'A pixel heart that lives off the data already logged — fed by the dose log, walked by the workouts, dressed by the milestones.',
  ogImage: 'https://jim.klonow.ski/ticker/og.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'TICKER, the pixel heart, standing on its stage',
  twitterCard: 'summary_large_image'
})

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

// --- memory: where the pet keeps what it remembers --------------------------------------------
// The owner's TICKER remembers in the database (migration 0009, /api/ticker/state), so it is the
// same pet on the phone and the desktop. The demo sandbox is shared by every demo visitor, so its
// pet keeps its memory in the browser, as it always did. A guest holds no memory of their own:
// they leave footprints, pets and runs through their own endpoints, and the owner's pet mentions
// them on its next look.

/** Whose pet it is: the keeper gets the reactions, the news and the stamps; a guest gets a hello. */
const keeper = role.value === 'owner' || role.value === 'demo'
/** Memory on the server (owner and guests) or in this browser (demo). */
const remote = role.value != null && role.value !== 'demo'
const requestFetch = useRequestFetch()
const { data: memoryData } = remote
  ? await useAsyncData('ticker-state', () => requestFetch<TickerStateResponse>('/api/ticker/state'), {
      getCachedData: (key, app, ctx) => ctx.cause === 'initial' ? app.payload.data[key] : undefined
    })
  : { data: ref<TickerStateResponse | null>(null) }
const memory = reactive<Record<string, unknown>>({ ...(memoryData.value?.state ?? {}) })
const visits = computed(() => memoryData.value?.visits ?? null)
const visitorLabel = computed(() => memoryData.value?.me.label ?? null)

// Browser memory is read only once mounted. During hydration the setup-time reads returned the
// stored values while the server had rendered the defaults, so the demo pet hydrated with a PETS
// tile, a FEED count and a HI that didn't match its markup. Registered here, before the hooks
// below that re-read each setup-time recall(), so it flips first.
let hydrated = false
onMounted(() => {
  hydrated = true
})

/** What it remembers under a key: the server's copy, or the browser's for the demo pet. */
function recall<T>(key: string): T | null {
  if (remote) return (memory[key] as T | undefined) ?? null
  if (import.meta.server || !hydrated) return null
  try {
    const raw = localStorage.getItem(`ticker:${key}`)
    if (raw == null) return null
    try {
      return JSON.parse(raw) as T
    }
    catch {
      return raw as unknown as T // a plain stamp from before the memory was JSON
    }
  }
  catch {
    return null
  }
}

/**
 * Remember something: the server for the owner, the browser for the demo pet, nowhere for a
 * guest. `merge` folds an object into what is stored (json_patch on the server, the same rule on
 * the mirror here) instead of replacing it, so a fed check made on the phone and one made on the
 * desktop both survive — whole-object writes were last-writer-wins across devices.
 */
function remember(key: string, value: unknown, merge = false) {
  const next = merge ? mergePatch(remote ? memory[key] : recall(key), value) : value
  memory[key] = next
  if (remote) {
    if (role.value === 'owner') $fetch('/api/ticker/state', { method: 'POST', body: { key, value, merge } }).catch(() => { /* it'll remember next time */ })
  }
  else {
    try {
      localStorage.setItem(`ticker:${key}`, JSON.stringify(next))
    }
    catch { /* a private window — the demo pet forgets on close, which is fine */ }
  }
}

// --- the clock on the wall --------------------------------------------------------------------
// The HOME timezone's clock (shared/utils/time.ts), not the viewer's: it is one pet in one place,
// so a friend visiting from another timezone finds it awake or asleep by its own evening, not
// theirs. Null until mounted, so the server and the first client paint agree on a daytime stage.

const DUSK_HOUR = 19
const BEDTIME_HOUR = 22
const WAKE_HOUR = 6

/** "HH:MM" in the home timezone, 24-hour. */
const now = ref<string | null>(null)
const hour = computed(() => now.value == null ? null : Number(now.value.slice(0, 2)))
const night = computed(() => hour.value != null && (hour.value >= DUSK_HOUR || hour.value < WAKE_HOUR))
const asleep = computed(() => hour.value != null && (hour.value >= BEDTIME_HOUR || hour.value < WAKE_HOUR))

/** What the window shows: the sun by day, amber around dawn and dusk, the moon and stars at night. */
const sky = computed<'day' | 'golden' | 'night'>(() => {
  const h = hour.value
  if (h == null) return 'day'
  if (night.value) return 'night'
  return h < 8 || h >= 17 ? 'golden' : 'day'
})
/** The clock under the window, 12-hour: "3:14 pm". */
const clock = computed(() => {
  if (now.value == null || hour.value == null) return ''
  const h12 = hour.value % 12 || 12
  return `${h12}:${now.value.slice(3, 5)} ${hour.value < 12 ? 'am' : 'pm'}`
})

let clockTimer: ReturnType<typeof setTimeout> | undefined
let clockInterval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  const tick = () => {
    now.value = localTimeNow()
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

// The pet's mood inputs come from the one shared read (shared/utils/petState.ts) so this page and
// the home page agree: recovery = newest SCORED day (the last row is null until Whoop scores it),
// sluggish = under six hours enters, only seven clears (the home page's hysteresis — a flat
// seven-hour line here had the two pets in different moods on a 6h40m night).
const recovery = computed(() => latestRecovery(healthData.value ?? []))
const sleepMin = computed(() => latestSleepMin(healthData.value ?? []))
const sluggish = computed(() => isSluggish(healthData.value ?? []))
// The shared formatter rounds the total before splitting — this page's own copy read "6h 59.7m".
const fmtSleep = formatDuration
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

// The first hand-logged day is the pet's hatch date (shared/utils/tickerWardrobe.ts): the
// watch's vitals go back years further, but that is its prehistory — it was born with the journal.
const firstDate = computed(() => firstLoggedDay(entries.value))
const ageDays = computed(() => ageDaysOf(entries.value, today.value))
/** How old it turns today, when today is the anniversary of the first logged day; null otherwise. */
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
  const nightBest = best(health, h => h.sleep_total_min, 'max')
  if (nightBest) lines.push(`best night: ${fmtSleep(nightBest.value)} on ${when(nightBest.item.date)}.`)
  const calm = best(entries.value, e => e.rhr, 'min')
  if (calm) lines.push(`lowest resting HR: ${calm.value} bpm on ${when(calm.item.date)}.`)
  if (runnerHi.value) lines.push(`best run: ${runnerHi.value.score} points on ${when(runnerHi.value.date)}.`)
  if (crusherHi.value) lines.push(`best crush: ${crusherHi.value.score} points on ${when(crusherHi.value.date)}${crusherHi.value.cleared ? ' — and a whole wall cleared, once.' : '.'}`)
  if (worldHi.value) lines.push(`best month: ${worldHi.value.score} points on ${when(worldHi.value.date)}${worldHi.value.cleared ? ' — and made it all the way home, once.' : '.'}`)
  return lines
})

// --- the wardrobe and the build (shared/utils/tickerWardrobe.ts) -------------------------------
// The four wearables, the tier, the arms and the belly all come from the data through the module
// the home dashboard's companion reads too, so it is the same pet on both pages.

const wardrobeInputs = computed<WardrobeInputs>(() => ({
  entries: entries.value,
  workouts: workoutsData.value ?? [],
  scans: dexaData.value ?? [],
  today: today.value
}))
const loggedDays = computed(() => loggedDayCount(entries.value))
const milestones = computed(() => wearableMilestones(wardrobeInputs.value))
const earned = computed(() => milestones.value.filter(m => m.progress >= m.goal))

const build = computed<TickerBuild>(() => buildOf(wardrobeInputs.value))
const tier = computed(() => build.value.tier!)
const arms = computed(() => build.value.arms!)
const bellyRead = computed(() => build.value.belly!)
const scans = computed(() => sortedScans(dexaData.value ?? []))
const latestScan = computed(() => scans.value.at(-1) ?? null)
const leanGain = computed(() => leanGainOf(scans.value))

// --- achievements -------------------------------------------------------------------------------
// The four wearables are the rewards on four of these; the rest are just achievements. All are
// derived, so none can be lost; the memory holds the day each was first noticed (see
// announceAchievements), which is the date the panel shows. The older 'unlocks' key (a list of
// the four props) reads as earned on an unknown day.

interface Achievement {
  id: string
  name: string
  desc: string
  icon: string
  goal: number
  progress: number
  unit: string
  reward?: TickerProp
}

const WEARABLE_META: Partial<Record<TickerProp, { id: string, name: string, desc: string, icon: string }>> = {
  crown: { id: 'crown', name: 'Hundred Days', desc: 'a hundred logged days in a row — the crown', icon: 'i-lucide-crown' },
  sweatband: { id: 'sweatband', name: 'Hundred Hours', desc: 'six thousand workout minutes — the sweatband', icon: 'i-lucide-dumbbell' },
  shades: { id: 'shades', name: 'A Year Together', desc: 'a year since the first logged day — the shades', icon: 'i-lucide-glasses' },
  medal: { id: 'medal', name: 'Two Fifty', desc: 'two hundred and fifty logged days — the medal', icon: 'i-lucide-medal' }
}

// Achievements the demo persona can never earn, so they are not shown to it (audit #42 item 29):
// Clean Week needs schedule rules (the sandbox has none — `rulesApply`), Luscious ninety days of
// finasteride (not in the seed), Open House visits from friends (the sandbox gets none).
const DEMO_UNREACHABLE = new Set(['clean-week', 'luscious', 'open-house'])

const achievements = computed<Achievement[]>(() => allAchievements.value.filter(a => role.value !== 'demo' || !DEMO_UNREACHABLE.has(a.id)))

const allAchievements = computed<Achievement[]>(() => [
  ...milestones.value.map(m => ({ ...WEARABLE_META[m.prop]!, goal: m.goal, progress: m.progress, unit: m.unit, reward: m.prop })),
  { id: 'grown', name: 'Hatched', desc: 'thirty logged days — it grew limbs', icon: 'i-lucide-egg', goal: TIER_DAYS.grown, progress: loggedDays.value, unit: 'logged days' },
  { id: 'elder', name: 'Elder', desc: 'five hundred logged days — the cane', icon: 'i-lucide-hourglass', goal: TIER_DAYS.elder, progress: loggedDays.value, unit: 'logged days' },
  { id: 'clean-week', name: 'Clean Week', desc: 'seven days with every due dose logged', icon: 'i-lucide-star', goal: 1, progress: cleanWeek.value ? 1 : 0, unit: 'clean week' },
  { id: 'luscious', name: 'Luscious', desc: 'ninety days of finasteride — the full mane', icon: 'i-lucide-sparkles', goal: 90, progress: finasterideStreak.value, unit: 'days of finasteride' },
  { id: 'runner-500', name: 'Runner', desc: 'five hundred points on the runner', icon: 'i-lucide-footprints', goal: 500, progress: runnerHi.value?.score ?? 0, unit: 'points' },
  { id: 'runner-1000', name: 'Marathon', desc: 'a thousand points on the runner', icon: 'i-lucide-trophy', goal: 1000, progress: runnerHi.value?.score ?? 0, unit: 'points' },
  { id: 'crusher-300', name: 'Can Crusher', desc: 'three hundred points on the can crusher', icon: 'i-lucide-cup-soda', goal: 300, progress: crusherHi.value?.score ?? 0, unit: 'points' },
  { id: 'clean-sweep', name: 'Clean Sweep', desc: 'every can on the wall, cleared', icon: 'i-lucide-check-check', goal: 1, progress: crusherHi.value?.cleared ? 1 : 0, unit: 'wall' },
  { id: 'made-it-home', name: 'Made It Home', desc: 'the whole month, left to right, to the castle', icon: 'i-lucide-castle', goal: 1, progress: worldHi.value?.cleared ? 1 : 0, unit: 'month' },
  { id: 'clean-month', name: 'Clean Month', desc: 'every soda can in the month, crushed', icon: 'i-lucide-cup-soda', goal: 1, progress: worldFeat('clean-month'), unit: 'month' },
  { id: 'no-hit-week', name: 'No-Hit Week', desc: 'a whole week of the month without a scratch', icon: 'i-lucide-shield', goal: 1, progress: worldFeat('no-hit-week'), unit: 'week' },
  { id: 'chain-3', name: 'Chain of Three', desc: 'a kicked can that crushed three in a row', icon: 'i-lucide-link', goal: 1, progress: worldFeat('chain-3'), unit: 'chain' },
  { id: 'petted', name: 'Well Petted', desc: 'a hundred pats, all time', icon: 'i-lucide-hand-heart', goal: 100, progress: pets.value.total, unit: 'pets' },
  { id: 'open-house', name: 'Open House', desc: 'five visits from friends', icon: 'i-lucide-door-open', goal: 5, progress: visits.value?.total ?? 0, unit: 'visits' },
  { id: 'pincushion', name: 'Pincushion', desc: 'ten blood draws on file', icon: 'i-lucide-test-tube', goal: 10, progress: drawDates.value.length, unit: 'draws' },
  { id: 'before-after', name: 'Before and After', desc: 'two DEXA scans to compare', icon: 'i-lucide-scan', goal: 2, progress: scans.value.length, unit: 'scans' }
])

const ACHIEVEMENTS_KEY = 'achievements'
function achievementDatesFromMemory(): Record<string, string> {
  const saved = recall<Record<string, string>>(ACHIEVEMENTS_KEY)
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved
  const old = recall<string[]>('unlocks')
  return Array.isArray(old) ? Object.fromEntries(old.map(p => [p, ''])) : {}
}
/** id → the day it was first noticed; '' for ones carried over from before the ledger. */
const achievementDates = ref<Record<string, string>>(achievementDatesFromMemory())
onMounted(() => {
  if (!remote) achievementDates.value = achievementDatesFromMemory()
})

const achievementCards = computed(() => achievements.value.map((a) => {
  const date = achievementDates.value[a.id]
  return { ...a, earned: date != null || a.progress >= a.goal, date: date || null }
}))
const earnedCount = computed(() => achievementCards.value.filter(a => a.earned).length)
/** The unearned one it is closest to, by share of the way there. */
const nextAchievement = computed(() => achievementCards.value
  .filter(a => !a.earned)
  .sort((a, b) => (b.progress / b.goal) - (a.progress / a.goal))[0] ?? null)

// --- discipline: a clean week of doses earns the gold star ----------------------------------
// The trailing seven days scored against the same merged rules as the hunger meter; today only
// counts once logged (tallySchedule's rule), so a morning never reads as a miss.

/** Which dates each compound was dosed on — what the schedule is scored against. */
const doseDates = computed(() => {
  const out = new Map<string, Set<string>>()
  for (const e of entries.value) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      let set = out.get(p.compound)
      if (!set) out.set(p.compound, set = new Set())
      set.add(e.date)
    }
  }
  return out
})
const weekTally = computed(() => {
  if (!rulesApply) return null
  const tallies = tallySchedule(rules.value, shiftDays(today.value, -6), today.value, doseDates.value, today.value)
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
/** True while the feed reconstitutes a vial: the companion rocks it (the swirl). */
const mixing = ref(false)
const poseOverride = computed(() => actionPose.value ?? (sitting.value && !asleep.value ? 'sit' : heldPose.value))
/** True for the length of a walk with a workout behind it: the carried prop shows. */
const walking = ref(false)

// --- what the compounds leave on it ---------------------------------------------------------
// The finasteride mane grows with the finasteride streak — stubble after a week, a mane after a
// month, luscious after three — and the feed animates it in tier by tier. The BPC bandage is on
// for any day BPC was logged. The flex, the stretch, the proud beat and the glow are one-shots in
// afterEffect() below.

const finasterideStreak = computed(() => finasterideStreakOf(entries.value, today.value))
/** 0–3: how many mane tiers the streak has reached. */
const maneTier = computed(() => maneTierOf(entries.value, today.value))
const nextMane = computed(() => nextManeTier(entries.value, today.value))
/** While the feed grows the mane in, the tier on show; null means the earned one. */
const maneGrow = ref<number | null>(null)
const bandaged = computed(() => dosesToday.value.some(d => /bpc/i.test(d.compound)))

/** The HGH stretch: a scaleY on the figure for a beat, with a transition only while it plays. */
const stretch = ref(1)
const stretching = ref(false)

/** The bowl shows what the plate held once it is fed: capsules, syringes, or one of each. */
const bowl = computed<TickerProp>(() => {
  if (hunger.value !== 'fed') return 'bowl-empty'
  const shots = dosesToday.value.some(d => isInjected(d.compound))
  const pills = dosesToday.value.some(d => !isInjected(d.compound))
  return shots && pills ? 'bowl-mixed' : shots ? 'bowl-shots' : 'bowl-full'
})

/** Poses whose face is the point: the shades come off for them and go back on after. */
const BARE_EYED = new Set<TickerPose>(['eating', 'gulp', 'jab1', 'jab2', 'mixing', 'petted', 'asleep'])

/**
 * The props layer, in paint order. The bowl shows what has been served today; one thing on the
 * left lobe at a time (the party hat on its birthday, the cap on a walk, else the crown if
 * earned); the other walk props and the earned wearables — the shades except where the eyes
 * matter; the gold star for a clean week; and the vet visit's calendar from three days out, with
 * the lab coat on the day.
 */
const accessories = computed<TickerProp[]>(() => {
  const out: TickerProp[] = [bowl.value]
  const worn = new Set(earned.value.map(m => m.prop))
  const carried = walking.value ? walkProp.value : null
  const mane = maneGrow.value ?? maneTier.value
  if (mane) out.push(MANE_TIERS[mane - 1]!.prop) // before the hats, so a hat sits on the hair
  if (birthday.value) out.push('party-hat')
  else if (carried === 'cap') out.push('cap')
  else if (worn.has('crown')) out.push('crown')
  if (carried && carried !== 'cap') out.push(carried)
  if (worn.has('sweatband')) out.push('sweatband')
  if (worn.has('shades') && !BARE_EYED.has(poseOverride.value ?? 'idle')) out.push('shades')
  if (worn.has('medal')) out.push('medal')
  if (cleanWeek.value) out.push('gold-star')
  if (bandaged.value) out.push('bandage')
  const d = nextDraw.value
  if (d && (d.status === 'today' || d.status === 'overdue' || d.inDays <= 3)) out.push('calendar')
  if (d?.status === 'today') out.push('lab-coat')
  return out
})
const x = ref(0)
const facing = ref(1)
const line = ref('')

// The log keeps the last ten distinct remarks of this visit with the clock they were said at.
interface LogEntry { id: number, at: string, text: string }
const LOG_MAX = 10
const log = ref<LogEntry[]>([])
let logId = 0
watch(line, (text) => {
  const said = text.trim()
  if (!said || log.value[0]?.text === said) return
  log.value = [{ id: ++logId, at: clock.value, text: said }, ...log.value].slice(0, LOG_MAX)
})
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

// Petting. The count is the server's for the owner and for guests (whose pats also land in their
// footprint for the day); the demo pet counts in the browser, read after hydration.
const pets = ref<TickerPets>(recall<TickerPets>('pets') ?? { total: 0, date: today.value, today: 0 })
const petsToday = computed(() => pets.value.date === today.value ? pets.value.today : 0)
onMounted(() => {
  if (!remote) pets.value = recall<TickerPets>('pets') ?? pets.value
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
  const next: TickerPets = { total: pets.value.total + 1, date: today.value, today: petsToday.value + 1 }
  pets.value = next
  if (remote) {
    $fetch<TickerPets>('/api/ticker/pet', { method: 'POST' })
      .then((p) => {
        pets.value = p
      })
      .catch(() => { /* counted here for now; the server's figure wins next load */ })
  }
  else {
    remember('pets', next)
  }

  spawnHeart(Math.random() * 36 - 18)
  line.value = asleep.value ? '(it stirs, smiles… and goes back to sleep)' : SQUEAKS[Math.min(petsToday.value - 1, SQUEAKS.length - 1)]!
  pet.value?.trigger('celebrate')
  if (busy.value) return // mid-walk pats are allowed; don't fight the walk's poses
  actionPose.value = 'petted'
  await wait(1300)
  if (actionPose.value === 'petted') actionPose.value = null
}

// The feed walks the day's doses one at a time. An injectable (the standing rule says so, or the
// compound comes as a vial) is a two-frame jab — syringe raised with a wince, then in with the
// brave face and one big beat; a pill is the capsule lift, then a gulp with a glass of water.
// Each dose gets its own line, with a word for the compounds it knows.
const FEED_QUIPS: Array<{ match: RegExp, jab?: string, swallow?: string }> = [
  { match: /testosterone/i, jab: 'oil — it took a second to push.' },
  { match: /hgh|growth/i, jab: 'the small one. barely a pinch.' },
  { match: /hcg/i, jab: 'quick one. it didn\'t look.' },
  { match: /bpc/i, jab: 'right where it was sore.' },
  { match: /finasteride/i, swallow: 'the little one. for the mane, someday.' }
]

// Anything the compound catalogue doesn't know defaults to a vial, so the pills it has never heard
// of (the iron protocol, a vitamin) are named here rather than jabbed.
const ORAL_WORDS = /iron|ferr|vitamin|magnesium|zinc|omega|creatine|berberine|melatonin|caffeine|aspirin|nac\b|tablet|capsule|gummy/i

function isInjected(compound: string): boolean {
  if (PROTOCOL_RULES.some(r => r.compound === compound && r.injected)) return true
  if (ORAL_WORDS.test(compound)) return false
  return defaultVialForm(compound) === 'vial'
}

/** What a compound does to it once it's in: a beat of theatre per family, nothing for the rest. */
async function afterEffect(compound: string) {
  if (/testosterone/i.test(compound)) {
    line.value = 'testosterone. (flex)'
    actionPose.value = 'flex'
    await wait(1100)
    if (actionPose.value === 'flex') actionPose.value = null
  }
  else if (/hgh|growth/i.test(compound)) {
    line.value = 'growth hormone. it felt taller for a second.'
    stretching.value = true
    stretch.value = 1.15
    await wait(700)
    stretch.value = 1
    await wait(350)
    stretching.value = false
  }
  else if (/hcg/i.test(compound)) {
    line.value = 'hCG. the heart beats a little prouder.'
    pet.value?.trigger('bigbeat')
    await wait(750)
    pet.value?.trigger('bigbeat')
    await wait(750)
  }
  else if (/bpc/i.test(compound)) {
    line.value = 'BPC-157 — bandage on, right where it was sore.'
    await wait(900)
  }
  else if (/ghk/i.test(compound)) {
    line.value = 'GHK-Cu. skin glow. (the sparkles are not a metaphor.)'
    pet.value?.trigger('celebrate')
    await wait(1400)
  }
  else if (/finasteride/i.test(compound)) {
    await growMane()
  }
}

/**
 * The mane after a finasteride swallow. It remembers the tier it last showed: a new tier grows
 * in from there, tier by tier; the same tier just gets a comb (one big beat); a lower one — the
 * streak broke — is noted and remembered, so it can grow again.
 */
const MANE_KEY = 'mane'

async function growMane() {
  const tier = maneTier.value
  const days = finasterideStreak.value
  const shown = Math.min(recall<number>(MANE_KEY) ?? 0, 3)
  const next = nextMane.value
  const standing = tier ? `the mane: ${MANE_TIERS[tier - 1]!.name}. ${days} days of finasteride${next ? ` — ${next.name} at ${next.days}` : ''}.` : ''

  if (!tier) {
    if (shown) remember(MANE_KEY, 0)
    line.value = shown
      ? `the mane's gone — the streak broke. ${days ? `day ${days} of the next one` : 'it starts again'}; stubble at ${MANE_TIERS[0]!.days}.`
      : `finasteride. ${days ? `day ${days} — ` : ''}the mane takes a week to show.`
    await wait(900)
    return
  }
  if (tier > shown) {
    for (let t = shown + 1; t <= tier; t++) {
      maneGrow.value = t
      line.value = `the mane: ${MANE_TIERS[t - 1]!.name}…`
      await wait(360)
    }
    maneGrow.value = null
    remember(MANE_KEY, tier)
    line.value = standing
  }
  else if (tier < shown) {
    remember(MANE_KEY, tier)
    line.value = `the mane thinned to ${MANE_TIERS[tier - 1]!.name} — the streak broke. ${days} days on the new one.`
  }
  else {
    pet.value?.trigger('bigbeat')
    line.value = `${standing} it combed it.`
  }
  await wait(900)
}

/** The vials reconstituted on the meal day — mixed before anything is eaten. */
const mixesToday = computed(() => entries.value.find(e => e.date === mealDay.value)?.reconstitutions ?? [])
const unitLabel = (u: string) => u === 'iu' ? 'IU' : u
const recipeOf = (m: { vial_amount: number, vial_unit: string, bac_water_ml: number }) => `${m.vial_amount} ${unitLabel(m.vial_unit)} in ${m.bac_water_ml} mL`

// What's been fed off today's plate, remembered with the meal day so a reload (or the phone
// later) still shows the checks. Doses are keyed by label and running number rather than index,
// which holds when a dose is logged later in the day.
const FED_KEY = 'fed'
const doseKeys = computed(() => {
  const seen = new Map<string, number>()
  return dosesToday.value.map((d) => {
    const base = `${d.compound} ${d.dose} ${unitLabel(d.unit)}`
    const nth = (seen.get(base) ?? 0) + 1
    seen.set(base, nth)
    return `${base}#${nth}`
  })
})
/** The stored checks: `keys` is a map so two devices' checks merge; rows from before hold an array. */
type FedMemory = { date: string, keys: string[] | Record<string, unknown> }
function fedFromMemory(): Set<string> {
  const saved = recall<FedMemory>(FED_KEY)
  if (saved?.date !== mealDay.value || !saved.keys) return new Set()
  return new Set(Array.isArray(saved.keys) ? saved.keys : Object.keys(saved.keys))
}
const fedKeys = ref(fedFromMemory())
onMounted(() => {
  if (!remote) fedKeys.value = fedFromMemory()
})
watch(mealDay, () => {
  fedKeys.value = fedFromMemory()
})
/** Plate indices fed today. */
const fedThisVisit = computed(() => new Set(doseKeys.value.map((k, i) => fedKeys.value.has(k) ? i : -1).filter(i => i >= 0)))
function markFed(i: number) {
  const key = doseKeys.value[i]!
  fedKeys.value = new Set([...fedKeys.value, key])
  // The same day merges one check in, so a check made on another device isn't erased; a new
  // day (or a row from before the map) replaces the plate outright.
  const stored = recall<FedMemory>(FED_KEY)
  const merge = stored?.date === mealDay.value && !Array.isArray(stored.keys)
  remember(
    FED_KEY,
    { date: mealDay.value, keys: Object.fromEntries((merge ? [key] : [...fedKeys.value]).map(k => [k, 1])) },
    merge
  )
}

/** A reconstitution: the vial and the bac water, swirled, never shaken. */
async function mixOne(i: number, note = '') {
  const m = mixesToday.value[i]
  if (!m) return
  const recipe = recipeOf(m)
  line.value = `reconstituting ${m.compound} — ${recipe}…${note}`
  actionPose.value = 'mixing'
  mixing.value = true
  await wait(1700)
  mixing.value = false
  line.value = `${m.compound} mixed: ${recipe}. swirled, didn't shake.`
  await wait(600)
}

/** One dose off the plate: the jab or the swallow, its line, then whatever the compound does to it. */
async function doseOne(i: number, note = '') {
  const d = dosesToday.value[i]
  if (!d) return
  const label = `${d.compound} ${d.dose} ${unitLabel(d.unit)}`
  const quip = FEED_QUIPS.find(q => q.match.test(d.compound))
  const again = fedThisVisit.value.size > 0
  if (isInjected(d.compound)) {
    line.value = `${label} — jab…${note}`
    actionPose.value = 'jab1'
    await wait(650)
    actionPose.value = 'jab2'
    pet.value?.trigger('bigbeat')
    await wait(750)
    line.value = `${label} — in. ${quip?.jab ?? (again ? 'still didn\'t flinch.' : 'didn\'t flinch.')}`
  }
  else {
    line.value = `${label} — down the hatch…${note}`
    actionPose.value = 'eating'
    await wait(700)
    actionPose.value = 'gulp'
    await wait(650)
    line.value = `${label} — swallowed. ${quip?.swallow ?? 'with water, like a grown-up.'}`
  }
  await wait(500)
  await afterEffect(d.compound)
  markFed(i)
}

/** What to say once the plate is (or isn't) clear. */
function plateLine(): string {
  const left = dosesToday.value.length - fedThisVisit.value.size
  if (left > 0) return `${left} more on the plate.`
  return rulesApply && missing.value.length
    ? `plate clear. still waiting on ${missingNames.value}.`
    : `all ${dosesToday.value.length} dose${dosesToday.value.length === 1 ? '' : 's'} down. ♥`
}

const servedNote = () => mealIsYesterday.value && !fedThisVisit.value.size ? ' (yesterday\'s plate)' : ''

/** The menu's "feed all": every mix, then every dose, in order. */
async function feed() {
  if (busy.value || !dosesToday.value.length) return
  busy.value = true
  wake()
  const note = servedNote()
  for (let i = 0; i < mixesToday.value.length; i++) await mixOne(i, i === 0 ? note : '')
  for (let i = 0; i < dosesToday.value.length; i++) await doseOne(i, i === 0 && !mixesToday.value.length ? note : '')
  actionPose.value = null
  line.value = plateLine()
  busy.value = false
}

/** A single row from the menu: one dose, or one vial to mix. */
async function feedOne(kind: 'dose' | 'mix', i: number) {
  if (busy.value) return
  busy.value = true
  wake()
  if (kind === 'mix') await mixOne(i, servedNote())
  else await doseOne(i, servedNote())
  actionPose.value = null
  if (kind === 'dose') line.value = plateLine()
  busy.value = false
}

/** The plate as a menu: the vials to mix, the doses with a check once fed, and feed-all. */
const feedItems = computed<DropdownMenuItem[][]>(() => {
  const mixes: DropdownMenuItem[] = mixesToday.value.map((m, i) => ({
    label: `mix ${m.compound} — ${recipeOf(m)}`,
    icon: 'i-lucide-flask-conical',
    onSelect: () => feedOne('mix', i)
  }))
  // A compound dosed more than once in the day (the iron protocol's three) gets a running number.
  const doses: DropdownMenuItem[] = dosesToday.value.map((d, i) => {
    const [base, nth] = doseKeys.value[i]!.split('#')
    const repeats = doseKeys.value.filter(k => k.startsWith(`${base}#`)).length
    return {
      label: `${base}${repeats > 1 ? ` #${nth}` : ''}${fedThisVisit.value.has(i) ? ' ✓' : ''}`,
      icon: isInjected(d.compound) ? 'i-lucide-syringe' : 'i-lucide-pill',
      onSelect: () => feedOne('dose', i)
    }
  })
  const all: DropdownMenuItem[] = [{
    label: `feed all · ${dosesToday.value.length}${mealIsYesterday.value ? ' (yesterday\'s plate)' : ''}`,
    icon: 'i-lucide-utensils',
    onSelect: feed
  }]
  return [...(mixes.length ? [mixes] : []), doses, all]
})

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
  const v = visits.value
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
    mixesToday.value.length
      ? `reconstituted ${mixesToday.value.map(m => `${m.compound} (${m.vial_amount} ${unitLabel(m.vial_unit)} in ${m.bac_water_ml} mL)`).join(', ')}${mealIsYesterday.value ? ' yesterday' : ' today'}. FEED mixes it again.`
      : null,
    finasterideStreak.value
      ? maneTier.value
        ? `the mane: ${MANE_TIERS[maneTier.value - 1]!.name} — ${finasterideStreak.value} days of finasteride${nextMane.value ? `; ${nextMane.value.name} at ${nextMane.value.days}` : '. it combs it.'}`
        : `finasteride, day ${finasterideStreak.value}. the mane shows at ${MANE_TIERS[0]!.days}.`
      : null,
    ageDays.value != null ? `${ageDays.value.toLocaleString('en-US')} days since the first logged day. it remembers all of them.` : null,
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
    latestScan.value?.total.body_fat_pct != null
      ? `body fat ${latestScan.value.total.body_fat_pct}% on the ${formatDate(latestScan.value.date, 'monthDay')} scan — ${bellyRead.value === 'soft' ? 'a bit of belly, it admits' : bellyRead.value === 'cut' ? 'cut. look at that' : 'lean'}.`
      : null,
    leanGain.value != null
      ? `lean mass ${leanGain.value >= 0 ? '+' : ''}${leanGain.value} lb since the first scan — ${arms.value === 'built' ? 'the arms show it' : `the arms fill in at +${LEAN_GAIN_LBS}`}.`
      : null,
    earned.value.length
      ? `wearing ${earned.value.map(m => m.name.replace(/^the /, '')).join(', ')} — earned at ${earned.value.map(m => `${m.goal.toLocaleString('en-US')} ${m.unit}`).join(', ')}.`
      : null,
    `achievements: ${earnedCount.value} of ${achievementCards.value.length}.${nextAchievement.value ? ` next: ${nextAchievement.value.name} — ${(nextAchievement.value.goal - nextAchievement.value.progress).toLocaleString('en-US')} ${nextAchievement.value.unit} to go.` : ' every one. there is nothing left to earn, only to keep.'}`,
    keeper && v?.total
      ? `visitors: ${v.total} footprint${v.total === 1 ? '' : 's'}${v.recent[0] ? ` — last ${v.recent[0].label ?? `a ${v.recent[0].role}`} on ${formatDate(v.recent[0].date, 'monthDay')}` : ''}.`
      : null,
    // A guest is handed a holder's name only when it is their own; anyone else is "a friend".
    ...(['runner', 'crusher', 'world'] as TickerGame[]).map((g) => {
      const b = visitorsBests.value[g]
      const noun = g === 'runner' ? 'run' : g === 'crusher' ? 'crush' : 'month'
      return b ? `visitors' best ${noun}: ${!keeper && b.label ? 'you' : b.label ?? 'a friend'}, ${b.score} points.` : null
    }),
    !keeper ? `you're on file as ${visitorLabel.value ?? 'a friend'}. it's keeping a footprint.` : null,
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

// --- play: the games -------------------------------------------------------------------------
// The one thing on the page that is not read from the data — though the can crusher's wall is.
// A game takes the stage over and the pet counts as busy for the duration (no fidgets, the other
// buttons wait). Each game keeps a house record under its own memory key; a guest's best goes to
// their footprint, which is that game's visitors' leaderboard, and the HUD shows them the house
// record to chase.

const runner = useTemplateRef('runner')
/** The game on the stage, or none. */
const playing = ref<TickerGame | null>(null)
/** The house records, one per game, under memory keys of the same names. */
const readHiScores = (): Record<TickerGame, TickerRecord | null> => ({
  runner: recall<TickerRecord>('runner'),
  crusher: recall<TickerRecord>('crusher'),
  world: recall<TickerRecord>('world')
})
const hiScores = ref<Record<TickerGame, TickerRecord | null>>(readHiScores())
const runnerHi = computed(() => hiScores.value.runner)
const crusherHi = computed(() => hiScores.value.crusher)
const worldHi = computed(() => hiScores.value.world)
/** 1 once a finished month ever earned the feat (sticky on the record), for the achievements. */
const worldFeat = (feat: WorldFeat) => (worldHi.value?.feats?.includes(feat) ? 1 : 0)
/** The last world game's figures, for the remark that names the day that got you. */
let lastSummary: WorldSummary | null = null
const visitorsBests = ref<Partial<Record<TickerGame, TickerBest | null>>>(visits.value?.bests ?? { runner: visits.value?.best ?? null })
let runSetRecord = false
/** A guest's game that topped the house record — the figure their HUD shows, so the one its NEW BEST and the quit line agree on. */
let runBeatHouse = false
/** The crusher's wall went, this game. */
let lastCleared = false
onMounted(() => {
  if (!remote) hiScores.value = readHiScores()
})

/** The HI on a game's HUD: the owner's record, or for a guest the house record whoever holds it. */
function houseBestOf(game: TickerGame): number {
  return Math.max(hiScores.value[game]?.score ?? 0, keeper ? 0 : visitorsBests.value[game]?.score ?? 0)
}

/** What it plays in: the wearables and the hat, not the floor props or the vet's coat. */
const worn = computed(() => accessories.value.filter(a => !a.startsWith('bowl-') && !['calendar', 'lab-coat'].includes(a)))

// --- the can crusher's wall ----------------------------------------------------------------------
// One can per soda logged in the trailing month, in rows by week, each as sturdy as its size. A
// clean month is the good ending — nothing to shoot — and offers last month's wall for practice.
const CRUSHER_WINDOW_DAYS = 30

function wallFor(endDay: string): { cans: CanInput[], oz: number, from: string } {
  const from = shiftDays(endDay, -(CRUSHER_WINDOW_DAYS - 1))
  const cans: CanInput[] = []
  let oz = 0
  for (const e of entries.value) {
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

const crusherWall = computed(() => {
  const thisMonth = wallFor(today.value)
  const practice = thisMonth.cans.length === 0
  const end = practice ? shiftDays(today.value, -CRUSHER_WINDOW_DAYS) : today.value
  const wall = practice ? wallFor(end) : thisMonth
  const count = wall.cans.length
  const title = `${formatDate(wall.from, 'monthDay')} – ${formatDate(end, 'monthDay')} · ${count} can${count === 1 ? '' : 's'}${wall.oz ? ` · ${wall.oz} oz` : ''}`.toUpperCase()
  return { cans: wall.cans, count, title, practice: practice && count > 0 }
})
/** The paddle is today's recovery: a rough night narrows it, a great one widens it. */
const paddleScale = computed(() => (recovery.value == null ? 1 : Math.max(0.7, Math.min(1.2, 0.7 + (recovery.value / 100) * 0.5))))
/** A workout today is a spare life. */
const crusherLives = computed(() => 3 + (minutesOn(today.value) > 0 ? 1 : 0))
/** Everyone plays the same board on a day. */
const daySeed = computed(() => Number(today.value.replace(/-/g, '')))
/** The stage height a game asks for (its `fit`): the crusher's wall and the world's playfield need about twice the runner's 17rem. */
const gameHeight = ref<number | null>(null)

// --- ticker world's month ---------------------------------------------------------------------
// The trailing thirty days as the level's days (shared/utils/tickerWorld.ts): logged or not, the
// doses and the sodas, the workout minutes, the recovery, a draw on file. The castle is today.
const WORLD_DAYS = 30
/** The running kinds (the cap family plus the bike): their platform slides. */
const CARDIO = /walk|run|jog|hik|elliptical|stair|tread|row|cycling|spin|bike|swim/i
const worldDays = computed<DayInput[]>(() => {
  const byDate = new Map(entries.value.map(e => [e.date, e]))
  const recoveryOn = new Map((healthData.value ?? []).map(h => [h.date, h.recovery_score ?? null]))
  const sleepOn = new Map((healthData.value ?? []).map(h => [h.date, h.sleep_total_min ?? null]))
  const first = shiftDays(today.value, -(WORLD_DAYS - 1))
  // A draw's block says its lab and how many markers it read.
  const drawLabels = new Map((labsData.value ?? []).map(d => [d.date, `${d.sources.length ? d.sources.join(' · ') : 'draw'} · ${Object.keys(d.markers).length} markers`]))
  // A gold-star day: every dose the schedule called for, logged, and none missed.
  const tallies = rulesApply ? tallySchedule(rules.value, first, today.value, doseDates.value, today.value) : []
  const hitDates = new Set(tallies.flatMap(t => t.hit))
  const missedDates = new Set(tallies.flatMap(t => t.missed))
  return Array.from({ length: WORLD_DAYS }, (_, i) => {
    const date = shiftDays(today.value, -(WORLD_DAYS - 1 - i))
    const e = byDate.get(date)
    const workoutMin = minutesOn(date)
    return {
      date,
      logged: !!e && isLoggedDay(e),
      doses: e?.peptides?.length ?? 0,
      sodas: (e?.sodas ?? []).map(s => ({ oz: sodaOunces(s.size) })),
      workoutMin,
      cardio: workoutsOn(date).some(w => CARDIO.test(w.workout_type ?? '')),
      recovery: recoveryOn.get(date) ?? null,
      sleepMin: sleepOn.get(date) ?? null,
      draw: drawLabels.has(date),
      drawLabel: drawLabels.get(date) ?? null,
      goldStar: hitDates.has(date) && !missedDates.has(date) && workoutMin > 0
    }
  })
})

const playItems = computed<DropdownMenuItem[][]>(() => [[
  {
    label: `runner${houseBestOf('runner') ? ` · HI ${houseBestOf('runner')}` : ''}`,
    icon: 'i-lucide-footprints',
    onSelect: () => play('runner')
  },
  {
    label: `can crusher${houseBestOf('crusher') ? ` · HI ${houseBestOf('crusher')}` : ''} · ${crusherWall.value.count} can${crusherWall.value.count === 1 ? '' : 's'}${crusherWall.value.practice ? ' (last month)' : ''}`,
    icon: 'i-lucide-cup-soda',
    onSelect: () => play('crusher')
  },
  {
    label: `ticker world${houseBestOf('world') ? ` · HI ${houseBestOf('world')}` : ''} · the month`,
    icon: 'i-lucide-castle',
    onSelect: () => play('world')
  }
]])

function play(game: TickerGame) {
  if (busy.value) return
  wake()
  busy.value = true
  runSetRecord = false
  runBeatHouse = false
  lastCleared = false
  playing.value = game
  line.value = game === 'runner'
    ? 'space or tap to run. esc quits.'
    : game === 'world'
      ? 'the month, left to right — home is today. ← → run, space jumps (hold for height). esc quits.'
      : crusherWall.value.count
        ? `${crusherWall.value.count} cans on the wall${crusherWall.value.practice ? ' (last month\'s — this one is clean)' : ''}. space or tap to launch; arrows or the pointer move. esc quits.`
        : 'nothing to shoot. good. (esc quits)'
}

function onGameOver(game: TickerGame, score: number, cleared: boolean, feats: WorldFeat[] = [], summary: WorldSummary | null = null) {
  // Read before the server's answer moves the house record up to this very score.
  runBeatHouse = !keeper && score > 0 && score > houseBestOf(game)
  if (cleared) lastCleared = true
  if (game === 'world') lastSummary = summary
  const current = hiScores.value[game]
  const better = score > (current?.score ?? 0)
  // The runner has no end to reach; every other game remembers that it was finished once.
  const finishes = game !== 'runner'
  const nowCleared = finishes && cleared && !current?.cleared
  const earned = game === 'world' && cleared ? feats.filter(f => !current?.feats?.includes(f)) : []
  if (!remote) {
    if (better || nowCleared || earned.length) {
      const next: TickerRecord = {
        score: better ? score : current?.score ?? 0,
        date: better ? today.value : current?.date ?? today.value,
        ...(finishes ? { cleared: !!current?.cleared || cleared } : {}),
        ...(game === 'world' && (current?.feats?.length || earned.length) ? { feats: [...(current?.feats ?? []), ...earned] } : {})
      }
      hiScores.value = { ...hiScores.value, [game]: next }
      remember(game, next)
      runSetRecord = better
    }
    return
  }
  if (keeper && better) {
    hiScores.value = { ...hiScores.value, [game]: { ...current, score, date: today.value } } // the server confirms below
    runSetRecord = true
  }
  $fetch<TickerRunResponse>('/api/ticker/run', { method: 'POST', body: { score, game, cleared, ...(feats.length ? { feats } : {}) } })
    .then((r) => {
      hiScores.value = { ...hiScores.value, [game]: r.record }
      visitorsBests.value = { ...visitorsBests.value, [game]: r.visitorsBest }
      if (!keeper) runSetRecord = r.isRecord
    })
    .catch(() => { /* the game still happened; the record just isn't written yet */ })
}

async function onGameQuit(score: number) {
  const game = playing.value ?? 'runner'
  playing.value = null
  busy.value = false
  await nextTick()
  measureFloor()
  const best = hiScores.value[game]
  const house = houseBestOf(game)
  const swept = lastCleared ? (game === 'crusher' ? 'wall cleared. ' : game === 'world' ? 'made it home. ' : '') : ''
  // The keeper's record, or a guest topping the house: the celebration the HUD's NEW BEST promised.
  if (keeper ? runSetRecord : runBeatHouse) {
    line.value = keeper ? `${swept}new best: ${best?.score ?? score} points. ♥` : `${swept}new house record: ${score} points. ♥`
    pet.value?.trigger('celebrate')
    for (let i = 0; i < 5; i++) timers.push(setTimeout(() => spawnHeart(Math.random() * 120 - 60), i * 150))
  }
  else if (!keeper && runSetRecord) {
    // Their own best (the server's word), short of the house: a nod, not a party.
    line.value = `${swept}${score} points — your best yet. the house record is ${house}.`
    pet.value?.trigger('bigbeat')
  }
  else if (swept) {
    line.value = `${swept}${score} points. ♥`
    pet.value?.trigger('celebrate')
  }
  else if (score > 0 && keeper && best) {
    line.value = `${score} points. best ${best.score} on ${formatDate(best.date, 'monthDay')} — it's still catching its breath.`
  }
  else if (score > 0 && house) {
    line.value = `${score} points. the house record is ${house}.`
  }
  else {
    line.value = game === 'crusher' && !crusherWall.value.count ? 'nothing to shoot. good.' : 'next time.'
  }
  // The world names the day that got you — or admits it never did.
  if (game === 'world' && lastSummary) {
    const got = gotLine(lastSummary)
    if (got) line.value = `${line.value} ${got}`
  }
}

/** "sep 14 got me — two cans and the pit." from a world game's figures; "not a scratch." for a clean run home. */
function gotLine(summary: WorldSummary): string {
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
  return `${formatDate(worst.date, 'monthDay').toLowerCase()} got me — ${causes}.`
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

// Hints are a few words — seven tiles leave ~100px each — with the longer wording as the tooltip.
const stats = computed<Stat[]>(() => [
  {
    label: 'AGE',
    value: ageDays.value != null ? `${ageDays.value.toLocaleString('en-US')}d` : '—',
    hint: birthday.value ? `turns ${birthday.value} ♥` : 'since day one',
    title: firstDate.value ? `days since the first logged day, ${formatDate(firstDate.value, 'monthDay')} ${firstDate.value.slice(0, 4)}` : undefined
  },
  { label: 'WEIGHT', value: weight.value != null ? `${weight.value} lb` : '—', hint: 'borrowed', title: 'yours — it borrows the number' },
  { label: 'STREAK', value: `${streak.value}d`, hint: 'logged days' },
  { label: 'FED', ...fedTile.value },
  { label: 'NEXT DRAW', value: drawTile.value.value, hint: drawTile.value.hint },
  {
    label: 'MOOD',
    value: moodWord.value,
    hint: fever.value
      ? `rhr ${fever.value.rhr} vs ${fever.value.baseline}`
      : recovery.value != null ? `recovery ${recovery.value}%` : undefined,
    title: fever.value ? `resting HR ${fever.value.rhr} against a two-week average of ${fever.value.baseline}` : undefined
  },
  {
    label: 'PETS',
    value: String(petsToday.value),
    hint: `${pets.value.total.toLocaleString('en-US')} all-time`,
    title: visits.value?.pets ? `${visits.value.pets} of them from visitors` : undefined
  }
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
    return `happy birthday — TICKER turns ${birthday.value} today. (first logged day: ${hatched})`
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

// The one-shots below each play once per thing-that-happened: a stamp in the memory says what
// has already been reacted to.
function firstTime(key: string, stamp: string): boolean {
  return recall<string>(key) !== stamp
}
function record(key: string, stamp: string) {
  remember(key, stamp)
}

// The soda reaction. The home digest's flatline fires on the live count crossing three; here the
// count is whatever was logged before the visit, so the one-shot plays once per count per day —
// a fresh soda earns a fresh flinch, a second look at the same tally only gets the line.
const FLINCH_KEY = 'flinched'

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
const BIRTHDAY_KEY = 'birthday'

function celebrateBirthday() {
  record(BIRTHDAY_KEY, today.value)
  pet.value?.trigger('celebrate')
  for (let i = 0; i < 9; i++) timers.push(setTimeout(() => spawnHeart(Math.random() * 160 - 80), i * 140))
}

// Results landing: the newest draw on file is a week old or less and hasn't been reacted to —
// the thump if anything is flagged (it read the report twice), the hop for a clean sheet.
const LANDED_KEY = 'landed'
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
// A snapshot of the figures TICKER saw last visit, kept in its memory. On arrival the difference
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
const SNAPSHOT_KEY = 'snapshot'

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
  const s = recall<Snapshot>(SNAPSHOT_KEY)
  return s?.v === 1 ? s : null
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
    // Every scan figure is optional (an older report format can leave one out): compare what both scans carry.
    const prev = scans.value.at(-2)
    const bf = scan.total.body_fat_pct
    const prevBf = prev?.total.body_fat_pct
    const lean = scan.total.lean_mass_lbs
    const prevLean = prev?.total.lean_mass_lbs
    const parts = [`new scan ${formatDate(scan.date, 'monthDay')}: body fat ${bf ?? '—'}%${prevBf != null ? ` (${prevBf}% before)` : ''}`]
    if (lean != null && prevLean != null) {
      const d = Math.round((lean - prevLean) * 10) / 10
      parts.push(`lean ${d >= 0 ? '+' : ''}${d} lb`)
    }
    const better = !prev || (bf != null && prevBf != null && bf < prevBf) || (lean != null && prevLean != null && lean > prevLean)
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

/** New footprints since the owner's last look: who came by and what they left. */
function visitorsNews(): News | null {
  const v = visits.value
  if (!v || !keeper) return null
  const fresh = v.total - (recall<number>('visitsSeen') ?? 0)
  if (fresh <= 0) return null
  const latest = v.recent.slice(0, fresh)
  const who = [...new Set(latest.map(r => r.label ?? `a ${r.role}`))].join(', ')
  const petted = latest.reduce((s, r) => s + r.pets, 0)
  return {
    line: `${fresh} visit${fresh === 1 ? '' : 's'} since its last look — ${who}.${petted ? ` ${petted} pet${petted === 1 ? '' : 's'} given.` : ''} it waved.`,
    event: 'celebrate'
  }
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
const SALUTE_KEY = 'saluted'

async function salute() {
  record(SALUTE_KEY, today.value)
  const n = weekTally.value?.hit ?? 0
  line.value = `clean week — ${n} of ${n} due doses logged${cycleClause.value}. (salute)`
  if (busy.value) return
  actionPose.value = 'salute'
  await wait(1700)
  if (actionPose.value === 'salute') actionPose.value = null
}

// Newly completed achievements: announced once each and dated, then simply listed (and worn).
const freshAchievements = computed(() => achievements.value.filter(a => a.progress >= a.goal && achievementDates.value[a.id] == null))

function announceAchievements() {
  const fresh = freshAchievements.value
  if (!fresh.length) return
  // Only the new dates go to memory, merged in: another device's earlier dates stay as they were.
  const dated = Object.fromEntries(fresh.map(a => [a.id, today.value]))
  achievementDates.value = { ...achievementDates.value, ...dated }
  remember(ACHIEVEMENTS_KEY, dated, true)
  const rewards = fresh.filter(a => a.reward).map(a => WEARABLE_META[a.reward!]!.id)
  line.value = `achievement${fresh.length === 1 ? '' : 's'}: ${fresh.map(a => a.name).join(', ')}${rewards.length ? ` — it put on the ${rewards.join(' and the ')}` : ''}. ♥`
  pet.value?.trigger('celebrate')
}

// Greet (the clock above has ticked by now, so a late visit finds it asleep), then react to each
// thing that has happened in turn once it has settled in — the home digest's stagger, then a
// beat between reactions so each line gets read. The snapshot is written last, so the next
// visit's news starts from what it saw today. A guest gets a hello and leaves a footprint; the
// reactions, the news and the stamps are the keeper's.
onMounted(() => {
  quoteIdx = Math.floor(Math.random() * 1000)

  if (!keeper) {
    // A friend. (The doctor role can't open this page — its curated view leaves out sodas and
    // daily doses, both of which TICKER chatters about — so there is no doctor greeting; the
    // endpoints still accept the role in case that policy changes.)
    const name = visitorLabel.value
    const hello: News = { line: `a friend${name ? ` — ${name}` : ''}! TICKER waves. (it's Jim's; be gentle.)`, event: 'celebrate' }
    line.value = hello.line
    timers.push(setTimeout(() => tell(hello), 800))
    $fetch('/api/ticker/visit', { method: 'POST' }).catch(() => { /* no footprint today, then */ })
    return
  }

  lastVisit.value = loadSnapshot()
  if (awayDays.value >= 3) sitting.value = true // it sat down to wait; any press stands it up
  line.value = arrivalLine()
  const reactions: Array<() => void> = []
  if (sodasToday.value) reactions.push(flinch)
  if (lastVisit.value) for (const item of newsSince(lastVisit.value)) reactions.push(() => tell(item))
  const footprints = visitorsNews()
  if (footprints) {
    reactions.push(() => tell(footprints))
    remember('visitsSeen', visits.value!.total)
  }
  if (birthday.value && firstTime(BIRTHDAY_KEY, today.value)) reactions.push(celebrateBirthday)
  if (landedPending.value) reactions.push(resultsLanded)
  if (cleanWeek.value && firstTime(SALUTE_KEY, today.value)) reactions.push(salute)
  if (freshAchievements.value.length) reactions.push(announceAchievements)
  reactions.forEach((react, i) => timers.push(setTimeout(react, 800 + i * 2200)))
  remember(SNAPSHOT_KEY, snapshotNow())
})
</script>

<style scoped>
.stage {
  transition: background-color 0.6s ease;
}
.stage.night {
  background: var(--color-bg);
}
/* While a game has the stage, nothing on it is text to a thumb: a long press on a pad (or the
   paddle, or the runner's tap) used to fall through to the remark line and pop iOS's
   selection handles and Copy / Look Up menu. All three games inherit this. */
.stage.in-game {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.stage.in-game > p {
  pointer-events: none;
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
/* A phone's stage is ~358px: the figure's canvas starts ~80px in, so the window and the clock
   tuck into the left margin, under the corner cobweb, instead of sitting on its shoulder. */
@media (max-width: 639px) {
  .window { left: 10px; top: 34px; }
  .clock { left: 10px; top: 76px; }
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
