import { indexEstimates, lookupEstimate, type MealEstimate } from '#shared/utils/nutrition'
import { mealKey } from '#shared/utils/mealKey'

// The meal-estimate cache as the pages see it: one shared list (useListResource, so every chip
// on a page reads the same store), an index by key, and the two owner writes — estimate texts
// the cache lacks, and correct a figure by hand. In-flight keys live in useState so a chip on the
// entry form and the hub card never both ask the model for the same new meal.
//
// Awaited like the other list composables: `const { lookup } = await useMealEstimates()`.
export async function useMealEstimates() {
  const resource = useListResource<MealEstimate[]>('/journal/meal-estimates', '/api/journal/meals/estimates', { label: 'meal estimates' })
  // Everything that needs the Nuxt instance goes BEFORE the await: a plain async function has
  // no <script setup> async-context restore, so useState after it is NUXT_E1001 (a 500 on SSR).
  const inFlight = useState<string[]>('meal-estimates-in-flight', () => [])
  await resource
  const { data, refresh, error } = resource

  const index = computed(() => indexEstimates(data.value ?? []))

  /** The figures for a meal text from any source — hand entry, code library, model — or null. */
  function lookup(text: string | null | undefined): MealEstimate | null {
    return lookupEstimate(index.value, text)
  }

  function isPending(text: string | null | undefined): boolean {
    const key = mealKey(text)
    return !!key && inFlight.value.includes(key)
  }

  /** Reassigns the list so useAsyncData's reactivity sees the change (same rule as the soda widget). */
  function merge(rows: MealEstimate[]) {
    const byKey = new Map((data.value ?? []).map(r => [r.key, r]))
    for (const r of rows) byKey.set(r.key, r)
    data.value = [...byKey.values()].sort((a, b) => a.text.localeCompare(b.text))
  }

  /**
   * Ask the model for whichever of these texts have no estimate and aren't already being
   * estimated. Owner-only on the server; callers hide the affordance for other roles. Returns
   * the texts the answer could not be pinned to — left without figures, worth asking again.
   */
  async function estimate(texts: string[]): Promise<string[]> {
    const wanted = new Map<string, string>()
    for (const t of texts) {
      const key = mealKey(t)
      if (key && !index.value.has(key) && !inFlight.value.includes(key) && !wanted.has(key)) wanted.set(key, t.trim())
    }
    if (!wanted.size) return []
    const keys = [...wanted.keys()]
    inFlight.value = [...inFlight.value, ...keys]
    try {
      const { estimates, unmatched } = await $fetch<{ estimates: MealEstimate[], unmatched?: string[] }>('/api/journal/meals/estimate', {
        method: 'POST',
        body: { texts: [...wanted.values()] }
      })
      merge(estimates)
      return unmatched ?? []
    }
    finally {
      inFlight.value = inFlight.value.filter(k => !keys.includes(k))
    }
  }

  async function correct(body: { text: string, kcal: number, protein_g: number, carbs_g: number, fat_g: number }): Promise<void> {
    const { estimate: row } = await $fetch<{ estimate: MealEstimate }>('/api/journal/meals/correct', { method: 'POST', body })
    if (row) merge([row])
  }

  return { data, refresh, error, index, inFlight, lookup, isPending, estimate, correct }
}
