// Shared echarts styling for the Phosphor Terminal system: transparent canvas, near-invisible
// grid lines, phosphor accent series. Kept in one place so every chart on the site reads as
// part of the same instrument panel rather than each page inventing its own axis colors.
//
// Plain TS with no imports, so the node test runner can load it (tests/theme.test.mjs).

/**
 * Hex twins of the main.css @theme tokens that script needs as literal colors: echarts options,
 * and inline styles computed per value. A CSS variable can't go in either. tests/theme.test.mjs
 * holds every entry equal to its token, so a palette change in main.css can't leave the charts
 * behind. Keys are the token names without `--color-`.
 */
export const THEME = {
  'accent': '#2ce8a4',
  'warn': '#e8b34b',
  'danger': '#e86a5e',
  'ember': '#e8834b',
  'mark': '#5d7a6d',
  'indigo-dot': '#8593ea',
  'soda': '#7a2e35',
  'raised': '#0d1310',
  'line': '#1a2620',
  'line-soft': '#16211b',
  'line-accent': '#24382f',
  'body': '#c7d4cd',
  'band': '#1e3a2e',
  'band-outer': '#152b21'
} as const

export const CHART_ACCENT = THEME.accent
export const CHART_WARN = THEME.warn
export const CHART_DANGER = THEME.danger
export const CHART_EMBER = THEME.ember
export const CHART_INDIGO = THEME['indigo-dot']
export const CHART_SODA = THEME.soda

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

export const CHART_TEXT = {
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
