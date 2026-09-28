import type { AskMessage } from '../utils/askHistory.ts'

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
