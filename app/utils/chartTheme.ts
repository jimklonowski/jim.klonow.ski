// Shared echarts styling for the Phosphor Terminal system: transparent canvas, near-invisible
// grid lines, phosphor accent series. Kept in one place so every chart on the site reads as
// part of the same instrument panel rather than each page inventing its own axis colors.

export const CHART_ACCENT = '#2ce8a4'
export const CHART_WARN = '#e8b34b'
export const CHART_DANGER = '#e86a5e'
export const CHART_INDIGO = '#8593ea'
export const CHART_SODA = '#7a2e35'

export const CHART_AXIS = {
  /** Horizontal grid lines — deliberately barely-there against the near-black panel. */
  split: '#16211b',
  line: '#1a2620',
  label: '#5d7a6d',
  /** Dashed verticals marking lab draws. */
  guide: '#24382f'
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

export const CHART_TOOLTIP = {
  trigger: 'axis' as const,
  backgroundColor: '#0d1310',
  borderColor: '#24382f',
  borderWidth: 1,
  padding: [6, 10] as [number, number],
  textStyle: { ...CHART_TEXT, color: '#c7d4cd', fontSize: 11 },
  extraCssText: 'border-radius:0;box-shadow:0 0 12px rgba(0,0,0,.5);'
}

/** Point markers become noise past ~40 readings, so dense series render as a bare line. */
export function seriesSymbol(pointCount: number) {
  return pointCount > 40
    ? { symbol: 'none' as const }
    : { symbol: 'circle' as const, symbolSize: 4 }
}
