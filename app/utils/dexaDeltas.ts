// Scan-to-scan change for a DEXA metric: the signed delta with its glyph, coloured by direction ×
// whether that direction is good, and muted when the move is smaller than the scanner can tell
// apart. Shared by the DEXA page (stat cells, regional table, scan-over-scan) and the home
// page's body-composition row, so the two can never disagree about what counts as a real move.

/** Which way a metric should move: body fat down, lean up, total mass neither. */
export type Direction = 'up' | 'down' | 'neutral'

export interface Delta {
  text: string
  class: string
}

// Rough scan-to-scan repeatability of a GE Lunar DEXA, so a move smaller than this reads as
// noise (muted) rather than as a trend: about half a pound on a tissue mass, a few tenths of a
// point on a fat %, ~1 % on BMD, a few cubic inches of VAT. Jim's Sep 2026 scan moved BMD by
// 0.007 g/cm² and VAT by 1.4 in³ — both well inside the scanner's wobble.
export const DEXA_NOISE = { mass: 0.5, pct: 0.3, regionPct: 0.5, vat: 3, bmd: 0.01, tScore: 0.1, ag: 0.02 }

// Signed change with its direction glyph, coloured by direction × whether that way is good:
// accent when it moved the right way, warn when it didn't, muted when it's neither, didn't move,
// or moved by less than the scanner can tell apart.
export function deltaInfo(now: number | null | undefined, before: number | null | undefined, decimals: number, good: Direction, noise = 0): Delta | null {
  if (now == null || before == null) return null
  const d = now - before
  if (Math.abs(d) < 0.5 * 10 ** -decimals) return { text: '± 0', class: 'text-muted' }
  const text = `${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d).toFixed(decimals)}`
  const cls = good === 'neutral' || Math.abs(d) < noise
    ? 'text-muted'
    : (d > 0) === (good === 'up') ? 'text-accent' : 'text-warn'
  return { text, class: cls }
}
