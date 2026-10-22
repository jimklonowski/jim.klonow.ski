<template>
  <!-- Nuxt UI's Chart (TanStack Charts) behind the props the echarts version took, so TrendCard,
       MetricTile and the pages didn't change. The marks are our own `definition`: lines per
       series (a step-after curve for doses), the dashed lab-draw guides, the protocol annotations
       (dose lines and event/cycle bands), dots on flagged rows and a ▲ on censored readings, and
       a second y scale when two markers share one chart. Colors are the categories' own strings
       (var(--color-…) tokens pass straight through) and the axis text is the root's currentColor
       and font, so a preset, face or size switch reaches every chart with no re-render. -->
  <UChart
    type="line"
    :data="data"
    :index="xAxisKey"
    :categories="series"
    :definition="definition"
    :height="chartHeight"
    :aria-label="ariaLabel ?? describedChart"
    :tooltip="{ content: { side: 'top', sideOffset: 10 } }"
    :ui="{ root: bare ? 'overflow-visible' : undefined }"
  >
    <template #tooltip="{ points }">
      <div class="px-2.5 py-1.5 text-meta min-w-32 bg-raised border border-line-accent text-body shadow-(--panel-shadow)">
        <p class="text-muted mb-1">
          {{ tipTitle(points) }}
        </p>
        <div
          v-for="row in tipRows(points)"
          :key="row.name"
          class="flex items-center justify-between gap-3"
        >
          <span class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ background: row.color }"
            />
            {{ row.name }}
          </span>
          <span class="text-hi">{{ row.value }}</span>
        </div>
        <p
          v-for="note in tipNotes(points)"
          :key="note.text"
          class="mt-0.5"
          :style="{ color: note.color }"
        >
          {{ note.glyph }} {{ note.text }}
        </p>
      </div>
    </template>
  </UChart>
</template>

