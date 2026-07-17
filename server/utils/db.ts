/// <reference path="../../worker-configuration.d.ts" />
import type { H3Event } from 'h3'

// nitro-cloudflare-dev types `context.cloudflare.env` as PlatformProxy["env"] (unknown) since it
// isn't parameterized with our Env — cast through the generated global Env from worker-configuration.d.ts.
export function getDb(event: H3Event): D1Database {
  return (event.context.cloudflare.env as unknown as Env).DB
}

export function getLabsBucket(event: H3Event): R2Bucket {
  return (event.context.cloudflare.env as unknown as Env).LABS_BUCKET
}

// R2 objects are private; every source key is served through the authenticated proxy route.
export function toPdfUrl(key: string): string {
  return `/api/labs/pdf/${encodeURIComponent(key)}`
}

export function parseJournalRow(row: Record<string, unknown>) {
  return {
    date: row.date as string,
    day: (row.day as number | null) ?? null,
    weight_lbs: (row.weight_lbs as number | null) ?? null,
    bp_systolic: (row.bp_systolic as number | null) ?? null,
    bp_diastolic: (row.bp_diastolic as number | null) ?? null,
    rhr: (row.rhr as number | null) ?? null,
    hrv: (row.hrv as number | null) ?? null,
    peptides: JSON.parse((row.peptides as string) || '[]'),
    reconstitutions: JSON.parse((row.reconstitutions as string) || '[]'),
    food: JSON.parse((row.food as string) || '{}'),
    notes: (row.notes as string | null) ?? ''
  }
}

export function parseLabsRow(row: Record<string, unknown>) {
  return {
    date: row.date as string,
    fasting: !!row.fasting,
    sources: (JSON.parse((row.sources as string) || '[]') as string[]).map(toPdfUrl),
    markers: JSON.parse((row.markers as string) || '{}'),
    qualitative: JSON.parse((row.qualitative as string) || '[]'),
    ai_summary: (row.ai_summary as string | null) ?? null
  }
}

export function parseHealthMetricsRow(row: Record<string, unknown>) {
  return {
    date: row.date as string,
    vo2_max: (row.vo2_max as number | null) ?? null,
    body_fat_pct: (row.body_fat_pct as number | null) ?? null,
    lean_body_mass_lbs: (row.lean_body_mass_lbs as number | null) ?? null,
    sleep_total_min: (row.sleep_total_min as number | null) ?? null,
    sleep_rem_min: (row.sleep_rem_min as number | null) ?? null,
    sleep_deep_min: (row.sleep_deep_min as number | null) ?? null,
    sleep_core_min: (row.sleep_core_min as number | null) ?? null,
    sleep_awake_min: (row.sleep_awake_min as number | null) ?? null,
    recovery_score: (row.recovery_score as number | null) ?? null,
    strain: (row.strain as number | null) ?? null,
    sleep_performance_pct: (row.sleep_performance_pct as number | null) ?? null
  }
}

export const HEALTH_METRIC_FIELDS = [
  'vo2_max', 'body_fat_pct', 'lean_body_mass_lbs',
  'sleep_total_min', 'sleep_rem_min', 'sleep_deep_min', 'sleep_core_min', 'sleep_awake_min',
  'recovery_score', 'strain', 'sleep_performance_pct'
] as const

export type HealthMetricField = (typeof HEALTH_METRIC_FIELDS)[number]

