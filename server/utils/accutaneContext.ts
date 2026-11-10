import type { Cycle } from '#shared/utils/cycles'
import { cycleEnd, cycleStatusOn } from '#shared/utils/cycles'
import { diffDays, shiftDays } from '#shared/utils/dates'
import {
  COURSE_TARGET_MG_PER_KG, DONATION_DEFERRAL_DAYS, LIPID_WINDOW_WEEKS, RECHECK_WINDOW_DAYS, baselineDrawDate, courseDoses,
  courseStats, isotretinoinCycle, plannedMgPerDay, recheckDraw
} from '#shared/utils/accutane'
import { plannedDrawStates } from '#shared/utils/plannedDraws'
import { loadCycles } from './cycleContext'
import { loadBloodDraws } from './goalContext'
import { loadPlannedDraws } from './plannedDrawContext'

// The isotretinoin course as AI-prompt context (audit #43 item 97): where it stands as of
// `asOf` — day and week, the dose as logged, the running total against the prescriber's 150 and
// 220 mg/kg targets with the dates they land at the current pace, the baseline and recheck
// draws, and whether the date sits inside weeks 4–8, when the lipid and liver moves show. The
// same arithmetic the course page runs (shared/utils/accutane.ts), so the model reports what
// the page shows. Pronoun-free. '' when no dated course is on file or it ended long ago.

/** How long after the course ends it is still worth a paragraph (the deferral, and recovery draws). */
const DONE_RELEVANCE_DAYS = 90

export async function accutaneContext(db: D1Database, asOf: string, preloadedCycles?: Cycle[]): Promise<string> {
  const cycles = preloadedCycles ?? await loadCycles(db)
  const course = isotretinoinCycle(cycles, asOf)
  if (!course) return ''
  const end = cycleEnd(course)
  const status = cycleStatusOn(course, asOf)
  if (status === 'done' && diffDays(end, asOf) > DONE_RELEVANCE_DAYS) return ''

  const [doseRes, weightRow, draws, plans] = await Promise.all([
    db.prepare('SELECT date, peptides FROM journal_entries WHERE date >= ?1 AND date <= ?2 AND peptides IS NOT NULL ORDER BY date ASC').bind(course.start_date, asOf).all(),
    db.prepare('SELECT date, weight_lbs FROM journal_entries WHERE weight_lbs IS NOT NULL AND date <= ?1 ORDER BY date DESC LIMIT 1').bind(asOf).first<{ date: string, weight_lbs: number }>(),
    loadBloodDraws(db, asOf),
    loadPlannedDraws(db)
  ])
  const journal = ((doseRes.results ?? []) as Array<{ date: string, peptides: string | null }>)
    .map(r => ({ date: r.date, peptides: JSON.parse(r.peptides || '[]') as Array<{ compound: string, dose: number | null, unit?: string | null }> }))
  const stats = courseStats(course, courseDoses(journal), weightRow?.weight_lbs ?? null, asOf, plannedMgPerDay(course))
  const baseline = baselineDrawDate(draws, course.start_date)
  const planStates = plannedDrawStates(plans.filter(p => p.cycle_id === course.id || p.cycle_id == null), draws.map(d => d.date), asOf).map(s => ({ date: s.plan.date, status: s.status }))
  const recheck = recheckDraw(draws, planStates, course.start_date)

  const lines: string[] = []
  const head = status === 'upcoming'
    ? `ISOTRETINOIN COURSE — STARTS ${course.start_date} (${diffDays(asOf, course.start_date)} days away), planned ${stats.paceMgPerDay || plannedMgPerDay(course) || '?'} mg a day.`
    : status === 'done'
      ? `ISOTRETINOIN COURSE — ENDED ${end} (${diffDays(end, asOf)} days ago).`
      : `ISOTRETINOIN COURSE — DAY ${stats.daysElapsed}, WEEK ${Math.ceil(stats.daysElapsed / 7)} (started ${course.start_date}, planned through ${end}).`
  lines.push(head)

  if (status !== 'upcoming') {
    const dose = stats.currentMgPerDay != null ? `${stats.currentMgPerDay} mg a day as last logged (${stats.lastDoseDate})` : 'no capsule logged yet'
    const pace = stats.paceMgPerDay ? `; pace ${stats.paceMgPerDay} mg a day over the last ${stats.paceWindowDays} days` : ''
    lines.push(`Dose: ${dose}${pace}; ${stats.dosedDays} of ${stats.daysElapsed} days dosed.`)
    const perKg = stats.kg != null ? ` = ${stats.mgPerKg} mg/kg at ${stats.kg} kg` : ' (no weigh-in on file for the mg/kg side)'
    const targets = stats.lowerMg != null
      ? ` Targets: ${COURSE_TARGET_MG_PER_KG.lower} mg/kg = ${stats.lowerMg} mg (${stats.pctOfLower} % there${stats.reachLower ? `, ${stats.cumulativeMg >= stats.lowerMg ? 'reached' : 'at this pace reached'} ${stats.reachLower}` : ''}); ${COURSE_TARGET_MG_PER_KG.upper} mg/kg = ${stats.upperMg} mg${stats.reachUpper ? ` (${stats.cumulativeMg >= stats.upperMg! ? 'reached' : 'at this pace'} ${stats.reachUpper})` : ''}. The course ends on the total, not the calendar: a missed day lengthens it, a dose increase shortens it.`
      : ''
    lines.push(`Cumulative: ${stats.cumulativeMg} mg${perKg}.${targets}`)
  }

  lines.push(baseline ? `Baseline lipids and liver: the ${baseline} draw.` : 'No baseline lipid/liver draw on file before the start.')
  if (status !== 'upcoming') {
    const recheckLine = !recheck
      ? `First recheck (lipids, liver, CBC, CK) is due in course days ${RECHECK_WINDOW_DAYS.from}–${RECHECK_WINDOW_DAYS.to} (${shiftDays(course.start_date, RECHECK_WINDOW_DAYS.from)} to ${shiftDays(course.start_date, RECHECK_WINDOW_DAYS.to)}); none is on file or booked.`
      : recheck.onFile
        ? `First recheck: the ${recheck.date} draw.`
        : `First recheck: booked for ${recheck.date} (${recheck.planStatus}).`
    lines.push(recheckLine)
    const lipidFrom = shiftDays(course.start_date, (LIPID_WINDOW_WEEKS.from - 1) * 7)
    const lipidTo = shiftDays(course.start_date, LIPID_WINDOW_WEEKS.to * 7 - 1)
    const where = asOf < lipidFrom ? 'still ahead' : asOf <= lipidTo ? 'open now' : 'behind'
    lines.push(`Lipid/liver window: weeks ${LIPID_WINDOW_WEEKS.from}–${LIPID_WINDOW_WEEKS.to} (${lipidFrom} to ${lipidTo}), ${where}. Expect triglycerides, LDL and non-HDL up, HDL down, ALT/AST mildly up, CK high after hard training — dose-dependent, reversible drug effects to attribute to isotretinoin before diet or the anabolic question, and no clean baseline for the Primobolan decision while the course runs.`)
  }
  lines.push(`No blood donation during the course or for ${DONATION_DEFERRAL_DAYS} days after the last capsule (${shiftDays(end, DONATION_DEFERRAL_DAYS)}); no vitamin A supplements, no tetracyclines.`)
  return lines.join('\n')
}
