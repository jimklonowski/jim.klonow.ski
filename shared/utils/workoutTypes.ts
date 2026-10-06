// Workout labels as the sources spell them. Whoop's sport_name is lowercase-kebab ("disc-golf",
// "spin"); HealthKit's workout type is a fixed enum of English names, and several Whoop sports
// collapse onto one broader HealthKit type — a disc golf round arrives from Apple as "Disc
// Sports". The read-time merge (server/utils/workout-merge.ts) prefers Apple's label, so a round
// read "disc-golf" after the Whoop sync and flipped to "Disc Sports" once Apple Health caught up.
// Jim plays no other disc sport, so every spelling means the same thing.
//
// Applied once, at write time (server/utils/db.ts upsertWorkout), so the stored row is already
// canonical and every reader — including the raw GROUP BY in the DEXA summary — agrees.
// Migration 0008 brought the rows written before this existed into line.
// Kept app-import-free so plain-node tests can run it.

const WORKOUT_TYPE_OVERRIDES: Record<string, string> = {
  'disc-golf': 'Disc Golf',
  'disc golf': 'Disc Golf',
  'disc sports': 'Disc Golf'
}

/** The label a workout is filed under, with each source's spelling folded to the one Jim uses. */
export function normalizeWorkoutType(label: string | null | undefined): string | null {
  if (label == null) return null
  return WORKOUT_TYPE_OVERRIDES[label.trim().toLowerCase()] ?? label
}
