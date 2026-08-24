/** Range options for the trends picker; 0 days means "all history". */
export const TREND_RANGES = [
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
  { label: 'all', days: 0 }
] as const

// One range + smoothing state governing every chart on /journal/trends, per the handoff
// ("one range picker for everything"). Kept in useState so the choice survives navigating
// out to a spoke and back.
export function useTrendRange() {
  const days = useState('journal-trend-days', () => 90)
  const smooth = useState('journal-trend-smooth', () => false)

  /** Inclusive lower bound as YYYY-MM-DD, or null when showing all history. */
  const cutoff = computed(() => {
    if (!days.value) return null
    const d = new Date()
    d.setDate(d.getDate() - days.value)
    return d.toLocaleDateString('en-CA')
  })

  function inRange<T extends { date: string }>(rows: T[]): T[] {
    const from = cutoff.value
    return from ? rows.filter(r => r.date >= from) : rows
  }

  /**
   * Trailing 7-day mean over the given numeric fields. Averages the last 7 *readings*
   * rather than 7 calendar days, which matches how the old journal page smoothed and keeps
   * gaps from collapsing the window.
   */
  function smoothRows<T extends Record<string, unknown>>(rows: T[], fields: string[], window = 7): T[] {
    if (!smooth.value) return rows
    return rows.map((row, i) => {
      const slice = rows.slice(Math.max(0, i - window + 1), i + 1)
      const out = { ...row }
      for (const field of fields) {
        const vals = slice.map(r => r[field]).filter((v): v is number => typeof v === 'number')
        if (vals.length) {
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length
          ;(out as Record<string, unknown>)[field] = Math.round(mean * 10) / 10
        }
      }
      return out
    })
  }

  return { days, smooth, cutoff, inRange, smoothRows }
}
