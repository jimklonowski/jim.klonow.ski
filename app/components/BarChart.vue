<template>
  <!-- Exposed as one labelled image: the rendered SVG is unlabelled paths. See AreaChart.vue. -->
  <VChart
    :option="option"
    autoresize
    role="img"
    :aria-label="ariaLabel ?? describedChart"
    :style="{ height: typeof height === 'number' ? `${height}px` : height }"
  >
    <template #tooltip="raw">
      <slot
        name="tooltip"
        :params="asPoints(raw)"
      >
        <div class="px-2.5 py-1.5 text-[11px] min-w-32 bg-raised border border-line-accent text-body">
          <p
            v-if="asPoints(raw)[0]"
            class="text-muted mb-1"
          >
            {{ asPoints(raw)[0]?.axisValueLabel ?? asPoints(raw)[0]?.axisValue }}
          </p>
          <div
            v-for="p in asPoints(raw)"
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
  </VChart>
</template>

<script setup lang="ts">
import { CHART_TOOLTIP_Z, chartFrame } from '~/utils/chartTheme'

export interface BarTooltipPoint {
  seriesName?: string
  color?: string
  value?: number | string
  axisValue?: string
  axisValueLabel?: string
}

function asPoints(raw: unknown): BarTooltipPoint[] {
  return (Array.isArray(raw) ? raw : [raw]) as BarTooltipPoint[]
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

const option = computed<ECOption>(() => ({
  ...chartFrame({
    labels: props.data.map(d => d[props.xAxisKey] as string),
    showLegend: props.showLegend,
    legendItem: { width: 10, height: 10 },
    grid: props.hideXAxis && props.hideYAxis ? 'bare' : 'normal',
    bareTop: 2,
    xAxis: { show: !props.hideXAxis },
    yAxis: { show: !props.hideYAxis }
  }),
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(44,232,164,0.06)' } },
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    extraCssText: `${CHART_TOOLTIP_Z}box-shadow:none;`
  },
  series: props.yAxisKeys.map(key => ({
    type: 'bar',
    name: props.categories[key]?.name ?? key,
    stack: props.stacked ? 'total' : undefined,
    data: props.data.map(d => d[key] as number),
    itemStyle: { color: props.categories[key]?.color, borderRadius: 0 }
  }))
}))
</script>
