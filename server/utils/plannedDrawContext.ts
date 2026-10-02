// Planned blood draws as AI-prompt context (digests, the ask chat, the labs summary), plus the
// loader. Pronoun-free, like the rest of the prompt prose. Three situations are worth telling
// the model about, and nothing else: a draw booked in the next few weeks (the prep it implies
// explains gaps in the orals, and its purpose says what to watch), a draw past its date with no
// results (so the plan is never narrated as a draw that happened), and the labs summary for the
// very draw a plan was waiting on (its questions come first).
import type { PlannedDraw } from '#shared/utils/plannedDraws'
import { activePrep, countdownLabel, drawLabel, plannedDrawStates, purposeLines } from '#shared/utils/plannedDraws'

// Three weeks: the biotin hold starts three days out, and a booked draw further off than this
// changes nothing about how the period's data should read.
const UPCOMING_HORIZON_DAYS = 21

/** Every planned draw on file, soonest first. Empty when the table doesn't exist yet. */
export async function loadPlannedDraws(db: D1Database): Promise<PlannedDraw[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM planned_draws ORDER BY date ASC, id ASC').all()
    return ((results ?? []) as Array<Record<string, unknown>>).map(parsePlannedDrawRow)
  }
  catch {
    return []
  }
}

// The plans as they stood on `asOf`, rendered as prompt paragraphs. asOf matters the same way it
// does for cycleContext: a labs summary can regenerate for a historical draw, and "booked, no
// results yet" has to be true as of THAT day, so only draws on or before asOf count as on file.
// Returns '' when nothing is relevant.
export async function plannedDrawContext(db: D1Database, asOf: string, preloaded?: PlannedDraw[]): Promise<string> {
  let plans: PlannedDraw[]
  let drawDates: string[]
  try {
    const [loaded, labsRes] = await Promise.all([
      preloaded ?? loadPlannedDraws(db),
      db.prepare('SELECT date FROM labs_entries WHERE date <= ?1 ORDER BY date ASC').bind(asOf).all()
    ])
    plans = loaded
    drawDates = ((labsRes.results ?? []) as Array<{ date: string }>).map(r => r.date)
  }
  catch {
    return ''
  }
  if (!plans.length) return ''

  const paragraphs: string[] = []
  for (const state of plannedDrawStates(plans, drawDates, asOf)) {
    const { plan, status, inDays } = state
    const what = drawLabel(plan)
    const questions = purposeLines(plan)
    const purpose = questions.length ? ` Meant to answer: ${questions.join('; ')}.` : ''

    if (status === 'done' && state.drawDate === asOf) {
      paragraphs.push(
        `THIS DRAW WAS PLANNED: booked for ${plan.date}${plan.date !== asOf ? ` and drawn ${asOf}` : ''} — ${what}.${purpose}${questions.length ? ' Open with those questions, in that order, each answered with the specific numbers, before anything else.' : ''}`
      )
    }
    else if (status === 'today' || (status === 'upcoming' && inDays <= UPCOMING_HORIZON_DAYS)) {
      const prep = activePrep(plan, asOf)
      const prepLine = prep.length
        ? ` Prep in force as of ${asOf}: ${prep.map(r => r.text).join('; ')}. Read a held oral or supplement in this window as deliberate draw prep, never as a missed dose or a stopped supplement.`
        : ''
      paragraphs.push(
        `PLANNED BLOOD DRAW — ${status === 'today' ? 'TODAY' : 'UPCOMING'}: ${plan.date} (${countdownLabel(inDays)}), ${what}.${purpose}${prepLine} Nothing from it exists yet: describe no results, and do not count it as a draw on file.`
      )
    }
    else if (status === 'overdue') {
      paragraphs.push(
        `PLANNED BLOOD DRAW — NO RESULTS YET: booked for ${plan.date} (${countdownLabel(inDays)}), ${what}; no draw is on file for it, so either the appointment moved or the results are not uploaded yet. Treat it as pending, never as a draw that happened.${purpose}`
      )
    }
  }
  return paragraphs.join('\n\n')
}
