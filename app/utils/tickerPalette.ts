import type { TickerInk } from '#shared/utils/tickerSprite'

// TICKER's inks as colours, for drawing a sprite anywhere that isn't the companion's CSS grid
// (the runner's canvas). Mirrors the .ink-* rules in app/components/ticker/Companion.vue — a
// change to either must be made in both; theme tokens are named so they resolve to whatever the
// page is showing.
export const INK_COLORS: Record<TickerInk, string> = {
  rim: '#6e1f2c',
  red: 'var(--color-danger)',
  shade: '#c2493f',
  hi: '#ff8a7d',
  spec: '#ffd5cc',
  eye: 'var(--color-bg)',
  glint: 'var(--color-hi)',
  blush: '#f5a0a6',
  tongue: '#ff9aa5',
  drop: '#8fd3ff',
  limb: 'var(--color-dim)',
  glove: 'var(--color-hi)',
  shoe: 'var(--color-accent)',
  clip: 'var(--color-warn)',
  line: 'var(--color-faint)',
  flag: 'var(--color-danger)',
  mug: 'var(--color-ember)',
  coffee: '#5a3424',
  bowl: '#6f8aa0',
  hat: '#c084fc'
}

/** Every ink resolved against the live theme — call once per game, not per cell. */
export function resolveInks(): Record<TickerInk, string> {
  const style = getComputedStyle(document.documentElement)
  const out = {} as Record<TickerInk, string>
  for (const [ink, value] of Object.entries(INK_COLORS) as Array<[TickerInk, string]>) {
    const token = /^var\((--[\w-]+)\)$/.exec(value)?.[1]
    out[ink] = token ? style.getPropertyValue(token).trim() || '#888' : value
  }
  return out
}

/** A theme token's value, for the runner's ground and HUD. */
export function themeColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
}
