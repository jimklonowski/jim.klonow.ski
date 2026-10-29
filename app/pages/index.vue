<template>
  <div
    v-if="!hasSession"
    class="px-6 py-20 text-center"
  >
    <p class="num-display text-hi text-figure">
      jim.klonow.ski
    </p>
    <p class="mt-2 text-row text-muted">
      personal health terminal · bloodwork, body composition, protocol log
    </p>
    <div class="mt-6 flex items-center justify-center gap-2.5">
      <NuxtLink
        to="/labs/login"
        class="tui-btn tui-btn-accent"
      >
        ❯ sign in
      </NuxtLink>
      <!-- Plain <a>: /demo is a nitro server route (mints the demo cookie, redirects),
           so this must be a full page load, never SPA-routed. Link-checker rules for this
           file are relaxed in eslint.config.mjs since /demo isn't a Vue route. -->
      <a
        href="/demo"
        class="tui-btn"
      >
        view demo
      </a>
    </div>
    <p class="mt-3 text-meta text-faint">
      demo mode — a fictional persona with synthetic data · no sign-up
    </p>
    <a
      :href="REPO_URL"
      target="_blank"
      rel="noopener"
      class="mt-5 inline-flex items-center gap-1.5 text-meta text-muted hover:text-accent"
    >
      <UIcon
        name="simple-icons:github"
        class="size-3.5"
      />
      source on github
    </a>
  </div>

  <TuiDataState
    v-else-if="overviewError"
    :error="overviewError"
    @retry="refreshOverview"
  />

  <div
    v-else
    class="grid gap-px bg-line border-b border-line"
    :class="isFullAccess
      ? 'lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,390px)_minmax(0,1fr)_minmax(0,400px)]'
      : 'lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]'"
  >
    <!-- Three breakpoints. xl (1280px+): the three columns — they need ~1270px of content, so
         at lg those fixed tracks plus a 480px minimum overflowed the viewport and scrolled the
         whole page sideways. lg (1024–1279): vitals + the middle column, with the digest dropping
         below them across both tracks (daily and weekly side by side). Under lg: one column, and
         the vitals section lays its own blocks out two-up from md so a 1000px-wide row doesn't
         put a delta 800px from the value it belongs to. Every track is minmax(0,…) for the same
         reason the note below describes.

         Panel dividers are the grid's own background showing through 1px gaps.
         Every section needs min-w-0: stacked to one auto column on mobile, the track's
         automatic minimum is its widest item's min-content width, so a long unbreakable
         row (a cycle plan line, say) widens the grid past the viewport and the page
         scrolls sideways under a header that stayed put. -->
    <!-- Four blocks (vitals, protocol, cycle, next draw). Two-up between md and lg, where the
         section is the full page width; one stack in the 390px column from lg. -->
    <!-- The whole column scrubs with the vitals ‹ › (useDayScrub, Jim 2026-10-28): doses, food,
         the workout line and the WATER bar all read the shown day. On a phone a horizontal swipe
         anywhere in the column steps it too (useSwipe on this element; right = back a day). -->
    <section
      ref="scrubColumnEl"
      class="bg-bg px-6 pt-4 pb-5 min-w-0 md:grid md:grid-cols-2 md:gap-x-8 lg:block"
    >
      <!-- tour ids sit on the compact components, not the sections — a full-height column
           as the popover anchor pushes the tour popover to the viewport edge. -->
      <!-- The wrapper keeps vitals + the WATER bar one cell of the md two-up grid. -->
      <div>
        <HomeVitals
          id="tour-vitals"
          v-model:date="shownDate"
          :entries="entries"
          :metrics="healthMetrics"
          :protein="protein"
        />

        <!-- The shown day's water against the profile's goal, closing the vitals block (moved up
             from under the quick-log buttons, Jim 2026-10-29) — the same bar the PROTEIN tile
             draws, filled with the hub tracker's water blue (shared/utils/water.ts has the goal
             and the maths). The local mirror useQuickLog patches after a + CUP tap is what this
             reads, so the bar fills on the spot. The vitals ‹ › scrub it too: a past day reads
             "WATER · OCT 25" with that day's pours, and the label is a tap back to today. -->
        <div
          v-if="water"
          class="flex items-center gap-2 mt-3 text-meta"
          :title="`${water.pours} pour${water.pours === 1 ? '' : 's'} ${water.dayWord}`"
        >
          <button
            v-if="!water.isToday"
            type="button"
            class="text-accent hover:text-accent-hover cursor-pointer whitespace-nowrap"
            title="Back to today"
            @click="resetDay()"
          >
            {{ water.label }}
          </button>
          <span
            v-else
            class="text-muted"
          >{{ water.label }}</span>
          <span
            class="num text-row leading-none"
            :class="water.met ? 'text-accent' : 'text-hi'"
          >{{ water.oz }}</span>
          <span class="text-muted whitespace-nowrap">/ {{ water.goal }} oz</span>
          <span
            class="relative flex-1 h-1.25 bg-line-soft overflow-hidden"
            role="progressbar"
            :aria-valuenow="Math.round(water.ozRaw)"
            aria-valuemin="0"
            :aria-valuemax="water.goal"
            :aria-label="`Water ${water.dayWord} against the daily goal`"
          >
            <span
              class="absolute inset-y-0 left-0 bg-water transition-[width] duration-300"
              :style="{ width: `${Math.min(100, water.pct)}%` }"
            />
          </span>
          <span :class="water.met ? 'text-accent' : 'text-muted'">{{ water.pct }}%</span>
        </div>
      </div>

      <div>
        <TuiHeader
          :label="`PROTOCOL · LOGGED ${isToday ? 'TODAY' : shownLabel}`"
          fill
          class="mt-4.5 md:mt-0 lg:mt-4.5"
        />
        <!-- Identical doses fold into one row (shared/utils/doseGroups.ts): three iron tablets
             read "×3 · 3 × 75 mg" with their times underneath, not three rows. The IU→mass
             equivalent is desktop-only; on a phone it ate half the row for a conversion the
             reader knows. -->
        <div
          v-if="doseRows.length"
          class="flex flex-col gap-1.5 mt-2.5 text-small"
        >
          <div
            v-for="(row, i) in doseRows"
            :key="`${row.first.time}-${row.first.compound}-${i}`"
            class="flex flex-col gap-0.5"
          >
            <div class="flex gap-2.5">
              <span class="text-ghost shrink-0">{{ row.first.time }}</span>
              <NuxtLink
                :to="`/journal/compound/${encodeURIComponent(row.first.compound)}`"
                class="text-body hover:text-accent truncate"
              >{{ row.first.compound }}<span
                v-if="row.count > 1"
                class="text-muted"
              > ×{{ row.count }}</span></NuxtLink>
              <span
                class="ml-auto shrink-0 text-muted"
                :title="row.count > 1 ? `${row.total} ${unitLabel(row.first.unit)} ${dayWord}` : undefined"
              >{{ row.count > 1 ? `${row.count} × ` : '' }}{{ row.first.dose }} {{ unitLabel(row.first.unit) }}<span
                v-if="equivalent(row.first)"
                class="hidden lg:inline"
              > ({{ equivalent(row.first) }})</span>{{ row.first.site ? ` · ${shortSite(row.first.site)}` : '' }}</span>
            </div>
            <div
              v-if="row.times.length > 1"
              class="flex gap-2.5 text-meta"
            >
              <span class="text-ghost shrink-0 invisible">{{ row.first.time }}</span>
              <span class="text-ghost">{{ row.times.join(' · ') }}</span>
            </div>
          </div>
        </div>
        <p
          v-else
          class="mt-2.5 text-small text-muted"
        >
          No doses logged {{ dayWord }}.
        </p>

        <!-- Today's meals and the week's protein, from the same figures as the hub's food card. -->
        <HomeFood
          v-if="isFullAccess"
          :day="shownNutrition"
          :date="asOf"
          :entries="entries"
          :index="estimateIndex"
          :target="proteinTarget"
          :can-edit="canEdit"
        />

        <!-- Mirrors the dose rows above: label left, value right-aligned, stats on their own
           line so nothing has to wrap mid-metric in this 390px column. Lists every session
           from the most recent workout day — a three-workout day used to show only its last. -->
        <div
          v-if="latestWorkouts.length"
          class="mt-3.5 text-small text-muted space-y-2"
        >
          <div
            v-for="(w, i) in latestWorkouts"
            :key="`${w.date}-${w.start_time ?? i}`"
          >
            <div class="flex items-baseline gap-2">
              <span
                v-if="i === 0"
                class="shrink-0"
              >└ {{ workoutsOnShownDay ? '' : 'last ' }}workout{{ latestWorkouts.length > 1 ? 's' : '' }}:</span>
              <span class="ml-auto text-body text-right">{{ w.workout_type ?? 'Session' }}</span>
            </div>
            <div class="flex flex-wrap justify-end gap-x-1.5 mt-0.5">
              <span
                v-for="(part, j) in workoutParts(w)"
                :key="part"
                class="whitespace-nowrap"
              >{{ j ? `· ${part}` : part }}</span>
            </div>
          </div>
        </div>

        <div class="flex gap-2 mt-4.5">
          <!-- Scrubbed back, the button is the way into that day's entry instead. -->
          <NuxtLink
            v-if="isFullAccess"
            :to="`/journal/${asOf}`"
            class="tui-btn tui-btn-accent flex-1 justify-center"
          >
            {{ isToday ? (canEdit ? '+ LOG TODAY' : 'TODAY') : (canEdit ? `EDIT ${shownLabel}` : shownLabel) }}
          </NuxtLink>
          <NuxtLink
            to="/journal/calendar"
            class="tui-btn flex-1 justify-center"
          >
            CALENDAR
          </NuxtLink>
          <NuxtLink
            v-if="isFullAccess"
            to="/journal/photos"
            class="tui-btn flex-1 justify-center"
          >
            PHOTOS
          </NuxtLink>
          <NuxtLink
            v-else
            to="/journal/supplements"
            class="tui-btn flex-1 justify-center"
          >
            STACK
          </NuxtLink>
        </div>

        <!-- One-tap soda and water from here too (useQuickLog): the same defaults the hub's
             trackers use — the last drink logged, the profile's cup size — and the status line
             above moves with each tap. Write roles only. -->
        <div
          v-if="canEdit"
          class="flex gap-2 mt-2"
        >
          <button
            type="button"
            class="tui-btn flex-1 justify-center min-w-0"
            :disabled="addingSoda"
            :title="`Log a soda: ${sodaLabel}`"
            @click="addSoda()"
          >
            <!-- The drink's size is desktop-only: "+ SODA · DR PEPPER 12oz can" truncated to
                 "12OZ…" in a phone-width button. -->
            <span class="truncate">{{ addingSoda ? 'LOGGING…' : `+ SODA · ${sodaDrink}` }}<span class="hidden lg:inline">{{ addingSoda ? '' : sodaSize }}</span></span>
          </button>
          <button
            type="button"
            class="tui-btn flex-1 justify-center min-w-0"
            :disabled="addingWater"
            :title="`Log ${cupOz} oz of water`"
            @click="addWater()"
          >
            <span class="truncate">{{ addingWater ? 'LOGGING…' : `+ CUP ${cupOz}oz` }}</span>
          </button>
        </div>
      </div>

      <HomeCycle
        :cycles="cycles"
        :entries="entries"
        :draws="draws"
        :health-metrics="healthMetrics"
      />

      <HomeNextDraw
        :plans="plannedDraws"
        :draw-dates="drawDates"
        :is-owner="isOwner"
      />
    </section>

    <section class="bg-bg px-6 pt-4 pb-5 min-w-0">
      <HomeFlaggedMarkers
        id="tour-flagged"
        :flagged="flagged"
        :flag-counts="flagCounts"
        :draw-date="latestDraw?.date ?? null"
      />

      <div
        v-if="contextNote"
        class="mt-3.5 px-3 py-2.5 bg-inset border border-dashed border-line-input text-small text-muted"
      >
        ℹ {{ contextNote }}
      </div>

      <div class="flex flex-wrap items-baseline gap-3.5 mt-3.5 text-small">
        <span class="text-faint">quick:</span>
        <NuxtLink
          to="/labs"
          class="text-accent hover:text-accent-hover"
        >full panel →</NuxtLink>
        <NuxtLink
          to="/journal/trends"
          class="text-accent hover:text-accent-hover"
        >trends →</NuxtLink>
        <NuxtLink
          v-if="isOwner"
          to="/labs/upload"
          class="text-accent hover:text-accent-hover"
        >upload results →</NuxtLink>
        <NuxtLink
          to="/labs/dexa"
          class="text-accent hover:text-accent-hover"
        >dexa{{ latestDexa ? ` (${formatDate(latestDexa.date, 'monthDay').toLowerCase()})` : '' }} →</NuxtLink>
        <NuxtLink
          v-if="isOwner"
          to="/tools/sharing"
          class="text-accent hover:text-accent-hover"
        >sharing →</NuxtLink>
      </div>

      <!-- Draw-over-draw sparklines for the markers the protocol is steered by -->
      <HomeWatchMarkers :draws="draws" />

      <TuiHeader
        label="90-DAY TRENDS"
        fill
        class="mt-5"
      />
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
        <NuxtLink
          v-for="t in trends"
          :key="t.label"
          to="/journal/trends"
          :aria-label="`${t.label} — open 90-day trends`"
          class="block bg-raised border border-line-soft px-3 py-2.5 hover:bg-row-hover hover:border-line-input transition-colors"
        >
          <div class="flex justify-between text-label text-muted">
            <span>{{ t.label }}</span>
            <span class="text-body">{{ t.latest }}</span>
          </div>
          <TuiSparkline
            :values="t.values"
            class="mt-1.5"
          />
        </NuxtLink>
      </div>

      <!-- The latest DEXA scan on the body mesh, with its headline figures and regions. Fills
           the space this column used to leave empty below the trends on a wide screen. -->
      <HomeBody
        :latest="latestDexa"
        :previous="previousDexa"
      />
    </section>

    <!--
      The digest is the one panel with no length ceiling — a wordy weekly recap used to set the
      row height and leave the other two columns sitting above a screen of dead space. As the
      third column (xl) the inner box is capped to the viewport (chrome is 7.1875rem: 53px header
      + 31px status + 31px footer) as a flex column: HomeDigest scrolls its prose region internally
      and keeps its action bar in flow at the bottom.

      The cap lives on an inner box, not the section, because the section stays stretched to the
      row: when the middle column runs taller than the cap, a capped section left the rest of its
      cell showing the grid's line-coloured background — an empty block under the TICKER bar once
      you scrolled to the page bottom. The inner box is also sticky: nothing in the page chrome is
      sticky, so as the header and status line scroll off the top the box pins to the viewport and
      the cap grows by the same amount (--chrome-scrolled, tracked in the script, 0 → 84px), which
      keeps the bar pinned just above the footer for the whole scroll. h-full means it never
      outgrows the row when the row is the shorter of the two.

      At lg it spans both tracks under the other two sections and flows at its natural height,
      daily and weekly side by side.
    -->
    <section
      v-if="isFullAccess"
      class="bg-bg min-w-0 lg:col-span-2 xl:col-span-1 xl:min-h-0"
    >
      <div
        class="px-6 pt-4 pb-5 xl:sticky xl:top-0 xl:h-full xl:max-h-[calc(100dvh-7.25rem+var(--chrome-scrolled,0px))] xl:flex xl:flex-col xl:min-h-0"
        :style="{ '--chrome-scrolled': `${chromeScrolled}px` }"
      >
        <HomeDigest
          id="tour-digest"
          :digests="digests"
          :is-owner="isOwner"
          :rhr="latestRhr"
          :sluggish="sluggish"
          :recovery="latestRecovery"
          :sodas-today="sodasToday"
          :latest-draw-date="latestDraw?.date ?? null"
          :flag-count="flagCounts.high + flagCounts.low"
          :accessories="wardrobe.accessories"
          :build="wardrobe.build"
          @refresh="refreshDigests"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { diffDays } from '#shared/utils/dates'
