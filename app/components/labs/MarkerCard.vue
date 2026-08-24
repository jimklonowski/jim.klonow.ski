<template>
  <button
    type="button"
    class="w-full text-left bg-raised px-3.5 py-3 border border-line-soft border-t-2 hover:bg-[#101a15] transition-colors cursor-pointer"
    :style="{ borderTopColor: statusColor }"
    @click="open = true"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="text-[12.5px] text-hi leading-tight flex items-center gap-1 min-w-0">
        <UIcon
          v-if="meta.computed"
          name="i-lucide-calculator"
          class="w-3 h-3 shrink-0 text-faint"
          title="Computed from other markers"
        />
        <span class="truncate">{{ meta.label }}</span>
      </span>
      <span
        class="text-[11px] shrink-0"
        :style="{ color: statusColor }"
      >{{ statusLabel }}</span>
    </div>

    <div class="flex items-baseline gap-1.5 mt-2">
      <span class="num-display text-[26px] leading-none">{{ displayValue }}</span>
      <span
        v-if="meta.unit"
        class="text-[10.5px] text-muted"
      >{{ meta.unit }}</span>
    </div>

    <TuiRangeBar
      v-if="hasRange"
      :value="current"
      :meta="meta"
      :height="5"
      class="mt-3"
    />

    <div class="flex items-baseline justify-between gap-2 mt-2 text-[10.5px]">
      <span class="text-muted truncate">{{ rangeCaption }}</span>
      <span
        v-if="deltaText"
        class="shrink-0"
        :class="deltaClass"
      >{{ deltaText }}</span>
    </div>
  </button>

  <UModal
    v-model:open="open"
    :title="meta.label"
    :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
  >
    <template #body>
      <div class="space-y-5">
        <p
          v-if="meta.description"
          class="text-[12.5px] leading-[1.7] text-dim"
        >
          {{ meta.description }}
        </p>

        <p
          v-if="meta.computed"
          class="text-[11px] text-faint"
        >
          ⚙ computed from other markers
        </p>

        <div class="space-y-1.5 text-[12px]">
          <div
            v-if="hasRange"
            class="flex items-center gap-2"
          >
            <span class="inline-block w-3 h-1.5 shrink-0 bg-[#152b21]" />
            <span class="text-muted">reference</span>
            <span class="text-hi">{{ refText }} {{ meta.unit }}</span>
          </div>
          <div
            v-if="meta.optimalMin !== undefined || meta.optimalMax !== undefined"
            class="flex items-center gap-2"
          >
            <span class="inline-block w-3 h-1.5 shrink-0 bg-[#1e3a2e]" />
            <span class="text-muted">optimal</span>
            <span class="text-hi">{{ optText }} {{ meta.unit }}</span>
          </div>
        </div>

        <TrendCard
          v-if="chartPoints.length >= 2"
          :label="meta.label"
          :unit="meta.unit"
          :data="chartPoints"
          :height="140"
        />

        <div>
          <TuiHeader label="ALL READINGS" />
          <div
            v-if="history.length"
            class="mt-2"
          >
            <div
              v-for="(row, i) in history"
              :key="row.date"
              class="flex items-center justify-between gap-3 px-2 py-1.5 text-[12px]"
              :class="i % 2 ? 'bg-inset' : ''"
            >
              <span class="text-muted">{{ row.dateLabel }}</span>
              <span class="flex items-baseline gap-2">
                <span class="text-hi">{{ row.value }}</span>
                <span class="text-[10.5px] text-muted">{{ meta.unit }}</span>
                <span
                  class="text-[10.5px] w-9 text-right"
                  :style="{ color: row.color }"
                >{{ row.label }}</span>
              </span>
            </div>
          </div>
          <p
            v-else
            class="mt-2 text-[12px] text-muted"
          >
            No readings recorded yet.
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { BIOMARKERS, getStatus } from '~/data/biomarkers'

const props = defineProps<{
  biomarkerKey: string
  entries: Array<{ date: string, markers: Record<string, number | null> }>
}>()

