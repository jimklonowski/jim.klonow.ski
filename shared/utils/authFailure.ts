// What a failed sign-in or PIN unlock should say (audit #43 item 50). Every failure used to read
// "Incorrect password" — a rate limit, a dead network and a server error all told the person to
// type it again, more carefully. The status says which it was; only a refusal of the credential
// itself is the credential's fault.

/** The HTTP status behind a failed $fetch, or null when no answer came back at all (ofetch's
 * FetchError without a response — the network, not the server). */
export function responseStatus(err: unknown): number | null {
  const e = err as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } } | null | undefined
  const s = e?.statusCode ?? e?.status ?? e?.response?.status
  return typeof s === 'number' ? s : null
}

/** The line under the form. `wrong` is the credential's own message ("Incorrect PIN. Try again."). */
export function signInFailure(err: unknown, wrong: string): string {
  const status = responseStatus(err)
  if (status === null) return 'No answer from the server. Check the connection and try again.'
  if (status === 400 || status === 401) return wrong
  if (status === 403) return 'That session has ended. Reload the page and sign in again.'
  if (status === 429) return 'Too many attempts. Wait a minute and try again.'
  return `The server could not check that (${status}). Try again in a moment.`
}