import { workoutStartMs } from '#shared/utils/time'
import { isFullAccessRole } from '#shared/utils/access'
import { WATER_DEFAULT_CUP_OZ, fmtOzValue } from '#shared/utils/water'
import { isSluggish, latestRecovery as petRecovery } from '#shared/utils/petState'
import { REPO_URL } from '#shared/utils/site'
import { wardrobeOf } from '#shared/utils/tickerWardrobe'
import { groupDoses } from '#shared/utils/doseGroups'
import { dayNutrition, type EstimateIndex } from '#shared/utils/nutrition'
import { profileNumber } from '#shared/utils/profile'
import { iuEquivalentLabel } from '#shared/utils/peptideCalc'
import type { PeptideEntry } from '~/data/journal'

const { role, isOwner, canEdit } = await useAuth()

// The doctor role gets a curated clinical view: no daily entries, photos, food, or AI digests
// (the digest endpoint would 403), so those panels and links are hidden rather than
// rendered broken. See shared/utils/access.ts.
const isFullAccess = computed(() => isFullAccessRole(role.value))

// How much of the chrome above the grid (53px header + 31px status line) has scrolled off the
// top of the viewport. The digest column's sticky box (template above) adds this to its height
// cap so it grows into the room the header vacates. Clamped, so once past the chrome the value
// — and the inline style it feeds — stops changing on every scroll event. Read once on mount
// too: a reload restores the old scroll position without firing a scroll event.
const CHROME_ABOVE_PX = 84
const chromeScrolled = ref(0)
function trackChromeScrolled() {
  chromeScrolled.value = Math.min(Math.max(window.scrollY, 0), CHROME_ABOVE_PX)
}
onMounted(trackChromeScrolled)
useEventListener('scroll', trackChromeScrolled, { passive: true })

