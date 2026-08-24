// The digest prompt asks the model to "end with 1-3 concrete recommendations", but they come
// back inside the summary markdown rather than as a structured field. The home page shows them
// in their own numbered box (01/02/03), so split the trailing list off the prose here instead
// of changing the generator. Returns the recommendations empty when the model wrote the whole
// thing as prose — the caller then renders the summary unchanged and hides the box.

export interface DigestParts {
  prose: string
  recommendations: string[]
}

const BULLET = /^\s*(?:[-*+]|\d{1,2}[.)])\s+(.*)$/

export function splitDigest(summary: string | null | undefined): DigestParts {
  if (!summary) return { prose: '', recommendations: [] }

  const lines = summary.replace(/\r\n/g, '\n').split('\n')

  // Walk back over the trailing run of list items, skipping the blank lines between them.
  let start = lines.length
  const collected: string[] = []
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    if (!line.trim()) {
      if (collected.length) continue
      start = i
      continue
    }
    const match = BULLET.exec(line)
    if (!match) break
    collected.unshift(stripEmphasis(match[1]!.trim()))
    start = i
  }

  if (collected.length < 2) return { prose: summary.trim(), recommendations: [] }

  return {
    prose: lines.slice(0, start).join('\n').trim(),
    recommendations: collected
  }
}

/** Recommendation rows are already styled, so leading bold/italic markers just add noise. */
function stripEmphasis(text: string): string {
  return text.replace(/^\*\*(.+?)\*\*:?\s*/, '$1 — ').replace(/\*\*/g, '').trim()
}
