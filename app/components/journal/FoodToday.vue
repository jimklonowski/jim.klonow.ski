<template>
  <section class="bg-raised border border-line-soft px-4 py-3.5">
    <div class="flex items-baseline gap-3 text-meta">
      <span class="tui-label">Today · food</span>
      <span
        v-if="day.estimated"
        class="ml-auto text-dim whitespace-nowrap"
      >{{ dayEstimated ? '≈ ' : '' }}{{ fmtKcal(day.kcal) }} kcal · {{ fmtMacros(day) }}<span
        v-if="dayEstimated"
        class="text-faint"
      > est.</span><span
        v-if="day.missing.length"
        class="text-faint"
        :title="`${day.missing.length} meal${day.missing.length === 1 ? '' : 's'} without figures — the total is a floor`"
      > +</span></span>
    </div>

    <!-- Day order, one line per slot: the meal and its figures, an inline autocomplete while
         editing, or "+ add" (the clock's meal in accent). Snack slots show only when logged, or
         as a small "+ snack" in their gap; the legacy single Snack only on days that have one. -->
    <div class="mt-2.5 space-y-1.5">
      <div
        v-for="row in slotRows"
        :key="row.slot"
        class="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 items-baseline text-row"
      >
        <span
          class="text-micro uppercase tracking-widest pt-1"
          :class="row.snack && !row.text && editing !== row.slot ? 'text-ghost' : 'text-muted'"
        >{{ row.snack && !row.text && editing !== row.slot ? '' : row.label }}</span>

        <div
          v-if="editing === row.slot"
          class="min-w-0"
        >
          <div class="flex items-center gap-2 min-w-0">
            <UInputMenu
              v-model="draft"
              mode="autocomplete"
              :items="historyFor(row.slot)"
              open-on-click
              autofocus
              :placeholder="row.placeholder"
              class="flex-1 min-w-0"
              :ui="{ item: 'text-small' }"
            />
            <button
              type="button"
              class="tui-btn tui-btn-accent"
              :disabled="saving || (!draft.trim() && !row.text)"
              :aria-label="draft.trim() ? `Save ${row.label.toLowerCase()}` : `Clear ${row.label.toLowerCase()}`"
              @click="saveSlot(row.slot)"
            >
              {{ saving ? '…' : draft.trim() ? '✓' : 'CLEAR' }}
            </button>
            <button
              type="button"
              class="text-meta text-faint hover:text-accent cursor-pointer"
              aria-label="Cancel"
              @click="editing = null"
            >
              ✕
            </button>
          </div>
          <!-- Live, a beat behind the typing: the figures if this is a known meal, or the
               "did you mean …?" that would pair it with one. -->
          <div class="mt-1 min-h-4">
            <JournalMealEstimate
              :text="liveDraft"
              @replace="draft = $event"
            />
          </div>
        </div>

        <div
          v-else-if="row.text"
          class="min-w-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5"
        >
          <button
            v-if="!readonly"
            type="button"
            class="text-hi text-left hover:text-accent cursor-pointer"
            :title="`Edit ${row.label.toLowerCase()}`"
            @click="startEdit(row.slot)"
          >
            {{ row.text }}
          </button>
          <span
            v-else
            class="text-hi"
          >{{ row.text }}</span>
          <JournalMealEstimate :text="row.text" />
        </div>

        <button
          v-else-if="!readonly && row.snack"
          type="button"
          class="text-left text-meta text-ghost hover:text-accent cursor-pointer"
          @click="startEdit(row.slot)"
        >
          + {{ row.label.toLowerCase() }}
        </button>
        <button
          v-else-if="!readonly"
          type="button"
          class="text-left cursor-pointer"
          :class="row.slot === suggestedSlot ? 'text-accent hover:text-accent-hover' : 'text-faint hover:text-accent'"
          @click="startEdit(row.slot)"
        >
          + add{{ row.slot === suggestedSlot ? ` ${row.label.toLowerCase()}` : '' }}
        </button>
        <span
          v-else-if="!row.snack"
          class="text-faint"
        >—</span>
      </div>
    </div>

    <p
      v-if="todaySodas.length"
      class="mt-2 text-meta text-muted"
    >
      + {{ todaySodas.length }} soda{{ todaySodas.length === 1 ? '' : 's' }} ≈ {{ fmtKcal(day.sodaKcal) }} kcal<span
        v-if="day.sodaUnsized"
        class="text-faint"
      > (+{{ day.sodaUnsized }} unsized)</span>
    </p>

    <!-- The week: average over the days whose meals are all estimated, against the protein
         target when one is on file. The owner's backfill lives here because this is where the
         gap shows. -->
    <div class="mt-2.5 pt-2.5 border-t border-line-soft flex flex-wrap items-baseline gap-x-3 gap-y-1 text-meta text-muted">
      <span
        v-if="avg.days"
        :title="avgTitle"
      >
        7d avg ≈ <span class="text-hi">{{ fmtKcal(avg.kcal) }}</span> kcal ·
        <span
          class="text-hi"
          :class="proteinTarget && avg.protein_g >= proteinTarget ? 'text-accent' : ''"
        >{{ avg.protein_g }}</span> g protein<template v-if="proteinTarget"> / {{ proteinTarget }} g</template>
        <span class="text-faint">· {{ avg.days }} day{{ avg.days === 1 ? '' : 's' }} est.</span>
      </span>
      <span
        v-else
        class="text-faint"
      >No fully estimated days in the last week.</span>
      <!-- Meals with no figures from any source. The AI pass is explicit and confirmed: it
           spends tokens, and hand-entered label figures are the preferred path. -->
      <button
        v-if="isOwner && unestimated.length"
        type="button"
        class="ml-auto text-accent hover:text-accent-hover cursor-pointer disabled:opacity-50"
        :disabled="backfilling"
        :title="`Meals without figures: ${unestimated.slice(0, 8).join(', ')}${unestimated.length > 8 ? ', …' : ''}`"
        @click="backfill"
      >
        {{ backfilling ? `estimating ${done}/${total}…` : `${unestimated.length} meal${unestimated.length === 1 ? '' : 's'} without figures · ESTIMATE WITH AI` }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
// The hub's food card: today's four slots with their figures and the day's total, a one-line
// quick log per slot (so a meal is logged without opening the day form), the week's average
// against the protein target, and — for the owner — one explicit, confirmed AI pass over the
// meals no source has figures for. Nothing here calls the model on its own: a new meal gets its
// figures from the code library, a hand entry on its chip, or that button. Writes go through
// POST /api/journal/meal (one slot, json_set) and are reflected into the shared journal store
// like the soda and water taps.
import {
  MEAL_SLOTS, MEAL_SLOT_LABELS, dayNutrition, fmtKcal, fmtMacros, isSnackSlot, knownMeals, mealHistory, nutritionAverage,
  nutritionIsEstimated, nutritionWindow, resolveMealText, slotForTime, unestimatedMeals, type MealSlot
} from '#shared/utils/nutrition'
import { profileNumber } from '#shared/utils/profile'

withDefaults(defineProps<{
  readonly?: boolean
}>(), { readonly: false })

const toast = useToast()
const { isOwner } = await useAuth()
const { data } = await useJournalEntries()
const { data: profileData } = await useProfile()
const { index, estimate } = await useMealEstimates()

const today = useToday()
const entries = computed(() => data.value ?? [])
const todayEntry = computed(() => entries.value.find(e => e.date === today.value) ?? null)
const todaySodas = computed(() => todayEntry.value?.sodas ?? [])
const day = computed(() => dayNutrition(todayEntry.value, index.value))
const dayEstimated = computed(() => nutritionIsEstimated(day.value))

const proteinTarget = computed(() => profileNumber(profileData.value, 'protein_target_g', 0) || null)
// Seven days ending yesterday until today's dinner is logged, then ending today — today's running
// total is shown above, it must not also count as a whole day here.
const avg = computed(() => nutritionAverage(entries.value, index.value, today.value, 7))
const avgWindow = computed(() => nutritionWindow(entries.value, today.value, 7))
const avgTitle = computed(() => `Days with every meal estimated, ${formatDate(avgWindow.value.from, 'monthDay')} – ${avgWindow.value.to === today.value ? 'today' : 'yesterday'}; today joins once dinner is logged`)

const PLACEHOLDERS: Record<MealSlot, string> = {
  breakfast: 'Protein shake + creatine',
  snack: 'Sourdough',
  snack_am: 'Beef sticks',
  lunch: 'Chipotle bowl',
  snack_pm: 'Sourdough',
  dinner: 'Steak + veggies',
  snack_eve: 'Watermelon'
}

// The legacy single Snack appears only on a day that has one; the gap snacks always have a row
// (as "+ snack" when empty).
const slotRows = computed(() => MEAL_SLOTS
  .map(slot => ({
    slot,
    label: MEAL_SLOT_LABELS[slot],
    snack: isSnackSlot(slot),
    text: todayEntry.value?.food?.[slot]?.trim() ?? '',
    placeholder: PLACEHOLDERS[slot]
  }))
  .filter(row => row.slot !== 'snack' || row.text || editing.value === 'snack')
)

// The clock's slot, re-read each minute so an open tab moves from "+ add lunch" to dinner.
const clock = ref(localTimeNow())
onMounted(() => {
  const id = setInterval(() => {
    clock.value = localTimeNow()
  }, 60_000)
  onUnmounted(() => clearInterval(id))
})
const suggestedSlot = computed(() => slotForTime(clock.value))

// Slot-ranked history: what was logged for lunch floats first on the lunch input, and every
// spelling of a meal is one entry (shared/utils/nutrition.ts mealHistory).
const historyBySlot = computed(() =>
  Object.fromEntries(MEAL_SLOTS.map(s => [s, mealHistory(entries.value, s).map(h => h.text)])) as Record<MealSlot, string[]>
)
function historyFor(slot: MealSlot): string[] {
  return historyBySlot.value[slot]
}

// --- quick log --- (declared before slotRows reads it? No: computeds are lazy, so order is fine.)
const editing = ref<MealSlot | null>(null)
const draft = ref('')
const saving = ref(false)
// The chip under the input follows the draft a beat behind, so it doesn't flicker per keystroke.
const liveDraft = refDebounced(draft, 350)
const known = computed(() => knownMeals(entries.value, index.value))

function startEdit(slot: MealSlot) {
  draft.value = todayEntry.value?.food?.[slot] ?? ''
  editing.value = slot
}

// Reassigns `data.value` so useAsyncData's reactivity sees it (same rule as the soda widget).
function applyFoodLocally(date: string, food: Partial<Record<MealSlot, string>>) {
  if (!data.value) return
  const idx = data.value.findIndex(e => e.date === date)
  if (idx >= 0) {
    data.value = data.value.map((e, i) => i === idx ? { ...e, food } : e)
  }
  else {
    data.value = [...data.value, { date, food }].sort((a, b) => a.date.localeCompare(b.date))
  }
}

async function saveSlot(slot: MealSlot) {
  if (saving.value) return
  // A spelling of a meal that already has figures is saved AS that meal (same key, or a strong
  // match), and said so — the log converges on one spelling instead of growing variants.
  const resolved = resolveMealText(draft.value, known.value)
  const text = resolved.text
  saving.value = true
  const date = today.value
  try {
    const { food } = await $fetch<{ food: Partial<Record<MealSlot, string>> }>('/api/journal/meal', {
      method: 'POST',
      body: { date, slot, text }
    })
    applyFoodLocally(date, food)
    editing.value = null
    if (resolved.changed) {
      toast.add({ title: `Saved as "${text}"`, description: 'Matched a meal that already has figures. Edit the slot if that was wrong.', color: 'info', icon: 'i-lucide-link' })
    }
    // The shell's streak / logged figures count food (shared/utils/journalLog.ts). A meal with
    // no figures shows "enter macros → · estimate with AI →" on its chip — nothing automatic.
    await refreshNuxtData('overview')
  }
  catch (err) {
    toast.add({ title: 'Failed to log the meal', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// --- backfill (owner) ---
// Every distinct meal in the history with no estimate, in batches the endpoint accepts. Each
// batch is cached as it lands, so a failure part-way keeps what was done.
const unestimated = computed(() => unestimatedMeals(entries.value, index.value))
const backfilling = ref(false)
const done = ref(0)
const total = ref(0)

async function backfill() {
  const texts = unestimated.value
  if (!texts.length || backfilling.value) return
  if (!window.confirm(
    `Send ${texts.length} meal name${texts.length === 1 ? '' : 's'} to Claude for calorie and macro estimates? `
    + 'Meals in the library or entered by hand are skipped. The estimates are cached, marked "est.", and cost a few cents.'
  )) return
  backfilling.value = true
  done.value = 0
  total.value = texts.length
  try {
    // Texts the model's answer could not be pinned to stay without figures (never a neighbour's
    // numbers); they are named so a second press can pick them up.
    const unmatched: string[] = []
    for (let i = 0; i < texts.length; i += 50) {
      const batch = texts.slice(i, i + 50)
      unmatched.push(...await estimate(batch))
      done.value = Math.min(texts.length, i + batch.length)
    }
    const got = total.value - unmatched.length
    if (unmatched.length) {
      toast.add({
        title: `Estimated ${got} of ${total.value} meal${total.value === 1 ? '' : 's'}`,
        description: `No figures came back for: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? ', …' : ''}. Press ESTIMATE again to retry them.`,
        color: 'warning'
      })
    }
    else {
      toast.add({ title: `Estimated ${got} meal${got === 1 ? '' : 's'}`, color: 'success', icon: 'i-lucide-check' })
    }
  }
  catch (err) {
    toast.add({
      title: `Estimating stopped after ${done.value} of ${total.value}`,
      description: `${extractErrorMessage(err, 'Unknown error')} What was estimated is kept — press ESTIMATE again for the rest.`,
      color: 'error'
    })
  }
  finally {
    backfilling.value = false
  }
}
</script>