// Same conditional-composable rule as the cycles/planned-draws fetches below: only the roles
// that get the + SODA / + CUP buttons load their defaults. Unconditional, this ran for guests
// too — two rejected list fetches on every landing, server-rendered and again on mount.
const quickLog = canEdit.value ? await useQuickLog() : null
const sodaLabel = computed(() => quickLog?.sodaLabel.value ?? 'SODA')
const sodaDrink = computed(() => quickLog?.sodaDrink.value ?? 'SODA')
const sodaSize = computed(() => quickLog?.sodaSize.value ? ` ${quickLog.sodaSize.value}` : '')
const cupOz = computed(() => quickLog?.cupOz.value ?? WATER_DEFAULT_CUP_OZ)
const addingSoda = computed(() => quickLog?.addingSoda.value ?? false)
const addingWater = computed(() => quickLog?.addingWater.value ?? false)
const addSoda = () => quickLog?.addSoda()
// A cup is always today's: if the column is scrubbed back, return so the bar shows the pour.
const addWater = () => {
  resetDay()
  return quickLog?.addWater()
}
// The meal figures and the protein target behind the PROTEIN vitals row and the food line. The
// estimates endpoint returns nothing for the doctor and the profile is a full-access read, so
// both are skipped for roles that don't get food (and for guests, who have no session).
const estimates = isFullAccess.value ? await useMealEstimates() : null
const profile = isFullAccess.value ? await useProfile() : null
const estimateIndex = computed<EstimateIndex>(() => estimates?.index.value ?? new Map())
const proteinTarget = computed(() => profile ? profileNumber(profile.data.value, 'protein_target_g', 0) || null : null)
const {
  hasSession, entries, draws, healthMetrics, latestDraw, latestDexa, previousDexa, dexaScans,
  allWorkouts, todayEntry, sodasToday, flagged, flagCounts,
  error: overviewError, refresh: refreshOverview
} = useOverview(role)

