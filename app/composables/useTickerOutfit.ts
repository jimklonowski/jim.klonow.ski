import { isSluggish } from '#shared/utils/petState'
import { wardrobeOf } from '#shared/utils/tickerWardrobe'
import type { TickerBuild, TickerProp } from '#shared/utils/tickerSprite'

/**
 * TICKER as it is dressed and built, for a page that hosts it without being its home: the earned
 * wearables, the mane, the tier, the arms and the belly (shared/utils/tickerWardrobe.ts — what the
 * home digest and /ticker read) and the short-sleep slump (shared/utils/petState.ts). /ask drew a
 * bare default heart: none of this was handed to it, so it was not the same pet (audit #44
 * item 49).
 *
 * Nothing is awaited — a page does not wait for its pet. The journal and the workouts are fetched
 * in the browser, so until both are in it is the plain figure it always was here; it dresses once
 * they land, rather than flashing a limbless hatchling with nothing on first.
 */
export function useTickerOutfit() {
  const journal = useJournalEntries()
  const workouts = useWorkoutsEntries()
  const health = useHealthMetricsEntries()
  const dexa = useDexaEntries()
  const protocol = useProtocol()
  const today = useToday()

  /** The lists the wardrobe is counted from are both in. */
  const ready = computed(() => journal.data.value != null && workouts.data.value != null)
  const outfit = computed<{ accessories: TickerProp[], build: TickerBuild }>(() => {
    if (!ready.value) return { accessories: [], build: {} }
    return wardrobeOf({
      entries: journal.data.value ?? [],
      workouts: workouts.data.value ?? [],
      scans: dexa.data.value ?? [],
      standing: protocol.standing.value,
      today: today.value
    })
  })

  return {
    ready,
    accessories: computed(() => outfit.value.accessories),
    build: computed(() => outfit.value.build),
    /** Short on sleep (the home page's rule, hysteresis and all): heavy lids, a slow beat, the coffee. */
    sluggish: computed(() => isSluggish(health.data.value ?? []))
  }
}
