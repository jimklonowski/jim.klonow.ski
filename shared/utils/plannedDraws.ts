// Planned blood draws: the dated thing the labs section never had. A draw ON FILE is a
// labs_entries row written by an upload; this is the row that exists BEFORE it — the date it is
// booked for, where, what is being drawn, and what the result is meant to answer. Until this,
// "next draw Oct 17, Quest, LC/MS, to read T on the lower dose" lived in a code comment
// (protocolEvents.ts) and in nobody's calendar.
//
// This is the pure half, shared by the /labs section, the home strip, the calendar, the cycle
// dossier and the AI prompt context (server/utils/plannedDrawContext.ts): the row type, the
// status math, how a plan is matched to the draw that fulfilled it, and the prep reminders.
// Status is derived from the date and the draws on file, never stored (same rule as cycles).
//
// Kept app-import-free (like cycles.ts) so the plain-node tests can run it; relative imports
// carry an explicit .ts for the same reason.
import { diffDays, shiftDays } from './dates.ts'
import type { CheckpointKey } from './cycles.ts'

export interface PlannedDraw {
  id: number
  /** YYYY-MM-DD the draw is booked (or intended) for. */
  date: string
  /** Where: "Quest", "CHW", "Labcorp"… freehand, usually one of KNOWN_LABS via autocomplete. */
  lab: string | null
  /** What is being drawn, in words: "LC/MS testosterone + CBC + CMP + lipids + iron panel". */
  panel: string | null
  fasting: boolean
  /**
   * What the draw is meant to answer, one question per line. The AI summary written for the
   * fulfilling draw opens by answering them in order; the home strip shows them as its tree.
   */
  purpose: string | null
  /** The cycle checkpoint this draw is booked for, when it is one. Both set or both null. */
  cycle_id: number | null
  checkpoint_key: CheckpointKey | null
  /** The labs_entries date that fulfilled the plan: set by the upload save, null until then. */
  labs_date: string | null
  created_at?: string
}

/** The labs this history has been drawn at — the autocomplete items, not a closed list. */
export const KNOWN_LABS = ['Quest', 'CHW', 'Labcorp']

/** A draw landing this many days either side of the plan still counts as it: appointments move. */
export const MATCH_WINDOW_DAYS = 3

/** Past the date with no results: "overdue" for this long, "missed" after. */
export const OVERDUE_DAYS = 14

export type PlannedDrawStatus = 'upcoming' | 'today' | 'overdue' | 'done' | 'missed'

export interface PlannedDrawState {
  plan: PlannedDraw
  status: PlannedDrawStatus
  /** The draw that fulfilled it: the stored link first, else the nearest draw inside the window. */
  drawDate: string | null
  /** Signed days from today to the plan; negative once the date has passed. */
  inDays: number
}

/**
 * The draw on file that fulfils a plan, or null. An explicit `labs_date` (set by the upload
 * save) wins; otherwise the nearest draw within MATCH_WINDOW_DAYS, so a plan made before the
 * link existed — or a draw uploaded from another device — still reads as done.
 */
export function matchDraw(plan: PlannedDraw, drawDates: string[]): string | null {
  if (plan.labs_date) return plan.labs_date
  let best: string | null = null
  let bestGap = Infinity
  for (const d of drawDates) {
    const gap = Math.abs(diffDays(plan.date, d))
    if (gap <= MATCH_WINDOW_DAYS && gap < bestGap) {
      best = d
      bestGap = gap
    }
  }
  return best
}

export function plannedDrawState(plan: PlannedDraw, drawDates: string[], today: string): PlannedDrawState {
  const drawDate = matchDraw(plan, drawDates)
  const inDays = diffDays(today, plan.date)
  let status: PlannedDrawStatus
  if (drawDate) status = 'done'
  else if (inDays > 0) status = 'upcoming'
  else if (inDays === 0) status = 'today'
  else if (-inDays <= OVERDUE_DAYS) status = 'overdue'
  else status = 'missed'
  return { plan, status, drawDate, inDays }
}

/** Every plan with its state, soonest date first. */
export function plannedDrawStates(plans: PlannedDraw[], drawDates: string[], today: string): PlannedDrawState[] {
  return [...plans]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map(p => plannedDrawState(p, drawDates, today))
}

/** A plan still waiting on results: booked ahead, today, or past its date without a draw. */
export function isOpen(state: PlannedDrawState): boolean {
  return state.status === 'upcoming' || state.status === 'today' || state.status === 'overdue'
}

