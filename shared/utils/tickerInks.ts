import type { TickerInk } from './tickerSprite.ts'

// TICKER's inks as plain hex, for drawing the sprite where there is no CSS to resolve a theme
// token: the Open Graph card the Worker renders (server/routes/ticker/og.png.get.ts). The
// token-backed inks carry the values from app/assets/css/main.css — tests/tickerCard.test.mjs
// reads that file and fails if the two drift. The sprite-only shades mirror
// app/components/ticker/Companion.vue; app/utils/tickerPalette.ts is the browser's live copy.
export const TOKEN_HEX = {
  bg: '#070a09',
  raised: '#0d1310',
  lineAccent: '#24382f',
  accent: '#2ce8a4',
  warn: '#e8b34b',
  danger: '#e86a5e',
  ember: '#e8834b',
  hi: '#e6f2ec',
  dim: '#a7bcb0',
  faint: '#62806f',
  ghost: '#4a6357'
} as const

/** The main.css custom property each token is, for the drift test. */
export const TOKEN_PROPERTY: Record<keyof typeof TOKEN_HEX, string> = {
  bg: '--color-bg',
  raised: '--color-raised',
  lineAccent: '--color-line-accent',
  accent: '--color-accent',
  warn: '--color-warn',
  danger: '--color-danger',
  ember: '--color-ember',
  hi: '--color-hi',
  dim: '--color-dim',
  faint: '--color-faint',
  ghost: '--color-ghost'
}

export const INK_HEX: Record<TickerInk, string> = {
  rim: '#6e1f2c',
  red: TOKEN_HEX.danger,
  shade: '#c2493f',
  hi: '#ff8a7d',
  spec: '#ffd5cc',
  eye: TOKEN_HEX.bg,
  glint: TOKEN_HEX.hi,
  blush: '#f5a0a6',
  tongue: '#ff9aa5',
  drop: '#8fd3ff',
  limb: TOKEN_HEX.dim,
  glove: TOKEN_HEX.hi,
  shoe: TOKEN_HEX.accent,
  clip: TOKEN_HEX.warn,
  line: TOKEN_HEX.faint,
  flag: TOKEN_HEX.danger,
  mug: TOKEN_HEX.ember,
  coffee: '#5a3424',
  bowl: '#6f8aa0',
  hat: '#c084fc',
  hair: '#a8702f'
}
