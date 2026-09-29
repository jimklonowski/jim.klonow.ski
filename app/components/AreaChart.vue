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
import { annotationsAt } from '#shared/utils/chartAnnotations'
import type { PlacedAnnotation } from '#shared/utils/chartAnnotations'
import { ANNOTATION_STYLE, CHART_AXIS, CHART_TOOLTIP, CHART_WARN, chartFrame, seriesSymbol } from '~/utils/chartTheme'

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

interface AxisTooltipParam {
  axisValueLabel?: string
  marker?: string
  seriesName?: string
  value?: unknown
}

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
  /** Protocol context already placed on this chart's categories (shared/utils/chartAnnotations):
   * dose changes as solid ember lines, events and cycles as faint bands. Their text is in the
   * hover tooltip for the date under the cursor, so even a 46px bare tile carries it. */
  annotations?: PlacedAnnotation[]
  /** Give the second series its own y-axis on the right: two markers in different units on one
   * chart (HDL mg/dL against total T ng/dL) without one flattening the other. */
  dualAxis?: boolean
  /** Draw straight across gaps. For sparse, unaligned series (two markers from different
   * panels) where a null is "not measured that day", not a break in the line. */
  connectNulls?: boolean
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
  ariaLabel: undefined,
  annotations: () => [],
  dualAxis: false,
  connectNulls: false
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

  // Guides on the first series only, otherwise they stack up per line: the dashed lab-draw
  // verticals, the ember dose-change lines, and the event/cycle bands behind everything.
  const onChart = props.annotations.filter(a => labels.includes(a.at) && (a.end == null || labels.includes(a.end)))
  const drawLines = props.markLines.filter(v => labels.includes(v)).map(xAxis => ({ xAxis }))
  const doseLines = onChart.filter(a => a.end == null).map(a => ({
    xAxis: a.at,
    lineStyle: { color: ANNOTATION_STYLE.doseLine, type: 'solid' as const, width: 1 }
  }))
  // echarts types a band as a [start, end] pair, so build it as a tuple.
  const bands = onChart.filter(a => a.end != null).map((a): [{ xAxis: string, itemStyle: { color: string } }, { xAxis: string }] => [
    { xAxis: a.at, itemStyle: { color: a.kind === 'cycle' ? ANNOTATION_STYLE.cycle : ANNOTATION_STYLE.event } },
    { xAxis: a.end! }
  ])

  const frame = chartFrame({
    labels,
    showLegend: props.showLegend,
    grid: props.bare ? 'bare' : props.fixedGutter ? 'fixed' : 'normal',
    xAxis: { boundaryGap: false, show: !props.bare },
    // A bare tile is read for its shape, so let the line fill the box instead of anchoring to
    // a zero baseline it never approaches. Two axes compare shapes too, so neither pins to 0.
    yAxis: { show: !props.bare, scale: props.bare || props.dualAxis, splitLine: { show: !props.bare } }
  })

  return {
    ...frame,
    ...(props.dualAxis
      ? { yAxis: [frame.yAxis, { ...frame.yAxis, position: 'right' as const, splitLine: { show: false } }] }
      : {}),
    color: categories.map(([, c]) => c.color),
    tooltip: onChart.length ? { ...CHART_TOOLTIP, formatter: tooltipWith(onChart, labels) } : CHART_TOOLTIP,
    series: categories.map(([key, meta], i) => ({
      type: 'line',
      name: meta.name,
      ...(props.dualAxis && i === 1 ? { yAxisIndex: 1 } : {}),
      ...(props.connectNulls ? { connectNulls: true } : {}),
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
      ...(i === 0 && (drawLines.length || doseLines.length)
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: CHART_AXIS.guide, type: 'dashed', width: 1 },
              label: { show: false },
              data: [...drawLines, ...doseLines]
            }
          }
        : {}),
      ...(i === 0 && bands.length
        ? { markArea: { silent: true, label: { show: false }, data: bands } }
        : {})
    }))
  }
})

/**
 * The axis tooltip, plus whatever protocol context covers the hovered date. Rebuilds echarts'
 * default body (date, then one marker/name/value row per series) because a formatter replaces
 * it wholesale.
 */
function tooltipWith(placed: PlacedAnnotation[], order: string[]) {
  return (raw: unknown) => {
    const params = (Array.isArray(raw) ? raw : [raw]) as AxisTooltipParam[]
    const category = params[0]?.axisValueLabel ?? ''
    const rows = params
      .filter(p => p.value != null && p.value !== '')
      .map(p => `${p.marker ?? ''}${escapeHtml(p.seriesName ?? '')} <b>${escapeHtml(String(p.value))}</b>`)
    const notes = annotationsAt(placed, category, order).map((a) => {
      const color = a.kind === 'dose' ? ANNOTATION_STYLE.dose : a.kind === 'cycle' ? ANNOTATION_STYLE.cycleText : ANNOTATION_STYLE.eventText
      return `<span style="color:${color}">${a.kind === 'dose' ? '│' : '▒'} ${escapeHtml(a.text)}</span>`
    })
    return [escapeHtml(category), ...rows, ...notes].join('<br/>')
  }
}
</script>
