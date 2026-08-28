// Standing protocol context shared by the digest prompts and the labs AI-summary prompt.
// The injectable schedule is a hand-maintained constant (it changes rarely and carries intent —
// which weekdays — that the dose log can't express). The same cadence exists in structured form
// as PROTOCOL_RULES in app/data/journal.ts (adherence panel + calendar rings) — keep the two in
// sync when the protocol changes. The vitamin/supplement/skin stack lives in
// the `supplements` table and is rendered per-request by supplementContext(), so edits on
// /journal/supplements flow into the AI prompts without a deploy.
// Written pronoun-free so it drops into prompts that refer to the reader as "he" or "they".
export const PROTOCOL_SCHEDULE = `Intended dosing schedule (the reference for adherence — journal dose logs should line up with this; call out deviations, don't re-announce matches):
- Every day: HGH 2 IU + GHK-Cu 2 mg.
- Every morning: Tadalafil 5 mg oral (daily-protocol Cialis, since ~June 2025 — 7 mg gummies until June 2, 2026, 5 mg tablets since). Taken for endothelial/BP support; it is deliberately NOT in the dose log, so never read its absence there as a missed dose. Its mild BP-lowering effect is standing context when interpreting blood-pressure trends.
- Monday + Thursday: Testosterone Cypionate 75 mg per injection (150 mg/week — reduced from 100 mg/injection, 200 mg/week, in late August 2026).
- Tuesday + Friday + Sunday: hCG 250 IU.
- BPC-157 is as-needed only (for soreness/tightness), so sporadic logging is expected, not a lapse.`

// How long a stopped supplement (or a fresh start) stays worth mentioning — matches the
// ~4-month protocol lookback the labs summary and digest trends already use.
const CHANGE_RELEVANCE_DAYS = 120

interface SupplementRow {
  name: string
  dose: string | null
  category: string
  status: string
  schedule: string
  started: string | null
  stopped: string | null
  notes: string | null
}

function shiftDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function describe(s: SupplementRow, recentSince: string): string {
  const parts = [s.name]
  if (s.dose) parts.push(s.dose)
  let out = parts.join(' ')
  if (s.schedule && s.schedule !== 'daily') out += ` (${s.schedule})`
  if (s.started && s.started >= recentSince) out += ` (started ${s.started})`
  if (s.notes) out += ` — ${s.notes}`
  return out
}

// The supplement stack as it stood on `asOf` (YYYY-MM-DD), rendered as prompt paragraphs.
// asOf matters because lab summaries can be (re)generated for historical draws: a supplement
// stopped after the draw was still active then. Returns '' when there's nothing to say —
// including when the table doesn't exist yet, so digest generation never dies on a missing
// migration.
export async function supplementContext(db: D1Database, asOf: string): Promise<string> {
  let rows: SupplementRow[]
  try {
    const { results } = await db.prepare(
      'SELECT name, dose, category, status, schedule, started, stopped, notes FROM supplements ORDER BY sort ASC, name ASC'
    ).all()
    rows = (results ?? []) as unknown as SupplementRow[]
  }
  catch {
    return ''
  }

  const recentSince = shiftDays(asOf, -CHANGE_RELEVANCE_DAYS)
  // A row stopped after asOf was still being taken at asOf (lab summaries can regenerate
  // for historical draws); on_hand rows are never part of the taken stack.
  const activeAt = (s: SupplementRow) =>
    s.status !== 'on_hand'
    && (s.started == null || s.started <= asOf)
    && (s.stopped == null || s.stopped > asOf)

  const oral = rows.filter(s => s.category !== 'skin' && activeAt(s))
  const skin = rows.filter(s => s.category === 'skin' && activeAt(s))
  const onHand = rows.filter(s => s.status === 'on_hand')
  const recentlyStopped = rows.filter(s => s.stopped != null && s.stopped <= asOf && s.stopped >= recentSince)

  const paragraphs: string[] = []
  if (oral.length) {
    paragraphs.push(`Daily oral stack, taken consistently but mostly NOT logged in the journal (absence from dose logs is not a lapse): ${oral.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  if (skin.length) {
    paragraphs.push(`Skin/hair routine: ${skin.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  if (recentlyStopped.length) {
    paragraphs.push(`Recently discontinued: ${recentlyStopped.map(s => `${s.name} (stopped ${s.stopped}${s.notes ? `; ${s.notes.toLowerCase()}` : ''})`).join('; ')}.`)
  }
  if (onHand.length) {
    paragraphs.push(`On hand but NOT currently being taken (do not treat as active exposure; relevant to pending decisions like the anabolic question): ${onHand.map(s => describe(s, recentSince)).join('; ')}.`)
  }
  return paragraphs.join('\n\n')
}