// --- the shown day ---
// The day the left column is scrubbed to (null = today). HomeVitals draws the ‹ › on the same
// ref through v-model; useDayScrub on it here gives this page the same derived values the card
// has, so the doses, food, workout line, LOG button and WATER bar all follow without the card
// having to expose anything. ‹ stops at the first day of either series, as in the card.
const shownDate = ref<string | null>(null)
const firstDate = computed(() => firstDateOf(entries.value, healthMetrics.value))
const { asOf, isToday, label: shownLabel, step: stepDay, reset: resetDay } = useDayScrub(shownDate, firstDate)
/** "today" / "on Oct 25" — the word the per-day sentences end with. */
const dayWord = computed(() => isToday.value ? 'today' : `on ${formatDate(asOf.value, 'monthDay')}`)
/** The shown day's journal entry, if it has one. */
const shownEntry = computed(() => isToday.value ? todayEntry.value : entries.value.find(e => e.date === asOf.value) ?? null)

// A horizontal swipe anywhere in the column steps the day on a phone (Jim 2026-10-28): right =
// back a day, left = forward. VueUse's listeners are passive, so vertical scrolling is untouched;
// the direction is the dominant axis, and the 60px threshold keeps a wobbly scroll from stepping.
// The template key differs from the variable name on purpose: with the same name Vue 3.5 tries
// to assign the element onto this readonly ref and it stays null (no listeners, no swipe).
const scrubColumn = useTemplateRef<HTMLElement>('scrubColumnEl')
useSwipe(scrubColumn, {
  threshold: 60,
  onSwipeEnd(_e, direction) {
    if (direction === 'right') stepDay(-1)
    else if (direction === 'left') stepDay(1)
  }
})

