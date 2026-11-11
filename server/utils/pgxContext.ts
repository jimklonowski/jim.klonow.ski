import { pgxPromptBlock, type PgxNote } from '#shared/utils/pgx'

// The drug-gene notes (audit #43 item 78) for the server: the row parser the list endpoint
// shares, the loader, and the prompt block the digests, the ask chat and the labs summary read.

/** A pgx_notes row with its JSON columns parsed; a malformed list reads as empty. */
export function parsePgxRow(row: Record<string, unknown>): PgxNote {
  const list = (raw: unknown): string[] => {
    try {
      const v = JSON.parse((raw as string) || '[]')
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    }
    catch {
      return []
    }
  }
  return {
    id: row.id as number,
    gene: row.gene as string,
    genotype: (row.genotype as string | null) ?? null,
    compounds: list(row.compounds),
    markers: list(row.markers),
    note: row.note as string,
    created_at: row.created_at as string | undefined
  }
}

/** Every note on file; empty before migration 0022. */
export async function loadPgxNotes(db: D1Database): Promise<PgxNote[]> {
  try {
    const { results } = await db.prepare('SELECT * FROM pgx_notes ORDER BY id ASC').all()
    return ((results ?? []) as Array<Record<string, unknown>>).map(parsePgxRow)
  }
  catch {
    return []
  }
}

export async function pgxContext(db: D1Database): Promise<string> {
  return pgxPromptBlock(await loadPgxNotes(db))
}
