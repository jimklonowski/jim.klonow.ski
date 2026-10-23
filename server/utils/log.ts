// One shape for every server log line — `[tag] what: detail` — so `wrangler tail` filters by tag
// and a thrown non-Error (a string, a Response, a D1 result) never prints as "[object Object]".
// console.info/warn/error survive the production log stripping, which removes only
// console.log/debug (nuxt.config security.removeLoggers). Audit #42 item 42: the tags were
// `[ai]`, `audit:`, `task_runs:`, `Whoop recovery sync skipped:` and bare `${task} failed:`.

/** The message of whatever was thrown. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function logError(tag: string, what: string, err?: unknown): void {
  console.error(`[${tag}] ${what}${err === undefined ? '' : `: ${errorMessage(err)}`}`)
}

export function logWarn(tag: string, what: string, detail?: unknown): void {
  console.warn(`[${tag}] ${what}${detail === undefined ? '' : `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
}

export function logInfo(tag: string, what: string): void {
  console.info(`[${tag}] ${what}`)
}
