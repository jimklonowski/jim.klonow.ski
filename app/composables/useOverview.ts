import type { JournalEntry, PeptideEntry } from '~/data/journal'
import type { LabsEntry } from '~/composables/useLabsEntries'
import type { DexaEntry } from '~/composables/useDexaEntries'
import type { HealthMetricsEntry } from '~/composables/useHealthMetricsEntries'
import type { WorkoutEntry } from '~/composables/useWorkoutsEntries'
import type { Role } from '#shared/utils/access'
import { BIOMARKERS, getStatus } from '~/data/biomarkers'
import type { BiomarkerMeta } from '~/data/biomarkers'

export interface FlaggedMarker {
  key: string
  meta: BiomarkerMeta
  value: number
  status: 'low' | 'high'
  /** Change vs the previous draw that recorded this marker, or null on a first reading. */
  delta: number | null
}

/** Local (not UTC) YYYY-MM-DD, so an evening "today" doesn't roll over to tomorrow. */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}

// Shared aggregator behind the shell (header status line, footer, command palette) and the
// mission-control home page. The list endpoints 401 without a session, so every fetch is
// gated on the role — guests get empty arrays instead of failed requests. Login is a hard
// navigation, so the role is stable for a component's lifetime and the conditional
// composable calls below stay consistent between SSR and hydration.
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

  /** Lab draws, oldest first. */
  const draws = computed<LabsEntry[]>(() =>
    [...(labs?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )
  const latestDraw = computed(() => draws.value.at(-1) ?? null)

  const healthMetrics = computed<HealthMetricsEntry[]>(() =>
    [...(metrics?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )
  const latestMetrics = computed(() => healthMetrics.value.at(-1) ?? null)

  const dexaScans = computed<DexaEntry[]>(() =>
    [...(dexa?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )
  const latestDexa = computed(() => dexaScans.value.at(-1) ?? null)

  const allWorkouts = computed<WorkoutEntry[]>(() =>
    [...(workouts?.data.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  )

  /** Consecutive logged days ending at the most recent entry. */
  const streak = computed(() => {
    const last = latestEntry.value
    if (!last) return 0
    const dates = new Set(entries.value.map(e => e.date))
    let count = 0
    const d = new Date(last.date + 'T12:00:00')
    while (dates.has(d.toLocaleDateString('en-CA'))) {
      count++
      d.setDate(d.getDate() - 1)
    }
    return count
  })

  const todayEntry = computed(() => entries.value.find(e => e.date === localToday()) ?? null)
  const sodasToday = computed(() => todayEntry.value?.sodas?.length ?? 0)

  /** Doses logged today, earliest first. Falls back to the newest entry's doses when today is blank. */
  const dosesToday = computed<PeptideEntry[]>(() => {
    const source = todayEntry.value ?? latestEntry.value
    return [...(source?.peptides ?? [])].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  })

  /** Every out-of-range marker on the latest draw, high first then low, worst delta first. */
  const flagged = computed<FlaggedMarker[]>(() => {
    const draw = latestDraw.value
    if (!draw) return []
    const out: FlaggedMarker[] = []
    for (const [key, value] of Object.entries(draw.markers)) {
      const meta = BIOMARKERS[key]
      if (!meta || value == null) continue
      const status = getStatus(value, meta)
      if (status !== 'high' && status !== 'low') continue
      out.push({ key, meta, value, status, delta: deltaFor(key, draw.date, value) })
    }
    return out.sort((a, b) =>
      (a.status === b.status ? 0 : a.status === 'high' ? -1 : 1)
      || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)
    )
  })

  function deltaFor(key: string, drawDate: string, value: number): number | null {
    const prior = draws.value
      .filter(d => d.date < drawDate && d.markers[key] != null)
      .at(-1)
    const prev = prior?.markers[key]
    return prev == null ? null : Math.round((value - prev) * 100) / 100
  }

  const flagCounts = computed(() => ({
    high: flagged.value.filter(f => f.status === 'high').length,
    low: flagged.value.filter(f => f.status === 'low').length,
    optimal: latestDraw.value
      ? Object.entries(latestDraw.value.markers)
        .filter(([k, v]) => v != null && BIOMARKERS[k] && getStatus(v, BIOMARKERS[k]!) === 'optimal').length
      : 0
  }))

  /** Distinct source PDFs across every draw. */
  const pdfCount = computed(() =>
    new Set(draws.value.flatMap(d => d.sources ?? [])).size
  )

  async function refresh() {
    await Promise.all([
      journal?.refresh(),
      labs?.refresh(),
      metrics?.refresh(),
      dexa?.refresh(),
      workouts?.refresh()
    ])
  }

  return {
    hasSession,
    entries,
    latestEntry,
    todayEntry,
    draws,
    latestDraw,
    healthMetrics,
    latestMetrics,
    dexaScans,
    latestDexa,
    allWorkouts,
    streak,
    sodasToday,
    dosesToday,
    flagged,
    flagCounts,
    pdfCount,
    refresh
  }
}
