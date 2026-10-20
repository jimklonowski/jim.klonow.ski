// A single physical workout can be recorded up to three times: Whoop auto-detects it (external_id
// `whoop:*`), the Apple Watch workout arrives via the Health Auto Export webhook, and the Peloton
// app writes its own copy to HealthKit (the one that carries distance). Rather than destructively
// deduping the table (each source keeps upserting on its own external_id), rows are merged at read
// time: workouts that start near-simultaneously or substantially overlap in time are treated as
// one session, keeping the richest record and filling its gaps from the others.
//
// Lives in shared/ (not server/utils) so the plain-node test suite can import it; nothing on the
// client uses it.

import { workoutStartMs } from './time.ts'

// Cross-source copies usually start within a couple of minutes of each other, but Whoop's
// auto-detection can lead/lag the Peloton class by 10+ minutes (observed: 11.7 min). The start
// window catches the common case; the overlap rule (below) catches the stragglers without
// merging back-to-back classes, which barely overlap.
const START_WINDOW_MS = 10 * 60 * 1000

// A watch that can't reach the bike when a class starts logs one or two false starts — a minute
// or two each, with their own tiny calorie, heart-rate and distance figures — a few minutes
// before the real recording. They cluster with it (same start window), and because each has every
// metric filled in they tied the full ride on richness and the earliest one won the merge: the
// 45-min HIIT ride of 2026-10-19 showed as "1.8 min · 7 kcal · 0.4 mi". A record shorter than a
// quarter of its cluster's longest is a false start, and it neither leads the merge nor fills
// gaps. A short session with no longer copy beside it is still whole, and a record with no
// duration at all is kept rather than guessed at.
const FRAGMENT_RATIO = 0.25

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
// with offset ("2026-07-19 06:10:00 -0500"). Both resolve to the same epoch; anything else opts
// out of clustering.
function startMs(w: MergeableWorkout): number | null {
  return workoutStartMs(w.start_time)
}

function richness(w: MergeableWorkout): number {
  return METRIC_FIELDS.filter(f => w[f] != null).length
}

/** The cluster minus its false starts (see FRAGMENT_RATIO). */
function wholeRecords<T extends MergeableWorkout>(cluster: T[]): T[] {
  const longest = Math.max(...cluster.map(w => w.duration_min ?? 0))
  return cluster.filter(w => w.duration_min == null || w.duration_min >= longest * FRAGMENT_RATIO)
}

function mergeCluster<T extends MergeableWorkout>(cluster: T[]): MergedWorkout<T> {
  // Richest record wins as the base. On equal richness the longer one leads, so the session's
  // figures come from the record whose duration it shows (a watch-split strength session once
  // read 10.3 min at the 5-min segment's 32 kcal; the 10.3-min record itself said 79). Then a
  // record carrying distance (the Peloton copy) breaks ties so miles ridden always survive.
  const ranked = wholeRecords(cluster).sort((a, b) =>
    richness(b) - richness(a)
    || (b.duration_min ?? 0) - (a.duration_min ?? 0)
    || Number(b.distance_mi != null) - Number(a.distance_mi != null)
  )
  const merged: MergedWorkout<T> = { ...ranked[0]!, sources: [] }
  for (const w of ranked.slice(1)) {
    for (const f of METRIC_FIELDS) {
      if (merged[f] == null && w[f] != null) (merged as MergeableWorkout)[f] = w[f]
    }
  }
  // A session lasts as long as its longest whole record. The richest copy isn't always the
  // longest: the watch joined the 2026-10-19 HIIT ride five minutes in (40.7 of 45 min, while the
  // Whoop copy knew the whole class), and the watch has split strength sessions in two. Calories,
  // heart rate and distance stay with the richest record — a longer window from a copy that knows
  // less about the work doesn't make its figures better. Measured over the full history this
  // changed 30 of 1,127 sessions, never on the strength of Whoop's auto-detected window.
  const longest = Math.max(...ranked.map(w => w.duration_min ?? 0))
  if (longest > 0) merged.duration_min = longest
  // Prefer Apple's record for the label ("Indoor Cycling" over Whoop's "spin") and for the date:
  // Apple timestamps are local so their date is the day the workout actually happened, while
  // Whoop rows synced before the timezone fix carry the UTC date (a day late for evening rides).
  const apple = ranked.find(w => workoutSource(w.external_id) === 'apple')
  merged.workout_type = apple?.workout_type
    ?? ranked.find(w => w.workout_type != null)?.workout_type
    ?? null
  if (apple) {
    merged.date = apple.date
    // The start comes with the date so the merged record is self-consistent: Apple's is the class
    // start, where Whoop's auto-detected one can lag it, and it's in the local-with-offset form.
    // Whoop syncs on a cron before the phone fires its webhook, so its row has the lower id and
    // used to win every richness tie as the base — leaking its UTC start_time to the client.
    if (apple.start_time) merged.start_time = apple.start_time
  }
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
