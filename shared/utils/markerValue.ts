// How a lab marker's reading prints, everywhere it prints (audit #42 item 21). The labs page's
// MarkerCard rule: a whole number as itself, anything else to one decimal — hematocrit 51.7 is
// "51.7", ferritin 16 is "16", prolactin 7.1 is "7.1". The home watch tile had its own copy that
// dropped the decimal at ten and above, so 51.7 read "52" and a 50.4 flagged high against a ≤50
// reference printed as "50", the bound it had just crossed. Plain TS so the test can run it.

export function fmtMarkerValue(v: number): string {
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}
