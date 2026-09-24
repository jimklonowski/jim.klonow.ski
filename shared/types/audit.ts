// A row of the write history as /api/audit returns it (server/utils/audit.ts builds these).
export interface AuditEntry {
  id: number
  at: string
  action: 'create' | 'update' | 'delete' | 'restore'
  table: string
  key: string
  summary: string | null
  restoredAt: string | null
  /** Why this entry can't be restored, or null when it can. */
  blocked: string | null
}
