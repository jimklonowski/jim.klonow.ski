// Splits a series into the runs a line chart should draw (audit #42 item 3).
//
// A chart row with no reading for a series is a GAP: nothing was measured that day, and a line
// drawn straight across it invents a trend. The ECharts wrapper broke the line there; the
// TanStack one dropped the empty rows and drew through — this restores the break by handing the
// chart one line per run of consecutive readings. `connect` (the AreaChart `connectNulls` prop)
// is for sparse, unaligned series (two markers from different panels) where an empty row means
// "not measured that day", not a break. Plain TS so tests/chartRuns.test.mjs can load it.

/**
 * `rows` in order; `pick` returns the series' value for a row (null/undefined/NaN = gap).
 * Returns the mapped readings grouped into runs; with `connect` a single run of every reading.
 */
export function splitRuns<Row, Out>(
  rows: readonly Row[],
  pick: (row: Row) => unknown,
  map: (row: Row, value: number) => Out,
  connect = false
): Out[][] {
  const runs: Out[][] = []
  let run: Out[] = []
  for (const row of rows) {
    const v = pick(row)
    if (typeof v === 'number' && Number.isFinite(v)) {
      run.push(map(row, v))
    }
    else if (!connect && run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs
}
