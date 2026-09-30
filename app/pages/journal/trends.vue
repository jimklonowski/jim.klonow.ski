<template>
  <div>
    <JournalHeader
      section="TRENDS"
      :meta="`${metricCount} metrics`"
    >
      <template #actions>
        <JournalRangePicker :show-notes="annotationsAvailable" />
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="fetchError"
      @retry="retryAll"
    />

    <div class="px-4 sm:px-6 py-3.5 space-y-3.5">
      <!-- The key to the lines and bands on every tile below; hovering a tile names the ones
           under the cursor. Only what falls inside the selected range. -->
      <p
        v-if="annotationKey.length"
        class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10.5px] leading-[1.6]"
        aria-label="Protocol notes on these charts"
      >
        <span class="text-faint uppercase tracking-widest">notes</span>
        <span
          v-for="a in annotationKey"
          :key="`${a.kind}-${a.from}-${a.text}`"
          class="whitespace-nowrap"
          :style="{ color: a.color }"
        >{{ a.glyph }} {{ a.text }} <span class="text-muted">{{ a.when }}</span></span>
      </p>

      <!-- Vitals: manual entry + Withings scale -->
      <section>
        <TuiHeader
          label="VITALS ── manual + withings"
          :dashes="0"
        >
          <span
            v-if="drawLabel"
            class="text-[10px] text-muted normal-case"
          >▲ lab draws: {{ drawLabel }}</span>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mt-2.5">
          <JournalMetricTile
            v-for="tile in vitalTiles"
            :key="tile.label"
            :label="tile.label"
            :unit="tile.unit"
            :value="tile.value"
            :series="tile.series"
            :rows="vitalRows"
            :mark-lines="tile.markLines"
            :annotations="annotations"
          />
        </div>
      </section>

      <!-- Health: Whoop + Apple Watch -->
      <section>
        <TuiHeader
          label="HEALTH ── whoop + apple watch"
          :dashes="0"
        >
          <UDropdownMenu
            :items="metricMenuItems"
            :content="{ align: 'end' }"
          >
            <button
              type="button"
              class="text-[10px] text-accent hover:text-accent-hover cursor-pointer normal-case"
            >
              configure metrics ▾
            </button>
          </UDropdownMenu>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-2.5">
          <JournalMetricTile
            v-for="tile in healthTiles"
            :key="tile.key"
            :label="tile.label"
            :unit="tile.unit"
            :value="tile.value"
            :accent="tile.accent"
            :series="tile.series"
            :rows="healthRows"
            :annotations="annotations"
          />
        </div>
        <p
          v-if="!healthTiles.length"
          class="mt-2.5 text-[12px] text-muted"
        >
          No health metrics selected — use configure metrics to add some.
        </p>
      </section>

      <!-- Sleep stages -->
      <section
        v-if="sleepRows.length"
        class="bg-raised border border-line-soft px-3 py-2.5"
      >
        <div class="flex items-baseline gap-3 text-[10px] text-muted">
          <span class="uppercase tracking-widest">Sleep stages</span>
          <span class="text-faint">· min/night</span>
          <span class="ml-auto flex gap-2.5">
            <span
              v-for="stage in SLEEP_STAGES"
              :key="stage.key"
              :style="{ color: stage.color }"
            >▪ {{ stage.name }}</span>
          </span>
        </div>
        <div class="mt-2">
          <ClientOnly>
            <BarChart
              :data="sleepRows"
              :categories="sleepCategories"
              :y-axis-keys="SLEEP_STAGE_KEYS"
              x-axis-key="date"
              stacked
              hide-y-axis
              hide-x-axis
              :height="120"
            >
              <template #tooltip="{ params }">
                <div class="px-2.5 py-2 text-[11px] min-w-44 bg-raised border border-line-accent shadow-[0_0_12px_rgba(0,0,0,0.5)]">
                  <p class="text-muted mb-1.5">
                    {{ params[0]?.axisValue }}
                  </p>
                  <div
                    v-for="p in params"
                    :key="p.seriesName"
                    class="flex items-center justify-between gap-4"
                  >
                    <span class="flex items-center gap-1.5 text-dim">
                      <span
                        class="w-2 h-2 rounded-full shrink-0"
                        :style="{ background: p.color }"
                      />
                      {{ p.seriesName }}
                    </span>
                    <span class="text-hi">{{ formatDuration(Number(p.value ?? 0)) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4 pt-1.5 mt-1.5 border-t border-line">
                    <span class="text-muted">Asleep</span>
                    <span class="text-hi">{{ formatDuration(asleepMinutes(params)) }}</span>
                  </div>
                </div>
              </template>
            </BarChart>
            <template #fallback>
              <div class="h-30" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cycleAnnotations, eventAnnotations, placeAnnotations, ruleAnnotations } from '#shared/utils/chartAnnotations'
import { cycleEnd, isTentative } from '#shared/utils/cycles'
import { PROTOCOL_EVENTS } from '#shared/utils/protocolEvents'
import { PROTOCOL_RULES } from '#shared/utils/protocolRules'
import { HEALTH_METRICS_META, formatDuration } from '~/data/health-metrics'
import { ANNOTATION_STYLE, CHART_ACCENT, CHART_DANGER, CHART_EMBER, CHART_INDIGO, CHART_WARN } from '~/utils/chartTheme'

useSeoMeta({ title: 'Journal · Trends' })

const { data: journalData, refresh, error } = await useJournalEntries()
const { data: healthData, refresh: refreshHealth, error: healthError } = await useHealthMetricsEntries()

const fetchError = computed(() => error.value ?? healthError.value ?? null)
function retryAll() {
  refresh()
  refreshHealth()
}
const { data: labsData } = await useLabsEntries()
const { data: cyclesData } = await useCycles()
const { role } = await useAuth()

const { inRange, smoothRows, notes } = useTrendRange()

const entries = computed(() => journalData.value ?? [])
const healthEntries = computed(() => healthData.value ?? [])

// --- protocol notes (dose changes, dated events, cycles) ---
// PROTOCOL_RULES and PROTOCOL_EVENTS are the owner's real protocol, so the demo persona's
// charts never get them (its doses drift by design and would contradict the lines).
const annotationsAvailable = computed(() => role.value != null && role.value !== 'demo')
const annotations = computed(() => {
  if (!notes.value || !annotationsAvailable.value) return []
  const today = localToday()
  const cycles = (cyclesData.value ?? [])
    .filter(c => !isTentative(c) && c.start_date <= today)
    .map(c => ({ name: c.name, from: c.start_date, to: cycleEnd(c) < today ? cycleEnd(c) : today }))
  return [...ruleAnnotations(PROTOCOL_RULES), ...eventAnnotations(PROTOCOL_EVENTS), ...cycleAnnotations(cycles)]
})

/** The key strip: every annotation that lands on the visible range, placed on all its days. */
const annotationKey = computed(() => {
  if (!annotations.value.length) return []
  const days = [...new Set([...inRange(entries.value), ...inRange(healthEntries.value)].map(e => e.date))].sort()
  const md = (d: string) => formatDate(d, 'monthDay').toLowerCase()
  return placeAnnotations(annotations.value, days).map(a => ({
    ...a,
    glyph: a.kind === 'dose' ? '│' : '▒',
    color: a.kind === 'dose' ? ANNOTATION_STYLE.dose : a.kind === 'cycle' ? ANNOTATION_STYLE.cycleText : ANNOTATION_STYLE.eventText,
    when: a.to && a.to !== a.from
      ? `${md(a.from)}–${a.from.slice(0, 7) === a.to.slice(0, 7) ? a.to.slice(8).replace(/^0/, '') : md(a.to)}`
      : md(a.from)
  }))
})

// --- lab draw markers ---
const drawsInRange = computed(() => {
  const rows = inRange(entries.value)
  const first = rows[0]?.date
  const last = rows.at(-1)?.date
  if (!first || !last) return []
  return (labsData.value ?? []).filter(l => l.date >= first && l.date <= last)
})

const drawLabel = computed(() =>
  drawsInRange.value.map(d => formatDate(d.date, 'monthDay').toLowerCase()).join(' · ')
)
// ISO days: the tiles chart on `day` values now, so a guide names one exact date — a formatted
// label used to land on the same month-day of whichever year echarts matched last.
const drawMarkLines = computed(() =>
  drawsInRange.value.map(d => d.date)
)

// --- vitals group ---
const VITAL_FIELDS = ['weight_lbs', 'bp_systolic', 'bp_diastolic', 'rhr', 'hrv']

const vitalRows = computed(() =>
  smoothRows(
    inRange(entries.value).map(e => ({
      date: formatDate(e.date, 'monthDay'),
      day: e.date,
      weight_lbs: e.weight_lbs ?? null,
      bp_systolic: e.bp_systolic ?? null,
      bp_diastolic: e.bp_diastolic ?? null,
      rhr: e.rhr ?? null,
      hrv: e.hrv ?? null
    })),
    VITAL_FIELDS
  )
)

/** Latest non-null value of a field across the visible range. */
function latest(rows: Array<Record<string, unknown>>, field: string): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i]?.[field]
    if (typeof v === 'number') return v
  }
  return null
}

