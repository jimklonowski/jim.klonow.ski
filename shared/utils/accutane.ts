// The isotretinoin course page's arithmetic (the accutane plan, Phase C: /journal/accutane).
// Everything here is derived from stores that already exist — the dose log (every capsule at its
// real milligrams), the cycle row (the projection), the labs, the photos and the day-by-day
// streams — so the page has nothing of its own to remember or forget. Pure and framework-free;
// tests/accutane.test.mjs pins every rule.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { BASELINE_LOOKBACK_DAYS, cycleEnd, cycleStatusOn, isTentative, type Cycle } from './cycles.ts'
import { diffDays, roundTo, shiftDays } from './dates.ts'
import { OVERDUE_DAYS, type PlannedDrawStatus } from './plannedDraws.ts'

export const ISOTRETINOIN = 'Isotretinoin'

/** The prescriber's (Clear Health) cumulative targets, mg per kg of body weight. */
export const COURSE_TARGET_MG_PER_KG = { lower: 150, upper: 220 } as const
/** What the literature supports; the upper prescriber target is the relapse-reduction extension. */
export const RESEARCH_TARGET_MG_PER_KG = { lower: 120, upper: 150 } as const

export const LBS_PER_KG = 2.20462
// The baseline lookback is cycles.ts's BASELINE_LOOKBACK_DAYS — one rule for the course, the
// cycle dossier and the prompts (item 93).
/** The acne photo set wants a session at least this often; older and the strip's chip goes amber. */
export const STALE_PHOTO_DAYS = 14
/**
 * The course's photo record starts this many days before capsule one: the baseline set is shot
 * in the days just before the start, while a physique session the week before is not part of
 * the course (Jim's Nov 2 chest and face shots showed up as the course's first frames).
 */
export const PHOTO_BASELINE_LOOKBACK_DAYS = 3
/** No blood donation during the course or for this long after the last dose. */
export const DONATION_DEFERRAL_DAYS = 30
/** The projection's pace is the mean over this many recent course days (item 98). */
export const PACE_WINDOW_DAYS = 14
/** The lipid and liver moves show in this window of the course (weeks 4–8). */
export const LIPID_WINDOW_WEEKS = { from: 4, to: 8 } as const
/** Waxing, dermabrasion and laser wait this long after the last dose — the skin scars easily. */
export const PROCEDURE_DEFERRAL_DAYS = 180

/** The markers isotretinoin moves, in the order the panel lists them. CK rides with training. */
export const COURSE_MARKERS = ['triglycerides', 'ldl', 'hdl', 'non_hdl', 'cholesterol', 'alt', 'ast', 'ck'] as const
export type CourseMarker = typeof COURSE_MARKERS[number]

/** Which direction is the drug's known effect: up for everything but HDL. */
export const EXPECTED_DIRECTION: Record<CourseMarker, 1 | -1> = {
  triglycerides: 1, ldl: 1, hdl: -1, non_hdl: 1, cholesterol: 1, alt: 1, ast: 1, ck: 1
}

// --- the course ---

/**
 * The cycle that IS the course: the one carrying isotretinoin — active first, then the soonest
 * upcoming, then the most recently ended. Null when none is planned. A tentative course (a month
 * or quarter, no start day) is passed over: it has no dates to derive anything from (item 92).
 */
export function isotretinoinCycle(cycles: readonly Cycle[], today: string): Cycle | null {
  const courses = cycles.filter(c => !isTentative(c) && c.compounds.some(i => i.compound === ISOTRETINOIN))
  const by = (status: 'active' | 'upcoming' | 'done') => courses.filter(c => cycleStatusOn(c, today) === status)
  return by('active').sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
    ?? by('upcoming').sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    ?? by('done').sort((a, b) => cycleEnd(b).localeCompare(cycleEnd(a)))[0]
    ?? null
}

