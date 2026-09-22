<template>
  <!-- The SVG echarts renders is a pile of unlabelled paths, so the chart is exposed as a single
       image with a text alternative. Callers that can say something specific pass `ariaLabel`;
       everything else gets the series names and range derived below. -->
  <VChart
    :option="option"
    autoresize
    role="img"
    :aria-label="ariaLabel ?? describedChart"
    :style="{ height: typeof height === 'number' ? `${height}px` : height }"
  />
</template>

<script setup lang="ts">
import { CHART_AXIS, CHART_GRID, CHART_GRID_FIXED, CHART_TEXT, CHART_TOOLTIP, CHART_WARN, seriesSymbol } from '~/utils/chartTheme'

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
  /** Row field flagging the rows that get a point marker — the dosing days of a daily step
   * chart, say. Other rows draw none, and the density rule counts only the flagged rows. */
  pointKey?: string
  /** Row field holding a per-row echarts symbol name ('triangle', 'diamond', …) for readings
   * that must not be read as ordinary points — a value censored at an assay ceiling, say.
   * Unlike `pointKey` these ignore the density rule: a data-integrity mark is not decoration
   * and must never be thinned away. Shape carries the meaning, color only reinforces it. */
  markerKey?: string
  /** Fixed axis gutters instead of measured ones, so charts stacked on one x-axis stay flush
   * however wide their y-labels are. */
  fixedGutter?: boolean
  /** Text alternative for screen readers. Falls back to a generated series/range summary. */
  ariaLabel?: string
}>(), {
  xAxisKey: 'date',
  height: 160,
  showLegend: false,
  area: false,
  markLines: () => [],
  step: false,
  bare: false,
  pointKey: undefined,
  markerKey: undefined,
  fixedGutter: false,
  ariaLabel: undefined
})

/** "Line chart: Weight, Resting HR — 90 points, 2026-06-24 to 2026-09-22" */
const describedChart = computed(() => {
  const names = Object.values(props.categories).map(c => c.name).join(', ')
  const labels = props.data.map(d => d[props.xAxisKey] as string).filter(Boolean)
  const span = labels.length > 1 ? `, ${labels[0]} to ${labels.at(-1)}` : ''
  return `Line chart: ${names || 'no series'} — ${props.data.length} point${props.data.length === 1 ? '' : 's'}${span}`
})

const option = computed<ECOption>(() => {
  const categories = Object.entries(props.categories)
  const labels = props.data.map(d => d[props.xAxisKey] as string)
  const pointKey = props.pointKey
  const symbol = seriesSymbol(pointKey ? props.data.filter(d => d[pointKey]).length : props.data.length)
  // Per-row symbols only when the density rule allows points at all: an item-level 'circle'
  // would override a series-level 'none'.
  const flagRows = pointKey != null && symbol.symbol !== 'none'
  const markerKey = props.markerKey
  const hasMarkers = markerKey != null && props.data.some(d => d[markerKey])
  const gridBase = props.fixedGutter ? CHART_GRID_FIXED : CHART_GRID

  return {
    backgroundColor: 'transparent',
    textStyle: CHART_TEXT,
    color: categories.map(([, c]) => c.color),
    grid: props.bare
      ? { top: 4, left: 2, right: 2, bottom: 2, containLabel: false }
      : { ...gridBase, top: props.showLegend ? 26 : 8 },
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
      data: flagRows || hasMarkers
        ? props.data.map((d) => {
            const marker = markerKey ? d[markerKey] as string : ''
            return {
              value: d[key] as number,
              ...(marker
                ? { symbol: marker, symbolSize: 9, itemStyle: { color: CHART_WARN } }
                : flagRows
                  ? { symbol: d[pointKey as string] ? 'circle' : 'none' }
                  : {})
            }
          })
        : props.data.map(d => d[key] as number),
      smooth: false,
      ...(props.step ? { step: 'end' as const } : {}),
      ...symbol,
      // A crowded category axis thins symbols to the labelled ticks; every flagged row must show.
      ...(flagRows || hasMarkers ? { showAllSymbol: true } : {}),
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
