import type Anthropic from '@anthropic-ai/sdk'
import { checkAskHistory } from '#shared/utils/askHistory'
import { localToday } from '#shared/utils/time'
import { zAsk } from '#shared/utils/schemas'
import { READER_CONTEXT } from '../../utils/digest'

// Ask-the-data chat: answers freeform questions over the full tracked history (labs, DEXA,
// journal, Whoop, protocol). Owner-only — same policy as digest generation: nobody else gets
// to spend Anthropic tokens. Streams plain-text deltas; the client renders them as they land.

const SYSTEM_RULES = `You are the analysis console on a personal health dashboard, answering the owner's questions about his own data. ${READER_CONTEXT}

Ground rules:
- Answer from the fact sheet below. Cite the dates and numbers you're reasoning from so answers are checkable against the dashboard.
- Trends measured against protocol dates are observed associations — say so; don't assert causation.
- If the data can't answer the question (marker never tested, window not tracked), say exactly that rather than estimating an answer.
- Honest signal over encouragement: if something looks off, say it plainly.
- Formatting: light Markdown — **bold** the numbers that matter, short bullet lists where they read better than prose. No headings, no tables. Keep answers tight; this is a terminal, not an essay.
- No greeting, no closing, no medical-advice disclaimers.`

/** The text of a streamed delta, or null for the structural events around it. */
function textDelta(event: Anthropic.MessageStreamEvent): string | null {
  return event.type === 'content_block_delta' && event.delta.type === 'text_delta'
    ? event.delta.text
    : null
}

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readValidatedJson(event, zAsk)
  // Shape, length, and turn-order rules live in shared/utils/askHistory.ts alongside the trim
  // the page applies before sending, so a history the page produces is one this accepts.
  const history = checkAskHistory(body.messages)
  if (!history.ok) throw createError({ statusCode: 400, message: history.problem })
  const messages: Anthropic.MessageParam[] = history.messages
  // The client sends its local date so "this week" means Jim's week, not UTC's.
  const today = body.today ?? localToday()

  const context = await buildAskContext(getDb(event), today)

  const startedAt = Date.now()
  const stream = createAnthropic({ timeout: 120_000 }).messages.stream({
    model: AI_MODELS.chat,
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

  // Pull the first event before committing to a 200. Everything that fails before generation
  // starts — a rejected key, an exhausted rate limit, an overloaded upstream — is a real HTTP
  // error here, with a status the client can act on. Returning the stream first meant those
  // arrived as a 200 whose body was "*[generation failed: …]*", which the page then rendered
  // into the transcript and sent back as conversation on the next question.
  const iterator = stream[Symbol.asyncIterator]()
  let step: IteratorResult<Anthropic.MessageStreamEvent>
  try {
    step = await iterator.next()
  }
  catch (err) {
    stream.abort()
    throw aiError(err, 'chat')
  }

  // Plain chunked text (not SSE): the client appends whatever arrives. Once the first byte is
  // out the status is already sent, so a mid-stream failure can only be reported in-band.
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')

  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (!step.done) {
          const text = textDelta(step.value)
          if (text) controller.enqueue(encoder.encode(text))
          step = await iterator.next()
        }
        const final = await stream.finalMessage()
        logAiUsage('chat', AI_MODELS.chat, final.usage, final.stop_reason, startedAt)
        if (final.stop_reason === 'max_tokens') {
          controller.enqueue(encoder.encode('\n\n*[answer truncated — ask a narrower question]*'))
        }
      }
      catch (err) {
        console.error('[ai] chat stream failed:', err instanceof Error ? err.message : err)
        controller.enqueue(encoder.encode('\n\n*[generation failed — try again]*'))
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
