// Shared echarts styling for the Phosphor Terminal system: transparent canvas, near-invisible
// grid lines, accent series. Kept in one place so every chart on the site reads as part of the
// same instrument panel rather than each page inventing its own axis colors.
//
// Plain TS with no imports, so the node test runner can load it (tests/theme.test.mjs).

/**
 * The main.css tokens as `var()` strings, for script that needs a color as a value: echarts
 * options, and inline styles computed per value. The SVG echarts renders carries them verbatim
 * into its fill/stroke attributes (zrender only parses `rgba` strings), and the browser resolves
 * them against the active `html[data-theme]` block — so a display preset switch repaints every
 * chart with no re-render, and there is no copy of the palette to keep in step. Keys are the
 * token names without `--color-`; tests/theme.test.mjs holds each to a token main.css declares.
 *
 * Two things a var() cannot do: alpha (a tint is a color plus a separate `opacity`, as in
 * ANNOTATION_STYLE), and echarts' own hover lift, which parses the color, gets nothing, and would
 * paint the hovered mark with no fill — so AreaChart and BarChart set `emphasis: { disabled: true }`
 * and leave hover to the tooltip.
 */
const token = (name: string) => `var(--color-${name})`

export const THEME = {
  'accent': token('accent'),
  'warn': token('warn'),
  'danger': token('danger'),
  'ember': token('ember'),
  'mark': token('mark'),
  'indigo-dot': token('indigo-dot'),
  'raised': token('raised'),
  'line': token('line'),
  'line-soft': token('line-soft'),
  'line-accent': token('line-accent'),
  'body': token('body'),
  'band': token('band'),
  'band-outer': token('band-outer')
} as const

export const CHART_ACCENT = THEME.accent
export const CHART_WARN = THEME.warn
export const CHART_DANGER = THEME.danger
export const CHART_EMBER = THEME.ember
export const CHART_INDIGO = THEME['indigo-dot']

/** A lab value's status (getStatus in app/data/biomarkers.ts) as a color: marker dots, card
 * accents, flagged rows. Was hand-copied into five components. */
export const STATUS_COLORS = {
  optimal: THEME.accent,
  low: THEME.warn,
  high: THEME.danger,
  unknown: THEME.mark
} as const

export type StatusKey = keyof typeof STATUS_COLORS

/** Range-band fills, for inline styles (TuiRangeBar). Templates use the bg-band classes. */
export const BAND_COLORS = {
  band: THEME.band,
  outer: THEME['band-outer']
} as const

export const CHART_AXIS = {
  /** Horizontal grid lines — deliberately barely-there against the near-black panel. */
  split: THEME['line-soft'],
  line: THEME.line,
  label: THEME.mark,
  /** Dashed verticals marking lab draws. */
  guide: THEME['line-accent']
} as const

/**
 * Protocol context on the time-series charts (shared/utils/chartAnnotations.ts): a dose change
 * is a half-strength ember line, an event (travel) a faint warn band, a cycle a faint accent
 * band. All of it sits under the data's contrast on purpose: 90 days can hold a dozen dose
 * steps, and at full strength they out-shouted the 46px trend lines they annotate. The tooltip
 * and the key use the same `color` at full strength.
 */
export const ANNOTATION_STYLE = {
  dose: { color: THEME.ember, opacity: 0.42 },
  event: { color: THEME.warn, opacity: 0.13 },
  cycle: { color: THEME.accent, opacity: 0.1 }
} as const

export const CHART_TEXT = {
  // A literal rather than var(--font-mono): zrender measures labels with canvas measureText,
  // which can't resolve a var() and would size every gutter for the fallback face.
  fontFamily: '\'JetBrains Mono\', ui-monospace, monospace',
  fontSize: 10
} as const

export const CHART_GRID = {
  top: 8,
  left: 4,
  right: 8,
  bottom: 4,
  containLabel: true
} as const