/** Today's meals summed from their figures — the food line and the PROTEIN row read it while the column shows today. */
const todayNutrition = computed(() => dayNutrition(todayEntry.value, estimateIndex.value))
// The PROTEIN row and the food line are day totals, not "latest as of" readings, so the shown
// day's meals are summed here.
const shownNutrition = computed(() => isToday.value ? todayNutrition.value : dayNutrition(shownEntry.value, estimateIndex.value))
/** Null (no row) for roles without food; `grams` null until a meal with figures is logged. */
const protein = computed(() => {
  if (!isFullAccess.value) return null
  const n = shownNutrition.value
  return { grams: n.estimated > 0 ? n.protein_g : null, target: proteinTarget.value, floor: n.missing.length > 0 }
})
/**
 * The WATER bar closing the vitals block: null for roles without the + CUP button. It follows the
 * column's ‹ › like the PROTEIN row (Jim 2026-10-28: "see previous water intakes"), reading the
 * shown day's pours against the profile's CURRENT goal (goal changes aren't versioned); the
 * label carries the day once it isn't today.
 */
const water = computed(() => {
  if (!quickLog) return null
  const { oz: ozRaw, count: pours } = isToday.value
    ? { oz: quickLog.waterOzToday.value, count: quickLog.watersToday.value }
    : quickLog.waterOn(asOf.value)
  const goal = quickLog.goalOz.value
  const pct = goal > 0 ? Math.round((ozRaw / goal) * 100) : 0
  return {
    oz: fmtOzValue(ozRaw), ozRaw, goal, pct, met: pct >= 100, pours,
    isToday: isToday.value, label: isToday.value ? 'WATER' : `WATER · ${shownLabel.value}`, dayWord: dayWord.value
  }
})

