<template>
  <div class="mt-3.5 pt-2.5 border-t border-dashed border-line text-small">
    <!-- Which meals are in (the three mains always, a snack slot only once logged) and the
         day's calories. -->
    <div class="flex items-baseline gap-2.5">
      <span class="text-ghost shrink-0">├</span>
      <span class="text-muted shrink-0">FOOD</span>
      <span class="flex gap-2 text-meta tracking-wide shrink-0">
        <span
          v-for="t in ticks"
          :key="t.slot"
          :class="t.logged ? 'text-accent' : 'text-ghost'"
          :title="t.title"
        >{{ t.short }} {{ t.logged ? '✓' : '–' }}</span>
      </span>
      <span
        class="ml-auto min-w-0 truncate text-right"
        :class="day.meals.length ? 'text-hi' : 'text-muted'"
        :title="kcalTitle"
      >{{ kcalText }}</span>
    </div>

    <!-- Macros for the day, the week's average against the protein target. -->
    <div
      v-if="day.meals.length || avg.days"
      class="flex items-baseline gap-2.5 mt-1 text-meta text-muted"
    >
      <span class="text-ghost shrink-0 invisible">├</span>
      <span
        v-if="day.meals.length"
        class="shrink-0"
      >{{ fmtMacros(day) }}</span>
      <span
        v-if="avg.days"
        class="ml-auto min-w-0 truncate text-right"
        :title="avgTitle"
      >7d avg {{ fmtKcal(avg.kcal) }} kcal · <span
        class="text-hi"
        :class="target && avg.protein_g >= target ? 'text-accent' : ''"
      >{{ avg.protein_g }}</span>{{ target ? ` / ${target}` : '' }} g protein{{ avg.estimated ? ' est.' : '' }}</span>
    </div>

    <!-- The clock's meal when it isn't logged yet (or the next main meal after it), straight
         into the hub's quick log; otherwise just the way to the food card. -->
    <div class="flex items-baseline gap-2.5 mt-1">
      <span class="text-ghost shrink-0">└</span>
      <NuxtLink
        v-if="suggested"
        :to="{ path: '/journal', query: { meal: suggested }, hash: '#food' }"
        class="text-meta text-accent hover:text-accent-hover"
      >+ add {{ MEAL_SLOT_LABELS[suggested].toLowerCase() }} →</NuxtLink>
      <!-- A scrubbed-to day: the way to that day's entry, where its meals are. -->
      <NuxtLink
        v-else-if="!isToday"
        :to="`/journal/${asOf}`"
        class="text-meta text-muted hover:text-accent"
      >{{ formatDate(asOf, 'monthDay') }} entry →</NuxtLink>
      <NuxtLink
        v-else
        to="/journal#food"
        class="text-meta text-muted hover:text-accent"
      >food log →</NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
// The home page's food line under the day's doses: slot ticks, calories and macros from the meal
// figures (shared/utils/nutrition.ts — library and hand-entered label figures first, the model's
// only where it was explicitly asked), the 7-day average against the protein target, and a link
// into the hub's quick log for the meal that is due. Read-only here: the typing stays on /journal.
import type { JournalEntry } from '~/data/journal'
import {
  MAIN_SLOTS, MEAL_SLOTS, MEAL_SLOT_LABELS, fmtKcal, fmtMacros, isSnackSlot, nutritionAverage, nutritionIsEstimated,
  nutritionWindow, slotForTime, type DayNutrition, type EstimateIndex, type MainSlot, type MealSlot
} from '#shared/utils/nutrition'
import { localTimeNow } from '#shared/utils/time'

const props = defineProps<{
  /** The shown day's meals summed (dayNutrition of that day's entry). */
  day: DayNutrition
  /**
   * The day `day` is for, when the home column is scrubbed back (useDayScrub); today when absent.
   * The 7-day average ends on it and the add-meal link gives way to that day's entry.
   */
  date?: string
  /** Every journal entry, for the trailing-week average. */
  entries: JournalEntry[]
  index: EstimateIndex
  /** The profile's protein_target_g, or null when none is set. */
  target: number | null
  /** Write roles get the "+ add <meal>" link; read-only viewers only the way to the food card. */
  canEdit: boolean
}>()

const today = useToday()

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

// The shown day: today, or the day the column is scrubbed to.
const asOf = computed(() => props.date ?? today.value)
const isToday = computed(() => asOf.value >= today.value)

// The trailing week as of the shown day, ending the day before it until its dinner is logged
// (nutritionWindow) — so a scrubbed-to day reads the average Jim would have seen that day.
const avg = computed(() => nutritionAverage(props.entries, props.index, asOf.value, 7))
const avgTitle = computed(() => {
  const w = nutritionWindow(props.entries, asOf.value, 7)
  const to = w.to === asOf.value
    ? (isToday.value ? 'today' : formatDate(w.to, 'monthDay'))
    : (isToday.value ? 'yesterday' : formatDate(w.to, 'monthDay'))
  return `Days with every meal estimated, ${formatDate(w.from, 'monthDay')} – ${to} · ${avg.value.days} day${avg.value.days === 1 ? '' : 's'}`
})

// The clock's meal, re-read each minute so an open tab moves from lunch to dinner. useNow is the
// reactive trigger; localTimeNow() reads the home-timezone wall clock. Today only: a past day's
// quick log would land in today's entry.
const now = useNow({ interval: 60_000 })
const suggested = computed<MainSlot | null>(() => {
  if (!props.canEdit || !isToday.value) return null
  void now.value
  const from = MAIN_SLOTS.indexOf(slotForTime(localTimeNow()))
  return MAIN_SLOTS.slice(from).find(slot => !loggedSlots.value.has(slot)) ?? null
})
</script>
