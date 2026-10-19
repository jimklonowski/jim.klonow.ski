<template>
  <!-- Nuxt UI's Chart (TanStack Charts) behind the same props the echarts version took, so the
       call sites didn't change. The marks are our own `definition` rather than the generated one:
       the generated bars have a 4px rounded top, and nothing in this design is rounded. Colors are
       the categories' own strings (var(--color-…) tokens pass straight through), the axis text is
       the root's currentColor and font — so a preset, face or size switch reaches the chart with no
       re-render and no copy of the palette. -->
  <UChart
    type="bar"
    :data="data"
    :index="xAxisKey"
    :categories="series"
    :definition="definition"
    :height="chartHeight"
    :aria-label="ariaLabel ?? describedChart"
    :tooltip="{ content: { side: 'top', sideOffset: 10 } }"
  >
    <template #tooltip="{ points }">
      <slot
        name="tooltip"
        :params="asPoints(points)"
      >
        <div class="px-2.5 py-1.5 text-meta min-w-32 bg-raised border border-line-accent text-body">
          <p
            v-if="asPoints(points)[0]"
            class="text-muted mb-1"
          >
            {{ asPoints(points)[0]?.axisValue }}
          </p>
          <div
            v-for="p in asPoints(points)"
            :key="p.seriesName"
            class="flex items-center justify-between gap-3"
          >
            <span class="flex items-center gap-1.5">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :style="{ background: p.color }"
              />
              {{ p.seriesName }}
            </span>
            <span class="text-hi">{{ p.value }}</span>
          </div>
        </div>
      </slot>
    </template>
  </UChart>
</template>

<script setup lang="ts">
import { barY, colorLegend, colorLegendItems, defineChart, group, ruleY } from '@tanstack/charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal'

/** One row of the tooltip: the shape the call sites' `#tooltip` slots were written against. */
export interface BarTooltipPoint {
  seriesName?: string
  color?: string
  value?: number | string
  axisValue?: string
  axisValueLabel?: string
}

defineSlots<{
  tooltip?(props: { params: BarTooltipPoint[] }): unknown
}>()

const props = withDefaults(defineProps<{
  data: Record<string, unknown>[]
  categories: Record<string, { name: string, color: string }>
  yAxisKeys: string[]
  xAxisKey?: string
  stacked?: boolean
  height?: number | string
  showLegend?: boolean
  /** Hide the y-axis entirely — used by the dense mini bar charts. */
  hideYAxis?: boolean
  /** Hide the x-axis too, for a bare stacked strip. Tooltips still work. */
  hideXAxis?: boolean
  /** Text alternative for screen readers. Falls back to a generated series/range summary. */
  ariaLabel?: string
}>(), {
  xAxisKey: 'date',
  stacked: false,
  height: 160,
  showLegend: false,
  hideYAxis: false,
  hideXAxis: false,
  ariaLabel: undefined
})

/** "Bar chart: Strain — 30 bars, 2026-08-24 to 2026-09-22" */
const describedChart = computed(() => {
  const names = props.yAxisKeys.map(k => props.categories[k]?.name ?? k).join(', ')
  const labels = props.data.map(d => d[props.xAxisKey] as string).filter(Boolean)
  const span = labels.length > 1 ? `, ${labels[0]} to ${labels.at(-1)}` : ''
  return `Bar chart: ${names || 'no series'} — ${props.data.length} bar${props.data.length === 1 ? '' : 's'}${span}`
})

const chartHeight = computed(() => (typeof props.height === 'number' ? props.height : parseInt(props.height, 10) || 160))

/** The categories as UChart wants them; it turns each `color` into the chart's series variables. */
const series = computed(() => props.yAxisKeys.map(key => ({
  key,
  label: props.categories[key]?.name ?? key,
  color: props.categories[key]?.color
})))

const seriesLabel = (key: string) => props.categories[key]?.name ?? key

/** One row per bar segment: the long form TanStack's channels read. `category` is the series
 * NAME, not its key — it is what UChart's default tooltip and the chart's aria text read back. */
interface Row {
  x: string
  category: string
  value: number | undefined
}

const rows = computed<Row[]>(() => props.data.flatMap(datum => props.yAxisKeys.map((key) => {
  const value = datum[key]
  return {
    x: String(datum[props.xAxisKey] ?? ''),
    category: seriesLabel(key),
    value: typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }
})))

const definition = computed(() => {
  const names = props.yAxisKeys.map(seriesLabel)
  // The data's own x order, configured rather than inferred from the marks.
  const xs = props.data.map(d => String(d[props.xAxisKey] ?? ''))
  return defineChart({
    marks: [
      // Stacked by default when several categories share an x; grouped side by side otherwise.
      barY(rows.value, {
        x: 'x',
        y: 'value',
        z: 'category',
        color: 'category',
        inset: 1,
        ...(props.stacked ? {} : { layout: group({ padding: 0.1 }) })
      }),
      ruleY([0])
    ],
    scales: {
      x: {
        scale: scaleBand<string>().domain(xs).padding(0.2),
        axis: props.hideXAxis ? false : {}
      },
      y: {
        scale: scaleLinear,
        nice: true,
        // Horizontal grid lines go with the y labels; a bare strip has neither.
        grid: !props.hideYAxis,
        axis: props.hideYAxis ? false : {}
      }
    },
    color: {
      scale: scaleOrdinal<string, string>().domain(names).range(names.map((_, i) => `var(--ts-chart-${i + 1})`)),
      legend: props.showLegend
        ? colorLegend({ items: colorLegendItems({ justify: 'center', gap: 16 }) })
        : undefined
    },
    focus: 'group-x',
    // The default only focuses a point within 48px, which leaves dead zones between sparse bars.
    maxFocusDistance: Number.POSITIVE_INFINITY
  })
})

/** UChart's focused points → the tooltip rows the slots expect. */
function asPoints(points: readonly { datum: unknown, color?: string }[]): BarTooltipPoint[] {
  return points.map((p) => {
    const d = p.datum as Row
    return { seriesName: d.category, color: p.color, value: d.value, axisValue: d.x, axisValueLabel: d.x }
  })
}
</script>
