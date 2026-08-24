<template>
  <VChart
    :option="option"
    autoresize
    :style="{ height: typeof height === 'number' ? `${height}px` : height }"
  />
</template>

<script setup lang="ts">
import { CHART_AXIS, CHART_GRID, CHART_TEXT, CHART_TOOLTIP, seriesSymbol } from '~/utils/chartTheme'

const props = withDefaults(defineProps<{
  data: Record<string, unknown>[]
  categories: Record<string, { name: string, color: string }>
  xAxisKey?: string
  height?: number | string
  showLegend?: boolean
  /** Subtle gradient fill under the line. Off by default — the design wants bare lines. */
  area?: boolean
  /** Dashed vertical guides at these x-axis values (lab draw dates on the journal charts). */
  markLines?: string[]
  /** Render as a step line — right for values that hold flat between changes, like a dose. */
  step?: boolean
  /** Drop both axes and grid lines: the line alone, for dense metric tiles. Tooltips stay. */
  bare?: boolean
}>(), {
  xAxisKey: 'date',
  height: 160,
  showLegend: false,
  area: false,
  markLines: () => [],
  step: false,
  bare: false
})

const option = computed<ECOption>(() => {
  const categories = Object.entries(props.categories)
  const labels = props.data.map(d => d[props.xAxisKey] as string)

  return {
    backgroundColor: 'transparent',
    textStyle: CHART_TEXT,
    color: categories.map(([, c]) => c.color),
    grid: props.bare
      ? { top: 4, left: 2, right: 2, bottom: 2, containLabel: false }
      : { ...CHART_GRID, top: props.showLegend ? 26 : 8 },
    tooltip: CHART_TOOLTIP,
    legend: {
      show: props.showLegend,
      top: 0,
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect',
      textStyle: { ...CHART_TEXT, color: CHART_AXIS.label }
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      show: !props.bare,
      axisLabel: { color: CHART_AXIS.label, fontSize: 10 },
      axisLine: { lineStyle: { color: CHART_AXIS.line } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      show: !props.bare,
      // A bare tile is read for its shape, so let the line fill the box instead of
      // anchoring to a zero baseline it never approaches.
      scale: props.bare,
      axisLabel: { color: CHART_AXIS.label, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { show: !props.bare, lineStyle: { color: CHART_AXIS.split } }
    },
    series: categories.map(([key, meta], i) => ({
      type: 'line',
      name: meta.name,
      data: props.data.map(d => d[key] as number),
      smooth: false,
      ...(props.step ? { step: 'end' as const } : {}),
      ...seriesSymbol(props.data.length),
      lineStyle: { width: 1.5, color: meta.color },
      itemStyle: { color: meta.color },
      ...(props.area
        ? { areaStyle: { color: meta.color, opacity: 0.08 } }
        : {}),
      // Only the first series carries the guides, otherwise they stack up per line.
      ...(i === 0 && props.markLines.length
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: CHART_AXIS.guide, type: 'dashed', width: 1 },
              label: { show: false },
              data: props.markLines
                .filter(v => labels.includes(v))
                .map(xAxis => ({ xAxis }))
            }
          }
        : {})
    }))
  }
})
</script>
