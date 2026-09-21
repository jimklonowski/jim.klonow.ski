import Anthropic from '@anthropic-ai/sdk'
import { checkAskHistory } from '#shared/utils/askHistory'
import { READER_CONTEXT } from '../../utils/digest'

// Ask-the-data chat: answers freeform questions over the full tracked history (labs, DEXA,
// journal, Whoop, protocol). Owner-only — same policy as digest generation: nobody else gets
// to spend Anthropic tokens. Streams plain-text deltas; the client renders them as they land.

const MODEL = 'claude-sonnet-5'

const SYSTEM_RULES = `You are the analysis console on a personal health dashboard, answering the owner's questions about his own data. ${READER_CONTEXT}

Ground rules:
- Answer from the fact sheet below. Cite the dates and numbers you're reasoning from so answers are checkable against the dashboard.
- Trends measured against protocol dates are observed associations — say so; don't assert causation.
- If the data can't answer the question (marker never tested, window not tracked), say exactly that rather than estimating an answer.
- Honest signal over encouragement: if something looks off, say it plainly.
- Formatting: light Markdown — **bold** the numbers that matter, short bullet lists where they read better than prose. No headings, no tables. Keep answers tight; this is a terminal, not an essay.
- No greeting, no closing, no medical-advice disclaimers.`

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const body = await readBody(event)
  // Shape, length, and turn-order rules live in shared/utils/askHistory.ts alongside the trim
  // the page applies before sending, so a history the page produces is one this accepts.
  const history = checkAskHistory(body?.messages)
  if (!history.ok) throw createError({ statusCode: 400, message: history.problem })
  const messages: Anthropic.MessageParam[] = history.messages
  // The client sends its local date so "this week" means Jim's week, not UTC's.
  const today = typeof body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
    ? body.today
    : new Date().toISOString().slice(0, 10)

  const context = await buildAskContext(getDb(event), today)

  const anthropic = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    // The rules + fact sheet are byte-identical on every turn of a same-day conversation: the
    // sheet is rebuilt from D1 per request, but every query is ORDER BY'd and `today` is pinned
    // by the client, so only `messages` varies. The cache marker makes turns 2..N read the
    // sheet at ~10% of input price instead of re-paying for it (5-minute TTL, refreshed by each
    // hit — a question more than five minutes after the last answer re-warms it at 1.25×).
    // Usage is logged below; cache_read should be non-zero from the second turn on.
    system: [{ type: 'text', text: `${SYSTEM_RULES}\n\n--- FACT SHEET ---\n${context}`, cache_control: { type: 'ephemeral' } }],
    messages
  })

  // Plain chunked text (not SSE): the client appends whatever arrives. Errors after the first
  // byte can only be reported in-band, so they land as a bracketed line in the transcript.
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')

  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        const final = await stream.finalMessage()
        const u = final.usage
        console.info(`[ask] ${MODEL} turns=${messages.length} in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens} stop=${final.stop_reason}`)
        if (final.stop_reason === 'max_tokens') {
          controller.enqueue(encoder.encode('\n\n*[answer truncated — ask a narrower question]*'))
        }
      }
      catch (err) {
        controller.enqueue(encoder.encode(`\n\n*[generation failed: ${err instanceof Error ? err.message : 'unknown error'}]*`))
      }
      finally {
        controller.close()
      }
    },
    cancel() {
      stream.abort()
    }
  })
})
