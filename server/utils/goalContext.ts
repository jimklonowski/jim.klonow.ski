import { ISOTRETINOIN, courseCaveatSpans } from '#shared/utils/accutane'
import { caveatCompoundOn } from '#shared/utils/labNotes'
import type { Readings } from '#shared/utils/labReadings'
import type { ProtocolData } from '#shared/utils/protocolStore'
import type { GoalDraw, MarkerGoal } from '#shared/utils/markerGoals'
import { VERDICT_WORD, cycleGoalSummary, goalLine, goalVerdict, goalsForCycle } from '#shared/utils/markerGoals'
import { cycleStatusOn, isTentative, type Cycle } from '#shared/utils/cycles'
import { BIOMARKERS, isEchoOnly } from '../../app/data/biomarkers'
import { MARKER_CAVEATS, readingNotesOn } from '../data/markerCaveats'
import { loadCycles } from './cycleContext'

// The dated marker goals as AI-prompt context (audit #43 item 60): each goal's deterministic
// verdict as of `asOf`, and the GO / NO-GO / UNDECIDED roll-up for every planned cycle they
// gate — so the model reports the verdict the page shows instead of inferring one. A reading
// drawn on a medication that moves the marker (MARKER_CAVEATS × the protocol's spans) is
// CONFOUNDED and decides nothing: the course's lipids never settle the Primobolan question.
// Pronoun-free, like the rest of the prose. '' when no goal is on file.

/** Every goal on file, oldest stated first; empty before migration 0020. */
export async function loadMarkerGoals(db: D1Database): Promise<MarkerGoal[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM marker_goals ORDER BY stated ASC, id ASC').all()
    return (results ?? []) as unknown as MarkerGoal[]
  }
  catch {
    return []
  }
}

/** The blood draws on or before `asOf` as the verdicts read them, each with its reading notes
 * (echo-only rows dropped). Shared with accutaneContext. */
export async function loadBloodDraws(db: D1Database, asOf: string): Promise<GoalDraw[]> {
  const { results } = await db.prepare('SELECT date, markers, qualitative, readings FROM labs_entries WHERE date <= ?1 ORDER BY date ASC').bind(asOf).all()
  return ((results ?? []) as Array<{ date: string, markers: string | null, qualitative: string | null, readings: string | null }>)
    .map(r => ({ date: r.date, markers: JSON.parse(r.markers || '{}') as Record<string, number | null>, qualitative: JSON.parse(r.qualitative || '[]'), readings: JSON.parse(r.readings || '{}') as Readings }))
    .filter(r => !isEchoOnly(r))
    // Notes and the printed qualifiers both censor (isCensored reads either).
    .map(r => ({ date: r.date, markers: r.markers, notes: readingNotesOn(r.date) ?? null, readings: r.readings }))
}

export async function markerGoalsContext(db: D1Database, asOf: string, protocol: ProtocolData, preloadedCycles?: Cycle[]): Promise<string> {
  const goals = await loadMarkerGoals(db)
  if (!goals.length) return ''
  const [draws, cycles, doseRes] = await Promise.all([
    loadBloodDraws(db, asOf),
    preloadedCycles ?? loadCycles(db),
    // The isotretinoin dose log: the course stars its draws from the log and the cycle row too
    // (item 97), not only from the protocol row's dates.
    db.prepare(`SELECT date, peptides FROM journal_entries WHERE peptides LIKE '%${ISOTRETINOIN}%' ORDER BY date ASC`).all()
  ])
  const courseLog = ((doseRes.results ?? []) as Array<{ date: string, peptides: string | null }>)
    .map(r => ({ date: r.date, peptides: JSON.parse(r.peptides || '[]') as Array<{ compound: string, dose: number | null, unit?: string | null }> }))
  const spans = [...protocol.rules, ...protocol.standing, ...courseCaveatSpans(cycles, courseLog)]
  const verdictOf = (g: MarkerGoal) => goalVerdict(g, draws, asOf, date => caveatCompoundOn(MARKER_CAVEATS, g.marker, date, spans))
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
  return `${sections.join('\n\n')}\nThese verdicts are computed from the draws on file: report them as given (MET / NOT MET / INSUFFICIENT / CONFOUNDED) rather than re-judging, and name what a draw would need to show to change one. A CONFOUNDED reading was taken on a medication known to move that marker and settles nothing about the goal.`
}
