// A single physical workout can be recorded up to three times: Whoop auto-detects it (external_id
// `whoop:*`), the Apple Watch workout arrives via the Health Auto Export webhook, and the Peloton
// app writes its own copy to HealthKit (the one that carries distance). Rather than destructively
// deduping the table (each source keeps upserting on its own external_id), rows are merged at read
// time: same-day workouts whose start times fall within a small window are treated as one session,
// keeping the richest record and filling its gaps from the others.

// Cross-source recordings of the same session start within a couple of minutes of each other,
// while back-to-back Peloton classes are at least a class-length (~20 min) apart, so 10 minutes
// separates the two cases cleanly.
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

// Whoop start times are ISO ("2026-07-19T10:10:00.000Z"); Health Auto Export uses
// "2026-07-19 06:10:00 -0500". Both parse via Date; anything else opts out of clustering.
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
  // Prefer Apple's canonical HealthKit name ("Indoor Cycling") over Whoop's sport name ("spin")
  // so the same activity is labeled consistently regardless of which record was richest.
  merged.workout_type = ranked.find(w => workoutSource(w.external_id) === 'apple')?.workout_type
    ?? ranked.find(w => w.workout_type != null)?.workout_type
    ?? null
  merged.sources = [...new Set(ranked.map(w => workoutSource(w.external_id)))]
  return merged
}

export function mergeWorkouts<T extends MergeableWorkout>(rows: T[]): Array<MergedWorkout<T>> {
  const byDate = new Map<string, T[]>()
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date)!.push(row)
  }

  const out: Array<MergedWorkout<T>> = []
  for (const dayRows of byDate.values()) {
    const timed = dayRows
      .map(w => ({ w, start: startMs(w) }))
      .filter((x): x is { w: T, start: number } => x.start != null)
      .sort((a, b) => a.start - b.start)

    // Greedy time clustering: a workout joins the current cluster if it starts within the
    // window of the cluster's latest start.
    const clusters: T[][] = []
    let current: T[] = []
    let lastStart = -Infinity
    for (const { w, start } of timed) {
      if (current.length && start - lastStart > START_WINDOW_MS) {
        clusters.push(current)
        current = []
      }
      current.push(w)
      lastStart = start
    }
    if (current.length) clusters.push(current)

    // Rows without a parseable start time can't be matched to a session; pass them through.
    for (const w of dayRows) {
      if (startMs(w) == null) clusters.push([w])
    }

    out.push(...clusters.map(mergeCluster))
  }

  return out.sort((a, b) =>
    a.date.localeCompare(b.date) || (startMs(a) ?? Infinity) - (startMs(b) ?? Infinity)
  )
}
