// The vitamin/supplement/skin stack as AI-prompt context. It lives in the `supplements` table and
// is rendered per request, so edits on /journal/supplements flow into the prompts without a
// deploy. The wording is shared/utils/supplementProse.ts (pure, tested); this is the D1 read.
import { renderSupplementContext, type SupplementRow } from '#shared/utils/supplementProse'

// Returns '' when there's nothing to say — including when the table doesn't exist yet, so digest
// generation never dies on a missing migration.
export async function supplementContext(db: D1Database, asOf: string): Promise<string> {
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
