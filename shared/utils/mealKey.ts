// The normalized key for a meal text — its own module because both the meal library
// (shared/utils/mealLibrary.ts) and the nutrition helpers (shared/utils/nutrition.ts) build on
// it, and the library's lookup table is keyed by it at module load.

/** Tokens that carry no nutrition and vary between spellings ("bacon egg and cheese" / "bacon, egg & cheese"). */
const STOPWORDS = new Set(['and', 'with', 'w', 'the', 'a', 'an', 'of', 'plus', 'some'])

/**
 * The cache key for a meal text: lowercase, "2 x" → "2x", punctuation to spaces, stopwords out,
 * a light plural fold (shakes → shake, gyros → gyro), then the distinct tokens sorted. '' for
 * blank text. Two spellings of the same meal collide on purpose; genuinely different meals
 * ("costco pizza" vs "costco cheese pizza") stay apart.
 */
export function mealKey(text: string | null | undefined): string {
  if (!text) return ''
  const tokens = text
    .toLowerCase()
    .replace(/(\d+)\s*[x×]\s*/g, '$1x ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\+/g, ' ')
    .split(' ')
    .filter(t => t && !STOPWORDS.has(t))
    .map(t => (t.length >= 4 && /[a-z]s$/.test(t) && !t.endsWith('ss') ? t.slice(0, -1) : t))
  return [...new Set(tokens)].sort().join(' ')
}

/**
 * Splits a leading quantity off a meal text: "2 x grilled cheese + guac" → { n: 2, rest:
 * 'grilled cheese + guac' }. The quantity multiplies the WHOLE meal (two sandwiches AND two
 * guac cups — Jim's convention), so a known meal covers every "N x" of itself. null without one.
 */
export function splitQuantity(text: string): { n: number, rest: string } | null {
  const m = /^\s*(\d+)\s*[x×]\s+(.+)$/i.exec(text)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 20 ? { n, rest: m[2]!.trim() } : null
}