/**
 * The shown day's doses with identical ones folded (×N), in time order. Strictly that day's:
 * useOverview's dosesToday falls back to the newest entry when today is blank, which under a
 * "LOGGED TODAY" header read as today's — now ‹ is the way to yesterday's.
 */
const doseRows = computed(() => groupDoses(
  [...(shownEntry.value?.peptides ?? [])].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
))

// Same conditional-composable rule as useOverview: the role is stable for the component's
// lifetime (login is a hard navigation), so guests skip the fetch instead of 401ing.
const cyclesData = hasSession ? useCycles() : null
const cycles = computed(() => cyclesData?.data.value ?? [])
const plannedData = hasSession ? usePlannedDraws() : null
const plannedDraws = computed(() => plannedData?.data.value ?? [])
// The standing meds: the mane's streak counts them once finasteride is no longer logged.
const protocolData = hasSession ? useProtocol() : null
const drawDates = computed(() => draws.value.map(d => d.date))

// Reactive: the overnight PWA used to keep yesterday as today until a reload.
const today = useToday()

// What TICKER has earned and how it is built, so the digest's companion is the same pet as /ticker.
const wardrobe = computed(() => wardrobeOf({
  entries: entries.value, workouts: allWorkouts.value, scans: dexaScans.value, standing: protocolData?.standing.value ?? [], today: today.value
}))

