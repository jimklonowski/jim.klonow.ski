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
      <TickerMaze
        v-else-if="playing === 'maze'"
        ref="runner"
        :build="build"
        :accessories="worn"
        :night="night"
        :hi="houseBestOf('maze')"
        :ghosts="mazeGhosts.ghosts"
        :title="mazeGhosts.title"
        :seed="daySeed"
        :lives="crusherLives"
        @fit="h => gameHeight = h"
        @over="(score, cleared) => onGameOver('maze', score, cleared)"
        @quit="onGameQuit"
      />
      <TickerDrop
        v-else-if="playing === 'drop'"
        ref="runner"
        :build="build"
        :accessories="worn"
        :night="night"
        :hi="houseBestOf('drop')"
        :germs="dropGerms.germs"
        :title="dropGerms.title"
        :seed="daySeed"
        @fit="h => gameHeight = h"
        @over="(score, cleared) => onGameOver('drop', score, cleared)"
        @quit="onGameQuit"
      />
      <TickerInvaders
        v-else-if="playing === 'invaders'"
        ref="runner"
        :build="build"
        :accessories="worn"
        :night="night"
        :hi="houseBestOf('invaders')"
        :wave="invadersWave.wave"
        :title="invadersWave.title"
        :seed="daySeed"
        :lives="crusherLives"
        @fit="h => gameHeight = h"
        @over="(score, cleared) => onGameOver('invaders', score, cleared)"
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
      <!-- FEED opens the plate: one row per dose (and per vial to mix, and per daily med that is
           taken but never logged), each fed on its own, or all of them in order. Rows fed this
           visit carry a check. -->
      <UDropdownMenu
        :items="feedItems"
        :content="{ align: 'start' }"
        :disabled="busy || !plateCount"
        :ui="{ content: 'min-w-60 font-mono', itemLabel: 'text-small' }"
      >
        <button
          type="button"
          class="tui-btn disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="busy || !plateCount"
          :title="plateCount ? 'Pick a dose to feed, or feed the whole plate' : 'Nothing on the plate yet — TICKER eats what the journal says, plus the daily meds'"
        >
          ⊳ FEED{{ plateCount ? ` · ${fedCount ? `${fedCount}/` : ''}${plateCount}` : '' }}
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
                class="tui-label text-nano shrink-0"
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
// forget to do. Petting is the one pure interaction.
//
// The figures are shared/utils/tickerDay.ts (through useTickerDay), the words are
// shared/utils/tickerVoice.ts, the memory is useTickerMemory and the clock useTickerClock
// (audit #42 item 42). What is left here is the stage: the actions, their animation and their
// timing, the games' records, and what the pet remembers having reacted to.
import { diffDays } from '#shared/utils/dates'
import { MANE_TIERS } from '#shared/utils/tickerWardrobe'
import { WEARABLE_META, accessoriesFor, achievementsOf, heldPoseOf, moodWordOf, reachableAchievements, recipeOf } from '#shared/utils/tickerDay'
import type { Achievement } from '#shared/utils/tickerDay'
import {
  NO_WORKOUT_LINE, SAT_BACK_LINE, SAT_DOWN_LINE, achievementLine, afterEffectOf, arrivalLine, doseDoneLine, doseLabel, doseStartLine,
  drawTile, fedTile, flinchLine, gotLine, helloLine, maneGoneLine, maneStandingLine, maneThinnedLine, mixDoneLine, mixStartLine, newsSince,
  plateLine, playIntroLine, quitRemark, quoteLines, recordLines, resultsLandedLine, saluteLine, squeakFor, statTiles, todaySummaryLine,
  visitorsNews, walkEndLine, walkStartLine
} from '#shared/utils/tickerVoice'
import type { News, Snapshot } from '#shared/utils/tickerVoice'
import type { WorldFeat, WorldSummary } from '#shared/utils/tickerWorld'
import type { TickerPose, TickerProp } from '#shared/utils/tickerSprite'
import type { TickerBest, TickerGame, TickerPets, TickerRecord, TickerRunResponse } from '#shared/types/ticker'
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
const { rules: protocolRules, standing: protocolStanding } = await useProtocol()
const { data: dexaData } = await useDexaEntries()
// The vial list is owner/demo only (the API says so); a friend's TICKER has no pantry to mention.
const vialsData = canEdit.value ? await useVials() : null
const today = useToday()

