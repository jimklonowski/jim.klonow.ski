import Anthropic from '@anthropic-ai/sdk'

// One place for every Anthropic call the site makes. Before this, five handlers each constructed
// their own client, hardcoded their own model id, and handled (or didn't handle) truncation and
// SDK errors differently — so "what model writes the lab summary" and "why did that 500" were
// both answered by grepping.

/**
 * Model per surface. Deliberately one constant: a model bump is a line here, not a five-file
 * search. These are the models each surface has been running — the open question of moving the
 * whole set onto one current model is an explicit decision, not something to drift into.
 */
export const AI_MODELS = {
  /** /ask — conversational, streams, prompt-cached fact sheet. */
  chat: 'claude-sonnet-5',
  /** Daily + weekly recaps, written from precomputed facts. */
  digest: 'claude-sonnet-5',
  /** Lab/DEXA/echo PDF → structured JSON. */
  extract: 'claude-opus-4-8',
  /** Prose trend summary for a draw. */
  summary: 'claude-opus-4-8',
  /** Freeform stockpile text → inventory rows (structured output). */
  parse: 'claude-opus-5'
} as const

export type AiTask = keyof typeof AI_MODELS

// A hung connection must not sit on a Worker request. The SDK's default is 10 minutes, which on
// a browser-initiated call meant a user watching a spinner for the request AND both retries.
const DEFAULT_TIMEOUT_MS = 90_000
const DEFAULT_MAX_RETRIES = 2

/**
 * An SDK client with the key read once and sane request bounds. Throws a 500 naming the missing
 * variable rather than letting the SDK fail with "apiKey is required".
 */
export function createAnthropic(opts: { timeout?: number, maxRetries?: number } = {}): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY is not configured' })
  }
  return new Anthropic({
    apiKey,
    timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
    maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES
  })
}

interface UsageLike {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/**
 * One structured line per call, so `wrangler tail` answers what each feature costs and whether
 * prompt caching is actually landing. console.info survives the production log stripping, which
 * only removes console.log/debug (see nuxt.config security.removeLoggers).
 */
export function logAiUsage(task: AiTask, model: string, usage: UsageLike | undefined, stopReason?: string | null, startedAt?: number) {
  const ms = startedAt ? Date.now() - startedAt : undefined
  console.info(
    `[ai] ${task} model=${model}`
    + ` in=${usage?.input_tokens ?? 0}`
    + ` cache_write=${usage?.cache_creation_input_tokens ?? 0}`
    + ` cache_read=${usage?.cache_read_input_tokens ?? 0}`
    + ` out=${usage?.output_tokens ?? 0}`
    + ` stop=${stopReason ?? 'n/a'}`
    + (ms != null ? ` ms=${ms}` : '')
  )
}

/**
 * Rejects a response that didn't finish cleanly. A `max_tokens` stop is the dangerous one: the
 * text reads complete but is cut off mid-thought, and both the lab summary and the extraction
 * used to store or parse it as though it were whole.
 */
export function assertCompleted(stopReason: string | null | undefined, task: AiTask): void {
  if (stopReason === 'end_turn' || stopReason == null) return
  if (stopReason === 'max_tokens') {
    throw createError({ statusCode: 502, message: `The ${task} response hit the output limit and was truncated — nothing was saved.` })
  }
  if (stopReason === 'refusal') {
    throw createError({ statusCode: 502, message: `The model declined to complete the ${task} request.` })
  }
  throw createError({ statusCode: 502, message: `The ${task} response ended unexpectedly (${stopReason}).` })
}

/** The concatenated text blocks of a response, trimmed. */
export function textOf(content: Array<{ type: string, text?: string }>): string {
  return content.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim()
}

/**
 * Maps an SDK error onto an h3 error with a status that means something to the client, and keeps
 * the provider's own wording out of the response (it lands in the log instead).
 */
export function aiError(err: unknown, task: AiTask): ReturnType<typeof createError> {
  // An h3 error from our own guards above already carries the right status.
  if (err && typeof err === 'object' && 'statusCode' in err) return err as ReturnType<typeof createError>

  console.error(`[ai] ${task} failed:`, err instanceof Error ? err.message : err)

  if (err instanceof Anthropic.RateLimitError) {
    return createError({ statusCode: 503, message: 'The AI service is rate limited right now — try again shortly.' })
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return createError({ statusCode: 504, message: `The ${task} request timed out.` })
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return createError({ statusCode: 504, message: 'Could not reach the AI service.' })
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return createError({ statusCode: 500, message: 'The AI credentials were rejected — check ANTHROPIC_API_KEY.' })
  }
  // APIError is the base every HTTP failure extends, so it stays last — RateLimitError and
  // AuthenticationError above are subclasses and would otherwise be swallowed here.
  if (err instanceof Anthropic.APIError) {
    return createError({ statusCode: 502, message: `The AI service returned ${err.status ?? 'an error'}.` })
  }
  return createError({ statusCode: 502, message: `The ${task} request failed.` })
}