/**
 * Margins for charts stacked on one x-axis (the dose step over the modeled curve on a compound
 * page). `containLabel` measures each chart's own y-labels, so a "1000" axis above a "100" axis
 * drifts the plots apart by a character. These are sized for four-character y-labels and a
 * "Sep 18" end label at the 10px mono face — what containLabel lands on for "100" today, so
 * nothing moves for the common case and the two plots stay flush in every case.
 */
export const CHART_GRID_FIXED = {
  top: 8,
  left: 34,
  right: 26,
  bottom: 24,
  containLabel: false
} as const

/**
 * ECharts hard-codes `z-index: 9999999` on its HTML tooltip, which floats it over any sticky
 * chrome on the page (the /labs time scrubber sits at z-10). `extraCssText` lands after that rule
 * in the same style attribute, so it is the one place the z-index can be pulled back down.
 * Every tooltip config's extraCssText should start with this.
 */
export const CHART_TOOLTIP_Z = 'z-index:1;'

export const CHART_TOOLTIP = {
  trigger: 'axis' as const,
  backgroundColor: THEME.raised,
  borderColor: THEME['line-accent'],
  borderWidth: 1,
  padding: [6, 10] as [number, number],
  textStyle: { ...CHART_TEXT, color: THEME.body, fontSize: 11 },
  extraCssText: `${CHART_TOOLTIP_Z}border-radius:0;box-shadow:0 0 12px rgba(0,0,0,.5);`
}

/** Point markers become noise past ~40 readings, so dense series render as a bare line. */
export function seriesSymbol(pointCount: number) {
  return pointCount > 40
    ? { symbol: 'none' as const }
    : { symbol: 'circle' as const, symbolSize: 4 }
}

interface ChartFrameOptions {
  /** Category labels along x. */
  labels: string[]
  showLegend?: boolean
  /** Legend swatch: a 14×2 line for line charts, a 10×10 square for bars. */
  legendItem?: { width: number, height: number }
  /** 'bare' drops the gutters for axis-less tiles; 'fixed' is CHART_GRID_FIXED for stacked charts. */
  grid?: 'normal' | 'fixed' | 'bare'
  /** Top margin of a bare grid (the line tiles keep a little headroom for the stroke). */
  bareTop?: number
  /** Merged over the shared category x-axis (visibility, boundaryGap). */
  xAxis?: Record<string, unknown>
  /** Merged over the shared value y-axis (visibility, scale, splitLine.show). */
  yAxis?: Record<string, unknown> & { splitLine?: Record<string, unknown> }
}

/**
 * The frame every chart on the site shares: transparent canvas, the mono text style, grid
 * margins, legend styling, and the category-x / value-y axes in the axis colors. AreaChart and
 * BarChart each used to build all of this themselves; they now pass only what differs (bar vs
 * line spacing, which axes a bare chart hides) and add their own series and tooltip.
 */
export function chartFrame(o: ChartFrameOptions) {
  const grid = o.grid === 'bare'
    ? { top: o.bareTop ?? 4, left: 2, right: 2, bottom: 2, containLabel: false }
    : { ...(o.grid === 'fixed' ? CHART_GRID_FIXED : CHART_GRID), top: o.showLegend ? 26 : 8 }
  const { splitLine, ...yAxis } = o.yAxis ?? {}
  return {
    backgroundColor: 'transparent',
    textStyle: CHART_TEXT,
    grid,
    legend: {
      show: !!o.showLegend,
      top: 0,
      itemWidth: o.legendItem?.width ?? 14,
      itemHeight: o.legendItem?.height ?? 2,
      icon: 'rect',
      textStyle: { ...CHART_TEXT, color: CHART_AXIS.label }
    },
    xAxis: {
      type: 'category' as const,
      data: o.labels,
      axisLabel: { color: CHART_AXIS.label, fontSize: 10 },
      axisLine: { lineStyle: { color: CHART_AXIS.line } },
      axisTick: { show: false },
      ...o.xAxis
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: CHART_AXIS.label, fontSize: 10 },
      axisLine: { show: false },
      ...yAxis,
      splitLine: { ...splitLine, lineStyle: { color: CHART_AXIS.split } }
    }
  }
}
