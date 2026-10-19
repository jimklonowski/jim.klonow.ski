// Shared chart styling for the Phosphor Terminal system, for the two Nuxt UI Chart wrappers
// (AreaChart, BarChart) and the inline SVG / styled elements that colour a value by status.
//
// Plain TS with no imports, so the node test runner can load it (tests/theme.test.mjs).

/**
 * The main.css tokens as `var()` strings, for script that needs a color as a value: chart marks
 * and inline styles computed per value. TanStack's SVG carries them verbatim into fill/stroke
 * attributes and the browser resolves them against the active `html[data-theme]` block — so a
 * display preset switch repaints every chart with no re-render, and there is no copy of the
 * palette to keep in step. Keys are the token names without `--color-`; tests/theme.test.mjs
 * holds each to a token main.css declares.
 *
 * Alpha is the one thing a var() cannot carry: a tint is a color plus a separate opacity, as in
 * ANNOTATION_STYLE.
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

/** Axis colours. The grid and axis lines themselves are styled in main.css (`.ts-chart__grid`,
 * `.ts-chart__axes`); `guide` is the dashed vertical on a lab draw. */
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

/**
 * Margins for charts stacked on one x-axis (the dose step over the modeled curve on a compound
 * page). Automatic margins measure each chart's own y-labels, so a "1000" axis above a "100" axis
 * drifts the plots apart by a character. These are sized for four-character y-labels and a
 * "Sep 18" end label at the 10px mono face, so the two plots stay flush in every case.
 */
export const CHART_GRID_FIXED = {
  top: 8,
  left: 34,
  right: 26,
  bottom: 24
} as const

/** Point markers become noise past ~40 readings, so dense series render as a bare line. */
export function seriesSymbol(pointCount: number) {
  return pointCount > 40
    ? { symbol: 'none' as const }
    : { symbol: 'circle' as const, symbolSize: 4 }
}
