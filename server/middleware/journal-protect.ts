export default defineEventHandler((event) => {
  const url = getRequestURL(event)

  if (!url.pathname.startsWith('/journal')) return

  const cookie = getCookie(event, 'labs-auth')
  const secret = process.env.LABS_SECRET

  if (!secret || !cookie || cookie !== secret) {
    return sendRedirect(event, '/labs/login', 302)
  }
})
