import { zProtocolDelete } from '#shared/utils/schemas'

// Hard delete of one version, or of a whole item with its versions — for typos and duplicates.
// Stopping something is a version edit (an end date) via version.post.ts, so it survives as the
// history the prompts and rings read. Every removed row is logged, versions first, so a restore
// from /tools/data is the item and then each version.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const body = await readValidatedJson(event, zProtocolDelete)
  const db = getDb(event)

  if (body.version_id != null) {
    const before = await auditBefore(event, 'protocol_versions', body.version_id)
    await db.prepare('DELETE FROM protocol_versions WHERE id = ?1').bind(body.version_id).run()
    if (before) await recordAudit(event, { table: 'protocol_versions', key: body.version_id, before, deleted: true, summary: `version ${before.dose_label ?? ''} from ${before.from_date ?? 'the start'}`.replace(/\s+/g, ' ') })
    return { ok: true }
  }

  const itemId = body.item_id!
  const before = await auditBefore(event, 'protocol_items', itemId)
  const { results } = await db.prepare('SELECT id FROM protocol_versions WHERE item_id = ?1').bind(itemId).all<{ id: number }>()
  const versionIds = (results ?? []).map(r => r.id)
  const versionBefores = await Promise.all(versionIds.map(id => auditBefore(event, 'protocol_versions', id)))
  // Explicit, not left to ON DELETE CASCADE, so the two deletes are one batch whatever the
  // foreign-key pragma of the database running them.
  await db.batch([
    db.prepare('DELETE FROM protocol_versions WHERE item_id = ?1').bind(itemId),
    db.prepare('DELETE FROM protocol_items WHERE id = ?1').bind(itemId)
  ])
  const name = (before?.name as string | undefined) ?? `item ${itemId}`
  for (const [i, id] of versionIds.entries()) {
    const vb = versionBefores[i]
    if (vb) await recordAudit(event, { table: 'protocol_versions', key: id, before: vb, deleted: true, summary: `${name}: version from ${vb.from_date ?? 'the start'}` })
  }
  if (before) await recordAudit(event, { table: 'protocol_items', key: itemId, before, deleted: true, summary: name })
  return { ok: true }
})
