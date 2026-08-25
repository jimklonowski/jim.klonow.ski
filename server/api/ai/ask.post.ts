import Anthropic from '@anthropic-ai/sdk'
import { READER_CONTEXT } from '../../utils/digest'

// Ask-the-data chat: answers freeform questions over the full tracked history (labs, DEXA,
// journal, Whoop, protocol). Owner-only — same policy as digest generation: nobody else gets
// to spend Anthropic tokens. Streams plain-text deltas; the client renders them as they land.

const MODEL = 'claude-sonnet-5'
const MAX_TURNS = 20
const MAX_CONTENT_CHARS = 4000

const SYSTEM_RULES = `You are the analysis console on a personal health dashboard, answering the owner's questions about his own data. ${READER_CONTEXT}

Ground rules:
- Answer from the fact sheet below. Cite the dates and numbers you're reasoning from so answers are checkable against the dashboard.
- Trends measured against protocol dates are observed associations — say so; don't assert causation.
- If the data can't answer the question (marker never tested, window not tracked), say exactly that rather than estimating an answer.
- Honest signal over encouragement: if something looks off, say it plainly.
- Formatting: light Markdown — **bold** the numbers that matter, short bullet lists where they read better than prose. No headings, no tables. Keep answers tight; this is a terminal, not an essay.
- No greeting, no closing, no medical-advice disclaimers.`

interface ChatMessage { role: 'user' | 'assistant', content: string }

function validate(body: unknown): ChatMessage[] {
  const messages = (body as { messages?: unknown })?.messages
  if (!Array.isArray(messages) || !messages.length) {
    throw createError({ statusCode: 400, message: 'messages[] required' })
  }
  if (messages.length > MAX_TURNS) {
    throw createError({ statusCode: 400, message: `Conversation too long — start a fresh one (max ${MAX_TURNS} turns sent)` })
  }
  return messages.map((m: { role?: unknown, content?: unknown }) => {
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m?.content !== 'string' || !m.content.trim()) {
      throw createError({ statusCode: 400, message: 'each message needs role user|assistant and non-empty content' })
    }
    if (m.content.length > MAX_CONTENT_CHARS) {
      throw createError({ statusCode: 400, message: `message too long (max ${MAX_CONTENT_CHARS} chars)` })
    }
    return { role: m.role, content: m.content }
  })
}

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const body = await readBody(event)
  const messages = validate(body)
  // The client sends its local date so "this week" means Jim's week, not UTC's.
  const today = typeof body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
    ? body.today
    : new Date().toISOString().slice(0, 10)

  const context = await buildAskContext(getDb(event), today)

  const anthropic = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: `${SYSTEM_RULES}\n\n--- FACT SHEET ---\n${context}`,
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
