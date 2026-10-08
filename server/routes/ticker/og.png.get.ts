import { deflateSync } from 'node:zlib'
import { localTimeNow, localToday } from '#shared/utils/time'
import { loggedStreak } from '#shared/utils/journalLog'
import { ageDays, wardrobeOf } from '#shared/utils/tickerWardrobe'
import { renderTickerCard } from '#shared/utils/tickerCard'
import { encodePng } from '#shared/utils/pixelCanvas'

// The Open Graph image for /ticker — public, since crawlers hold no session. The page itself is
// gated, so a pasted link lands on /labs/login?for=ticker, whose head points here. The card shows
// the owner's pet as it is right now (wardrobe, build, asleep after bedtime) and two harmless
// figures; nothing from the log. Rendered on the Worker with no image library (pixelCanvas.ts) and
// cached for an hour — the three reads behind it are the whole journal, the workouts and the scans.
export default defineEventHandler(async (event) => {
  const entries = await listRows(event, 'SELECT * FROM journal_entries ORDER BY date ASC', parseJournalRow)
  const workouts = await listRows(event, 'SELECT date, duration_min FROM workouts', r => ({
    date: String(r.date),
    duration_min: r.duration_min == null ? null : Number(r.duration_min)
  }))
  const scans = await listRows(event, 'SELECT * FROM dexa_entries ORDER BY date ASC', parseDexaRow)

  const today = localToday()
  const hour = Number(localTimeNow().slice(0, 2))
  const { accessories, build } = wardrobeOf({ entries, workouts, scans, today })
  const raster = renderTickerCard({
    accessories,
    build,
    asleep: hour >= 22 || hour < 6,
    ageDays: ageDays(entries, today),
    streak: loggedStreak(entries, today),
    site: 'jim.klonow.ski'
  })
  const png = encodePng(raster, bytes => new Uint8Array(deflateSync(bytes)))

  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Cache-Control', 'public, max-age=3600')
  return Buffer.from(png)
})
