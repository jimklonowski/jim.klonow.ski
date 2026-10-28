<template>
  <component
    :is="expandable ? 'button' : to ? 'NuxtLink' : 'div'"
    :to="to"
    :type="expandable ? 'button' : undefined"
    :aria-haspopup="expandable ? 'dialog' : undefined"
    :aria-label="expandable ? `Expand ${label} chart` : undefined"
    class="group block w-full text-left bg-raised border border-line-soft px-3 py-2.5"
    :class="to || expandable ? 'hover:bg-row-hover hover:border-line transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-1px]' : ''"
    @click="expandable ? (open = true) : undefined"
  >
    <div class="flex items-baseline gap-2 text-micro text-muted">
      <span class="uppercase tracking-widest truncate">{{ label }}</span>
      <span
        v-if="unit"
        class="text-faint shrink-0"
      >{{ unit }}</span>
      <!-- The expand glyph sits ghost-faint so the value stays the loudest thing on the tile, and
           lights up with the hover — on a phone it is the one hint the tile opens. -->
      <span
        v-if="expandable"
        aria-hidden="true"
        class="ml-auto shrink-0 text-ghost group-hover:text-accent transition-colors"
      >⤢</span>
      <span
        class="shrink-0"
        :class="[expandable ? '' : 'ml-auto', accent ? 'text-accent' : 'text-hi']"
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
          :format-value="format"
          bare
        />
        <template #fallback>
          <div :style="{ height: `${height}px` }" />
        </template>
      </ClientOnly>
    </div>
  </component>

  <!-- Outside the button: the dialog teleports to body anyway, and a click inside it must never
       read as a click on the tile. Mounted only for expandable tiles; UModal renders nothing
       until it opens. -->
  <JournalMetricDetail
    v-if="expandable"
    v-model:open="open"
    :label="label"
    :unit="unit"
    :value="value"
    :accent="accent"
    :series="series"
    :data="chartData"
    :x-axis-key="xKey"
    :raw-rows="rawRows"
    :mark-lines="markLines"
    :annotations="placed"
    :connect="connect"
    :show-notes="showNotes"
    :format="format"
  />
</template>

<script setup lang="ts">
import { placeAnnotations } from '#shared/utils/chartAnnotations'
import type { ChartAnnotation } from '#shared/utils/chartAnnotations'
import { CHART_ACCENT } from '~/utils/chartTheme'

// One bordered metric tile: label + unit on the left, latest value on the right, and a bare
// line beneath. Used for both chart groups on /journal/trends and the vital tiles on the hub.
// With `expandable` the tile is a button that opens JournalMetricDetail: the same line at full
// size with axes, the range picker, and a stats strip.
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
  /** Click (or Enter) opens the expanded view. */
  expandable?: boolean
  /** `rows` before smoothing, for the expanded view's stats. Falls back to `rows`. */
  rawRows?: Array<Record<string, string | number | null>>
  /** The expanded view's picker offers the protocol-notes toggle. */
  showNotes?: boolean
  /** How a reading prints in the expanded view's stats (sleep prints as "6h55m"). */
  format?: (v: number) => string
}>(), {
  height: 46,
  markLines: () => [],
  annotations: () => [],
  connect: false,
  expandable: false,
  rawRows: undefined,
  showNotes: false,
  format: undefined
})

const open = ref(false)

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
