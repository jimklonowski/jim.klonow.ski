// The owner's subscribe link for the calendar feed (audit #43 item 58): the token lives only in
// the Worker's secrets, so the page that shows the link asks here, owner-only. `configured` is
// false until CALENDAR_TOKEN is set — the page then says what to do instead of printing a link
// that 404s.
export default defineEventHandler((event): { configured: boolean, url: string | null, webcal: string | null } => {
  requireOwner(event)
  const token = process.env.CALENDAR_TOKEN
  if (!token) return { configured: false, url: null, webcal: null }
  const origin = getRequestURL(event).origin
  const url = `${origin}/calendar.ics?token=${encodeURIComponent(token)}`
  return { configured: true, url, webcal: url.replace(/^https?:/, 'webcal:') }
})