/** The plan's daily milligrams as written (the dose × days a week ÷ 7), or null without an item. */
export function plannedMgPerDay(cycle: Cycle): number | null {
  const item = cycle.compounds.find(i => i.compound === ISOTRETINOIN)
  if (!item) return null
  const mg = item.unit === 'mcg' ? item.dose / 1000 : item.dose
  return roundTo(mg * item.weekdays.length / 7, 2)
}

export interface CourseDose {
  date: string
  /** The day's total, mg. */
  mg: number
}

type DoseRow = { compound: string, dose: number | null | undefined, unit?: string | null }

/** Every logged isotretinoin capsule, summed per day in milligrams, oldest first. */
export function courseDoses(entries: ReadonlyArray<{ date: string, peptides?: ReadonlyArray<DoseRow> | null }>): CourseDose[] {
  const byDate = new Map<string, number>()
  for (const e of entries) {
    for (const p of e.peptides ?? []) {
      if (p.compound !== ISOTRETINOIN || p.dose == null || !Number.isFinite(p.dose)) continue
      const mg = p.unit === 'mcg' ? p.dose / 1000 : p.dose
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + mg)
    }
  }
  return [...byDate].map(([date, mg]) => ({ date, mg: roundTo(mg, 2) })).sort((a, b) => a.date.localeCompare(b.date))
}

export interface CourseStats {
  start: string
  /** Last planned (or actual) day. */
  end: string
  status: 'upcoming' | 'active' | 'done'
  /** Course days up to today, inclusive, clamped to the span; 0 before the start. */
  daysElapsed: number
  /** Days with a dose in the log, inside the course. */
  dosedDays: number
  cumulativeMg: number
  /** The latest logged day's milligrams — the dose as it stands, titration included. */
  currentMgPerDay: number | null
  /** The last logged dose's day. */
  lastDoseDate: string | null
  kg: number | null
  mgPerKg: number | null
  lowerMg: number | null
  upperMg: number | null
  /** 0–100+, cumulative against the lower target. */
  pctOfLower: number | null
  /** Milligrams a day the projection runs on: the mean over the last PACE_WINDOW_DAYS of the
   * course (the dose as it stands, a lapse included), or the plan before any dose (item 98: the
   * whole-course mean lagged a 40 → 80 mg step for weeks and dated every target too late). */
  paceMgPerDay: number
  /** How many days that pace was read over. */
  paceWindowDays: number
  /** When the running total reached, or at this pace will reach, each target. */
  reachLower: string | null
  reachUpper: string | null
}

/**
 * The course so far and its projection. Cumulative milligrams are the sum of what was logged —
 * a 20 mg day counts 20, a skipped day 0 — so a titration or a lapse needs no plan edit; the
 * projection just moves. Weight is today's, since the target is mg per kg of the body that
 * carries it.
 */
