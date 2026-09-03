<template>
  <VChart
    :option="option"
    autoresize
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
import { CHART_AXIS, CHART_GRID, CHART_TEXT, CHART_TOOLTIP_Z } from '~/utils/chartTheme'

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
}>(), {
  xAxisKey: 'date',
  stacked: false,
  height: 160,
  showLegend: false,
  hideYAxis: false,
  hideXAxis: false
})

const option = computed<ECOption>(() => ({
  backgroundColor: 'transparent',
  textStyle: CHART_TEXT,
  grid: props.hideXAxis && props.hideYAxis
    ? { top: 2, left: 2, right: 2, bottom: 2, containLabel: false }
    : { ...CHART_GRID, top: props.showLegend ? 26 : 8 },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(44,232,164,0.06)' } },
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    extraCssText: `${CHART_TOOLTIP_Z}box-shadow:none;`
  },
  legend: {
    show: props.showLegend,
    top: 0,
    itemWidth: 10,
    itemHeight: 10,
    icon: 'rect',
    textStyle: { ...CHART_TEXT, color: CHART_AXIS.label }
  },
  xAxis: {
    type: 'category',
    data: props.data.map(d => d[props.xAxisKey] as string),
    show: !props.hideXAxis,
    axisLabel: { color: CHART_AXIS.label, fontSize: 10 },
    axisLine: { lineStyle: { color: CHART_AXIS.line } },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    show: !props.hideYAxis,
    axisLabel: { color: CHART_AXIS.label, fontSize: 10 },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: CHART_AXIS.split } }
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
