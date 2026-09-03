import type { Cycle, CyclePlanItem, StartPrecision } from '#shared/utils/cycles'

// Readable by every authenticated role: a planned cycle is protocol context, same policy as
// the supplement stack. Demo gets an empty list rather than a query — the sandbox DB has no
// cycles table, and the demo persona's drifting dose dates would make planned-vs-actual read
// as constant failure anyway (same reasoning as the hidden adherence panel).
export default defineEventHandler(async (event): Promise<Cycle[]> => {
  const auth = requireLabsAuth(event)
  if (auth.role === 'demo') return []

  const db = getDb(event)
  let results: Record<string, unknown>[]
  try {
    ({ results } = await db.prepare('SELECT * FROM cycles ORDER BY start_date DESC').all())
  }
  catch {
    // Missing table (migration not applied yet) reads as "no cycles", not a 500 — every
    // consumer of this list (home strip, adherence merge, calendar) degrades cleanly.
    return []
  }

  return (results ?? []).map(row => ({
    id: row.id as number,
    name: row.name as string,
    goal: (row.goal as string | null) ?? null,
    start_date: row.start_date as string,
    // Undefined until the start_precision migration lands, which reads as 'day' downstream —
    // correct for every row that predates tentative starts.
    start_precision: (row.start_precision as StartPrecision | undefined) ?? 'day',
    planned_weeks: row.planned_weeks as number,
    actual_end: (row.actual_end as string | null) ?? null,
    compounds: JSON.parse((row.compounds as string) || '[]') as CyclePlanItem[],
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string
  }))
})