/**
 * The one plan the home strip and the labs header talk about: the soonest open one. An overdue
 * plan sorts before an upcoming one by construction (its date is earlier), which is right — it
 * is the one that needs attention.
 */
export function nextPlannedDraw(plans: PlannedDraw[], drawDates: string[], today: string): PlannedDrawState | null {
  return plannedDrawStates(plans, drawDates, today).find(isOpen) ?? null
}

/** The plan booked for a cycle's checkpoint, if one is. */
export function checkpointPlan(plans: PlannedDraw[], cycleId: number, key: CheckpointKey): PlannedDraw | null {
  return plans.find(p => p.cycle_id === cycleId && p.checkpoint_key === key) ?? null
}

/** The earliest plan dated inside a window (a draw booked for a checkpoint without saying so). */
export function planInWindow(plans: PlannedDraw[], from: string, to: string): PlannedDraw | null {
  return [...plans]
    .filter(p => p.date >= from && p.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
}

/** "T on 150 mg/wk" lines from the purpose text: one per line, `;`-separated on one line also works. */
export function purposeLines(plan: Pick<PlannedDraw, 'purpose'>): string[] {
  return (plan.purpose ?? '')
    .split(/\r?\n|;/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** "Quest · LC/MS panel · fasting" — the plan in one line, without its date. */
export function drawLabel(plan: Pick<PlannedDraw, 'lab' | 'panel' | 'fasting'>): string {
  return [plan.lab, plan.panel, plan.fasting ? 'fasting' : 'non-fasting'].filter(Boolean).join(' · ')
}

/** "in 15 days", "tomorrow", "today", "3 days ago". */
export function countdownLabel(inDays: number): string {
  if (inDays === 0) return 'today'
  if (inDays === 1) return 'tomorrow'
  if (inDays === -1) return 'yesterday'
  return inDays > 0 ? `in ${inDays} days` : `${-inDays} days ago`
}

// --- prep reminders ---
// Hand-maintained, like PROTOCOL_RULES: what has to be true in the days before a draw for its
// numbers to compare with the earlier ones. Rendered relative to the plan's date, so each line
// carries the day it starts to apply — a dated line reminds by itself, with nothing to tick off.

export type PrepState = 'ahead' | 'today' | 'active'

export interface PrepReminder {
  key: string
  text: string
  /** The same reminder in two or three words, for the home strip's one-line summary. */
  short: string
  /** YYYY-MM-DD the reminder starts to apply. */
  from: string
  /** Where `from` sits against today: still ahead, starts today, or already in force. */
  state: PrepState
}

interface PrepRule {
  key: string
  /** Days before the draw it starts to apply; 0 = the draw morning itself. */
  daysBefore: number
  text: string
  short: string
  /** Only when the plan calls for it (the fast); omitted means always. */
  when?: (plan: Pick<PlannedDraw, 'fasting'>) => boolean
}

export const DRAW_PREP: PrepRule[] = [
  { key: 'biotin', daysBefore: 3, text: 'hold biotin and any B-complex (immunoassay interference)', short: 'hold biotin' },
  { key: 'training', daysBefore: 1, text: 'no hard training (CK, ALT/AST and creatinine run high after a session)', short: 'no hard training' },
  { key: 'fasting', daysBefore: 1, text: 'fast 10–12 h: water only after about 20:00', short: 'fast from 20:00', when: p => p.fasting },
  { key: 'orals', daysBefore: 0, text: 'morning orals and supplements after the draw, not before', short: 'orals after the draw' },
  { key: 'timing', daysBefore: 0, text: 'same time of day, and the same days since the last injection, as prior draws', short: 'usual time' }
]

export function prepReminders(plan: Pick<PlannedDraw, 'date' | 'fasting'>, today: string): PrepReminder[] {
  return DRAW_PREP
    .filter(rule => rule.when?.(plan) ?? true)
    .map((rule) => {
      const from = shiftDays(plan.date, -rule.daysBefore)
      const state: PrepState = from < today ? 'active' : from === today ? 'today' : 'ahead'
      return { key: rule.key, text: rule.text, short: rule.short, from, state }
    })
}

/** The reminders in force now — on the draw's eve the fast, the morning of the orals. */
export function activePrep(plan: Pick<PlannedDraw, 'date' | 'fasting'>, today: string): PrepReminder[] {
  return prepReminders(plan, today).filter(r => r.state !== 'ahead')
}