export function courseStats(cycle: Cycle, doses: readonly CourseDose[], weightLbs: number | null, today: string, planned: number | null): CourseStats {
  const start = cycle.start_date
  const end = cycleEnd(cycle)
  const status = cycleStatusOn(cycle, today)
  const last = today < end ? today : end
  const daysElapsed = today < start ? 0 : diffDays(start, last) + 1
  // Inside the course only: a capsule logged after the last planned day is not this course's.
  const onCourse = doses.filter(d => d.date >= start && d.date <= last)
  const cumulativeMg = roundTo(onCourse.reduce((s, d) => s + d.mg, 0), 2)
  const kg = weightLbs != null && weightLbs > 0 ? roundTo(weightLbs / LBS_PER_KG, 1) : null
  const lowerMg = kg != null ? Math.round(kg * COURSE_TARGET_MG_PER_KG.lower) : null
  const upperMg = kg != null ? Math.round(kg * COURSE_TARGET_MG_PER_KG.upper) : null
  // The pace is the recent dose, not the course mean: the last PACE_WINDOW_DAYS up to today
  // (fewer at the start), skipped days counting as zero.
  const paceWindowDays = Math.min(PACE_WINDOW_DAYS, Math.max(daysElapsed, 0))
  const paceFrom = shiftDays(last, -(paceWindowDays - 1))
  const recentMg = onCourse.filter(d => d.date >= paceFrom).reduce((s, d) => s + d.mg, 0)
  const paceMgPerDay = onCourse.length && paceWindowDays > 0 ? roundTo(recentMg / paceWindowDays, 1) : (planned ?? 0)

  const reach = (targetMg: number | null): string | null => {
    if (targetMg == null) return null
    let running = 0
    for (const d of onCourse) {
      running += d.mg
      if (running >= targetMg) return d.date
    }
    // Nothing to project once the course is over: the total is what it is.
    if (paceMgPerDay <= 0 || today > end) return null
    const daysLeft = Math.ceil((targetMg - running) / paceMgPerDay)
    // Before the start, day one is capsule one, so the Nth dosed day is start + N − 1; once
    // running, the count starts tomorrow — today's dose, if any, is already in the total.
    return today < start ? shiftDays(start, Math.max(daysLeft - 1, 0)) : shiftDays(today, Math.max(daysLeft, 1))
  }

  return {
    start,
    end,
    status,
    daysElapsed,
    dosedDays: onCourse.length,
    cumulativeMg,
    currentMgPerDay: onCourse.at(-1)?.mg ?? null,
    lastDoseDate: onCourse.at(-1)?.date ?? null,
    kg,
    mgPerKg: kg != null ? roundTo(cumulativeMg / kg, 1) : null,
    lowerMg,
    upperMg,
    pctOfLower: lowerMg ? roundTo((cumulativeMg / lowerMg) * 100, 1) : null,
    paceMgPerDay,
    paceWindowDays,
    reachLower: reach(lowerMg),
    reachUpper: reach(upperMg)
  }
}

// --- the donation deferral ---

// --- the course as a lab caveat ---

/**
 * The spans over which isotretinoin skews the lipid and liver markers (item 97), beside the
 * protocol row's own dates: every dated course from capsule one until DONATION_DEFERRAL_DAYS
 * after its last planned day, and the dose log itself from the first logged capsule to the last
 * plus the same tail — so a course logged before its protocol row existed, or one that ran past
 * the row, still stars its draws. Shape = labNotes' CaveatSpan.
 */
export function courseCaveatSpans(cycles: readonly Cycle[], entries: ReadonlyArray<{ date: string, peptides?: ReadonlyArray<DoseRow> | null }>): Array<{ compound: string, from: string, to: string | null }> {
  const spans: Array<{ compound: string, from: string, to: string | null }> = []
  for (const c of cycles) {
    if (isTentative(c) || !c.compounds.some(i => i.compound === ISOTRETINOIN)) continue
    spans.push({ compound: ISOTRETINOIN, from: c.start_date, to: shiftDays(cycleEnd(c), DONATION_DEFERRAL_DAYS) })
  }
  const doses = courseDoses(entries)
  if (doses.length) spans.push({ compound: ISOTRETINOIN, from: doses[0]!.date, to: shiftDays(doses.at(-1)!.date, DONATION_DEFERRAL_DAYS) })
  return spans
}

export interface DonationDeferral {
  /** The course's first day: the deferral starts with capsule one. */
  start: string
  /** The first day a donation is fine again, DONATION_DEFERRAL_DAYS after the last planned day. */
  until: string
  /** True when the date asked about falls inside [start, until); false for a course still ahead. */
  active: boolean
}

/**
 * The blood-donation deferral as of `date` (audit #43 item 85). Isotretinoin in donated blood can
 * harm a pregnant recipient's fetus, so blood banks refuse donors from the first capsule until a
 * month after the last. Returns the deferral covering `date` (the latest-ending when courses
 * overlap), else the next course ahead, else null. A tentative course has no dates, so it defers
 * nothing. The end is the cycle's, like the ladder's "blood donation ok" rung.
 */
