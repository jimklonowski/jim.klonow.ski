import type { Cycle } from '#shared/utils/cycles'
import { calendarEvents, renderIcs, type CalendarJournalRow, type CalendarLabDraw } from '#shared/utils/calendarFeed'
import { isotretinoinCycle } from '#shared/utils/accutane'
import type { Vaccination } from '#shared/utils/vaccines'
import { localToday } from '#shared/utils/time'
import { isEchoOnly } from '../../app/data/biomarkers'
import { loadCycles } from '../utils/cycleContext'
import { loadPhlebotomies } from '../utils/phlebotomyContext'
import { loadPlannedDraws } from '../utils/plannedDrawContext'

// The owner's calendar feed (audit #43 item 58): `GET /calendar.ics?token=<CALENDAR_TOKEN>`,
// for a phone's calendar to subscribe to (webcal://). A calendar app can't carry a session
// cookie, so the token is the credential — its own secret, URL-safe, never LABS_SECRET — and
// without it, or with the secret unset, the route answers 404 so the path tells nobody anything.
// Always the real DB: this is the owner's record. Public, so per-IP limited; a calendar app
// polls every few hours.

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'public', 'calendar')
  const token = process.env.CALENDAR_TOKEN
  if (!token || !safeEqual(getQuery(event).token, token)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const db = getRealDb(event)
  const today = localToday()
  const [plans, cycles, phlebotomies, labsRes, vaccRes] = await Promise.all([
    loadPlannedDraws(db),
    loadCycles(db),
    loadPhlebotomies(db),
    db.prepare('SELECT date, markers, qualitative FROM labs_entries ORDER BY date ASC').all(),
    db.prepare('SELECT id, date, vaccine, product, notes FROM vaccinations ORDER BY date ASC').all().catch(() => ({ results: [] }))
  ])
  // Blood draws only: an echo-only row is a scan and dates no draw.
  const labs: CalendarLabDraw[] = ((labsRes.results ?? []) as Array<{ date: string, markers: string | null, qualitative: string | null }>)
    .map(r => ({ date: r.date, markers: JSON.parse(r.markers || '{}') as Record<string, number | null>, qualitative: JSON.parse(r.qualitative || '[]') }))
    .filter(r => !isEchoOnly(r))
    .map(r => ({ date: r.date, markers: r.markers }))
  const vaccinations = (vaccRes.results ?? []) as unknown as Vaccination[]

  // The dose log is read only for the course, and only from its start: the weigh-in and the
  // capsules the projection runs on.
  const course = isotretinoinCycle(cycles as Cycle[], today)
  let journal: CalendarJournalRow[] = []
  if (course) {
    const [doseRes, weightRow] = await Promise.all([
      db.prepare('SELECT date, peptides FROM journal_entries WHERE date >= ?1 AND peptides IS NOT NULL ORDER BY date ASC').bind(course.start_date).all(),
      db.prepare('SELECT date, weight_lbs FROM journal_entries WHERE weight_lbs IS NOT NULL ORDER BY date DESC LIMIT 1').first<{ date: string, weight_lbs: number }>()
    ])
    journal = ((doseRes.results ?? []) as Array<{ date: string, peptides: string | null }>)
      .map(r => ({ date: r.date, peptides: JSON.parse(r.peptides || '[]') as CalendarJournalRow['peptides'] }))
    if (weightRow) journal.push({ date: weightRow.date, weight_lbs: weightRow.weight_lbs })
  }

  const host = getRequestURL(event).hostname
  const events = calendarEvents({ plans, labs, cycles, vaccinations, phlebotomies, journal }, today, host)
  const body = renderIcs(events, { name: 'Health calendar', now: new Date() })

  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'inline; filename="calendar.ics"')
  setHeader(event, 'Cache-Control', 'private, max-age=1800')
  setHeader(event, 'X-Robots-Tag', 'noindex')
  return body
})
