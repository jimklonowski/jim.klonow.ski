import { PROFILE_FIELDS } from '#shared/utils/profile'

// Set (upsert) or clear (empty value → delete) one profile fact. Owner-only: the demo sandbox
// has no profile table to write into. Keys are limited to PROFILE_FIELDS so the table can't
// accumulate typos, and a 'select' field only accepts one of its options.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<{ key?: unknown, value?: unknown }>(event)
  const field = PROFILE_FIELDS.find(f => f.key === body?.key)
  if (!field) {
    throw createError({ statusCode: 400, message: 'Unknown profile field' })
  }
  const value = typeof body.value === 'string' ? body.value.trim() : ''
  if (value && field.kind === 'select' && !field.options?.includes(value)) {
    throw createError({ statusCode: 400, message: `Invalid value for ${field.label}` })
  }

  const db = getDb(event)
  if (!value) {
    await db.prepare('DELETE FROM profile WHERE key = ?1').bind(field.key).run()
    return { ok: true, key: field.key, value: null }
  }

  await db.prepare(`
    INSERT INTO profile (key, value, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(field.key, value, new Date().toISOString()).run()

  return { ok: true, key: field.key, value }
})