export function donationDeferral(cycles: readonly Cycle[], date: string): DonationDeferral | null {
  const spans = cycles
    .filter(c => !isTentative(c) && c.compounds.some(i => i.compound === ISOTRETINOIN))
    .map(c => ({ start: c.start_date, until: shiftDays(cycleEnd(c), DONATION_DEFERRAL_DAYS) }))
  const covering = spans.filter(s => s.start <= date && date < s.until).sort((a, b) => b.until.localeCompare(a.until))[0]
  if (covering) return { ...covering, active: true }
  const ahead = spans.filter(s => s.start > date).sort((a, b) => a.start.localeCompare(b.start))[0]
  return ahead ? { ...ahead, active: false } : null
}

// --- the ladder ---

export type RungTier = 'course' | 'typical'
/** `missed`: the rung can no longer be completed as written (item 91) — it never takes "here". */
export type RungState = 'done' | 'here' | 'upcoming' | 'missed'

export interface CourseRung {
  key: string
  tier: RungTier
  label: string
  detail: string
  /** The rung's day; null when nothing dates it yet. */
  date: string | null
  state: RungState
}

export interface RecheckDraw {
  date: string
  /** True once a lab draw with the course markers is on file for it, false while it is only planned. */
  onFile: boolean
  /** The plan's standing when not on file: booked ahead, due today, past its date, missed (no
   * draw within OVERDUE_DAYS), or done by a draw that carried none of the course markers. */
  planStatus?: PlannedDrawStatus
}

/** The first recheck: weeks 3–10 of the course (the lipid and liver moves show by week 4–8). */
export const RECHECK_WINDOW_DAYS = { from: 14, to: 70 } as const

/**
 * Two tiers. The COURSE tier is facts about this course — dated by the log, the labs and the
 * plan. The TYPICAL tier is what courses usually do, pinned to the calendar so the week reads
 * off the page, and labelled as population experience, never as a prediction (the ChatGPT
 * review's point two, taken).
 */
