// ofetch wraps failures as `[POST] "/api/...": <status> <text>`, with the server's actual
// reason (from h3's createError) tucked away in `.data.message`. Surface that instead, so a
// failed save or upload says why.
export function extractErrorMessage(err: unknown, fallback = 'Request failed'): string {
  const e = err as { data?: { message?: string, statusMessage?: string }, statusCode?: number, message?: string }
  const serverMsg = e?.data?.message ?? e?.data?.statusMessage
  if (serverMsg) return e.statusCode ? `${serverMsg} (${e.statusCode})` : serverMsg
  return e?.message ?? fallback
}