const entries = computed(() => journalData.value ?? [])
const rhr = computed(() => overview.value?.latestRhr ?? null)

// --- memory: where the pet keeps what it remembers (app/composables/useTickerMemory.ts) --------
const { keeper, remote, visits, visitorLabel, recall, remember } = await useTickerMemory(role)

// --- the clock on the wall (app/composables/useTickerClock.ts) ---------------------------------
const { night, asleep, sky, clock } = useTickerClock()

// --- the day, as the pet experiences it (app/composables/useTickerDay.ts) ----------------------
// Whether a schedule applies: it does whenever the session has rules — the demo sandbox has its
// own since the protocol plan's P9 — and an unseeded sandbox's TICKER is fed when anything is
// logged and never hungry.
const rulesApply = protocolRules.value.length > 0
const {
  sodasToday, sodasThisWeek, mealDay, mealIsYesterday, dosesToday, standingToday, mixesToday, walkIsYesterday, workoutMinutes, workoutHr, walkProp,
  recovery, sleepMin, sluggish, streak, weight, latestHrv, firstDate, ageDays, birthday, drawDates, nextDraw, oldestOpen, fever,
  dueToday, loggedCompounds, eaten, missing, missingNames, hunger, unloggedThisWeek, cobwebs,
  loggedDays, milestones, earned, build, tier, arms, bellyRead, scans, latestScan, leanGain,
  weekTally, cleanWeek, activeCycle, cycleClause, finasterideStreak, tadalafilStreak, maneTier, nextMane, bandaged, injected, bowl, doseKeys,
  crusherWall, paddleScale, crusherLives, daySeed, worldDays, mazeGhosts, dropGerms, invadersWave
} = useTickerDay({
  entries,
  health: healthData,
  workouts: workoutsData,
  labs: labsData,
  planned: plannedData,
  cycles: cyclesData,
  scans: dexaData,
  vials: vialsData?.data ?? null,
  today,
  rules: protocolRules,
  standing: protocolStanding,
  rulesApply,
  night
})

// --- the record book --------------------------------------------------------------------------
// Reads the house records, which live in the memory (the games section below).

const records = computed(() => recordLines({
  entries: entries.value,
  health: healthData.value ?? [],
  workouts: workoutsData.value ?? [],
  streak: streak.value,
  hiScores: hiScores.value,
  today: today.value
}))

// --- achievements -------------------------------------------------------------------------------
// The list is derived (tickerDay.ts achievementsOf), so nothing can be lost; the memory holds the
// day each was first noticed (see announceAchievements), which is the date the panel shows. The
// older 'unlocks' key (a list of the four props) reads as earned on an unknown day.

const allAchievements = computed<Achievement[]>(() => achievementsOf({
  milestones: milestones.value,
  loggedDays: loggedDays.value,
  cleanWeek: cleanWeek.value,
  finasterideStreak: finasterideStreak.value,
  tadalafilStreak: tadalafilStreak.value,
  hiScores: hiScores.value,
  pets: pets.value.total,
  visits: visits.value?.total ?? 0,
  draws: drawDates.value.length,
  scans: scans.value.length
}))
const achievements = computed(() => reachableAchievements(allAchievements.value, role.value === 'demo'))

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

// --- mood: the held pose between interactions (one ladder in tickerDay.ts, read twice) ---------

const moodInputs = computed(() => ({
  asleep: asleep.value,
  fever: fever.value,
  drawStatus: nextDraw.value?.status ?? null,
  hunger: hunger.value,
  sluggish: sluggish.value,
  sodasToday: sodasToday.value,
  recovery: recovery.value
}))
const heldPose = computed(() => heldPoseOf(moodInputs.value))
const moodWord = computed(() => moodWordOf(moodInputs.value))

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
// The finasteride mane grows with the finasteride streak and the feed animates it in tier by
// tier; the BPC bandage is on for any day BPC was logged. The flex, the stretch, the proud beat
// and the glow are one-shots in afterEffect() below.

/** While the feed grows the mane in, the tier on show; null means the earned one. */
const maneGrow = ref<number | null>(null)

/** The HGH stretch: a scaleY on the figure for a beat, with a transition only while it plays. */
const stretch = ref(1)
const stretching = ref(false)

