<template>
  <VChart :option="option" autoresize :style="{ height: typeof height === 'number' ? `${height}px` : height }" />
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  data: Record<string, unknown>[]
  categories: Record<string, { name: string, color: string }>
  xAxisKey?: string
  height?: number | string
  showLegend?: boolean
}>(), {
  xAxisKey: 'date',
  height: 160,
  showLegend: false
})

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const labelColor = computed(() => isDark.value ? '#94a3b8' : '#64748b')
const splitLineColor = computed(() => isDark.value ? '#334155' : '#e2e8f0')

const option = computed<ECOption>(() => ({
  color: Object.values(props.categories).map(c => c.color),
  grid: {
    top: props.showLegend ? 28 : 8,
    left: 4,
    right: 4,
    bottom: 4,
    containLabel: true
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: isDark.value ? '#1e293b' : '#ffffff',
    borderColor: isDark.value ? '#334155' : '#e2e8f0',
    textStyle: { color: isDark.value ? '#e2e8f0' : '#1e293b' }
  },
  legend: {
    show: props.showLegend,
    top: 0,
    textStyle: { color: labelColor.value }
  },
  xAxis: {
    type: 'category',
    data: props.data.map(d => d[props.xAxisKey] as string),
    boundaryGap: false,
    axisLabel: { color: labelColor.value, fontSize: 11 },
    axisLine: { lineStyle: { color: splitLineColor.value } },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: labelColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: splitLineColor.value } }
  },
  series: Object.entries(props.categories).map(([key, meta]) => ({
    type: 'line',
    name: meta.name,
    data: props.data.map(d => d[key] as number),
    smooth: true,
    symbol: 'none',
    lineStyle: { width: 2, color: meta.color },
    itemStyle: { color: meta.color },
    areaStyle: { color: meta.color, opacity: 0.15 }
  }))
}))
</script>
