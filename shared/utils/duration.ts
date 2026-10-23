/**
 * "6h 5m" / "45m" from minutes. Rounds the total BEFORE splitting: floor/round separately turned
 * 419.7 into "6h 60m". Shared so the pet's voice (shared/utils/tickerVoice.ts) and the pages'
 * tiles (app/data/health-metrics.ts re-exports it) read a night the same way.
 */
export function formatDuration(min: number): string {
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
