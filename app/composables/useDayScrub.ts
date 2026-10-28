import { shiftDays } from '#shared/utils/dates'

/**
 * The home page's day scrub: one `shownDate` ref (null = today) that the vitals card's ‹ › and
 * the left column's swipe both move, and the derived values every block reads off it. The card
 * and the page each call this on the SAME ref, so there is one source of truth and nothing to
 * expose between them. Null rather than today's date so the column keeps reading TODAY across
 * midnight without anyone having to notice.
 *
 * `firstDate` is where ‹ stops — the first day any scrubbed series has (firstDateOf below).
 */
export function useDayScrub(shownDate: Ref<string | null>, firstDate: MaybeRefOrGetter<string | null>) {
  const today = useToday()
  /** The day shown: the scrubbed-to date, or today. */
  const asOf = computed(() => shownDate.value ?? today.value)
  const isToday = computed(() => shownDate.value == null || shownDate.value >= today.value)
  const canBack = computed(() => {
    const first = toValue(firstDate)
    return first != null && asOf.value > first
  })
  /** "OCT 25" (year outside the current one), for the headers that name the shown day. */
  const label = computed(() => formatDayLabel(asOf.value, today.value))

  function step(n: 1 | -1) {
    if (n < 0 && !canBack.value) return
    if (n > 0 && isToday.value) return
    const next = shiftDays(asOf.value, n)
    shownDate.value = next >= today.value ? null : next
  }
  function reset() {
    shownDate.value = null
  }

  return { today, asOf, isToday, canBack, label, step, reset }
}

/** The earliest date across dated lists (each oldest first), or null when all are empty. */
export function firstDateOf(...lists: { date: string }[][]): string | null {
  const firsts = lists.map(l => l[0]?.date).filter((d): d is string => !!d).sort()
  return firsts[0] ?? null
}