<script setup lang="ts">
import { areaY, colorLegend, colorLegendItems, defineChart, dot, lineY, rect, ruleX, ruleY, text } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { decorative } from '@tanstack/charts/mark/decorative'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal'
import { scalePoint } from '@tanstack/charts/scales/point'
import { annotationsAt } from '#shared/utils/chartAnnotations'
import type { PlacedAnnotation } from '#shared/utils/chartAnnotations'
import { SCALES } from '#shared/utils/displayScale'
import { splitRuns } from '~/utils/chartRuns'
import { ANNOTATION_STYLE, CHART_AXIS, CHART_GRID_FIXED, CHART_WARN, seriesSymbol } from '~/utils/chartTheme'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const props = withDefaults(defineProps<{
  data: Record<string, unknown>[]
  categories: Record<string, { name: string, color: string }>
  xAxisKey?: string
  height?: number | string
  showLegend?: boolean
  /** Subtle fill under the line. Off by default — the design wants bare lines. */
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
  /** Row field holding a per-row marker name ('triangle', …) for readings that must not be read
   * as ordinary points — a value censored at an assay ceiling, say. Unlike `pointKey` these
   * ignore the density rule: a data-integrity mark is not decoration and must never be thinned
   * away. Shape carries the meaning, color only reinforces it. */
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

const chartHeight = computed(() => (typeof props.height === 'number' ? props.height : parseInt(props.height, 10) || 160))

/** The categories as UChart wants them; it turns each `color` into the chart's series variables. */
const series = computed(() => Object.entries(props.categories).map(([key, c]) => ({ key, label: c.name, color: c.color })))

const labels = computed(() => props.data.map(d => String(d[props.xAxisKey] ?? '')))

// An axis of ISO days charts on the exact dates (so annotations, guides and tooltips can never
// land on the same month-day of another year) and formats only the DISPLAY. Once the data spans
// years, the short label carries ’yy the way CompareCard's does.
const isoAxis = computed(() => labels.value.length > 0 && labels.value.every(l => ISO_DAY.test(l)))
const multiYear = computed(() => isoAxis.value && labels.value[0]!.slice(0, 4) !== labels.value.at(-1)!.slice(0, 4))
const displayDay = (d: string) => (ISO_DAY.test(d) ? `${formatDate(d, 'monthDay')}${multiYear.value ? ` ’${d.slice(2, 4)}` : ''}` : d)

/** One row per series point: the long form TanStack's channels read. `category` is the series
 * NAME — it is what the tooltip and the chart's aria text read back. */
interface Row {
  x: string
  category: string
  value: number
  /** The source row, for the per-row flags. */
  src: Record<string, unknown>
}

/**
 * Per series: every reading (`rows`, for dots, markers and the tooltip) and the same readings
 * split into `runs` at the rows with no value — one line mark per run, so a week with no
 * weigh-ins is a break in the line, not a trend drawn through it. `connectNulls` keeps one run.
 */
const seriesRows = computed(() => series.value.map(({ key, label }) => {
  const runs = splitRuns(
    props.data,
    d => d[key],
    (d, v): Row => ({ x: String(d[props.xAxisKey] ?? ''), category: label, value: v, src: d }),
    props.connectNulls
  )
  return { key, name: label, rows: runs.flat(), runs }
}))

/**
 * A step that holds each value until the next x — the shape of a dose, which changes on a day
 * and stays. (Nuxt UI's own `step` curve turns halfway between points.) Same contract as its
 * curve objects: `line` and `area` path builders over scene points.
 */
const r = (n: number) => Math.round(n * 100) / 100
const stepAfter = (() => {
  const segments = (pts: readonly (readonly [number, number])[]) => pts.slice(1).map(([x1, y1], i) => `L${r(x1)},${r(pts[i]![1])}L${r(x1)},${r(y1)}`).join('')
  const line = (pts: readonly (readonly [number, number])[]) => (pts.length ? `M${r(pts[0]![0])},${r(pts[0]![1])}${segments(pts)}` : '')
  return {
    line,
    area: (top: readonly (readonly [number, number])[], bottom: readonly (readonly [number, number])[]) => {
      if (!top.length) return ''
      const reversed = [...bottom].reverse()
      return `${line(top)}L${r(reversed[0]![0])},${r(reversed[0]![1])}${segments(reversed)}Z`
    }
  }
})()

/**
 * The fixed gutters, scaled with the SIZE setting: the chart's axis text follows --type-scale
 * (10 px → 12.5 px at XL), but CHART_GRID_FIXED was sized for the 10 px face, so a four-character
 * y-label at XL ran into the left edge (audit #42 item 37 — measured 2 px of clearance left on a
 * two-character label). Both charts of a stacked pair scale alike, so they stay flush.
 */
const { activeScale } = useTheme()
const scaledGutter = computed(() => {
  const factor = SCALES[activeScale.value]?.factor ?? 1
  return {
    top: Math.round(CHART_GRID_FIXED.top * factor),
    left: Math.round(CHART_GRID_FIXED.left * factor),
    right: Math.round(CHART_GRID_FIXED.right * factor),
    bottom: Math.round(CHART_GRID_FIXED.bottom * factor)
  }
})

const definition = computed(() => {
  const names = series.value.map(s => s.label)
  const all = labels.value
  const onChart = props.annotations.filter(a => all.includes(a.at) && (a.end == null || all.includes(a.end)))
  const pointKey = props.pointKey
  const markerKey = props.markerKey
  const symbol = seriesSymbol(pointKey ? props.data.filter(d => d[pointKey]).length : props.data.length)
  const flagRows = pointKey != null && symbol.symbol !== 'none'
  const curve = props.step ? stepAfter : undefined

  const marks: unknown[] = []

  // Bands behind everything: an event (travel) in faint warn, a cycle in faint accent — one mark
  // per kind, since a rect's fill is one color.
  for (const kind of ['event', 'cycle'] as const) {
    const bands = onChart.filter(a => a.end != null && a.kind === kind)
    if (bands.length) {
      marks.push(decorative(rect(bands, { x1: 'at', x2: 'end', fill: ANNOTATION_STYLE[kind].color, fillOpacity: ANNOTATION_STYLE[kind].opacity })))
    }
  }
  // Dashed verticals on lab draws; solid half-strength ember lines on dose changes.
  if (props.markLines.length) {
    const guides = props.markLines.filter(v => all.includes(v))
    if (guides.length) marks.push(decorative(ruleX(guides, { stroke: CHART_AXIS.guide, strokeDasharray: '4 3' })))
  }
  const doseLines = onChart.filter(a => a.end == null).map(a => a.at)
  if (doseLines.length) marks.push(decorative(ruleX(doseLines, { stroke: ANNOTATION_STYLE.dose.color, strokeOpacity: ANNOTATION_STYLE.dose.opacity })))

  // The echarts charts anchored to a zero baseline except the bare tiles (read for their shape)
  // and dual-axis compares; the scale infers its domain from the marks, so an invisible rule at 0
  // asks for the same. Only on the primary y scale.
  if (!props.bare && !props.dualAxis) marks.push(decorative(ruleY([0], { strokeOpacity: 0 })))

  for (const [i, s] of seriesRows.value.entries()) {
    const yScale = props.dualAxis && i === 1 ? 'y2' : undefined
    const base = { x: 'x', y: 'value', color: 'category', yScale } as const
    const points = !flagRows && symbol.symbol !== 'none'
    for (const run of s.runs) {
      // A reading with nothing measured either side has no line to sit on (a one-point path
      // draws nothing); without point markers it would vanish, so it gets a dot of its own.
      if (run.length === 1 && !points) {
        marks.push(dot(run, { ...base, r: 1.5 }))
        continue
      }
      if (props.area) {
        marks.push(decorative(areaY(run, { ...base, y1: 0, y2: 'value', curve, fillOpacity: 0.08 })))
      }
      marks.push(lineY(run, { ...base, curve, strokeWidth: 1.5, points }))
    }
    // Point markers only on the flagged rows (dosing days of a daily step chart).
    if (flagRows) marks.push(dot(s.rows.filter(row => row.src[pointKey!]), { ...base, r: 2 }))
    // A censored reading wears a ▲ in warn; shape carries the meaning, whatever the density.
    if (markerKey) {
      const marked = s.rows.filter(row => row.src[markerKey])
      if (marked.length) marks.push(decorative(text(marked, { x: 'x', y: 'value', yScale, text: () => '▲', fill: CHART_WARN, fontSize: 9 })))
    }
  }

  // The vertical guide under the pointer, without its value label: the tooltip carries the date,
  // and on a bare tile the label would have no axis to sit on and land across the line.
  marks.push(crosshair({ x: { label: false }, y: false }))

  const scales: Record<string, unknown> = {
    x: {
      // A configured instance: the domain is the data's own order. Left to inference, the scale
      // takes x values in MARK order, and a draw guide or dose rule pushed before the lines
      // would claim slot 0 for its date — its reading then plots at the left edge.
      scale: scalePoint<string>().domain(all).padding(0),
      axis: props.bare ? false : { ticks: { format: (v: string) => (isoAxis.value ? displayDay(v) : v) } }
    },
    y: {
      scale: scaleLinear,
      nice: true,
      grid: !props.bare,
      axis: props.bare ? false : {}
    }
  }
  if (props.dualAxis) {
    scales.y2 = { scale: scaleLinear, nice: true, channel: 'y', side: 'right', grid: false, axis: {} }
  }

  return defineChart({
    marks: marks as never,
    scales: scales as never,
    color: {
      scale: scaleOrdinal<string, string>().domain(names).range(names.map((_, i) => `var(--ts-chart-${i + 1})`)),
      legend: props.showLegend ? colorLegend({ items: colorLegendItems({ justify: 'center', gap: 16 }) }) : undefined
    },
    // A bare tile keeps a little headroom for the stroke and nothing else; stacked charts take
    // the fixed gutters so their plots stay flush whatever their y-labels measure.
    margin: props.bare ? { top: 4, right: 2, bottom: 2, left: 2 } : props.fixedGutter ? scaledGutter.value : undefined,
    focus: 'group-x',
    // The default only focuses a point within 48px, which leaves dead zones between sparse points.
    maxFocusDistance: Number.POSITIVE_INFINITY
  })
})

// --- tooltip ---------------------------------------------------------------------------------
type Focused = readonly { datum: unknown, color?: string }[]
const rowsOf = (points: Focused) => points.map(p => p.datum as Partial<Row>).filter((d): d is Row => typeof d?.category === 'string' && typeof d.value === 'number')

function tipTitle(points: Focused) {
  const x = rowsOf(points)[0]?.x ?? ''
  return isoAxis.value ? displayDay(x) : x
}

/** One row per series at the hovered x (a flagged row's dot and its line point are the same reading). */
function tipRows(points: Focused) {
  const seen = new Set<string>()
  const out: { name: string, color?: string, value: number }[] = []
  for (const p of points) {
    const d = p.datum as Partial<Row>
    if (typeof d?.category !== 'string' || typeof d.value !== 'number' || seen.has(d.category)) continue
    seen.add(d.category)
    out.push({ name: d.category, color: p.color, value: d.value })
  }
  return out
}

/** The protocol context under the cursor: dose changes, events and cycles covering that day. */
function tipNotes(points: Focused) {
  const x = rowsOf(points)[0]?.x
  if (!x || !props.annotations.length) return []
  return annotationsAt(props.annotations, x, labels.value).map(a => ({
    glyph: a.kind === 'dose' ? '│' : '▒',
    color: ANNOTATION_STYLE[a.kind].color,
    text: a.text
  }))
}
</script>
