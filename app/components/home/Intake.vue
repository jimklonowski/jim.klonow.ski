<template>
  <div>
    <!-- Which meals are in (the three mains always, a snack slot only once logged) ride in the
         header, so the rows below are all meters. -->
    <TuiHeader
      :label="`INTAKE · ${dayLabel}`"
      fill
      class="mt-4.5"
    >
      <span class="flex gap-2 text-meta tracking-wide">
        <span
          v-for="t in ticks"
          :key="t.slot"
          :class="t.logged ? 'text-accent' : 'text-ghost'"
          :title="t.title"
        >{{ t.short }} {{ t.logged ? '✓' : '–' }}</span>
      </span>
    </TuiHeader>

    <!-- Three meters on one grid (option C of the 2026-10-29 side-panel canvas, Jim's pick):
         label · value · bar · figure · button, so protein, water and soda read as one set of
         daily targets and each button sits beside the number it moves. The value column is a
         min width, not a fixed one, so a 3-digit water total pushes its bar instead of
         overflowing into it. -->
    <div
      data-scrub
      class="flex flex-col gap-2 mt-2.5 text-meta"
    >
      <div
        class="flex items-center gap-2"
        :title="protein.title"
      >
        <span class="w-14 shrink-0 text-label tracking-[0.06em] text-muted">PROTEIN</span>
        <span class="min-w-[12ch] shrink-0 whitespace-nowrap"><span
          class="num text-row leading-none"
          :class="protein.valueClass"
        >{{ protein.value }}</span><span class="text-muted">{{ ` ${protein.unit}` }}</span></span>
        <span
          v-if="protein.pct != null"
          class="relative flex-1 h-1.25 bg-line-soft overflow-hidden"
          role="progressbar"
          :aria-valuenow="protein.pct"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`Protein ${dayWord} against the target`"
        >
          <span
            class="absolute inset-y-0 left-0 bg-accent opacity-70"
            :style="{ width: `${Math.min(100, protein.pct)}%` }"
          />
        </span>
        <span
          v-else
          class="flex-1"
        />
        <span
          class="w-[4ch] shrink-0 text-right"
          :class="protein.met ? 'text-accent' : 'text-muted'"
        >{{ protein.pct != null ? `${protein.pct}%` : '' }}</span>
        <!-- The clock's meal when it isn't logged yet (or the next main meal after it), straight
             into the hub's quick log; a scrubbed-to day opens that day's entry instead. -->
        <NuxtLink
          v-if="canEdit"
          :to="mealLink.to"
          :title="mealLink.title"
          class="tui-btn w-17 shrink-0 justify-center px-0 py-1.5"
        >{{ mealLink.text }}</NuxtLink>
      </div>

      <div
        v-if="water"
        class="flex items-center gap-2"
        :title="`${water.pours} pour${water.pours === 1 ? '' : 's'} ${dayWord}`"
      >
        <span class="w-14 shrink-0 text-label tracking-[0.06em] text-muted">WATER</span>
        <span class="min-w-[12ch] shrink-0 whitespace-nowrap"><span
          class="num text-row leading-none"
          :class="water.met ? 'text-accent' : 'text-hi'"
        >{{ water.oz }}</span><span class="text-muted"> / {{ water.goal }} oz</span></span>
        <span
          class="relative flex-1 h-1.25 bg-line-soft overflow-hidden"
          role="progressbar"
          :aria-valuenow="Math.round(water.ozRaw)"
          aria-valuemin="0"
          :aria-valuemax="water.goal"
          :aria-label="`Water ${dayWord} against the daily goal`"
        >
          <span
            class="absolute inset-y-0 left-0 bg-water transition-[width] duration-300"
            :style="{ width: `${Math.min(100, water.pct)}%` }"
          />
        </span>
        <span
          class="w-[4ch] shrink-0 text-right"
          :class="water.met ? 'text-accent' : 'text-muted'"
        >{{ water.pct }}%</span>
        <button
          v-if="canEdit"
          type="button"
          class="tui-btn w-17 shrink-0 justify-center px-0 py-1.5"
          :disabled="addingWater"
          :title="`Log ${cupOz} oz of water today`"
          @click="emit('addWater')"
        >
          {{ addingWater ? '…' : `+ ${cupOz} OZ` }}
        </button>
      </div>

      <!-- Soda has no target to fill, so its "bar" is the week: one cell per day ending on the
           shown day (outlined), soda-red when any was logged. The figure is the 7-day count. -->
      <div
        v-if="soda"
        class="flex items-center gap-2"
      >
        <span class="w-14 shrink-0 text-label tracking-[0.06em] text-muted">SODA</span>
        <span class="min-w-[12ch] shrink-0 whitespace-nowrap"><span
          class="num text-row leading-none"
          :class="soda.shown ? 'text-hi' : 'text-accent'"
        >{{ soda.shown }}</span><span class="text-muted">{{ isToday ? ' today' : ' that day' }}</span></span>
        <span
          class="flex-1 flex gap-0.5 h-1.25"
          :aria-label="`${soda.week} soda${soda.week === 1 ? '' : 's'} in the 7 days to ${dayWord === 'today' ? 'today' : dayLabel}`"
          role="img"
        >
          <span
            v-for="(d, i) in soda.days"
            :key="d.date"
            class="flex-1"
            :class="[d.n ? 'bg-soda' : 'bg-line-soft', i === soda.days.length - 1 ? 'outline-1 outline-offset-1 outline-dim' : '']"
            :title="`${formatDate(d.date, 'monthDay')}: ${d.n} soda${d.n === 1 ? '' : 's'}`"
          />
        </span>
        <span
          class="w-[4ch] shrink-0 text-right text-muted"
          :title="`${soda.week} in the last 7 days`"
        >{{ soda.week }}/7d</span>
        <button
          v-if="canEdit"
          type="button"
          class="tui-btn w-17 shrink-0 justify-center px-0 py-1.5"
          :disabled="addingSoda"
          :title="`Log a soda today: ${sodaLabel}`"
          @click="emit('addSoda')"
        >
          {{ addingSoda ? '…' : '+ SODA' }}
        </button>
      </div>

      <!-- The day's calories and macros, and the week's average against the protein target —
           the figures the old FOOD line carried. Wraps rather than truncates: in a narrow column
           the average drops to its own right-aligned line. -->
      <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pt-1.5 border-t border-dashed border-line text-muted">
        <span class="shrink-0">
          <span
            :class="day.meals.length ? 'text-hi' : ''"
            :title="kcalTitle"
          >{{ kcalText }}</span><template v-if="day.meals.length"> · {{ fmtMacros(day) }}</template>
        </span>
        <span
          v-if="avg.days"
          class="ml-auto min-w-0 flex flex-wrap justify-end gap-x-1.5"
          :title="avgTitle"
        >
          <span class="whitespace-nowrap">7d avg {{ fmtKcal(avg.kcal) }} kcal</span>
          <span class="whitespace-nowrap">· <span
            class="text-hi"
            :class="target && avg.protein_g >= target ? 'text-accent' : ''"
          >{{ avg.protein_g }}</span> g{{ avg.estimated ? ' est.' : '' }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The home page's INTAKE block under the day's doses: protein, water and soda as three aligned
// meters with their one-tap buttons, then the day's calories and the 7-day average. Food figures
// come from shared/utils/nutrition.ts (library and hand-entered label figures first, the model's
// only where it was explicitly asked); water and soda from the page, which reads the same journal
// list useQuickLog patches, so a tap moves its row on the spot. Typing meals stays on /journal.
import type { JournalEntry } from '~/data/journal'
import {
  MAIN_SLOTS, MEAL_SLOTS, MEAL_SLOT_LABELS, fmtKcal, fmtMacros, isSnackSlot, nutritionAverage, nutritionIsEstimated,
  nutritionWindow, slotForTime, type DayNutrition, type EstimateIndex, type MainSlot, type MealSlot
} from '#shared/utils/nutrition'
import { localTimeNow } from '#shared/utils/time'

const props = defineProps<{
  /** The shown day's meals summed (dayNutrition of that day's entry). */
  day: DayNutrition
  /** The shown day (useDayScrub's asOf): the 7-day average ends on it. */
  date: string
  /** "TODAY" or "OCT 27", for the header. */
  dayLabel: string
  /** Every journal entry, for the trailing-week average. */
  entries: JournalEntry[]
  index: EstimateIndex
  /** The profile's protein_target_g, or null when none is set. */
  target: number | null
  /** The shown day's water against the goal, or null when the role has none. */
  water: { oz: string, ozRaw: number, goal: number, pct: number, met: boolean, pours: number } | null
  /** Sodas per day for the 7 days ending on the shown day, oldest first; null when not shown. */
  sodaDays: Array<{ date: string, n: number }> | null
  /** Write roles get the buttons; read-only viewers only the figures. */
  canEdit: boolean
  cupOz: number
  /** What + SODA logs ("DR PEPPER 12oz can"), for its title. */
  sodaLabel: string
  addingWater: boolean
  addingSoda: boolean
}>()

const emit = defineEmits<{ addWater: [], addSoda: [] }>()

const today = useToday()
const isToday = computed(() => props.date >= today.value)
const dayWord = computed(() => isToday.value ? 'today' : `on ${formatDate(props.date, 'monthDay')}`)

// --- meals ---
const SHORT: Record<MealSlot, string> = {
  breakfast: 'B', snack: 'S', snack_am: 'AM', lunch: 'L', snack_pm: 'PM', dinner: 'D', snack_eve: 'EVE'
}
const loggedSlots = computed(() => new Set(props.day.meals.map(m => m.slot)))
const ticks = computed(() => MEAL_SLOTS
  .filter(slot => !isSnackSlot(slot) || loggedSlots.value.has(slot))
  .map(slot => ({
    slot,
    short: SHORT[slot],
    logged: loggedSlots.value.has(slot),
    title: `${MEAL_SLOT_LABELS[slot]}${loggedSlots.value.has(slot) ? '' : ' — not logged'}`
  }))
)

// The clock's meal, re-read each minute so an open tab moves from lunch to dinner. useNow is the
// reactive trigger; localTimeNow() reads the home-timezone wall clock. Today only: a past day's
// quick log would land in today's entry.
const now = useNow({ interval: 60_000 })
const suggested = computed<MainSlot | null>(() => {
  if (!isToday.value) return null
  void now.value
  const from = MAIN_SLOTS.indexOf(slotForTime(localTimeNow()))
  return MAIN_SLOTS.slice(from).find(slot => !loggedSlots.value.has(slot)) ?? null
})
// Button-width names: "+ BREAKFAST" doesn't fit the meter column.
const MEAL_BUTTON: Record<MainSlot, string> = { breakfast: '+ BFAST', lunch: '+ LUNCH', dinner: '+ DINNER' }
const mealLink = computed(() => {
  if (suggested.value) {
    return {
      to: { path: '/journal', query: { meal: suggested.value }, hash: '#food' },
      text: MEAL_BUTTON[suggested.value],
      title: `Log ${MEAL_SLOT_LABELS[suggested.value].toLowerCase()}`
    }
  }
  return isToday.value
    ? { to: '/journal#food', text: 'FOOD →', title: 'The food log' }
    : { to: `/journal/${props.date}`, text: 'OPEN →', title: `The ${formatDate(props.date, 'monthDay')} entry` }
})

/** The PROTEIN meter: grams against the profile's target, a bar when both are known. */
const protein = computed(() => {
  const d = props.day
  const floor = d.missing.length > 0
  const grams = d.estimated > 0 ? Math.round(d.protein_g) : null
  const target = props.target
  const unit = `${target ? `/ ${target} g` : 'g'}${floor ? ' +' : ''}`
  const title = floor ? 'A meal has no figures yet — this is a floor' : undefined
  if (grams == null) return { value: '—', unit, pct: null, met: false, valueClass: 'text-muted', title }
  const pct = target ? Math.round((grams / target) * 100) : null
  const met = pct != null && pct >= 100
  return { value: String(grams), unit, pct, met, valueClass: met ? 'text-accent' : 'text-hi', title }
})

// --- soda ---
const soda = computed(() => {
  const days = props.sodaDays
  if (!days?.length) return null
  return { days, shown: days.at(-1)!.n, week: days.reduce((s, d) => s + d.n, 0) }
})

// --- calories and the week ---
// Same conventions as the hub card: "≈" and "est." only when a model figure is in the total, a
// trailing "+" when a logged meal has no figures at all (the total is a floor).
const estimated = computed(() => nutritionIsEstimated(props.day))
const kcalText = computed(() => {
  if (!props.day.meals.length) return 'no meals logged'
  return `${estimated.value ? '≈ ' : ''}${fmtKcal(props.day.kcal)} kcal${estimated.value ? ' est.' : ''}${props.day.missing.length ? ' +' : ''}`
})
const kcalTitle = computed(() => {
  const parts: string[] = []
  if (props.day.sodaKcal) parts.push(`includes ${fmtKcal(props.day.sodaKcal)} kcal of soda`)
  if (props.day.missing.length) parts.push(`${props.day.missing.length} meal${props.day.missing.length === 1 ? '' : 's'} without figures — the total is a floor`)
  return parts.join(' · ') || undefined
})

// The trailing week as of the shown day, ending the day before it until its dinner is logged
// (nutritionWindow) — so a scrubbed-to day reads the average Jim would have seen that day.
const avg = computed(() => nutritionAverage(props.entries, props.index, props.date, 7))
const avgTitle = computed(() => {
  const w = nutritionWindow(props.entries, props.date, 7)
  const to = w.to === props.date
    ? (isToday.value ? 'today' : formatDate(w.to, 'monthDay'))
    : (isToday.value ? 'yesterday' : formatDate(w.to, 'monthDay'))
  return `Days with every meal estimated, ${formatDate(w.from, 'monthDay')} – ${to} · ${avg.value.days} day${avg.value.days === 1 ? '' : 's'}${props.target ? ` · protein target ${props.target} g` : ''}`
})
</script>