// The digest composable is lazy (the slideover owns it); the home column needs it up front.
const { data: digestData, execute: loadDigests, refresh: refreshDigests } = useDigests()
if (isFullAccess.value) await loadDigests()
const digests = computed(() => digestData.value ?? [])

/** Every session from the most recent workout day on or before the shown day, latest first. */
const latestWorkouts = computed(() => {
  // "Latest as of" the shown day, the vitals card's rule — a rest day still shows the last ride.
  const upTo = isToday.value ? allWorkouts.value : allWorkouts.value.filter(w => w.date <= asOf.value)
  const last = upTo.at(-1)
  if (!last) return []
  // Sorted on the parsed instant: Whoop's ISO and Apple's local strings don't compare as text.
  return upTo
    .filter(w => w.date === last.date)
    .sort((a, b) => (workoutStartMs(b.start_time) ?? 0) - (workoutStartMs(a.start_time) ?? 0))
})

function unitLabel(unit: PeptideEntry['unit']) {
  return unit === 'iu' ? 'IU' : unit
}

/** "≈ 0.83 mg" for an IU dose of a compound with a known potency, else null. */
function equivalent(dose: PeptideEntry) {
  return dose.unit === 'iu' ? iuEquivalentLabel(dose.compound, dose.dose) : null
}

// Sessions from an earlier day get a "last workout" label so they can't read as the shown day's.
const workoutsOnShownDay = computed(() => latestWorkouts.value[0]?.date === asOf.value)

// Every session leads with its age — "1h ago" answers what a clock time makes the reader work
// out. Ticks once a minute so the label stays right while the page sits open (the PWA comes
// back from the background hours later). The default ticks every animation frame, far too often
// for a minute-grained label. VueUse stays on the 14.x line Nuxt UI depends on; 15 replaces
// `interval` with `scheduler: cb => useIntervalFn(cb, 60_000)` when that day comes.
const now = useNow({ interval: 60_000 })
// Ages are client-only: the server's `now` and the browser's differ by the request's latency,
// and a minute boundary between the two rendered "4m ago" against "5m ago" — a hydration
// mismatch on every load that straddled one. The labels appear right after mount instead.
const mounted = useMounted()

