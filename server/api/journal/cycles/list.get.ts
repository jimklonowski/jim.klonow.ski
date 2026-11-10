import type { Cycle, CyclePlanItem, StartPrecision } from '#shared/utils/cycles'

// Readable by every authenticated role: a planned cycle is protocol context, same policy as
// the supplement stack. The demo sandbox answers from its own cycles table like any other role
// (audit #43 item 99): the seed carries the persona's isotretinoin course, whose daily capsules
// score as on schedule whatever day the seed is anchored to.
export default defineEventHandler(async (event): Promise<Cycle[]> => {
  requireLabsAuth(event)

  // Missing table (migration not applied yet) reads as "no cycles", not a 500 — every consumer
  // of this list (home strip, adherence merge, calendar) degrades cleanly. Any other error is a
  // real failure and must not masquerade as an empty planner.
  return withEtag(event, await listRows(event, 'SELECT * FROM cycles ORDER BY start_date DESC', row => ({
    id: row.id as number,
    name: row.name as string,
    goal: (row.goal as string | null) ?? null,
    start_date: row.start_date as string,
    // Undefined until the start_precision migration lands, which reads as 'day' downstream —
    // correct for every row that predates tentative starts.
    start_precision: (row.start_precision as StartPrecision | undefined) ?? 'day',
    planned_weeks: row.planned_weeks as number,
    // Undefined until the planned_days migration lands, which reads as whole weeks downstream —
    // correct for every row written before day-exact spans existed.
    planned_days: (row.planned_days as number | null | undefined) ?? null,
    actual_end: (row.actual_end as string | null) ?? null,
    compounds: JSON.parse((row.compounds as string) || '[]') as CyclePlanItem[],
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string
  }), { missingTableOk: true }))
})