function fmt(v: number | null, decimals = 0) {
  if (v == null) return '—'
  return decimals ? v.toFixed(decimals) : Math.round(v).toString()
}

const vitalTiles = computed(() => {
  const rows = vitalRows.value
  const sys = latest(rows, 'bp_systolic')
  const dia = latest(rows, 'bp_diastolic')
  return [
    {
      label: 'Weight',
      unit: 'lbs',
      value: fmt(latest(rows, 'weight_lbs'), 1),
      series: [{ key: 'weight_lbs', name: 'Weight', color: CHART_ACCENT }],
      // Only the weight chart carries the lab-draw verticals, per the mock.
      markLines: drawMarkLines.value
    },
    {
      label: 'BP',
      unit: 'mmHg',
      value: sys != null && dia != null ? `${Math.round(sys)}/${Math.round(dia)}` : '—',
      series: [
        { key: 'bp_systolic', name: 'sys', color: CHART_DANGER },
        { key: 'bp_diastolic', name: 'dia', color: CHART_INDIGO }
      ],
      markLines: []
    },
    {
      label: 'RHR',
      unit: 'bpm',
      value: fmt(latest(rows, 'rhr')),
      series: [{ key: 'rhr', name: 'RHR', color: CHART_WARN }],
      markLines: []
    },
    {
      label: 'HRV',
      unit: 'ms',
      value: fmt(latest(rows, 'hrv')),
      series: [{ key: 'hrv', name: 'HRV', color: CHART_INDIGO }],
      markLines: []
    }
  ]
})

