// Drug-gene notes (audit #43 item 78): the owner's pharmacogenomic findings, hand-entered into
// pgx_notes (migration 0022) — never a constant here, since the repository is public and a
// genotype is not. A note names the compounds and markers it bears on; the compound and
// protocol pages show it beside a match, the marker card under a matching marker, and the
// prompts carry every note so the model applies one when its compound comes up. Pure helpers.

/** A pgx_notes row as the list serves it (the JSON columns parsed). */
export interface PgxNote {
  id: number
  gene: string
  genotype: string | null
  compounds: string[]
  markers: string[]
  note: string
  created_at?: string
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** "Tamoxifen" matches "Tamoxifen Citrate" and the reverse; short fragments never match by containment. */
export function compoundMatches(listed: string, compound: string): boolean {
  const a = fold(listed)
  const b = fold(compound)
  if (!a || !b) return false
  if (a === b) return true
  return Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))
}

/** The notes that bear on a compound, in the order entered. */
export function pgxNotesForCompound(notes: readonly PgxNote[], compound: string): PgxNote[] {
  return notes.filter(n => n.compounds.some(c => compoundMatches(c, compound)))
}

/** The notes that bear on a marker key. */
export function pgxNotesForMarker(notes: readonly PgxNote[], marker: string): PgxNote[] {
  return notes.filter(n => n.markers.includes(marker))
}

/** "CYP2D6 *1/*4 — intermediate metabolizer" */
export function pgxHeading(n: Pick<PgxNote, 'gene' | 'genotype'>): string {
  return n.genotype ? `${n.gene} ${n.genotype}` : n.gene
}

/** "tamoxifen, clomiphene" from a typed list; blanks and repeats dropped, order kept. */
export function parseList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(/[,;\n]/)) {
    const t = part.trim()
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

/** The notes as a prompt block, or ''. Pronoun-free, like the rest of the prompt prose. */
export function pgxPromptBlock(notes: readonly PgxNote[]): string {
  if (!notes.length) return ''
  const lines = notes.map((n) => {
    const scope = [
      n.compounds.length ? `compounds: ${n.compounds.join(', ')}` : '',
      n.markers.length ? `markers: ${n.markers.join(', ')}` : ''
    ].filter(Boolean).join('; ')
    return `- ${pgxHeading(n)}${scope ? ` (${scope})` : ''}: ${n.note}`
  })
  return `Pharmacogenomic notes (from sequencing, hand-entered; standing facts, not findings of this period). Apply one only when its compound or marker is actually in play — a planned or running compound, a marker being interpreted — and then say which gene is why:\n${lines.join('\n')}`
}
