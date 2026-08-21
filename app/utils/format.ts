// Shared formatting helpers. Before this existed, formatDate had 10 page-local copies in 4
// mutually-incompatible variants (T00 vs T12 anchors, month lengths). Everything anchors to
// noon now — a midnight anchor renders as the previous day in timezones west of UTC.

const DATE_STYLES = {
  short: { month: 'short', day: 'numeric', year: 'numeric' },
  monthDay: { month: 'short', day: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  weekday: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

export function formatDate(d: string, style: keyof typeof DATE_STYLES = 'short'): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', DATE_STYLES[style])
}

export function pdfLabel(src: string): string {
  const filename = src.split('/').pop() ?? src
  return decodeURIComponent(filename).replace(/\.pdf$/i, '')
}

// Free-text narrative findings can't be reliably graded word-for-word, so this only flags
// results that name an actual severity/finding — everything else (including full descriptive
// sentences that merely mention "normal"/"no stenosis"/etc.) reads as reassuring, not alarming.
export function qualitativeColor(result: string): 'warning' | 'success' | 'neutral' {
  const text = result.toLowerCase()
  const concerning = /\b(mild|moderate|severe|abnormal|elevated|thicken|dilat|enlarg|reduced|decreased|positive|heterozygous|homozygous)\b/.test(text)
    || /(?<!not )\bdetected\b/.test(text)
  if (concerning) {
    return 'warning'
  }
  if (/\b(normal|no evidence|no significant|no stenosis|no regurgitation|not detected|negative|absent|unremarkable)\b/.test(text)) {
    return 'success'
  }
  return 'neutral'
}
