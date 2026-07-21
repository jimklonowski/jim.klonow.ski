// A single physical workout can be recorded up to three times: Whoop auto-detects it (external_id
// `whoop:*`), the Apple Watch workout arrives via the Health Auto Export webhook, and the Peloton
// app writes its own copy to HealthKit (the one that carries distance). Rather than destructively
// deduping the table (each source keeps upserting on its own external_id), rows are merged at read
// time: workouts that start near-simultaneously or substantially overlap in time are treated as
// one session, keeping the richest record and filling its gaps from the others.

// Cross-source copies usually start within a couple of minutes of each other, but Whoop's
// auto-detection can lead/lag the Peloton class by 10+ minutes (observed: 11.7 min). The start
// window catches the common case; the overlap rule (below) catches the stragglers without
// merging back-to-back classes, which barely overlap.
const START_WINDOW_MS = 10 * 60 * 1000

const METRIC_FIELDS = ['duration_min', 'calories', 'avg_hr', 'max_hr', 'distance_mi'] as const

export interface MergeableWorkout {
  external_id: string | null
  date: string
  workout_type: string | null
  start_time: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
  max_hr: number | null
  distance_mi: number | null
}

export type MergedWorkout<T extends MergeableWorkout> = T & { sources: string[] }

export function workoutSource(externalId: string | null): string {
  if (!externalId) return 'manual'
  return externalId.startsWith('whoop:') ? 'whoop' : 'apple'
}

// Whoop start times are ISO UTC ("2026-07-19T10:10:00.000Z"); Health Auto Export uses local time
// with offset ("2026-07-19 06:10:00 -0500"). Both parse via Date to the same epoch; anything
// else opts out of clustering.
function startMs(w: MergeableWorkout): number | null {
  if (!w.start_time) return null
  const t = new Date(w.start_time).getTime()
  return Number.isNaN(t) ? null : t
}

function richness(w: MergeableWorkout): number {
  return METRIC_FIELDS.filter(f => w[f] != null).length
}

function mergeCluster<T extends MergeableWorkout>(cluster: T[]): MergedWorkout<T> {
  // Richest record wins as the base; a record carrying distance (the Peloton copy) breaks ties
  // so miles ridden always survive the merge.
  const ranked = [...cluster].sort((a, b) =>
    richness(b) - richness(a) || Number(b.distance_mi != null) - Number(a.distance_mi != null)
  )
  const merged: MergedWorkout<T> = { ...ranked[0]!, sources: [] }
  for (const w of ranked.slice(1)) {
    for (const f of METRIC_FIELDS) {
      if (merged[f] == null && w[f] != null) (merged as MergeableWorkout)[f] = w[f]
    }
  }
  // Prefer Apple's record for the label ("Indoor Cycling" over Whoop's "spin") and for the date:
  // Apple timestamps are local so their date is the day the workout actually happened, while
  // Whoop rows synced before the timezone fix carry the UTC date (a day late for evening rides).
  const apple = ranked.find(w => workoutSource(w.external_id) === 'apple')
  merged.workout_type = apple?.workout_type
    ?? ranked.find(w => w.workout_type != null)?.workout_type
    ?? null
  if (apple) merged.date = apple.date
  merged.sources = [...new Set(ranked.map(w => workoutSource(w.external_id)))]
  return merged
}

export function mergeWorkouts<T extends MergeableWorkout>(rows: T[]): Array<MergedWorkout<T>> {
  // Clustering is by time only, deliberately ignoring the stored `date`: the same session can be
  // bucketed on different days by different sources (Whoop dates were UTC-derived), and epoch
  // timestamps don't care.
  const timed: Array<{ w: T, start: number, end: number }> = []
  const untimed: T[] = []
  for (const w of rows) {
    const start = startMs(w)
    if (start == null) untimed.push(w)
    else timed.push({ w, start, end: start + (w.duration_min ?? 0) * 60_000 })
  }
  timed.sort((a, b) => a.start - b.start)

  // Greedy time clustering: a workout joins the current cluster if it starts within the window
  // of the cluster's latest start, or if it overlaps the cluster's span by at least half of the
  // shorter of the two. Back-to-back classes overlap (near) zero, so they stay separate.
  const clusters: T[][] = []
  let current: T[] = []
  let clusterStart = 0
  let clusterEnd = 0
  let lastStart = 0
  for (const { w, start, end } of timed) {
    if (current.length) {
      const overlap = Math.min(clusterEnd, end) - Math.max(clusterStart, start)
      const shorter = Math.min(end - start, clusterEnd - clusterStart)
      const sameSession = start - lastStart <= START_WINDOW_MS
        || (overlap > 0 && overlap >= shorter * 0.5)
      if (!sameSession) {
        clusters.push(current)
        current = []
      }
    }
    if (!current.length) {
      clusterStart = start
      clusterEnd = end
    }
    else {
      clusterEnd = Math.max(clusterEnd, end)
    }
    current.push(w)
    lastStart = start
  }
  if (current.length) clusters.push(current)

  // Rows without a parseable start time can't be matched to a session; pass them through.
  for (const w of untimed) clusters.push([w])

  return clusters.map(mergeCluster).sort((a, b) =>
    a.date.localeCompare(b.date) || (startMs(a) ?? Infinity) - (startMs(b) ?? Infinity)
  )
}
