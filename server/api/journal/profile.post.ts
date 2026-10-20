import { PROFILE_FIELDS } from '#shared/utils/profile'
import { zProfileSave } from '#shared/utils/schemas'

// Set (upsert) or clear (empty value → delete) one profile fact. Owner-only: the demo sandbox
// has no profile table to write into. Keys are limited to PROFILE_FIELDS so the table can't
// accumulate typos, and a 'select' field only accepts one of its options.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { key, value } = await readValidatedJson(event, zProfileSave)
  const field = PROFILE_FIELDS.find(f => f.key === key)
  if (!field) {
    throw createError({ statusCode: 400, message: 'Unknown profile field' })
  }
  if (value && field.kind === 'select' && !field.options?.includes(value)) {
    throw createError({ statusCode: 400, message: `Invalid value for ${field.label}` })
  }
  // A number field stores the number's canonical string ('100', not '100.0' or ' 100'), within
  // its bounds — the water tracker reads these straight back as its goal and cup size.
  let stored = value
  if (value && field.kind === 'number') {
    const n = Number(value)
    const min = field.min ?? 0
    const max = field.max ?? Number.POSITIVE_INFINITY
    if (!Number.isFinite(n) || n <= 0 || n < min || n > max) {
      throw createError({ statusCode: 400, message: `${field.label} must be a number between ${min} and ${field.max ?? '∞'}` })
    }
    stored = String(n)
  }

  const db = getDb(event)
  const before = await auditBefore(event, 'profile', field.key)
  if (!stored) {
    await db.prepare('DELETE FROM profile WHERE key = ?1').bind(field.key).run()
    if (before) await recordAudit(event, { table: 'profile', key: field.key, before, deleted: true, summary: `${field.label} cleared` })
    return { ok: true, key: field.key, value: null }
  }

  await db.prepare(`
    INSERT INTO profile (key, value, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(field.key, stored, new Date().toISOString()).run()
  await recordAudit(event, { table: 'profile', key: field.key, before, summary: `${field.label}: ${stored}` })

  return { ok: true, key: field.key, value: stored }
})
