<template>
  <VChart :option="option" autoresize :style="{ height: typeof height === 'number' ? `${height}px` : height }">
    <template #tooltip="raw">
      <slot name="tooltip" :params="asPoints(raw)">
        <div
          class="rounded-lg px-3 py-2 text-xs min-w-32"
          :style="{ background: isDark ? '#1e293b' : '#ffffff', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, color: isDark ? '#e2e8f0' : '#1e293b' }"
        >
          <p v-if="asPoints(raw)[0]" class="font-medium mb-1 opacity-70">{{ asPoints(raw)[0]?.axisValueLabel ?? asPoints(raw)[0]?.axisValue }}</p>
          <div v-for="p in asPoints(raw)" :key="p.seriesName" class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: p.color }" />
              {{ p.seriesName }}
            </span>
            <span class="font-mono font-medium">{{ p.value }}</span>
          </div>
        </div>
      </slot>
    </template>
  </VChart>
</template>

<script setup lang="ts">
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
  radius?: number
  height?: number | string
  showLegend?: boolean
}>(), {
  xAxisKey: 'date',
  stacked: false,
  radius: 0,
  height: 160,
  showLegend: false
})

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const labelColor = computed(() => isDark.value ? '#94a3b8' : '#64748b')
const splitLineColor = computed(() => isDark.value ? '#334155' : '#e2e8f0')

const option = computed<ECOption>(() => ({
  grid: {
    top: props.showLegend ? 28 : 8,
    left: 4,
    right: 4,
    bottom: 4,
    containLabel: true
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    extraCssText: 'box-shadow: none;'
  },
  legend: {
    show: props.showLegend,
    top: 0,
    textStyle: { color: labelColor.value }
  },
  xAxis: {
    type: 'category',
    data: props.data.map(d => d[props.xAxisKey] as string),
    axisLabel: { color: labelColor.value, fontSize: 11 },
    axisLine: { lineStyle: { color: splitLineColor.value } },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: labelColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: splitLineColor.value } }
  },
  series: props.yAxisKeys.map(key => ({
    type: 'bar',
    name: props.categories[key]?.name ?? key,
    stack: props.stacked ? 'total' : undefined,
    data: props.data.map(d => d[key] as number),
    itemStyle: {
      color: props.categories[key]?.color,
      borderRadius: props.radius ? [props.radius, props.radius, 0, 0] : 0
    }
  }))
}))
</script>
