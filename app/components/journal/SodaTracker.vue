<template>
  <div
    class="bg-raised border border-line-soft"
    :class="compact ? 'px-3.5 py-2.5' : 'px-3.5 py-3'"
  >
    <!-- Compact: the hub's one-row widget — big count, 30d strip, quick-add. -->
    <div
      v-if="compact"
      class="flex items-center gap-4"
    >
      <div class="shrink-0">
        <p class="tui-label">
          Soda
        </p>
        <p class="leading-none mt-0.5">
          <span
            class="num-display text-head"
            :class="sodaCount ? 'text-warn' : 'text-accent'"
          >{{ sodaCount }}</span><span class="text-micro text-muted"> today</span>
        </p>
      </div>

      <!-- The strip keeps a floor and the quick-add label truncates: that label ("+ COKE ZERO
           20oz bottle") is the one thing in this row that can't wrap, and as a shrink-0 item it
           took the strip's width first on a phone, then — at the larger SIZE steps — the card
           past the viewport's edge, since the grid this sits in sizes its track to min-content. -->
      <div class="flex-1 min-w-16 flex items-end gap-0.5 h-6.5">
        <div
          v-for="day in days"
          :key="day.date"
          class="flex-1 bg-soda"
          :class="day.count ? '' : 'opacity-40'"
          :style="{ height: `${day.height}%` }"
          :title="day.title"
        />
      </div>

      <button
        v-if="!readonly"
        type="button"
        class="tui-btn tui-btn-accent min-w-0"
        :disabled="adding"
        :title="`+ ${quickAddLabel}`"
        @click="quickAdd()"
      >
        <span class="truncate min-w-0">{{ adding ? 'LOGGING…' : `+ ${quickAddLabel}` }}</span>
      </button>
      <button
        v-if="!readonly"
        type="button"
        class="shrink-0 text-micro text-faint hover:text-accent cursor-pointer"
        :aria-label="customOpen ? 'Hide custom soda form' : 'Log a different drink'"
        @click="customOpen = !customOpen"
      >
        {{ customOpen ? '▴' : '▾' }}
      </button>
    </div>

    <template v-else>
      <TuiHeader
        label="SODA · 30D"
        :dashes="6"
      >
        <span
          v-if="!readonly"
          class="flex items-baseline gap-2.5 text-meta"
        >
          <button
            type="button"
            class="text-accent hover:text-accent-hover cursor-pointer disabled:opacity-50"
            :disabled="adding"
            @click="quickAdd()"
          >{{ adding ? 'logging…' : `+ ${quickAddLabel}` }}</button>
          <span class="text-faint">·</span>
          <button
            type="button"
            class="text-accent hover:text-accent-hover cursor-pointer"
            @click="customOpen = !customOpen"
          >{{ customOpen ? 'custom ▴' : 'custom ▾' }}</button>
        </span>
      </TuiHeader>

      <!-- 30-day strip: one bar per day, zero-days kept as stubs so the timeline reads evenly.
           Hand-drawn rather than a BarChart because at 38px tall the axes are pure noise. -->
      <div class="flex items-end gap-0.5 h-9.5 mt-2.5">
        <div
          v-for="day in days"
          :key="day.date"
          class="flex-1 bg-soda"
          :class="day.count ? '' : 'opacity-40'"
          :style="{ height: `${day.height}%` }"
          :title="day.title"
        />
      </div>

      <div class="flex items-baseline justify-between gap-3 mt-1.5 text-label">
        <span class="text-muted">{{ startLabel }}</span>
        <span class="text-muted">
          <span :class="sodaCount ? 'text-warn' : 'text-accent'">{{ sodaCount }} today</span>{{ weekSummary }}<span :class="trendClass">{{ trendArrow }}</span>
        </span>
      </div>
    </template>

    <div
      v-if="customOpen && !readonly"
      class="mt-3 pt-3 border-t border-line-soft grid grid-cols-2 gap-2.5"
    >
      <UFormField
        label="DRINK"
      >
        <UInputMenu
          v-model="customDrink"
          mode="autocomplete"
          :items="DRINK_NAMES"
          open-on-click
          placeholder="Dr Pepper"
          class="w-full"
          :ui="{ item: 'text-small' }"
        />
      </UFormField>
      <UFormField
        label="SIZE"
      >
        <UInputMenu
          v-model="customSize"
          mode="autocomplete"
          :items="SODA_SIZES"
          open-on-click
          placeholder="12oz can"
          class="w-full"
          :ui="{ item: 'text-small' }"
        />
      </UFormField>
      <div class="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          class="tui-btn tui-btn-accent"
          :disabled="adding"
          @click="quickAdd(true)"
        >
          {{ adding ? 'LOGGING…' : '+ LOG THIS' }}
        </button>
        <!-- The label form for whatever drink is named here, logged today or not: the way in to
             a drink's figures without having to log one first. -->
        <button
          v-if="customDrink.trim()"
          type="button"
          class="text-meta text-muted hover:text-accent cursor-pointer text-left"
          :title="customLabelTitle"
          data-drink-label-custom
          @click="openLabel({ drink: customDrink, size: customSize || null })"
        >
          {{ customLabelText }}
        </button>
      </div>
    </div>

    <!-- Caffeine from the day's drinks (item 70): the total, when the last of it was, and how
         much landed after 14:00 — the part that costs sleep. -->
    <p
      v-if="caffeine"
      class="mt-2 text-meta text-muted"
      data-caffeine
    >
      caffeine <span class="text-hi">{{ caffeine.mg }}</span> mg · last {{ caffeine.last }}<span
        v-if="caffeine.late"
        class="text-warn"
      > · {{ caffeine.late }} mg after {{ LATE_CAFFEINE_HOUR }}:00</span>
    </p>

    <div
      v-if="todaySodas.length"
      class="mt-3 pt-2.5 border-t border-line-soft"
    >
      <div
        v-for="(s, i) in todaySodas"
        :key="i"
        class="flex items-baseline gap-3 px-1.5 py-1 text-small"
        :class="i % 2 ? 'bg-inset' : ''"
      >
        <span class="text-faint shrink-0">{{ s.time }}</span>
        <span class="text-hi truncate">{{ sodaLabel(s) }}</span>
        <!-- Not a soda (a sports drink, a coffee): logged here, kept off the soda count. -->
        <span
          v-if="!isSodaEntry(s)"
          class="shrink-0 text-nano leading-none px-1 py-0.5 border border-line-soft text-dim uppercase tracking-[0.08em]"
          :title="hydrates(s.drink) ? 'Not counted as a soda; its ounces count toward the water goal' : 'Not counted as a soda'"
        >{{ DRINK_KIND_LABELS[drinkInfo(s.drink).kind] }}</span>
        <span class="ml-auto shrink-0 flex items-baseline gap-3">
          <!-- The drink's calories and where they come from: "140 kcal ✎" is the owner's own
               label, "≈ 150 kcal" the built-in table (written from memory). The chip opens the
               label form, where the can's figures are typed or scanned. -->
          <template v-if="figuresChip(s)">
            <button
              v-if="!readonly"
              type="button"
              class="text-meta text-muted hover:text-accent cursor-pointer"
              :title="figuresTitle(s)"
              data-drink-label
              @click="openLabel(s)"
            >{{ figuresChip(s) }}</button>
            <span
              v-else
              class="text-meta text-muted"
              :title="figuresTitle(s)"
              data-drink-label
            >{{ figuresChip(s) }}</span>
          </template>
          <!-- A tap the outbox is still sending has no server index to remove by; it is marked
               instead, and the ✕ comes back once it lands. -->
          <span
            v-if="isPendingId(s.id)"
            class="text-meta text-muted"
            title="Kept while offline — sent when you're back online"
          >⏳ pending</span>
          <button
            v-else-if="!readonly"
            type="button"
            class="text-meta text-faint hover:text-danger cursor-pointer disabled:opacity-50"
            :disabled="removingIndex !== null"
            @click="remove(i)"
          >
            {{ removingIndex === i ? '⋯' : '✕' }}
          </button>
        </span>
      </div>
    </div>

    <JournalDrinkLabelForm
      v-if="!readonly && labelFor"
      v-model:open="labelOpen"
      :drink="labelFor.drink"
      :size="labelFor.size"
    />
  </div>
</template>

<script setup lang="ts">
// Soda tracker (a habit nudge, not a vital): quick-add of the last-logged drink, a custom form,
// today's list, and a 30-day bar. Extracted from the journal page, which carried all of this
// inline. Writes go through /api/journal/soda and are reflected into the shared journal store.
import { SODA_SIZES } from '~/data/journal'
import type { SodaEntry } from '~/data/journal'
import { DRINK_GROUPS, DRINK_KIND_LABELS, LATE_CAFFEINE_HOUR, drinkFigures, drinkInfo, drinkSource, drinkTotals, hydrates, indexDrinkLabels, isSodaEntry, lateCaffeineMg, sodasOnly } from '#shared/utils/drinks'
import { lastSoda as lastSodaOf, quickAddLabel as quickAddLabelOf } from '#shared/utils/soda'
import { isNoResponse, isPendingId, keepTap, newTapId } from '~/composables/useQuickLogOutbox'

withDefaults(defineProps<{
  readonly?: boolean
  /** One-row overview widget: count + 30d strip + quick-add, per the hub mock. */
  compact?: boolean
}>(), { readonly: false, compact: false })

const toast = useToast()
const { data } = await useJournalEntries()
const entries = computed(() => data.value ?? [])

// Home-timezone date/time (shared/utils/time.ts), not the runtime's clock zone: a late-night
// tap logs against the Chicago calendar day whether the phone is travelling or the SSR pass is
// running in a UTC Worker, and the 30-day strip's boundaries match between the two. `today` is
// the REACTIVE ref: after midnight the list, the strip and ✕ all move to the new day together —
// a computed reading localToday() never re-ran, so at 7am the list still showed yesterday's
// sodas while remove() posted today's date, deleting against the wrong day.
const today = useToday()
function localDateStr() {
  return today.value
}
function localTimeStr() {
  return localTimeNow()
}
/** The local date `delta` days from today (negative = past). */
function daysFromToday(delta: number) {
  return shiftDays(today.value, delta)
}

// The day's whole drink list (the rows below); the count and the strip are its sodas alone.
const todaySodas = computed<SodaEntry[]>(() =>
  entries.value.find(e => e.date === today.value)?.sodas ?? []
)
const sodaCount = computed(() => sodasOnly(todaySodas.value).length)
// Every catalogued drink, sodas first — the custom form logs a Gatorade or a coffee here too.
const DRINK_NAMES = DRINK_GROUPS.flatMap(g => g.names)
// The owner's own label figures (drink_labels): read in place of the built-in table.
const { data: labelRows } = useDrinkLabels()
const labels = computed(() => indexDrinkLabels(labelRows.value))
const caffeine = computed(() => {
  const t = drinkTotals(todaySodas.value, labels.value)
  return t.caffeine_mg > 0 && t.lastCaffeine ? { mg: t.caffeine_mg, last: t.lastCaffeine, late: lateCaffeineMg(todaySodas.value, labels.value) } : null
})

/** A row's figures chip: null for an unnamed drink, which has no name to keep a label under. */
function figuresChip(s: SodaEntry): string | null {
  if (!s.drink?.trim()) return null
  const mine = drinkSource(s.drink, labels.value) === 'label'
  const f = drinkFigures(s.drink, s.size, labels.value)
  if (!f) return mine ? 'label ✎' : 'label →'
  return mine ? `${f.kcal} kcal ✎` : `≈ ${f.kcal} kcal`
}
function figuresTitle(s: SodaEntry): string {
  const f = drinkFigures(s.drink, s.size, labels.value)
  const detail = f ? `${f.kcal} kcal · ${f.sugar_g} g sugar · ${f.sodium_mg} mg sodium · ${f.caffeine_mg} mg caffeine — ` : ''
  return drinkSource(s.drink, labels.value) === 'label'
    ? `${detail}from your label`
    : `${detail}from the built-in table, not checked against a label`
}

// The label form, for the row that was tapped.
const labelFor = ref<{ drink: string, size: string | null } | null>(null)
const labelOpen = ref(false)
function openLabel(s: { drink?: string | null, size?: string | null }) {
  if (!s.drink?.trim()) return
  labelFor.value = { drink: s.drink.trim(), size: s.size ?? null }
  labelOpen.value = true
}

// The last drink and the quick-add's label come from shared/utils/soda.ts — the home page's
// + SODA button reads the same two, so they can't disagree.
const lastSoda = computed(() => lastSodaOf(entries.value))
const lastDrink = computed(() => lastSoda.value?.drink ?? '')
const lastSize = computed(() => lastSoda.value?.size ?? '')

/** Header action label — the drink the quick-add will actually log, e.g. "DR PEPPER 12oz". */
const quickAddLabel = computed(() => quickAddLabelOf(lastSoda.value))

function sodaLabel(s: SodaEntry) {
  const drink = s.drink || 'Soda'
  return s.size ? `${drink} · ${s.size}` : drink
}

const customOpen = ref(false)
const customDrink = ref('')
const customSize = ref('')
// The custom form's way in to a drink's label figures: says whose figures are in use now.
const customLabelText = computed(() => (drinkSource(customDrink.value, labels.value) === 'label' ? 'your label ✎' : 'label figures →'))
const customLabelTitle = computed(() => {
  const source = drinkSource(customDrink.value, labels.value)
  return source === 'label'
    ? 'Figures come from your label — open to change them'
    : source === 'table'
      ? 'Figures come from the built-in table, not checked against a label — enter the can\'s own'
      : 'Not in the built-in table: typical figures for its kind are used — enter the can\'s own'
})
const adding = ref(false)

// Reassigns `data.value` (rather than mutating an entry in place) so the update is guaranteed to
// be picked up by `useAsyncData`'s reactivity regardless of its `deep` option.
function applySodasLocally(date: string, sodas: SodaEntry[]) {
  patchJournalDay(data, date, { sodas })
}

async function quickAdd(useCustom = false) {
  adding.value = true
  const date = localDateStr()
  const time = localTimeStr()
  const drink = (useCustom ? customDrink.value : lastDrink.value) || undefined
  const size = (useCustom ? customSize.value : lastSize.value) || undefined
  // The tap's own id rides with it (and in the outbox): the server skips a replay it already holds.
  const id = newTapId()
  try {
    const { sodas } = await $fetch<{ sodas: SodaEntry[] }>('/api/journal/soda', {
      method: 'POST',
      body: { date, time, drink, size, id }
    })
    applySodasLocally(date, sodas)
    // The status line's "soda N today" reads the scalar shell summary, not this list.
    await refreshNuxtData('overview')
    if (useCustom) {
      customDrink.value = ''
      customSize.value = ''
      customOpen.value = false
    }
  }
  catch (err) {
    // No answer at all (offline): keep the tap and show it as logged, pending (useQuickLogOutbox).
    const kept = isNoResponse(err) ? keepTap({ id, kind: 'soda', date, time, drink, size }, toast) : null
    if (kept) {
      applySodasLocally(date, [...(entries.value.find(e => e.date === date)?.sodas ?? []), kept as SodaEntry])
      if (useCustom) customOpen.value = false
    }
    else {
      toast.add({ title: 'Failed to log soda', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
    }
  }
  finally {
    adding.value = false
  }
}

const removingIndex = ref<number | null>(null)

async function remove(index: number) {
  if (removingIndex.value !== null) return
  removingIndex.value = index
  const date = localDateStr()
  // The entry on screen goes with its index: if another device changed the list since, the
  // server removes nothing and hands back the current list instead of taking another drink.
  const seen = todaySodas.value[index]
  try {
    const { sodas, removed } = await $fetch<{ sodas: SodaEntry[], removed: boolean }>('/api/journal/soda', {
      method: 'DELETE',
      query: { date, index, time: seen?.time ?? '', drink: seen?.drink ?? '', size: seen?.size ?? '' }
    })
    applySodasLocally(date, sodas)
    if (!removed) toast.add({ title: 'The list had changed', description: 'Another device changed today\'s sodas — nothing was removed. Here is the current list.', color: 'warning' })
    await refreshNuxtData('overview')
  }
  catch (err) {
    const msg = extractErrorMessage(err, 'Unknown error')
    toast.add({ title: 'Failed to remove', description: msg, color: 'error' })
  }
  finally {
    removingIndex.value = null
  }
}

const WINDOW_DAYS = 30
/** Zero-soda days keep a visible stub so the 30-day timeline reads evenly. */
const BAR_MIN_PCT = 6

/** Per-day counts across the trailing 30-day window, scaled to the 38px strip. */
const days = computed(() => {
  const counts = new Map<string, number>()
  for (const e of entries.value) {
    const n = sodasOnly(e.sodas).length
    if (n) counts.set(e.date, n)
  }
  const series = trailingDays(today.value, WINDOW_DAYS).map(date => ({ date, count: counts.get(date) ?? 0 }))
  const max = Math.max(1, ...series.map(d => d.count))
  // Percentages rather than px so the same bars fit the tall panel and the short hub widget.
  return series.map(d => ({
    ...d,
    height: d.count ? Math.max(BAR_MIN_PCT, Math.round((d.count / max) * 100)) : BAR_MIN_PCT,
    title: `${formatDate(d.date, 'monthDay')} · ${d.count} soda${d.count === 1 ? '' : 's'}`
  }))
})

const startLabel = computed(() =>
  days.value[0] ? formatDate(days.value[0].date, 'monthDay').toUpperCase() : ''
)

function countBetween(fromDaysAgo: number, toDaysAgo: number) {
  const from = daysFromToday(-fromDaysAgo)
  const to = daysFromToday(-toDaysAgo)
  return entries.value
    .filter(e => e.date >= from && e.date <= to)
    .reduce((n, e) => n + sodasOnly(e.sodas).length, 0)
}

const weekCount = computed(() => countBetween(6, 0))
const prevWeekCount = computed(() => countBetween(13, 7))

// Composed in script rather than as adjacent template blocks — Vue's whitespace condensing
// would eat the separating spaces and run "· 16 this wk" into the neighbouring counts.
const weekSummary = computed(() => ` · ${weekCount.value} this wk`)

const trendArrow = computed(() => {
  if (weekCount.value === prevWeekCount.value) return ''
  return weekCount.value > prevWeekCount.value ? ' ▲' : ' ▼'
})
const trendClass = computed(() => weekCount.value > prevWeekCount.value ? 'text-warn' : 'text-accent')
</script>
