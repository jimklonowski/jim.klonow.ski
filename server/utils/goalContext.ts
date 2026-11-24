import { ISOTRETINOIN, courseCaveatSpans } from '#shared/utils/accutane'
import { caveatCompoundOn, isCensored } from '#shared/utils/labNotes'
import type { Readings } from '#shared/utils/labReadings'
import type { ProtocolData } from '#shared/utils/protocolStore'
import type { GoalDraw, MarkerGoal } from '#shared/utils/markerGoals'
import { VERDICT_WORD, cycleGoalSummary, goalLine, goalVerdict, goalsForCycle } from '#shared/utils/markerGoals'
import { cycleStatusOn, isTentative, mergeRules, type Cycle } from '#shared/utils/cycles'
import { transitionalWindows } from '#shared/utils/hematocrit'
import { BIOMARKERS, computeMarkers, isEchoOnly } from '../../app/data/biomarkers'
import { MARKER_CAVEATS, readingNotesOn } from '../data/markerCaveats'
import { loadCycles } from './cycleContext'
import { isMissingTable } from './db'
import { loadPhlebotomies } from './phlebotomyContext'

// The dated marker goals as AI-prompt context (audit #43 item 60): each goal's deterministic
// verdict as of `asOf`, and the GO / NO-GO / UNDECIDED roll-up for every planned cycle they
// gate — so the model reports the verdict the page shows instead of inferring one. A reading
// drawn on a medication that moves the marker (MARKER_CAVEATS × the protocol's spans) is
// CONFOUNDED and decides nothing: the course's lipids never settle the Primobolan question.
// A red-cell reading inside the turnover window after a dose change, or a CBC in the weeks after
// a phlebotomy, is TOO EARLY (audit #44 item 16) — the pages' own windows and visit log.
// Pronoun-free, like the rest of the prose. '' when no goal is on file.

/** Every goal on file, oldest stated first; empty before migration 0020. */
export async function loadMarkerGoals(db: D1Database): Promise<MarkerGoal[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM marker_goals ORDER BY stated ASC, id ASC').all()
    return (results ?? []) as unknown as MarkerGoal[]
  }
  catch (err) {
    // Only a missing table reads as "no goals" (see loadPgxNotes).
    if (isMissingTable(err)) return []
    throw err
  }
}

/**
 * The blood draws on or before `asOf` as the verdicts read them, each with its reading notes
 * (echo-only rows dropped) and its derived markers folded in. Shared with accutaneContext.
 *
 * The derived markers (Trig/HDL, HOMA-IR, remnant cholesterol, free T %) are never stored: the
 * pages compute them per draw as the list loads (useLabsEntries), and so must this. Read raw, a
 * goal on one of them was MET on the page and "INSUFFICIENT — no reading on file" in every
 * prompt (audit #44 item 22). Same rules as the pages: a fasting-only marker needs a fasting
 * draw, and nothing is derived from a reading that is a bound.
 */
export async function loadBloodDraws(db: D1Database, asOf: string): Promise<GoalDraw[]> {
  const { results } = await db.prepare('SELECT date, fasting, markers, qualitative, readings FROM labs_entries WHERE date <= ?1 ORDER BY date ASC').bind(asOf).all()
  return ((results ?? []) as Array<{ date: string, fasting: number | null, markers: string | null, qualitative: string | null, readings: string | null }>)
    .map(r => ({ date: r.date, fasting: !!r.fasting, markers: JSON.parse(r.markers || '{}') as Record<string, number | null>, qualitative: JSON.parse(r.qualitative || '[]'), readings: JSON.parse(r.readings || '{}') as Readings }))
    .filter(r => !isEchoOnly(r))
    .map((r) => {
      // Notes and the printed qualifiers both censor (isCensored reads either).
      const draw: GoalDraw = { date: r.date, markers: r.markers, notes: readingNotesOn(r.date) ?? null, readings: r.readings }
      return { ...draw, markers: computeMarkers(r.markers, r.fasting, key => isCensored(draw, key)) }
    })
}

export async function markerGoalsContext(db: D1Database, asOf: string, protocol: ProtocolData, preloadedCycles?: Cycle[] | Promise<Cycle[]>): Promise<string> {
  const goals = await loadMarkerGoals(db)
  if (!goals.length) return ''
  const [draws, cycles, visits, doseRes] = await Promise.all([
    loadBloodDraws(db, asOf),
    preloadedCycles ?? loadCycles(db),
    loadPhlebotomies(db),
    // The isotretinoin dose log: the course stars its draws from the log and the cycle row too
    // (item 97), not only from the protocol row's dates.
    db.prepare(`SELECT date, peptides FROM journal_entries WHERE peptides LIKE '%${ISOTRETINOIN}%' ORDER BY date ASC`).all()
  ])
  const courseLog = ((doseRes.results ?? []) as Array<{ date: string, peptides: string | null }>)
    .map(r => ({ date: r.date, peptides: JSON.parse(r.peptides || '[]') as Array<{ compound: string, dose: number | null, unit?: string | null }> }))
  const spans = [...protocol.rules, ...protocol.standing, ...courseCaveatSpans(cycles, courseLog)]
  // The windows as the pages build them (the schedule with every planned cycle folded in); only
  // the visits on or before `asOf`, so a summary regenerated for an old draw is honest.
  const windows = transitionalWindows(cycles.length ? mergeRules(protocol.rules, cycles) : protocol.rules)
  const phlebotomies = visits.filter(p => p.date <= asOf)
  const verdictOf = (g: MarkerGoal) => goalVerdict(g, draws, asOf, {
    confoundedBy: date => caveatCompoundOn(MARKER_CAVEATS, g.marker, date, spans),
    windows,
    phlebotomies
  })
  const line = (g: MarkerGoal) => goalLine(verdictOf(g), BIOMARKERS[g.marker])

  const sections: string[] = []
  // Each planned cycle the goals gate, with its roll-up; a tentative plan still has goals.
  for (const c of cycles) {
    if (c.id == null || cycleStatusOn(c, asOf) === 'done') continue
    const own = goals.filter(g => g.cycle_id === c.id)
    if (!own.length) continue
    const all = goalsForCycle(goals, c.id)
    const summary = cycleGoalSummary(all.map(verdictOf))
    const when = isTentative(c) ? 'no start date set' : `start ${c.start_date}`
    sections.push(`Gating goals for the planned cycle "${c.name}" (${when}) — verdict as of ${asOf}: ${VERDICT_WORD[summary.verdict]} (${summary.met} met, ${summary.notMet} not met, ${summary.open} undecided):\n${all.map(line).join('\n')}`)
  }
  const standing = goals.filter(g => g.cycle_id == null)
  if (standing.length) sections.push(`Standing marker goals, verdict as of ${asOf}:\n${standing.map(line).join('\n')}`)
  if (!sections.length) return ''
  return `${sections.join('\n\n')}\nThese verdicts are computed from the draws on file: report them as given (MET / NOT MET / INSUFFICIENT / CONFOUNDED / TOO EARLY) rather than re-judging, and name what a draw would need to show to change one. A CONFOUNDED reading was taken on a medication known to move that marker and settles nothing about the goal. A TOO EARLY reading was taken before a dose change could show in red-cell mass, or in the weeks after a phlebotomy: it settles nothing either, and where a line names the first clean read, a draw before that date will not decide the goal.`
}