export function courseLadder(stats: CourseStats, today: string, baselineDrawDate: string | null, recheck: RecheckDraw | null): CourseRung[] {
  const { start, end } = stats
  const done = (date: string | null) => date != null && date <= today
  // A baseline is a draw BEFORE capsule one: once the course has started, none can be taken.
  const baselineMissed = baselineDrawDate == null && today >= start
  // The recheck window; a plan missed inside it, or one fulfilled by a draw without the course
  // markers, or the window gone by with nothing, can't be completed as written.
  const windowPassed = today > shiftDays(start, RECHECK_WINDOW_DAYS.to)
  const recheckPlanFailed = recheck != null && !recheck.onFile && (recheck.planStatus === 'missed' || recheck.planStatus === 'done')
  const recheckMissed = recheck?.onFile !== true && (recheckPlanFailed || (recheck == null && windowPassed))
  const recheckDetail = recheck?.onFile
    ? 'lipids and liver, on file'
    : recheck?.planStatus === 'done'
      ? 'that draw carried no lipids or liver — book them'
      : recheck?.planStatus === 'missed'
        ? `planned, no draw within ${OVERDUE_DAYS} days — book again`
        : recheck?.planStatus === 'overdue'
          ? 'planned — overdue, no draw on file yet'
          : recheck
            ? 'planned — lipids, liver, CBC, CK'
            : windowPassed
              ? 'weeks 3–10 passed without lipids and liver — book them now'
              : 'weeks 4–8 — book lipids, liver, CBC and CK'
  const course: Array<Omit<CourseRung, 'tier' | 'state'> & { done: boolean, missed?: boolean }> = [
    {
      key: 'baseline',
      label: 'baseline draw',
      detail: baselineDrawDate
        ? 'lipids and liver before capsule one, on file'
        : baselineMissed
          ? `none in the ${BASELINE_LOOKBACK_DAYS} days before the start — the first recheck is the earliest reading now`
          : `none on file — a draw in the ${BASELINE_LOOKBACK_DAYS} days before the start counts`,
      date: baselineDrawDate,
      done: baselineDrawDate != null,
      missed: baselineMissed
    },
    { key: 'start', label: 'capsule one', detail: `${stats.paceMgPerDay ? `${stats.currentMgPerDay ?? stats.paceMgPerDay} mg a day` : 'dose as logged'}`, date: start, done: done(start) },
    {
      key: 'recheck',
      label: 'first recheck',
      detail: recheckDetail,
      date: recheck?.date ?? null,
      done: recheck?.onFile === true,
      missed: recheckMissed
    },
    {
      key: 'lower',
      label: `${COURSE_TARGET_MG_PER_KG.lower} mg/kg`,
      detail: stats.lowerMg ? `${stats.lowerMg.toLocaleString()} mg — the lower target` : 'needs a weight on the log',
      date: stats.reachLower,
      done: stats.lowerMg != null && stats.cumulativeMg >= stats.lowerMg
    },
    {
      key: 'upper',
      label: `${COURSE_TARGET_MG_PER_KG.upper} mg/kg`,
      detail: stats.upperMg ? `${stats.upperMg.toLocaleString()} mg — the upper target, fewer relapses` : 'needs a weight on the log',
      date: stats.reachUpper,
      done: stats.upperMg != null && stats.cumulativeMg >= stats.upperMg
    },
    { key: 'end', label: 'last capsule', detail: 'as planned on the cycle — a titration or a lapse moves it', date: end, done: today > end },
    { key: 'donation', label: 'blood donation ok', detail: `${DONATION_DEFERRAL_DAYS} days after the last dose`, date: shiftDays(end, DONATION_DEFERRAL_DAYS), done: today > shiftDays(end, DONATION_DEFERRAL_DAYS) },
    { key: 'procedures', label: 'wax · laser ok', detail: `${PROCEDURE_DEFERRAL_DAYS} days after the last dose — the skin scars easily until then`, date: shiftDays(end, PROCEDURE_DEFERRAL_DAYS), done: today > shiftDays(end, PROCEDURE_DEFERRAL_DAYS) }
  ]
  // "Here" is the first rung still open — a missed one is passed over, not sat on.
  let hereTaken = false
  const courseRungs: CourseRung[] = course.map((r) => {
    let state: RungState = r.done ? 'done' : r.missed ? 'missed' : 'upcoming'
    if (state === 'upcoming' && !hereTaken) {
      state = 'here'
      hereTaken = true
    }
    const { done: _done, missed: _missed, ...rest } = r
    return { ...rest, tier: 'course', state }
  })

  const typical: Array<{ key: string, label: string, detail: string, fromWeek: number, toWeek: number }> = [
    { key: 'steady', label: 'steady state', detail: 'the drug levels off within about a week; dryness starts', fromWeek: 1, toWeek: 1 },
    { key: 'flare', label: 'possible flare', detail: 'some courses worsen before they improve — expected, not failure', fromWeek: 2, toWeek: 6 },
    { key: 'labs', label: 'lipids · liver move', detail: 'triglycerides and LDL up, HDL down, ALT/AST mildly up — the recheck window', fromWeek: 4, toWeek: 8 },
    { key: 'improve', label: 'visible change', detail: 'most courses show fewer new lesions by now', fromWeek: 8, toWeek: 12 }
  ]
  const typicalRungs: CourseRung[] = typical.map((t) => {
    const from = shiftDays(start, (t.fromWeek - 1) * 7)
    const to = shiftDays(start, t.toWeek * 7 - 1)
    const state: RungState = today > to ? 'done' : today >= from ? 'here' : 'upcoming'
    const weeks = t.fromWeek === t.toWeek ? `wk ${t.fromWeek}` : `wk ${t.fromWeek}–${t.toWeek}`
    return { key: t.key, tier: 'typical', label: `${t.label} · ${weeks}`, detail: t.detail, date: from, state }
  })

  return [...courseRungs, ...typicalRungs]
}

// --- the labs ---

export interface MarkerReading { date: string, value: number }

export interface CourseMarkerRow {
  key: CourseMarker
  /** The latest pre-course reading inside the lookback. */
  baseline: MarkerReading | null
  /** Every on-course reading, oldest first. */
  onCourse: MarkerReading[]
  latest: MarkerReading | null
  /** latest − baseline, one decimal; null without both. */
  delta: number | null
  /** The move is in the drug's known direction (true), against it (false), or there is none (null). */
  asExpected: boolean | null
}

