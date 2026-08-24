// "Today" for this app is always a Chicago calendar day, on the client and on the server alike.
//
// This used to be `new Date().toLocaleDateString('en-CA')`, i.e. whatever the *runtime's* local
// timezone happened to be. On the client that's Chicago and correct; inside a Cloudflare Worker
// it's UTC, so between 7pm and midnight Central every server-rendered "today" was tomorrow's
// date. That's what made "+ NEW ENTRY" open tomorrow's entry in the evening (the SSR href) and
// made the evening status bar show tomorrow's date until hydration caught up.
//
// Pinning the zone also means a day boundary that doesn't move when Jim travels — a dose logged
// at 11pm belongs to that day's entry regardless of which timezone the phone is in.
//
// The en-CA locale is used purely because it formats as ISO YYYY-MM-DD (en-US would give
// 08/24/2026); the timeZone option does the actual conversion. Same trick as
// server/tasks/whoop/sync.ts, which hit this bug first with evening Whoop workouts.
export const HOME_TZ = 'America/Chicago'

const isoDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOME_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
})

/** Today's date in the home timezone as YYYY-MM-DD. Identical on server and client. */
export function localToday(): string {
  return isoDateFmt.format(new Date())
}

/** A date `days` before today (home timezone), as YYYY-MM-DD. Negative values look forward. */
export function localDaysAgo(days: number): string {
  return isoDateFmt.format(new Date(Date.now() - days * 86400000))
}
