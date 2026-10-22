// Small numeric helpers shared by the prompt builders and the pages (audit #42 item 40: `avg`
// existed three times — digestFacts, askContext and the compound page — two of them identical).
// Plain TS, no imports.

/** The arithmetic mean of the finite numbers in `values`; null when there are none. */
export function mean(values: Iterable<number | null | undefined>): number | null {
  let sum = 0
  let n = 0
  for (const v of values) {
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    sum += v
    n++
  }
  return n ? sum / n : null
}