// Shared by the Apple Health webhook and the Whoop sync task - health_metrics has no manual-entry
// UI, so whichever source has a value for a field just overwrites it (no null-only-patch needed).
export async function upsertHealthMetrics(db: D1Database, date: string, fields: Partial<Record<HealthMetricField, number>>): Promise<boolean> {
  const cols = HEALTH_METRIC_FIELDS.filter(f => fields[f] != null)
  if (cols.length === 0) return false

  const existing = await db.prepare('SELECT date FROM health_metrics WHERE date = ?1').bind(date).first()
  if (!existing) {
    const allCols = ['date', ...cols]
    const placeholders = allCols.map((_, i) => `?${i + 1}`).join(', ')
    await db.prepare(`INSERT INTO health_metrics (${allCols.join(', ')}) VALUES (${placeholders})`)
      .bind(date, ...cols.map(f => fields[f]))
      .run()
  }
  else {
    const setClause = cols.map((f, i) => `${f} = ?${i + 2}`).join(', ')
    await db.prepare(`UPDATE health_metrics SET ${setClause} WHERE date = ?1`)
      .bind(date, ...cols.map(f => fields[f]))
      .run()
  }
  return true
}

export function parseWorkoutRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    external_id: (row.external_id as string | null) ?? null,
    date: row.date as string,
    workout_type: (row.workout_type as string | null) ?? null,
    start_time: (row.start_time as string | null) ?? null,
    duration_min: (row.duration_min as number | null) ?? null,
    calories: (row.calories as number | null) ?? null,
    avg_hr: (row.avg_hr as number | null) ?? null,
    max_hr: (row.max_hr as number | null) ?? null,
    distance_mi: (row.distance_mi as number | null) ?? null
  }
}

export function parseVialRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    compound: row.compound as string,
    supplier: (row.supplier as string | null) ?? null,
    vial_amount: row.vial_amount as number,
    vial_unit: (row.vial_unit as string) || 'mg',
    quantity: (row.quantity as number | null) ?? 1,
    status: (row.status as string) || 'sealed',
    opened_date: (row.opened_date as string | null) ?? null,
    bac_water_ml: (row.bac_water_ml as number | null) ?? null,
    lot: (row.lot as string | null) ?? null,
    expiry: (row.expiry as string | null) ?? null,
    cost: (row.cost as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null
  }
}

export function parseDigestRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    type: row.type as string,
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    summary: row.summary as string,
    stats: JSON.parse((row.stats as string) || '{}'),
    created_at: (row.created_at as string | null) ?? null
  }
}

export interface WorkoutUpsert {
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

// Shared by the Apple Health webhook and the Whoop sync task. When external_id is present the
// row is upserted on it (idempotent re-sync); otherwise a new row is inserted unconditionally.
export async function upsertWorkout(db: D1Database, w: WorkoutUpsert): Promise<void> {
  if (w.external_id) {
    await db.prepare(`
      INSERT INTO workouts (external_id, date, workout_type, start_time, duration_min, calories, avg_hr, max_hr, distance_mi)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(external_id) DO UPDATE SET
        date = excluded.date,
        workout_type = excluded.workout_type,
        start_time = excluded.start_time,
        duration_min = excluded.duration_min,
        calories = excluded.calories,
        avg_hr = excluded.avg_hr,
        max_hr = excluded.max_hr,
        distance_mi = excluded.distance_mi
    `).bind(w.external_id, w.date, w.workout_type, w.start_time, w.duration_min, w.calories, w.avg_hr, w.max_hr, w.distance_mi).run()
  }
  else {
    await db.prepare(`
      INSERT INTO workouts (date, workout_type, start_time, duration_min, calories, avg_hr, max_hr, distance_mi)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(w.date, w.workout_type, w.start_time, w.duration_min, w.calories, w.avg_hr, w.max_hr, w.distance_mi).run()
  }
}

export function parseDexaRow(row: Record<string, unknown>) {
  return {
    date: row.date as string,
    weight_lbs: row.weight_lbs as number,
    sources: (JSON.parse((row.sources as string) || '[]') as string[]).map(toPdfUrl),
    total: JSON.parse(row.total as string),
    regions: JSON.parse(row.regions as string),
    vat: row.vat ? JSON.parse(row.vat as string) : undefined,
    ag_ratio: (row.ag_ratio as number | null) ?? undefined,
    bone_density: row.bone_density ? JSON.parse(row.bone_density as string) : undefined,
    symmetry: row.symmetry ? JSON.parse(row.symmetry as string) : undefined
  }
}
