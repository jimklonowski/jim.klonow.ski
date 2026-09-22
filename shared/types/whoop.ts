/** GET /api/whoop/status — the connection and last-sync state the header menu shows. */
export interface WhoopStatus {
  connected: boolean
  /** ISO timestamp of the last sync that completed without errors, or null. */
  lastSyncedAt: string | null
  /** Why the last sync failed, or null when the last one succeeded. */
  lastError: string | null
  lastErrorAt: string | null
  /** True when the refresh token was rejected — only a reconnect fixes it. */
  needsReconnect: boolean
}