/** The props layer, in paint order (tickerDay.ts accessoriesFor). */
const accessories = computed<TickerProp[]>(() => accessoriesFor({
  bowl: bowl.value,
  worn: new Set(earned.value.map(m => m.prop)),
  carried: walking.value ? walkProp.value : null,
  mane: maneGrow.value ?? maneTier.value,
  birthday: !!birthday.value,
  pose: poseOverride.value,
  cleanWeek: cleanWeek.value,
  bandaged: bandaged.value,
  draw: nextDraw.value
}))
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
  line.value = squeakFor(petsToday.value, asleep.value)
  pet.value?.trigger('celebrate')
  if (busy.value) return // mid-walk pats are allowed; don't fight the walk's poses
  actionPose.value = 'petted'
  await wait(1300)
  if (actionPose.value === 'petted') actionPose.value = null
}

// The feed walks the day's doses one at a time. An injectable (the standing rule says so, or the
// compound comes as a vial) is a two-frame jab — syringe raised with a wince, then in with the
// brave face and one big beat; a pill is the capsule lift, then a gulp with a glass of water.
// Each dose gets its own line (tickerVoice.ts), with a word for the compounds it knows.

/** What a compound does to it once it's in: a beat of theatre per family, nothing for the rest. */
async function afterEffect(compound: string) {
  const effect = afterEffectOf(compound)
  if (!effect) return
  if (effect.kind === 'mane') return growMane()
  line.value = effect.line
  switch (effect.kind) {
    case 'flex':
      actionPose.value = 'flex'
      await wait(1100)
      if (actionPose.value === 'flex') actionPose.value = null
      break
    case 'pump':
      // Hands on hips, chest out, then two swells with a beat each — the plumbing, wide open.
      actionPose.value = 'pumped'
      stretching.value = true
      for (let i = 0; i < 2; i++) {
        stretch.value = 1.12
        pet.value?.trigger('bigbeat')
        await wait(450)
        stretch.value = 1
        await wait(300)
      }
      stretching.value = false
      await wait(400)
      if (actionPose.value === 'pumped') actionPose.value = null
      break
    case 'stretch':
      stretching.value = true
      stretch.value = 1.15
      await wait(700)
      stretch.value = 1
      await wait(350)
      stretching.value = false
      break
    case 'proud':
      pet.value?.trigger('bigbeat')
      await wait(750)
      pet.value?.trigger('bigbeat')
      await wait(750)
      break
    case 'bandage':
      await wait(900)
      break
    case 'glow':
      pet.value?.trigger('celebrate')
      await wait(1400)
      break
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
  const standing = maneStandingLine(tier, days, nextMane.value)

  if (!tier) {
    if (shown) remember(MANE_KEY, 0)
    line.value = maneGoneLine(!!shown, days)
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
    line.value = maneThinnedLine(tier, days)
  }
  else {
    pet.value?.trigger('bigbeat')
    line.value = `${standing} it combed it.`
  }
  await wait(900)
}

// What's been fed off today's plate, remembered with the meal day so a reload (or the phone
// later) still shows the checks. Doses are keyed by label and running number rather than index
// (tickerDay.ts doseKeysOf), which holds when a dose is logged later in the day.
const FED_KEY = 'fed'
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
/** The standing meds' checks, keyed by name — there is one of each a day. */
const standingKey = (compound: string) => `standing:${compound}`
const fedStanding = computed(() => new Set(standingToday.value.map((m, i) => fedKeys.value.has(standingKey(m.compound)) ? i : -1).filter(i => i >= 0)))
/** The whole plate: the day's logged doses plus the daily meds that are never logged. */
const plateCount = computed(() => dosesToday.value.length + standingToday.value.length)
const fedCount = computed(() => fedThisVisit.value.size + fedStanding.value.size)
function markFed(i: number) {
  markFedKey(doseKeys.value[i]!)
}
function markFedKey(key: string) {
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
  line.value = mixStartLine(m, note)
  actionPose.value = 'mixing'
  mixing.value = true
  await wait(1700)
  mixing.value = false
  line.value = mixDoneLine(m)
  await wait(600)
}

/** One dose off the plate: the jab or the swallow, its line, then whatever the compound does to it. */
async function doseOne(i: number, note = '') {
  const d = dosesToday.value[i]
  if (!d) return
  const label = doseLabel(d)
  const again = fedThisVisit.value.size > 0
  const jab = injected(d.compound)
  line.value = doseStartLine(label, jab, note)
  if (jab) {
    actionPose.value = 'jab1'
    await wait(650)
    actionPose.value = 'jab2'
    pet.value?.trigger('bigbeat')
    await wait(750)
  }
  else {
    actionPose.value = 'eating'
    await wait(700)
    actionPose.value = 'gulp'
    await wait(650)
  }
  line.value = doseDoneLine(label, d.compound, jab, again)
  await wait(500)
  await afterEffect(d.compound)
  markFed(i)
}

/** A daily med off the plate — taken every day, never logged: the swallow, then whatever it does to it (the mane, the pump). */
async function standingOne(i: number, note = '') {
  const m = standingToday.value[i]
  if (!m) return
  const label = `${m.compound} ${m.label}`
  const again = fedCount.value > 0
  line.value = doseStartLine(label, false, note)
  actionPose.value = 'eating'
  await wait(700)
  actionPose.value = 'gulp'
  await wait(650)
  line.value = doseDoneLine(label, m.compound, false, again)
  await wait(500)
  await afterEffect(m.compound)
  markFedKey(standingKey(m.compound))
}

/** What to say once the plate is (or isn't) clear. */
const plateRemark = () => plateLine({
  doses: plateCount.value,
  fed: fedCount.value,
  rulesApply,
  missing: missing.value.length,
  missingNames: missingNames.value
})

const servedNote = () => mealIsYesterday.value && !fedThisVisit.value.size ? ' (yesterday\'s plate)' : ''

/** The menu's "feed all": every mix, then every dose, then the daily meds, in order. */
async function feed() {
  if (busy.value || !plateCount.value) return
  busy.value = true
  wake()
  const note = servedNote()
  for (let i = 0; i < mixesToday.value.length; i++) await mixOne(i, i === 0 ? note : '')
  for (let i = 0; i < dosesToday.value.length; i++) await doseOne(i, i === 0 && !mixesToday.value.length ? note : '')
  for (let i = 0; i < standingToday.value.length; i++) await standingOne(i, i === 0 && !mixesToday.value.length && !dosesToday.value.length ? note : '')
  actionPose.value = null
  line.value = plateRemark()
  busy.value = false
}

/** A single row from the menu: one dose, one daily med, or one vial to mix. */
async function feedOne(kind: 'dose' | 'standing' | 'mix', i: number) {
  if (busy.value) return
  busy.value = true
  wake()
  if (kind === 'mix') await mixOne(i, servedNote())
  else if (kind === 'standing') await standingOne(i, servedNote())
  else await doseOne(i, servedNote())
  actionPose.value = null
  if (kind !== 'mix') line.value = plateRemark()
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
      icon: injected(d.compound) ? 'i-lucide-syringe' : 'i-lucide-pill',
      onSelect: () => feedOne('dose', i)
    }
  })
  // The daily meds: taken every day, never logged — on the plate after the doses.
  const daily: DropdownMenuItem[] = standingToday.value.map((m, i) => ({
    label: `${m.compound} ${m.label}${fedStanding.value.has(i) ? ' ✓' : ''}`,
    icon: 'i-lucide-pill',
    onSelect: () => feedOne('standing', i)
  }))
  const all: DropdownMenuItem[] = [{
    label: `feed all · ${plateCount.value}${mealIsYesterday.value ? ' (yesterday\'s plate)' : ''}`,
    icon: 'i-lucide-utensils',
    onSelect: feed
  }]
  return [...(mixes.length ? [mixes] : []), ...(doses.length ? [doses] : []), ...(daily.length ? [daily] : []), all]
})

