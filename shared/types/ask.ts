import type { AskMessage } from '../utils/askHistory.ts'

/**
 * The /ask stream is plain text, so how it ENDED needs one machine-readable line: after the last
 * content byte the server sends `\n` + this marker + JSON (AskStreamTrailer). ASCII record
 * separator — a byte no model answer contains, so the page can split on its first occurrence.
 */
export const ASK_TRAILER_MARK = '\u001E'

export interface AskStreamTrailer {
  /** False when the exchange was kept out of the thread: a refusal, mid-answer failure, or empty answer. */
  ok: boolean
  /** The surviving thread, or null when a just-created thread was dropped with its failed first question. */
  threadId: number | null
}

/** A saved /ask conversation in the history list. */
export interface AskThreadSummary {
  id: number
  title: string
  updatedAt: string
  /** Question/answer pairs. */
  exchanges: number
}

/** A saved conversation with its turns, as reopening it loads. */
export interface AskThread {
  id: number
  title: string
  updatedAt: string
  messages: AskMessage[]
}
