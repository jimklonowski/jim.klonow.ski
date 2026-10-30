import type { Role } from '#shared/utils/access'
import type { OverviewSummary } from '#shared/types/overview'
import { countFlags } from '~/data/biomarkers'

// The light aggregator behind the site shell (StatusLine, FooterStatus, CommandPalette): one
// request to /api/overview for the handful of figures those components render. They live in
// the default layout, so anything they fetch rides along on every page — which is why they no
// longer share useOverview() with the home dashboard (that one loads the full journal, labs,
// health-metrics, DEXA and workout lists it charts).
//
// Same conditional-composable rule as useOverview: the list endpoints 401 without a session and
// login is a hard navigation, so guests skip the fetch and the branch is stable across SSR and
// hydration. Pages that change any of these figures call refreshNuxtData('overview') after
// their save (journal day, sodas, lab upload, Whoop sync, Apple Health import).
export function useOverviewSummary(role: Ref<Role | null>) {
  const hasSession = !!role.value
  const requestFetch = useRequestFetch()

  const summary = hasSession
    // Derived markers (Trig/HDL, HOMA-IR, …) arrive computed in `current` — the server runs
    // computeMarkers per draw before picking each marker's current reading.
    ? useAsyncData('overview', () => requestFetch<OverviewSummary>('/api/overview'), {
        // Serve the SSR payload on hydration only — refresh() must hit the network.
        getCachedData: (key, app, ctx) => ctx.cause === 'initial' ? app.payload.data[key] : undefined
      })
    : null

  const data = computed<OverviewSummary | null>(() => summary?.data.value ?? null)
  const latestDraw = computed(() => data.value?.latestDraw ?? null)
  /** Each marker's current reading (the server's currentReadings) — what the flags and the palette read. */
  const current = computed(() => data.value?.current ?? {})
  const flagCounts = computed(() => countFlags(Object.fromEntries(Object.entries(current.value).map(([key, r]) => [key, r.value]))))
  const error = computed(() => summary?.error.value ?? null)

  return {
    hasSession,
    data,
    latestDraw,
    current,
    flagCounts,
    error,
    refresh: () => summary?.refresh() ?? Promise.resolve()
  }
}