const STATUS_COLORS = {
  optimal: '#2ce8a4',
  low: '#e8b34b',
  high: '#e86a5e',
  unknown: '#5d7a6d'
} as const

const STATUS_LABELS = {
  optimal: 'OPT',
  low: 'LOW',
  high: 'HIGH',
  unknown: '—'
} as const

// Hormones the protocol is expected to suppress — annotated so a LOW reading reads as
// "as designed" rather than as an unexplained flag.
const EXPECTED_SUPPRESSED = new Set(['fsh', 'lh'])

const open = ref(false)

const meta = computed(() => (
  BIOMARKERS[props.biomarkerKey]
  ?? { label: props.biomarkerKey, unit: '', category: 'metabolic' as const }
) as NonNullable<typeof BIOMARKERS[string]>)

const sorted = computed(() => [...props.entries].sort((a, b) => a.date.localeCompare(b.date)))
const withValue = computed(() => sorted.value.filter(e => e.markers[props.biomarkerKey] != null))
const current = computed(() => withValue.value.at(-1)?.markers[props.biomarkerKey] ?? null)
const prev = computed(() =>
  withValue.value.length >= 2 ? (withValue.value.at(-2)?.markers[props.biomarkerKey] ?? null) : null
)

const hasRange = computed(() => meta.value.refMin !== undefined || meta.value.refMax !== undefined)

const displayValue = computed(() => {
  const v = current.value
  if (v == null) return '—'
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
})

const status = computed(() => getStatus(current.value, meta.value))
const statusColor = computed(() => STATUS_COLORS[status.value])
const statusLabel = computed(() => STATUS_LABELS[status.value])

function num(v: number) {
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}

function bounds(min?: number, max?: number) {
  if (min !== undefined && max !== undefined) return `${num(min)}-${num(max)}`
  if (min !== undefined) return `>${num(min)}`
  if (max !== undefined) return `<${num(max)}`
  return ''
}

const refText = computed(() => bounds(meta.value.refMin, meta.value.refMax))
const optText = computed(() => bounds(meta.value.optimalMin, meta.value.optimalMax))

/** e.g. "ref 250-1100 · opt 600-1000 · suppressed" */
const rangeCaption = computed(() => {
  const parts: string[] = []
  if (refText.value) parts.push(`ref ${refText.value}`)
  if (optText.value) parts.push(`opt ${optText.value}`)
  if (status.value === 'low' && EXPECTED_SUPPRESSED.has(props.biomarkerKey)) parts.push('suppressed')
  return parts.join(' · ')
})

const delta = computed(() =>
  current.value != null && prev.value != null ? current.value - prev.value : null
)

const deltaText = computed(() => {
  const d = delta.value
  if (d == null || Math.abs(d) < 0.05) return null
  const magnitude = Math.abs(d) >= 10 ? Math.round(Math.abs(d)).toString() : Math.abs(d).toFixed(1)
  return `${d > 0 ? '▲+' : '▼-'}${magnitude}`
})

// Direction is only meaningful when the marker has a "better" direction; otherwise the
// delta is reported without a judgement color.
const deltaClass = computed(() => {
  const d = delta.value
  if (d == null) return 'text-muted'
  const better = meta.value.higherIsBetter
  if (better === undefined) return d > 0 ? 'text-accent' : 'text-warn'
  return (better ? d > 0 : d < 0) ? 'text-accent' : 'text-danger'
})

const chartPoints = computed(() =>
  withValue.value.map(e => ({
    date: formatDate(e.date, 'monthDay'),
    value: e.markers[props.biomarkerKey] as number
  }))
)

const history = computed(() =>
  [...withValue.value].reverse().map((e) => {
    const value = e.markers[props.biomarkerKey] as number
    const s = getStatus(value, meta.value)
    return {
      date: e.date,
      dateLabel: formatDate(e.date),
      value: num(value),
      color: STATUS_COLORS[s],
      label: STATUS_LABELS[s]
    }
  })
)
</script>
