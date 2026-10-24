// The vitamin/supplement/skin stack as AI-prompt context, rendered per request so edits on
// /journal/protocol flow into the prompts without a deploy. Since the protocol plan's P6 the
// stack lives in protocol_items/protocol_versions (standing items of category supplement/skin,
// mapped back to supplements-table rows by shared/utils/protocolStore.ts); a database that
// still runs on the code constants (tables missing or empty) reads the old `supplements` table.
// The wording is shared/utils/supplementProse.ts (pure, tested); this is the read.
import type { LoadedProtocol } from '#shared/utils/protocolStore'
import { renderSupplementContext, type SupplementRow } from '#shared/utils/supplementProse'
import { loadProtocol } from './protocolLoader'

// Returns '' when there's nothing to say — including when neither source exists yet, so digest
// generation never dies on a missing migration. `protocol` saves the read when the caller holds it.
export async function supplementContext(db: D1Database, asOf: string, protocol?: LoadedProtocol): Promise<string> {
  const loaded = protocol ?? await loadProtocol(db)
  if (loaded.source === 'tables') return renderSupplementContext(loaded.supplements, asOf)

  let rows: SupplementRow[]
  try {
    const { results } = await db.prepare(
      'SELECT name, dose, category, status, schedule, started, stopped, notes FROM supplements ORDER BY sort ASC, name ASC'
    ).all()
    rows = (results ?? []) as unknown as SupplementRow[]
  }
  catch {
    return ''
  }
  return renderSupplementContext(rows, asOf)
}
