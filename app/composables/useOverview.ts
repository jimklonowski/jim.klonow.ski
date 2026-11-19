import type { JournalEntry, PeptideEntry } from '~/data/journal'
import type { LabsEntry } from '#shared/types/labs'
import type { DexaEntry } from '~/composables/useDexaEntries'
import type { HealthMetricsEntry, WorkoutEntry } from '#shared/types/journal'
import type { Role } from '#shared/utils/access'
import { BIOMARKERS, countFlags, getStatus, isEchoOnly } from '~/data/biomarkers'
import type { BiomarkerMeta } from '~/data/biomarkers'
import { foldCurrent } from '#shared/utils/estradiol'
import { boundKind, boundValueText, isCensored, type BoundKind } from '#shared/utils/labNotes'
import { currentReadings } from '#shared/utils/labsTimeline'
import { fmtMarkerValue } from '#shared/utils/markerValue'

export interface FlaggedMarker {
  key: string
  meta: BiomarkerMeta
  value: number
  status: 'low' | 'high'
  /** The draw this reading came from — the latest draw's, or an earlier one inside the window. */
  date: string
  /** Change vs the previous draw that recorded this marker; null on a first reading, and for a bound. */
  delta: number | null
  /** The reading is a bound the report printed with < or > (or a censored hand note): a floor, a
   * ceiling, or a limit of unknown direction. Null for a measurement. */
  bound: BoundKind | null
  /** The value as printed: "<0.3" for a floor, the figure alone for a measurement. */
  valueText: string
}

// Aggregator behind the mission-control home page, over the complete lists it charts. The site
// shell (status line, footer, command palette) used to share this and so loaded every table on
// every page — it now reads the scalar /api/overview summary through useOverviewSummary().
//
// The list endpoints 401 without a session, so every fetch is gated on the role — guests get
// empty arrays instead of failed requests. Login is a hard navigation, so the role is stable
// for a component's lifetime and the conditional composable calls below stay consistent
// between SSR and hydration.
//
// Takes the role rather than awaiting useAuth() itself: awaiting inside a plain async
// composable loses the Nuxt instance context, so the useAsyncData calls below would throw.
// Callers `await useAuth()` at the top level of <script setup>, where the Vue compiler wraps
// the await in withAsyncContext and restores the context before this runs.
export function useOverview(role: Ref<Role | null>) {
  const hasSession = !!role.value

  const journal = hasSession ? useJournalEntries() : null
  const labs = hasSession ? useLabsEntries() : null
  const metrics = hasSession ? useHealthMetricsEntries() : null
  const dexa = hasSession ? useDexaEntries() : null
  const workouts = hasSession ? useWorkoutsEntries() : null

  /** Journal entries, oldest first. */
  const entries = computed<JournalEntry[]>(() =>
    [...(journal?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )
  const latestEntry = computed(() => entries.value.at(-1) ?? null)

  /** Blood draws, oldest first — an echo-only row is a scan, not a draw (isEchoOnly). */
  const draws = computed<LabsEntry[]>(() =>
    [...(labs?.data.value ?? [])].filter(e => !isEchoOnly(e)).sort((a, b) => a.date.localeCompare(b.date))
  )
  const latestDraw = computed(() => draws.value.at(-1) ?? null)

  const healthMetrics = computed<HealthMetricsEntry[]>(() =>
    [...(metrics?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )

  const dexaScans = computed<DexaEntry[]>(() =>
    [...(dexa?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )
  const latestDexa = computed(() => dexaScans.value.at(-1) ?? null)
  /** The scan before the latest — what the home body row diffs against. */
  const previousDexa = computed(() => dexaScans.value.at(-2) ?? null)

  const allWorkouts = computed<WorkoutEntry[]>(() =>
    [...(workouts?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )

  // useToday, not localToday(): a computed only re-runs when a reactive input changes, so the
  // home page's "today" stayed yesterday on an open tab until a reload.
  const today = useToday()
  const todayEntry = computed(() => entries.value.find(e => e.date === today.value) ?? null)
  const sodasToday = computed(() => sodasOnly(todayEntry.value?.sodas).length)

  /** Doses logged today, earliest first. Falls back to the newest entry's doses when today is blank. */
  const dosesToday = computed<PeptideEntry[]>(() => {
    const source = todayEntry.value ?? latestEntry.value
    return [...(source?.peptides ?? [])].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  })

  /**
   * Each marker's current reading: its newest within the window before the latest draw
   * (currentReadings), with estradiol as one reading — the LC/MS/MS when the two assays share a
   * draw, the newer otherwise (foldCurrent). The flagged rows and the counts both read this.
   */
  const current = computed(() => foldCurrent(currentReadings(draws.value)))

  /** Every out-of-range current reading, high first then low, worst delta first. */
  const flagged = computed<FlaggedMarker[]>(() => {
    const out: FlaggedMarker[] = []
    for (const [key, { value, date }] of current.value) {
      const meta = BIOMARKERS[key]
      if (!meta) continue
      const status = getStatus(value, meta)
      if (status !== 'high' && status !== 'low') continue
      const draw = draws.value.find(d => d.date === date)
      out.push({ key, meta, value, status, date, delta: deltaFor(key, date, value), bound: boundKind(draw, key), valueText: boundValueText(fmtMarkerValue(value), draw, key) })
    }
    return out.sort((a, b) =>
      (a.status === b.status ? 0 : a.status === 'high' ? -1 : 1)
      || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)
    )
  })

  // Measured against the last real measurement: a censored reading (isCensored) is never the
  // "before", and a censored latest reading has no change at all (audit #43 item 15).
  function deltaFor(key: string, drawDate: string, value: number): number | null {
    if (isCensored(draws.value.find(d => d.date === drawDate), key)) return null
    const prior = draws.value
      .filter(d => d.date < drawDate && d.markers[key] != null && !isCensored(d, key))
      .at(-1)
    const prev = prior?.markers[key]
    return prev == null ? null : Math.round((value - prev) * 100) / 100
  }

  const flagCounts = computed(() => countFlags(Object.fromEntries([...current.value].map(([key, r]) => [key, r.value]))))

  async function refresh() {
    await Promise.all([
      journal?.refresh(),
      labs?.refresh(),
      metrics?.refresh(),
      dexa?.refresh(),
      workouts?.refresh()
    ])
  }

  /** First fetch failure across the five sources, for the page-level error panel. */
  const error = computed(() =>
    journal?.error.value ?? labs?.error.value ?? metrics?.error.value
    ?? dexa?.error.value ?? workouts?.error.value ?? null
  )

  /** A client-only list (journal, metrics, workouts) still on its first fetch after a hard load. */
  const settled = (s: string | undefined) => s == null || s === 'success' || s === 'error'
  const pending = computed(() =>
    !settled(journal?.status.value) || !settled(metrics?.status.value) || !settled(workouts?.status.value)
  )

  return {
    hasSession,
    error,
    pending,
    entries,
    draws,
    latestDraw,
    healthMetrics,
    dexaScans,
    latestDexa,
    previousDexa,
    allWorkouts,
    todayEntry,
    sodasToday,
    dosesToday,
    flagged,
    flagCounts,
    refresh
  }
}