function workoutAge(w: typeof allWorkouts.value[number]): string | null {
  if (!mounted.value) return null
  // Either stored format (shared/utils/time.ts) resolves to an exact instant regardless of the
  // viewer's zone. A format-specific regex used to live here, so a merged record that carried
  // Whoop's ISO start fell through to the whole-days fallback: "1d ago" for last night's ride.
  const instant = workoutStartMs(w.start_time)
  if (instant != null) {
    const mins = Math.max(0, Math.floor((now.value.getTime() - instant) / 60000))
    if (mins < 1) return 'just now'
    // Dated yesterday but under an hour old happens right after midnight.
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
  }
  // No usable start time: whole days from the entry date, and nothing for today's — under
  // the "LOGGED TODAY" header "today" would only restate the heading.
  const days = diffDays(w.date, today.value)
  return days < 1 ? null : `${days}d ago`
}

// Kept as separate parts, not one joined string, so each metric renders non-breaking —
// otherwise this 390px column splits "18.9 min" across two lines.
function workoutParts(w: typeof allWorkouts.value[number]) {
  // Today's sessions are placed by their age alone; an older day's keep the clock time after
  // it, since "2d ago" doesn't say whether that was a morning or an evening session.
  const time = w.date === today.value ? null : workoutTime(w.start_time)
  // "♥ 119/141" = avg/max; whichever is missing drops out rather than showing a dash.
  const hr = w.avg_hr != null
    ? `♥ ${w.avg_hr}${w.max_hr != null ? `/${w.max_hr}` : ''}`
    : w.max_hr != null ? `♥ max ${w.max_hr}` : null
  return [
    workoutAge(w),
    time,
    // Whole minutes: "45.6 min" is precision nobody reads.
    w.duration_min != null ? `${Math.round(w.duration_min)} min` : null,
    w.calories != null ? `${w.calories} kcal` : null,
    hr
  ].filter((v): v is string => v != null)
}

/** Flagged markers that are expected on-protocol get a plain-language note under the rows. */
const contextNote = computed(() => {
  const notes: string[] = []
  const keys = new Set(flagged.value.map(f => f.key))
  if (keys.has('ferritin')) notes.push('ferritin re-test suggested — iron stores below optimal')
  if (keys.has('fsh') || keys.has('lh')) notes.push('FSH/LH suppression expected on-protocol')
  if (keys.has('estradiol')) notes.push('estradiol tracks total testosterone; watch for water retention')
  return notes.join('; ') || null
})

// 90-day windows (home timezone, so SSR and the client agree). Weight/HRV come off the journal,
// recovery off the Whoop metrics.
const cutoff = localDaysAgo(90)

function series<T extends { date: string }>(list: T[], pick: (row: T) => number | null | undefined) {
  return list
    .filter(row => row.date >= cutoff)
    .map(pick)
    .filter((v): v is number => v != null)
}

// --- TICKER inputs (design_handoff_ticker) ---

/** Latest hand-logged resting HR — TICKER's live beat rate. */
const latestRhr = computed(() =>
  [...entries.value].reverse().find(e => e.rhr != null)?.rhr ?? null
)

// Recovery and the short-sleep state come from the one shared read (shared/utils/petState.ts),
// so this pet and the one on /ticker are always in the same mood.
const latestRecovery = computed(() => petRecovery(healthMetrics.value))
const sluggish = computed(() => isSluggish(healthMetrics.value))

const trends = computed(() => [
  { label: 'WEIGHT lbs', values: series(entries.value, e => e.weight_lbs), decimals: 1 },
  { label: 'HRV ms', values: series(entries.value, e => e.hrv), decimals: 0 },
  { label: 'RECOVERY %', values: series(healthMetrics.value, m => m.recovery_score), decimals: 0 }
].map(t => ({
  ...t,
  latest: t.values.length ? t.values.at(-1)!.toFixed(t.decimals) : '—'
})))

useSeoMeta({ title: 'Home' })
</script>