type LabDraw = { date: string, markers: Record<string, number | null | undefined> }

/** Each course marker's baseline and on-course readings — on-course ends with the course's last
 * day when `end` is given; a draw after it is recovery, not the drug's effect. */
export function courseLabs(labs: readonly LabDraw[], start: string, end: string | null = null): CourseMarkerRow[] {
  const sorted = [...labs].sort((a, b) => a.date.localeCompare(b.date))
  const lookbackFrom = shiftDays(start, -BASELINE_LOOKBACK_DAYS)
  return COURSE_MARKERS.map((key) => {
    const readings = sorted.flatMap(d => (d.markers[key] != null && Number.isFinite(d.markers[key]) ? [{ date: d.date, value: d.markers[key] as number }] : []))
    const baseline = readings.filter(r => r.date < start && r.date >= lookbackFrom).at(-1) ?? null
    const onCourse = readings.filter(r => r.date >= start && (end == null || r.date <= end))
    const latest = onCourse.at(-1) ?? null
    const delta = baseline && latest ? roundTo(latest.value - baseline.value, 1) : null
    const asExpected = delta == null || delta === 0 ? null : Math.sign(delta) === EXPECTED_DIRECTION[key]
    return { key, baseline, onCourse, latest, delta, asExpected }
  })
}

/** A draw carrying any marker the course watches — the only kind that can be its baseline or
 * its recheck (item 90: a hormone-only panel or an echo in the window is not the recheck). */
export function hasCourseMarkers(draw: LabDraw): boolean {
  return COURSE_MARKERS.some(k => draw.markers[k] != null)
}

/** The day the pre-course panel was drawn: the latest lookback draw carrying any course marker. */
export function baselineDrawDate(labs: readonly LabDraw[], start: string): string | null {
  const lookbackFrom = shiftDays(start, -BASELINE_LOOKBACK_DAYS)
  return [...labs]
    .filter(d => d.date < start && d.date >= lookbackFrom && hasCourseMarkers(d))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.date ?? null
}

/**
 * The first recheck: the earliest draw with the course markers inside the recheck window if
 * one is on file; else the earliest planned draw inside it still open (booked, today, overdue);
 * else the latest plan inside it that failed (missed, or done by a draw without the markers),
 * so the ladder can say so; else null.
 */
export function recheckDraw(labs: readonly LabDraw[], planned: ReadonlyArray<{ date: string, status: PlannedDrawStatus }>, start: string): RecheckDraw | null {
  const from = shiftDays(start, RECHECK_WINDOW_DAYS.from)
  const to = shiftDays(start, RECHECK_WINDOW_DAYS.to)
  const inWindow = (d: string) => d >= from && d <= to
  const onFile = labs.filter(d => inWindow(d.date) && hasCourseMarkers(d)).map(d => d.date).sort()[0]
  if (onFile) return { date: onFile, onFile: true }
  const plans = planned.filter(p => inWindow(p.date)).sort((a, b) => a.date.localeCompare(b.date))
  const pick = plans.find(p => p.status !== 'missed' && p.status !== 'done') ?? plans.at(-1)
  return pick ? { date: pick.date, onFile: false, planStatus: pick.status } : null
}

// --- the photos ---

export interface RegionPhoto<P> {
  category: string
  latest: P | null
  count: number
  daysAgo: number | null
  stale: boolean
}

export interface PhotoStrip<P> {
  regions: RegionPhoto<P>[]
  /** The most recent day any region was shot. */
  lastSession: string | null
  daysSince: number | null
  stale: boolean
}

/**
 * Per region of a set: the newest photo and how old it is. Stale past STALE_PHOTO_DAYS. Only
 * photos dated on or after `from` count (the course's record, baseline days included) — pass
 * null for the whole library.
 */
