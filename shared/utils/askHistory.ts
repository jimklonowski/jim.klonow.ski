// Conversation-history rules for the /ask console, shared by the page (which trims what it
// sends) and the API handler (which rejects what it won't accept) so the two can't drift.
//
// The Messages API requires the first message to be a user turn, and — on models without
// assistant prefill, i.e. every current one — the last message too. A naive "last N messages"
// slice of a user/assistant/user/… transcript breaks the first rule whenever the transcript has
// an odd length, which it always does once the new question is appended: after ten exchanges
// the 21-message history sliced to 20 begins with an assistant turn and every request 400s
// until the conversation is cleared. Trimming has to land on a user turn.
//
// No runtime imports on purpose: tests load this straight into plain node.

export const ASK_MAX_TURNS = 20
export const ASK_MAX_CONTENT_CHARS = 4000

export type AskRole = 'user' | 'assistant'
export interface AskMessage { role: AskRole, content: string }

/**
 * The most recent `max` non-empty messages, then any leading assistant turns dropped so the
 * history opens on a user turn. Blank messages (the streaming placeholder) are removed first.
 *
 * Earlier answers longer than `maxChars` are cut to fit, since the handler refuses any message
 * over it: an answer can run well past that, and every follow-up after one used to fail. The
 * model only needs the gist of what it already said; the saved thread keeps the whole answer.
 * Messages that fit are returned as the same objects, so reactive proxies pass through.
 */
export function trimAskHistory<T extends AskMessage>(messages: T[], max = ASK_MAX_TURNS, maxChars = ASK_MAX_CONTENT_CHARS): T[] {
  const kept = messages.filter(m => m.content.trim())
  let start = Math.max(0, kept.length - max)
  while (start < kept.length && kept[start]!.role !== 'user') start++
  return kept.slice(start).map(m => m.role === 'assistant' && m.content.length > maxChars
    ? { ...m, content: `${m.content.slice(0, maxChars - 1)}…` }
    : m)
}

// --- how a generation ended ---

export const ASK_NOTE_REFUSED = '*[I can\'t help with that one as asked — try rephrasing it]*'
export const ASK_NOTE_TRUNCATED = '*[answer truncated — ask a narrower question]*'
export const ASK_NOTE_NO_ROOM = '*[I ran out of room before I could answer — ask a narrower question]*'

export interface AskEnding {
  /** Text to stream after the answer, already spaced from it; '' for none. */
  note: string
  /** The answer to save beside its question, or null to keep the exchange out of the thread. */
  stored: string | null
}

/**
 * What to tell the reader and what to keep, from the model's stop reason and the text it
 * streamed. An answer is kept only when the model wrote one: a refusal never is, and neither is a
 * `max_tokens` stop with nothing written — thinking shares the output budget, so a long think can
 * spend all of it, and the truncation note alone used to be saved as that question's answer and
 * sent back to the model as its own words on the next turn (audit #44 item 29). A truncated answer
 * that has text is kept with the note, so a reader coming back to the thread sees it was cut.
 */
export function askEnding(stopReason: string | null | undefined, answer: string): AskEnding {
  const hasText = answer.trim().length > 0
  if (stopReason === 'refusal') return { note: `\n\n${ASK_NOTE_REFUSED}`, stored: null }
  if (stopReason === 'max_tokens') {
    if (!hasText) return { note: ASK_NOTE_NO_ROOM, stored: null }
    const note = `\n\n${ASK_NOTE_TRUNCATED}`
    return { note, stored: answer + note }
  }
  return { note: '', stored: hasText ? answer : null }
}

export type AskHistoryCheck
  = { ok: true, messages: AskMessage[] }
    | { ok: false, problem: string }

/**
 * Validates an untrusted request body's `messages` against what the API will accept: an array
 * of ≤ `max` `{role, content}` entries with non-empty content under `maxChars`, opening and
 * closing on a user turn. On success returns plain copies (only role + content).
 */
export function checkAskHistory(input: unknown, max = ASK_MAX_TURNS, maxChars = ASK_MAX_CONTENT_CHARS): AskHistoryCheck {
  if (!Array.isArray(input) || !input.length) return { ok: false, problem: 'messages[] required' }
  if (input.length > max) {
    return { ok: false, problem: `Conversation too long — start a fresh one (max ${max} turns sent)` }
  }
  const messages: AskMessage[] = []
  for (const m of input as Array<{ role?: unknown, content?: unknown } | null>) {
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m?.content !== 'string' || !m.content.trim()) {
      return { ok: false, problem: 'each message needs role user|assistant and non-empty content' }
    }
    if (m.content.length > maxChars) return { ok: false, problem: `message too long (max ${maxChars} chars)` }
    messages.push({ role: m.role, content: m.content })
  }
  if (messages[0]!.role !== 'user') return { ok: false, problem: 'conversation must open with a user turn' }
  if (messages[messages.length - 1]!.role !== 'user') {
    return { ok: false, problem: 'conversation must end with the question being asked' }
  }
  return { ok: true, messages }
}
