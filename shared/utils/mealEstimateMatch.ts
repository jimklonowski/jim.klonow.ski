import { mealKey } from './mealKey.ts'

// Pairs the model's nutrition items back to the meal texts they were asked about (audit #42
// item 5). The prompt asks for one item per input, in order, echoing the text verbatim — but a
// model answer can come back reordered, paraphrased or one item short, and a plain `items[i]`
// fallback then cached a NEIGHBOUR's figures under this meal as an 'ai' estimate, which every
// chip and total trusted from then on. Here the echoed text is the match; position is only a
// fallback when the answer has exactly one item per input and the slot is not spoken for.

export interface MatchedEstimate<T> {
  text: string
  key: string
  item: T
}

export interface EstimateMatch<T> {
  matched: MatchedEstimate<T>[]
  /** Inputs no item could be pinned to — left without figures rather than guessed. */
  unmatched: string[]
}

export function matchEstimateItems<T extends { text: string }>(texts: readonly string[], items: readonly T[]): EstimateMatch<T> {
  const keys = texts.map(t => mealKey(t))
  const itemKeys = items.map(it => mealKey(it.text))
  const inputKeys = new Set(keys.filter(Boolean))
  const used = new Set<number>()
  // Two inputs that normalize alike are one meal (one cache row): the second takes the first's item.
  const byKey = new Map<string, T>()
  const matched: MatchedEstimate<T>[] = []
  const pending: number[] = []

  // 1. The echoed text, normalized the way the cache keys are, is the match.
  texts.forEach((text, i) => {
    const key = keys[i]!
    const seen = key ? byKey.get(key) : undefined
    if (seen) {
      matched.push({ text, key, item: seen })
      return
    }
    const j = key ? itemKeys.findIndex((k, idx) => !used.has(idx) && k === key) : -1
    if (j >= 0) {
      used.add(j)
      byKey.set(key, items[j]!)
      matched.push({ text, key, item: items[j]! })
    }
    else {
      pending.push(i)
    }
  })

  // 2. Position, only when the answer is one-to-one with the inputs: the item in this input's
  //    slot is taken if nothing has claimed it and its echo is not some OTHER input's text (a
  //    reordered answer must not be read positionally).
  const oneToOne = items.length === texts.length
  const unmatched: string[] = []
  for (const i of pending) {
    const key = keys[i]!
    const seen = key ? byKey.get(key) : undefined
    if (seen) {
      matched.push({ text: texts[i]!, key, item: seen })
      continue
    }
    const slotKey = itemKeys[i]
    const slotFree = oneToOne && !used.has(i) && !(slotKey && inputKeys.has(slotKey))
    if (key && slotFree) {
      used.add(i)
      byKey.set(key, items[i]!)
      matched.push({ text: texts[i]!, key, item: items[i]! })
    }
    else {
      unmatched.push(texts[i]!)
    }
  }
  return { matched, unmatched }
}
