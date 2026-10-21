<template>
  <component
    :is="to ? 'NuxtLink' : 'div'"
    :to="to"
    class="block bg-raised border border-line-soft px-3 py-2.5"
    :class="to ? 'hover:bg-row-hover transition-colors' : ''"
  >
    <div class="flex items-baseline gap-2 text-micro text-muted">
      <span class="uppercase tracking-widest truncate">{{ label }}</span>
      <span
        v-if="unit"
        class="text-faint shrink-0"
      >{{ unit }}</span>
      <span
        class="ml-auto shrink-0"
        :class="accent ? 'text-accent' : 'text-hi'"
      >{{ value }}</span>
    </div>

    <div
      :style="{ height: `${height}px` }"
      class="mt-1.5"
    >
      <ClientOnly>
        <AreaChart
          v-if="hasData"
          :data="chartData"
          :categories="categories"
          :height="height"
          :x-axis-key="xKey"
          :mark-lines="markLines"
          :annotations="placed"
          :connect-nulls="connect"
          bare
        />
        <template #fallback>
          <div :style="{ height: `${height}px` }" />
        </template>
      </ClientOnly>
    </div>
  </component>
</template>

<script setup lang="ts">
import { placeAnnotations } from '#shared/utils/chartAnnotations'
import type { ChartAnnotation } from '#shared/utils/chartAnnotations'
import { CHART_ACCENT } from '~/utils/chartTheme'

// One bordered metric tile: label + unit on the left, latest value on the right, and a bare
// line beneath. Used for both chart groups on /journal/trends and the vital tiles on the hub.
const props = withDefaults(defineProps<{
  label: string
  unit?: string
  /** Pre-formatted latest reading, e.g. "167.8" or "125/74" or "6h55m". */
  value: string
  /** Render the value in accent (a reading that's in a good place). */
  accent?: boolean
  /** One entry per line. Multi-series tiles (BP) pass two. */
  series: Array<{ key: string, name: string, color?: string }>
  /** Rows keyed by `date` (the axis label) plus one field per series key. Rows that also carry
   * `day` (YYYY-MM-DD) can take `annotations`. */
  rows: Array<Record<string, string | number | null>>
  height?: number
  /** x-axis labels to dash a vertical guide at (lab draw dates). */
  markLines?: string[]
  /** Protocol context to place on this tile's own points (see placed below). */
  annotations?: ChartAnnotation[]
  /** Spot readings taken days apart (BP): one line through them instead of a break at every
   * day without one. Streams measured daily (scale, strap) leave it off so a gap shows. */
  connect?: boolean
  to?: string
}>(), {
  height: 46,
  markLines: () => [],
  annotations: () => [],
  connect: false
})

const categories = computed(() =>
  Object.fromEntries(props.series.map(s => [s.key, { name: s.name, color: s.color ?? CHART_ACCENT }]))
)

// The chart spans the tile's own readings: blank rows at either end are trimmed (a sparse
// metric would otherwise render as a stub in a corner of the tile), but a blank row INSIDE the
// span stays, and AreaChart breaks the line there — a week with no weigh-ins is a gap, not a
// trend drawn through it (audit #42 item 3; dropping every blank row squeezed the gap days out
// of the axis and the line bridged them).
const hasReading = (r: Record<string, string | number | null>) => props.series.some(s => r[s.key] != null)
const chartData = computed(() => {
  const rows = props.rows
  const start = rows.findIndex(hasReading)
  if (start < 0) return []
  let end = rows.length - 1
  while (end > start && !hasReading(rows[end]!)) end--
  return rows.slice(start, end + 1)
})

const hasData = computed(() => chartData.value.filter(hasReading).length >= 2)

// Rows that carry `day` chart on the ISO day itself (AreaChart formats the display), so an
// annotation or draw guide names one exact day — a "Aug 24"-style label axis matched the same
// day in every year of the all-time range. Rows without `day` (the home hub's) keep their labels.
const xKey = computed(() =>
  chartData.value.length && chartData.value.every(r => typeof r.day === 'string') ? 'day' : 'date'
)

// Placed per tile, not once per page: each tile spans only the days from its first reading to
// its last, so a change before that has to land on the first point THIS line actually has on
// or after it.
const placed = computed(() => {
  if (!props.annotations.length || xKey.value !== 'day') return []
  const days = chartData.value.map(r => r.day as string)
  return placeAnnotations(props.annotations, days)
})
</script>
