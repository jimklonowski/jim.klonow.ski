import type Anthropic from '@anthropic-ai/sdk'
import { checkAskHistory } from '#shared/utils/askHistory'
import { localToday } from '#shared/utils/time'
import { zAsk } from '#shared/utils/schemas'
import { TICKER_CHAT_VOICE, readerContext } from '../../utils/digestPrompts'

// Ask-the-data chat, answered by TICKER: freeform questions over the full tracked history (labs,
// DEXA, journal, Whoop, protocol). Owner-only — same policy as digest generation: nobody else
// gets to spend Anthropic tokens. Streams plain-text deltas; the client renders them as they
// land. Each finished exchange is saved to its thread (ask_threads / ask_messages).

// The schedule inside readerContext is as of `today`, which the client pins for the whole
// conversation, so the rules stay byte-identical across turns and the prompt cache still hits.
const systemRules = (today: string) => `You are answering the owner's questions about his own data on his personal health dashboard. ${readerContext(today)}

${TICKER_CHAT_VOICE}

Ground rules:
- Answer from the fact sheet below.
- Trends measured against protocol dates are observed associations — say so; don't assert causation.
- Formatting: light Markdown — **bold** the numbers that matter, short bullet lists where they read better than prose. No headings, no tables. Keep answers tight; this is a terminal, not an essay.
- No greeting and no medical-advice disclaimers.`

/** The text of a streamed delta, or null for the structural events around it. */
function textDelta(event: Anthropic.MessageStreamEvent): string | null {
  return event.type === 'content_block_delta' && event.delta.type === 'text_delta'
    ? event.delta.text
    : null
}

/** A thread title from its first question: one line, bounded. */
function titleFrom(question: string): string {
  const line = question.replace(/\s+/g, ' ').trim()
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readValidatedJson(event, zAsk)
  // Shape, length, and turn-order rules live in shared/utils/askHistory.ts alongside the trim
  // the page applies before sending, so a history the page produces is one this accepts.
  const history = checkAskHistory(body.messages)
  if (!history.ok) throw createError({ statusCode: 400, message: history.problem })
  const messages: Anthropic.MessageParam[] = history.messages
  const question = history.messages.at(-1)!.content
  // The client sends its local date so "this week" means Jim's week, not UTC's.
  const today = body.today ?? localToday()
  const db = getDb(event)

  // The thread this exchange lands in. A new conversation gets its row now, so its id can go
  // back in a header before the first byte of the answer; it's removed again if nothing is saved.
  let threadId = body.threadId ?? null
  let createdThread = false
  if (threadId != null) {
    const exists = await db.prepare('SELECT 1 FROM ask_threads WHERE id = ?1').bind(threadId).first()
    if (!exists) throw createError({ statusCode: 404, message: 'That conversation no longer exists — start a new one' })
  }
  else {
    const now = new Date().toISOString()
    const res = await db.prepare('INSERT INTO ask_threads (title, created_at, updated_at) VALUES (?1, ?2, ?2)')
      .bind(titleFrom(question), now).run()
    threadId = res.meta.last_row_id
    createdThread = true
  }
  const dropEmptyThread = async () => {
    if (createdThread) await db.prepare('DELETE FROM ask_threads WHERE id = ?1').bind(threadId).run().catch(() => {})
  }

  const context = await buildAskContext(db, today)

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
    system: [{ type: 'text', text: `${systemRules(today)}\n\n--- FACT SHEET ---\n${context}`, cache_control: { type: 'ephemeral' } }],
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
    await dropEmptyThread()
    throw aiError(err, 'chat')
  }

  // Plain chunked text (not SSE): the client appends whatever arrives. Once the first byte is
  // out the status is already sent, so a mid-stream failure can only be reported in-band.
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'X-Thread-Id', String(threadId))

  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = ''
      let completed = false
      try {
        while (!step.done) {
          const text = textDelta(step.value)
          if (text) {
            answer += text
            controller.enqueue(encoder.encode(text))
          }
          step = await iterator.next()
        }
        const final = await stream.finalMessage()
        logAiUsage('chat', AI_MODELS.chat, final.usage, final.stop_reason, startedAt)
        if (final.stop_reason === 'max_tokens') {
          const note = '\n\n*[answer truncated — ask a narrower question]*'
          answer += note
          controller.enqueue(encoder.encode(note))
        }
        completed = answer.trim().length > 0
      }
      catch (err) {
        console.error('[ai] chat stream failed:', err instanceof Error ? err.message : err)
        controller.enqueue(encoder.encode('\n\n*[generation failed — try again]*'))
      }
      finally {
        // Only a finished answer is saved, question and answer together — the page drops a
        // failed exchange from the transcript, so the thread must not keep half of one.
        if (completed) {
          const now = new Date().toISOString()
          await db.batch([
            db.prepare('INSERT INTO ask_messages (thread_id, role, content, created_at) VALUES (?1, \'user\', ?2, ?3)').bind(threadId, question, now),
            db.prepare('INSERT INTO ask_messages (thread_id, role, content, model, created_at) VALUES (?1, \'assistant\', ?2, ?3, ?4)').bind(threadId, answer, AI_MODELS.chat, now),
            db.prepare('UPDATE ask_threads SET updated_at = ?2 WHERE id = ?1').bind(threadId, now)
          ]).catch(err => console.error('[ai] could not save the exchange:', err instanceof Error ? err.message : err))
        }
        else {
          await dropEmptyThread()
        }
        controller.close()
      }
    },
    cancel() {
      stream.abort()
    }
  })
})
