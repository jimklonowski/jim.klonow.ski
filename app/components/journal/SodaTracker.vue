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
            class="num-display text-[19px]"
            :class="todaySodas.length ? 'text-warn' : 'text-accent'"
          >{{ todaySodas.length }}</span><span class="text-[10px] text-muted"> today</span>
        </p>
      </div>

      <div class="flex-1 flex items-end gap-0.5 h-6.5 min-w-0">
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
        class="tui-btn tui-btn-accent shrink-0"
        :disabled="adding"
        @click="quickAdd()"
      >
        {{ adding ? 'LOGGING…' : `+ ${quickAddLabel}` }}
      </button>
      <button
        v-if="!readonly"
        type="button"
        class="shrink-0 text-[10px] text-faint hover:text-accent cursor-pointer"
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
          class="flex items-baseline gap-2.5 text-[11px]"
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

      <div class="flex items-baseline justify-between gap-3 mt-1.5 text-[10.5px]">
        <span class="text-muted">{{ startLabel }}</span>
        <span class="text-muted">
          <span :class="todaySodas.length ? 'text-warn' : 'text-accent'">{{ todaySodas.length }} today</span>{{ weekSummary }}<span :class="trendClass">{{ trendArrow }}</span>
        </span>
      </div>
    </template>

    <div
      v-if="customOpen && !readonly"
      class="mt-3 pt-3 border-t border-line-soft grid grid-cols-2 gap-2.5"
    >
      <UFormField
        label="DRINK"
        :ui="{ label: 'tui-label' }"
      >
        <UInput
          v-model="customDrink"
          list="soda-drinks"
          placeholder="Dr Pepper"
          class="w-full"
        />
        <datalist id="soda-drinks">
          <option
            v-for="d in SODA_DRINKS"
            :key="d"
            :value="d"
          />
        </datalist>
      </UFormField>
      <UFormField
        label="SIZE"
        :ui="{ label: 'tui-label' }"
      >
        <UInput
          v-model="customSize"
          list="soda-sizes"
          placeholder="12oz can"
          class="w-full"
        />
        <datalist id="soda-sizes">
          <option
            v-for="s in SODA_SIZES"
            :key="s"
            :value="s"
          />
        </datalist>
      </UFormField>
      <div class="col-span-2">
        <button
          type="button"
          class="tui-btn tui-btn-accent"
          :disabled="adding"
          @click="quickAdd(true)"
        >
          {{ adding ? 'LOGGING…' : '+ LOG THIS' }}
        </button>
      </div>
    </div>

    <div
      v-if="todaySodas.length"
      class="mt-3 pt-2.5 border-t border-line-soft"
    >
      <div
        v-for="(s, i) in todaySodas"
        :key="i"
        class="flex items-baseline gap-3 px-1.5 py-1 text-[12px]"
        :class="i % 2 ? 'bg-inset' : ''"
      >
        <span class="text-faint shrink-0">{{ s.time }}</span>
        <span class="text-hi truncate">{{ sodaLabel(s) }}</span>
        <button
          v-if="!readonly"
          type="button"
          class="ml-auto shrink-0 text-[11px] text-faint hover:text-danger cursor-pointer disabled:opacity-50"
          :disabled="removingIndex !== null"
          @click="remove(i)"
        >
          {{ removingIndex === i ? '⋯' : '✕' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Soda tracker (a habit nudge, not a vital): quick-add of the last-logged drink, a custom form,
// today's list, and a 30-day bar. Extracted from the journal page, which carried all of this
// inline. Writes go through /api/journal/soda and are reflected into the shared journal store.
import { SODA_DRINKS, SODA_SIZES } from '~/data/journal'
import type { SodaEntry } from '~/data/journal'

withDefaults(defineProps<{
  readonly?: boolean
  /** One-row overview widget: count + 30d strip + quick-add, per the hub mock. */
  compact?: boolean
}>(), { readonly: false, compact: false })

const toast = useToast()
const { data } = await useJournalEntries()
const entries = computed(() => data.value ?? [])

// Local date/time (not toISOString, which shifts to UTC) so a late-night tap logs against the
// correct calendar day and displays the actual clock time it happened.
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localTimeStr(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function shiftDays(delta: number) {
  const d = new Date()
  d.setDate(d.getDate() + delta)
  return localDateStr(d)
}

const todaySodas = computed<SodaEntry[]>(() => {
  const today = localDateStr()
  return entries.value.find(e => e.date === today)?.sodas ?? []
})

const lastSoda = computed<SodaEntry | null>(() => {
  const all = entries.value.flatMap(e => (e.sodas ?? []).map(s => ({ ...s, date: e.date })))
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return all.at(-1) ?? null
})
const lastDrink = computed(() => lastSoda.value?.drink ?? '')
const lastSize = computed(() => lastSoda.value?.size ?? '')

/** Header action label — the drink the quick-add will actually log, e.g. "DR PEPPER 12oz". */
const quickAddLabel = computed(() => {
  const drink = (lastDrink.value || 'Soda').toUpperCase()
  return lastSize.value ? `${drink} ${lastSize.value}` : drink
})

function sodaLabel(s: SodaEntry) {
  const drink = s.drink || 'Soda'
  return s.size ? `${drink} · ${s.size}` : drink
}

const customOpen = ref(false)
const customDrink = ref('')
const customSize = ref('')
const adding = ref(false)

// Reassigns `data.value` (rather than mutating an entry in place) so the update is guaranteed to
// be picked up by `useAsyncData`'s reactivity regardless of its `deep` option.
function applySodasLocally(date: string, sodas: SodaEntry[]) {
  if (!data.value) return
  const idx = data.value.findIndex(e => e.date === date)
  if (idx >= 0) {
    data.value = data.value.map((e, i) => i === idx ? { ...e, sodas } : e)
  }
  else {
    data.value = [...data.value, { date, sodas }].sort((a, b) => a.date.localeCompare(b.date))
  }
}

async function quickAdd(useCustom = false) {
  adding.value = true
  const date = localDateStr()
  const drink = (useCustom ? customDrink.value : lastDrink.value) || undefined
  const size = (useCustom ? customSize.value : lastSize.value) || undefined
  try {
    const { sodas } = await $fetch<{ sodas: SodaEntry[] }>('/api/journal/soda', {
      method: 'POST',
      body: { date, time: localTimeStr(), drink, size }
    })
    applySodasLocally(date, sodas)
    if (useCustom) {
      customDrink.value = ''
      customSize.value = ''
      customOpen.value = false
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    toast.add({ title: 'Failed to log soda', description: msg, color: 'error' })
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
  try {
    const { sodas } = await $fetch<{ sodas: SodaEntry[] }>('/api/journal/soda', {
      method: 'DELETE',
      query: { date, index }
    })
    applySodasLocally(date, sodas)
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
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
    const n = (e.sodas ?? []).length
    if (n) counts.set(e.date, n)
  }
  const series = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const date = shiftDays(i - (WINDOW_DAYS - 1))
    return { date, count: counts.get(date) ?? 0 }
  })
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
  const from = shiftDays(-fromDaysAgo)
  const to = shiftDays(-toDaysAgo)
  return entries.value
    .filter(e => e.date >= from && e.date <= to)
    .reduce((n, e) => n + (e.sodas?.length ?? 0), 0)
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