// --- health group ---
// Per-metric line colors: green for the "more is better" fitness markers, indigo for sleep,
// warn for strain (a load number with no good direction).
const HEALTH_COLORS: Record<string, string> = {
  vo2_max: CHART_ACCENT,
  body_fat_pct: CHART_ACCENT,
  lean_body_mass_lbs: CHART_ACCENT,
  sleep_total_min: CHART_INDIGO,
  recovery_score: CHART_ACCENT,
  strain: CHART_WARN,
  sleep_performance_pct: CHART_INDIGO
}

const DEFAULT_HEALTH_KEYS = [
  'vo2_max', 'body_fat_pct', 'sleep_total_min', 'recovery_score', 'strain', 'sleep_performance_pct'
]

const selectedHealthKeys = useState<string[]>('journal-health-metrics', () => [...DEFAULT_HEALTH_KEYS])

const metricMenuItems = computed(() => [
  Object.entries(HEALTH_METRICS_META).map(([key, meta]) => ({
    label: meta.label,
    type: 'checkbox' as const,
    checked: selectedHealthKeys.value.includes(key),
    onUpdateChecked: (checked: boolean) => {
      selectedHealthKeys.value = checked
        ? [...selectedHealthKeys.value, key]
        : selectedHealthKeys.value.filter(k => k !== key)
    },
    onSelect: (e: Event) => e.preventDefault()
  }))
])

const healthKeys = computed(() =>
  Object.keys(HEALTH_METRICS_META).filter(k => selectedHealthKeys.value.includes(k))
)

const healthRows = computed(() =>
  smoothRows(
    inRange(healthEntries.value).map(e => ({
      date: formatDate(e.date, 'monthDay'),
      day: e.date,
      ...Object.fromEntries(
        Object.keys(HEALTH_METRICS_META).map(k => [k, (e as unknown as Record<string, number | null>)[k] ?? null])
      )
    })),
    Object.keys(HEALTH_METRICS_META)
  )
)

const healthTiles = computed(() =>
  healthKeys.value.map((key) => {
    const meta = HEALTH_METRICS_META[key]!
    const v = latest(healthRows.value, key)
    return {
      key,
      label: meta.label,
      unit: key === 'sleep_total_min' ? '' : meta.unit,
      value: v == null ? '—' : key === 'sleep_total_min' ? formatDuration(v) : fmt(v, Number.isInteger(v) ? 0 : 1),
      // Recovery is the one metric the mock tints when it's in a good place.
      accent: key === 'recovery_score' && v != null && v >= 67,
      series: [{ key, name: meta.label, color: HEALTH_COLORS[key] ?? CHART_ACCENT }]
    }
  })
)

const metricCount = computed(() => vitalTiles.value.length + healthTiles.value.length + 1)

// --- sleep stages ---
// Legend + stack order from the mock: awake on top, then light (the `core` column), rem, deep.
const SLEEP_STAGES = [
  { key: 'sleep_awake_min', name: 'awake', color: CHART_EMBER },
  { key: 'sleep_core_min', name: 'light', color: CHART_ACCENT },
  { key: 'sleep_rem_min', name: 'rem', color: '#38b6d9' },
  { key: 'sleep_deep_min', name: 'deep', color: CHART_INDIGO }
] as const

// echarts stacks in series order, bottom-up — reverse so `deep` lands at the base.
const SLEEP_STAGE_KEYS = [...SLEEP_STAGES].reverse().map(s => s.key)

const sleepCategories = computed(() =>
  Object.fromEntries(SLEEP_STAGES.map(s => [s.key, { name: s.name, color: s.color }]))
)

const sleepRows = computed(() =>
  inRange(healthEntries.value)
    .filter(e => SLEEP_STAGES.some(s => (e as unknown as Record<string, number | null>)[s.key] != null))
    .map(e => ({
      date: formatDate(e.date, 'monthDay'),
      ...Object.fromEntries(
        SLEEP_STAGES.map(s => [s.key, (e as unknown as Record<string, number | null>)[s.key] ?? 0])
      )
    }))
)

function asleepMinutes(params: Array<{ seriesName?: string, value?: number | string }>) {
  return params
    .filter(p => p.seriesName !== 'awake')
    .reduce((sum, p) => sum + Number(p.value ?? 0), 0)
}
</script>
