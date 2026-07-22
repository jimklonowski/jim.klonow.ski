<template>
  <UCard class="h-full cursor-pointer hover:ring-1 hover:ring-primary/50 transition-shadow" @click="open = true">
    <div class="space-y-3">
      <div class="flex items-start justify-between gap-2">
        <p class="text-xs font-medium text-muted leading-tight flex items-center gap-1">
          <UIcon v-if="meta.computed" name="i-lucide-calculator" class="w-3 h-3 shrink-0 text-muted" title="Computed from other markers" />
          {{ meta.label }}
        </p>
        <UBadge :color="statusColor" variant="subtle" size="xs" class="shrink-0">
          {{ statusLabel }}
        </UBadge>
      </div>

      <div class="flex items-end gap-1.5">
        <span class="text-2xl font-bold tabular-nums">{{ displayValue }}</span>
        <span v-if="meta.unit" class="text-xs text-muted mb-0.5">{{ meta.unit }}</span>
      </div>

      <LabsRangeBar v-if="meta.refMin !== undefined || meta.refMax !== undefined" :value="current" :meta="meta" />

      <div v-if="prev !== null && current !== null" class="flex items-center gap-1 text-xs text-muted">
        <UIcon :name="changeIcon" :class="changeColor" class="w-3.5 h-3.5 shrink-0" />
        <span :class="changeColor">{{ changeText }}</span>
        <span>vs prev</span>
      </div>
    </div>
  </UCard>

  <!-- Detail modal -->
  <UModal v-model:open="open" :title="meta.label">
    <template #body>
      <div class="space-y-5">
        <!-- Description -->
        <p v-if="meta.description" class="text-sm text-muted leading-relaxed">
          {{ meta.description }}
        </p>

        <UBadge v-if="meta.computed" color="neutral" variant="subtle" size="xs" icon="i-lucide-calculator" class="w-fit">
          Computed from other markers
        </UBadge>

        <!-- Reference & optimal ranges -->
        <div class="space-y-1.5">
          <div v-if="meta.refMin !== undefined || meta.refMax !== undefined" class="flex items-center gap-2 text-sm">
            <span class="inline-block w-3 h-3 rounded-full bg-green-200 dark:bg-green-900/50 shrink-0" />
            <span class="text-muted">Reference range:</span>
            <span class="font-medium">
              <template v-if="meta.refMin !== undefined && meta.refMax !== undefined">{{ meta.refMin }} – {{ meta.refMax }}</template>
              <template v-else-if="meta.refMin !== undefined">≥ {{ meta.refMin }}</template>
              <template v-else-if="meta.refMax !== undefined">≤ {{ meta.refMax }}</template>
              {{ meta.unit }}
            </span>
          </div>
          <div v-if="meta.optimalMin !== undefined || meta.optimalMax !== undefined" class="flex items-center gap-2 text-sm">
            <span class="inline-block w-3 h-3 rounded-full bg-green-500/70 shrink-0" />
            <span class="text-muted">Optimal target:</span>
            <span class="font-medium">
              <template v-if="meta.optimalMin !== undefined && meta.optimalMax !== undefined">{{ meta.optimalMin }} – {{ meta.optimalMax }}</template>
              <template v-else-if="meta.optimalMin !== undefined">≥ {{ meta.optimalMin }}</template>
              <template v-else-if="meta.optimalMax !== undefined">≤ {{ meta.optimalMax }}</template>
              {{ meta.unit }}
            </span>
          </div>
        </div>

        <!-- Trend chart -->
        <div v-if="chartPoints.length >= 2">
          <ClientOnly>
            <AreaChart
              :data="chartPoints"
              :categories="{ value: { name: meta.label, color: '#22c55e' } }"
              :height="120"
            />
          </ClientOnly>
        </div>

        <USeparator />

        <!-- History table -->
        <div>
          <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">All Readings</p>
          <div v-if="history.length" class="space-y-2">
            <div
              v-for="row in history"
              :key="row.date"
              class="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0"
            >
              <span class="text-sm text-muted">{{ row.dateLabel }}</span>
              <div class="flex items-center gap-2">
                <span class="font-semibold tabular-nums">{{ row.value }}</span>
                <span class="text-xs text-muted">{{ meta.unit }}</span>
                <UBadge :color="row.statusColor" variant="subtle" size="xs">{{ row.statusLabel }}</UBadge>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-muted">No readings recorded yet.</p>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { BIOMARKERS, getStatus, getStatusColor } from '~/data/biomarkers'

const props = defineProps<{
  biomarkerKey: string
  entries: Array<{ date: string, markers: Record<string, number | null> }>
}>()

const open = ref(false)
const meta = computed(() => (BIOMARKERS[props.biomarkerKey] ?? { label: props.biomarkerKey, unit: '', category: 'metabolic' as const }) as NonNullable<typeof BIOMARKERS[string]>)

const sorted = computed(() =>
  [...props.entries].sort((a, b) => a.date.localeCompare(b.date))
)

const withValue = computed(() => sorted.value.filter(e => e.markers[props.biomarkerKey] != null))
const current = computed(() => withValue.value.at(-1)?.markers[props.biomarkerKey] ?? null)
const prev = computed(() => withValue.value.length >= 2 ? (withValue.value.at(-2)?.markers[props.biomarkerKey] ?? null) : null)

const displayValue = computed(() => {
  if (current.value === null || current.value === undefined) return '—'
  const v = current.value
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
})

const status = computed(() => getStatus(current.value, meta.value))
const statusColor = computed(() => getStatusColor(status.value))
const statusLabel = computed(() => ({ optimal: 'Optimal', low: 'Low', high: 'High', unknown: '—' })[status.value])

const delta = computed(() => {
  if (current.value === null || prev.value === null) return null
  return current.value - prev.value
})

const changeText = computed(() => {
  if (delta.value === null) return ''
  const sign = delta.value >= 0 ? '+' : ''
  const v = Math.abs(delta.value) >= 10 ? Math.round(delta.value).toString() : delta.value.toFixed(1)
  return `${sign}${v}`
})

const changeIcon = computed(() => {
  if (delta.value === null) return 'i-lucide-minus'
  if (Math.abs(delta.value) < 0.01) return 'i-lucide-minus'
  return delta.value > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'
})

const changeColor = computed(() => {
  if (delta.value === null || Math.abs(delta.value) < 0.01) return 'text-muted'
  const better = meta.value.higherIsBetter
  if (better === undefined) return 'text-muted'
  const improved = (better && delta.value > 0) || (!better && delta.value < 0)
  return improved ? 'text-success' : 'text-error'
})

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const chartPoints = computed(() =>
  sorted.value
    .filter(e => e.markers[props.biomarkerKey] != null)
    .map(e => ({
      date: formatDate(e.date),
      value: e.markers[props.biomarkerKey] as number
    }))
)

const history = computed(() =>
  sorted.value
    .filter(e => e.markers[props.biomarkerKey] != null)
    .map(e => {
      const value = e.markers[props.biomarkerKey] as number
      const s = getStatus(value, meta.value)
      return {
        date: e.date,
        dateLabel: formatDate(e.date),
        value: Number.isInteger(value) ? value.toString() : value.toFixed(1),
        statusColor: getStatusColor(s),
        statusLabel: ({ optimal: 'Optimal', low: 'Low', high: 'High', unknown: '—' })[s]
      }
    })
    .reverse()
)
</script>
