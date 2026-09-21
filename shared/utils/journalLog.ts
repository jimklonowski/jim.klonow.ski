// Distinguishes a day Jim actually journaled from a day that only has passively-collected
// vitals. This matters because journal_entries holds both: the one-time Apple Health
// export.xml import (app/pages/tools/import.vue) wrote a full blankEntry() per date back to
// 2020, and the Health Auto Export webhook keeps doing the same for new dates. Counting rows
// therefore measured Apple Watch coverage, not logging — the status bar read "streak 655d /
// entries 1,174" when the real figures were 142 and 193.
//
// Vitals-only rows are still first-class data (every weight/RHR/HRV chart reads them), so
// they stay in the table — only the streak and the logged-day count filter them out.
//
// Lives in shared/ so /api/overview computes the streak and logged-day count for the shell
// with the exact predicate the journal pages use. No runtime imports: plain node loads it
// for tests, and the date walk is done in UTC so a Worker and a browser agree.

/**
 * The hand-entered fields of a journal row. Both the client's JournalEntry and the server's
 * parseJournalRow() output satisfy this structurally.
 */
export interface LoggedDayFields {
  peptides?: unknown[] | null
  reconstitutions?: unknown[] | null
  sodas?: unknown[] | null
  food?: Record<string, string | null | undefined> | null
  notes?: string | null
}

/**
 * True when the day carries something hand-entered: a dose, a reconstitution, any food text,
 * a soda, or a note. Weight/BP/RHR/HRV are deliberately excluded — those arrive on their own
 * from the watch, so a day with nothing but vitals wasn't logged by hand.
 */
export function isLoggedDay(entry: LoggedDayFields): boolean {
  return (entry.peptides?.length ?? 0) > 0
    || (entry.reconstitutions?.length ?? 0) > 0
    || (entry.sodas?.length ?? 0) > 0
    || Object.values(entry.food ?? {}).some(meal => (meal ?? '').trim() !== '')
    || (entry.notes ?? '').trim() !== ''
}

/**
 * Consecutive logged days ending today, or ending yesterday when today hasn't been logged yet
 * — a streak shouldn't read 0 all morning. Anything staler than that is a broken streak.
 *
 * Counting back from the newest *entry* (what the three previous copies of this did) can't work
 * here: passive vitals land every day, so the walk always started at today and measured watch
 * coverage instead. `today` (YYYY-MM-DD) is passed in rather than read from localToday() to keep
 * this pure.
 */
export function loggedStreak(entries: Array<LoggedDayFields & { date: string }>, today: string): number {
  const logged = new Set(entries.filter(isLoggedDay).map(e => e.date))
  const cursor = new Date(today + 'T12:00:00Z')
  if (!logged.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1)

  let count = 0
  while (logged.has(cursor.toISOString().slice(0, 10))) {
    count++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return count
}