export function photoStrip<P extends { date: string, category: string, id: number }>(photos: readonly P[], categories: readonly string[], today: string, from: string | null = null): PhotoStrip<P> {
  const regions = categories.map((category) => {
    const mine = photos.filter(p => p.category === category && (from == null || p.date >= from)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    const latest = mine.at(-1) ?? null
    const daysAgo = latest ? diffDays(latest.date, today) : null
    return { category, latest, count: mine.length, daysAgo, stale: daysAgo == null || daysAgo > STALE_PHOTO_DAYS }
  })
  const lastSession = regions.reduce<string | null>((m, r) => (r.latest && (!m || r.latest.date > m) ? r.latest.date : m), null)
  const daysSince = lastSession ? diffDays(lastSession, today) : null
  return { regions, lastSession, daysSince, stale: daysSince == null || daysSince > STALE_PHOTO_DAYS }
}

// --- the signals ---

export interface WeekPoint {
  /** First day of the course-relative week. */
  from: string
  /** Weeks before the start are negative; week 0 starts on capsule one. */
  index: number
  value: number | null
  n: number
  /** A running count: the week has days left, so its sum can't be set beside full weeks (item 94).
   * Only ever true for `sum` — a mean over a few days is still a level. */
  partial: boolean
}

/**
 * A stream folded into course-relative weeks — `weeksBefore` of them before the start (the
 * baseline band) and every week of the course up to today. `mean` for a level (weight, HRV),
 * `sum` for a count (workouts, water pours). A week with no points is null, never zero.
 */
export function weeklySeries(points: ReadonlyArray<{ date: string, value: number | null | undefined }>, start: string, today: string, agg: 'mean' | 'sum' = 'mean', weeksBefore = 8): WeekPoint[] {
  const firstIndex = -weeksBefore
  const lastIndex = today < start ? -1 : Math.floor(diffDays(start, today) / 7)
  const weeks: WeekPoint[] = []
  for (let i = firstIndex; i <= lastIndex; i++) {
    const from = shiftDays(start, i * 7)
    weeks.push({ from, index: i, value: null, n: 0, partial: agg === 'sum' && shiftDays(from, 6) > today })
  }
  const sums = new Map<number, number>()
  for (const p of points) {
    if (p.value == null || !Number.isFinite(p.value)) continue
    const i = Math.floor(diffDays(start, p.date) / 7)
    if (i < firstIndex || i > lastIndex) continue
    sums.set(i, (sums.get(i) ?? 0) + p.value)
    const w = weeks[i - firstIndex]!
    w.n++
  }
  for (const w of weeks) {
    if (!w.n) continue
    const s = sums.get(w.index) ?? 0
    w.value = roundTo(agg === 'sum' ? s : s / w.n, 1)
  }
  return weeks
}

export interface SignalSummary {
  /** Mean of the pre-course weeks that have data. */
  baseline: number | null
  /** The latest course week with data. */
  current: number | null
  delta: number | null
  /** Sparkline-ready: gaps carried forward, the head back-filled; empty when nothing has data. */
  values: number[]
  /** Index of week 0 in `values`, or null before the course starts. */
  markIndex: number | null
}

export function signalSummary(allWeeks: readonly WeekPoint[]): SignalSummary {
  // A week still running is left out everywhere: a Monday's one session is not a drop from
  // last week's four.
  const weeks = allWeeks.filter(w => !w.partial)
  const pre = weeks.filter(w => w.index < 0 && w.value != null).map(w => w.value!)
  const baseline = pre.length ? roundTo(pre.reduce((s, v) => s + v, 0) / pre.length, 1) : null
  const current = [...weeks].reverse().find(w => w.index >= 0 && w.value != null)?.value ?? null
  const delta = baseline != null && current != null ? roundTo(current - baseline, 1) : null
  const firstValue = weeks.find(w => w.value != null)?.value
  const values: number[] = []
  if (firstValue != null) {
    let carry = firstValue
    for (const w of weeks) {
      if (w.value != null) carry = w.value
      values.push(carry)
    }
  }
  const zero = weeks.findIndex(w => w.index === 0)
  return { baseline, current, delta, values, markIndex: values.length && zero >= 0 ? zero : null }
}