async function walk() {
  if (busy.value) return
  busy.value = true
  wake()
  const minutes = workoutMinutes.value

  if (!minutes) {
    // No workout logged: two sad shuffles, then it sits back down.
    line.value = NO_WORKOUT_LINE
    for (let i = 0; i < 2; i++) {
      actionPose.value = 'walk1'
      await wait(420)
      actionPose.value = 'walk2'
      await wait(420)
      if (reducedMotion.value !== 'reduce') x.value += 10
    }
    actionPose.value = 'sleepy'
    line.value = SAT_BACK_LINE
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
  line.value = walkStartLine(minutes, hr, walkIsYesterday.value)

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
  line.value = walkEndLine(minutes)
  await wait(1400)
  actionPose.value = null
  walking.value = false
  busy.value = false
}

// --- talk: one real number per press ----------------------------------------------------------
// Every line quotes a figure the page already holds (tickerVoice.ts quoteLines skips what the
// data lacks), and presses walk through the list from a random start so two visits don't open
// on the same number.

const quotes = computed(() => quoteLines({
  weight: weight.value,
  recovery: recovery.value,
  sleepMin: sleepMin.value,
  fever: fever.value,
  rhr: rhr.value,
  latestHrv: latestHrv.value,
  latestDraw: latestDraw.value,
  flags: latestDraw.value ? flagCounts.value : null,
  nextDraw: nextDraw.value,
  rulesApply,
  due: dueToday.value.length,
  eaten: eaten.value.length,
  missing: missing.value.length,
  missingNames: missingNames.value,
  streak: streak.value,
  sodasThisWeek: sodasThisWeek.value,
  oldestOpen: oldestOpen.value,
  mixes: mixesToday.value,
  mealIsYesterday: mealIsYesterday.value,
  finasterideStreak: finasterideStreak.value,
  maneTier: maneTier.value,
  nextMane: nextMane.value,
  ageDays: ageDays.value,
  weekTally: weekTally.value,
  cycleClause: cycleClause.value,
  tier: tier.value,
  loggedDays: loggedDays.value,
  latestScan: latestScan.value,
  belly: bellyRead.value,
  leanGain: leanGain.value,
  arms: arms.value,
  earned: earned.value,
  earnedCount: earnedCount.value,
  achievementsTotal: achievementCards.value.length,
  nextAchievement: nextAchievement.value,
  keeper,
  visits: visits.value,
  visitorsBests: visitorsBests.value,
  visitorLabel: visitorLabel.value,
  records: records.value
}))

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
// The one thing on the page that is not read from the data — though the can crusher's wall, the
// world's month, the maze's ghosts, the drop's germs and the invaders' formation are (useTickerDay). A game takes the stage over and the pet counts as busy
// for the duration (no fidgets, the other buttons wait). Each game keeps a house record under
// its own memory key; a guest's best goes to their footprint, which is that game's visitors'
// leaderboard, and the HUD shows them the house record to chase.

const runner = useTemplateRef('runner')
/** The game on the stage, or none. */
const playing = ref<TickerGame | null>(null)
/** The house records, one per game, under memory keys of the same names. */
const readHiScores = (): Record<TickerGame, TickerRecord | null> => ({
  runner: recall<TickerRecord>('runner'),
  crusher: recall<TickerRecord>('crusher'),
  world: recall<TickerRecord>('world'),
  maze: recall<TickerRecord>('maze'),
  drop: recall<TickerRecord>('drop'),
  invaders: recall<TickerRecord>('invaders')
})
const hiScores = ref<Record<TickerGame, TickerRecord | null>>(readHiScores())
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

/** The stage height a game asks for (its `fit`): the crusher's wall and the world's playfield need about twice the runner's 17rem. */
const gameHeight = ref<number | null>(null)

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
  },
  {
    label: `capsule maze${houseBestOf('maze') ? ` · HI ${houseBestOf('maze')}` : ''} · ${mazeGhosts.value.title}`,
    icon: 'i-lucide-ghost',
    onSelect: () => play('maze')
  },
  {
    label: `capsule drop${houseBestOf('drop') ? ` · HI ${houseBestOf('drop')}` : ''} · ${dropGerms.value.title}`,
    icon: 'i-lucide-pill',
    onSelect: () => play('drop')
  },
  {
    label: `soda invaders${houseBestOf('invaders') ? ` · HI ${houseBestOf('invaders')}` : ''} · ${invadersWave.value.title}`,
    icon: 'i-lucide-rocket',
    onSelect: () => play('invaders')
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
  line.value = playIntroLine(game, crusherWall.value, mazeGhosts.value, dropGerms.value, invadersWave.value)
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
  const earnedFeats = game === 'world' && cleared ? feats.filter(f => !current?.feats?.includes(f)) : []
  if (!remote) {
    if (better || nowCleared || earnedFeats.length) {
      const next: TickerRecord = {
        score: better ? score : current?.score ?? 0,
        date: better ? today.value : current?.date ?? today.value,
        ...(finishes ? { cleared: !!current?.cleared || cleared } : {}),
        ...(game === 'world' && (current?.feats?.length || earnedFeats.length) ? { feats: [...(current?.feats ?? []), ...earnedFeats] } : {})
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
  const remark = quitRemark({
    game,
    score,
    best: hiScores.value[game],
    house: houseBestOf(game),
    keeper,
    setRecord: runSetRecord,
    beatHouse: runBeatHouse,
    cleared: lastCleared,
    wallEmpty: !crusherWall.value.count
  })
  line.value = remark.line
  if (remark.event) pet.value?.trigger(remark.event)
  if (remark.hearts) for (let i = 0; i < 5; i++) timers.push(setTimeout(() => spawnHeart(Math.random() * 120 - 60), i * 150))
  // The world names the day that got you — or admits it never did.
  if (game === 'world' && lastSummary) {
    const got = gotLine(lastSummary)
    if (got) line.value = `${line.value} ${got}`
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
    line.value = SAT_DOWN_LINE
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

// --- stats (tickerVoice.ts statTiles) ---------------------------------------------------------

const stats = computed(() => statTiles({
  ageDays: ageDays.value,
  birthday: birthday.value,
  firstDate: firstDate.value,
  weight: weight.value,
  streak: streak.value,
  fed: fedTile({
    rulesApply,
    doses: dosesToday.value.length,
    due: dueToday.value.length,
    logged: loggedCompounds.value.size,
    missing: missing.value.length,
    eaten: eaten.value.length,
    missingNames: missingNames.value,
    hunger: hunger.value
  }),
  draw: drawTile(nextDraw.value),
  moodWord: moodWord.value,
  fever: fever.value,
  recovery: recovery.value,
  petsToday: petsToday.value,
  petsTotal: pets.value.total,
  visitorPets: visits.value?.pets
}))

const todaySummary = computed(() => todaySummaryLine({
  doses: dosesToday.value.length,
  rulesApply,
  due: dueToday.value.length,
  missing: missing.value.length,
  eaten: eaten.value.length,
  missingNames: missingNames.value,
  workoutMinutes: workoutMinutes.value,
  sodasToday: sodasToday.value
}))

// --- arrival ----------------------------------------------------------------------------------

/** The greeting, read from the figures (tickerVoice.ts arrivalLine). */
const greeting = () => arrivalLine({
  today: today.value,
  asleep: asleep.value,
  birthday: birthday.value,
  firstDate: firstDate.value,
  fever: fever.value,
  awayDays: awayDays.value,
  hunger: hunger.value,
  missing: missing.value.length,
  missingNames: missingNames.value,
  sluggish: sluggish.value,
  sleepMin: sleepMin.value,
  nextDraw: nextDraw.value,
  recovery: recovery.value,
  streak: streak.value,
  unloggedThisWeek: unloggedThisWeek.value,
  oldestOpen: oldestOpen.value,
  weight: weight.value,
  ageDays: ageDays.value,
  records: records.value
})

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
  line.value = flinchLine(n)
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
  line.value = resultsLandedLine(draw.date, flags)
  pet.value?.trigger(flags ? 'thump' : 'celebrate')
}

// --- what changed since its last look ---------------------------------------------------------
// A snapshot of the figures TICKER saw last visit, kept in its memory; on arrival the difference
// is its news (tickerVoice.ts newsSince). Absence shows too: three days unseen and it has sat
// down to wait.

const SNAPSHOT_KEY = 'snapshot'

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

const news = (snap: Snapshot) => newsSince(snap, {
  today: today.value,
  streak: streak.value,
  scans: scans.value,
  arms: arms.value,
  activeCycle: activeCycle.value,
  planned: plannedData.value ?? [],
  workouts: workoutsData.value ?? [],
  weight: weight.value,
  loggedDays: loggedDays.value
})

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
  line.value = saluteLine(weekTally.value?.hit ?? 0, cycleClause.value)
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
  line.value = achievementLine(fresh, rewards)
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
    const hello: News = { line: helloLine(visitorLabel.value), event: 'celebrate' }
    line.value = hello.line
    timers.push(setTimeout(() => tell(hello), 800))
    $fetch('/api/ticker/visit', { method: 'POST' }).catch(() => { /* no footprint today, then */ })
    return
  }

  lastVisit.value = loadSnapshot()
  if (awayDays.value >= 3) sitting.value = true // it sat down to wait; any press stands it up
  line.value = greeting()
  const reactions: Array<() => void> = []
  if (sodasToday.value) reactions.push(flinch)
  if (lastVisit.value) for (const item of news(lastVisit.value)) reactions.push(() => tell(item))
  const footprints = visitorsNews(visits.value, recall<number>('visitsSeen') ?? 0)
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
