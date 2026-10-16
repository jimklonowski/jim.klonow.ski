import type { TickerInk } from './tickerSprite.ts'
import { PRESETS } from './themePresets.ts'

// TICKER's inks as plain hex, for drawing the sprite where there is no CSS to resolve a theme
// token: the Open Graph card the Worker renders (server/routes/ticker/og.png.get.ts). The card is
// public, so it is always the default preset — no viewer's display cookie reaches a share unfurl.
// The token-backed inks read that preset (shared/utils/themePresets.ts, held equal to main.css by
// tests/theme.test.mjs; tests/tickerCard.test.mjs checks these against main.css as well). The
// sprite-only shades mirror app/components/ticker/Companion.vue; app/utils/tickerPalette.ts is
// the browser's live copy.
const DEFAULT = PRESETS.phosphor.tokens

export const TOKEN_HEX = {
  bg: DEFAULT.bg,
  raised: DEFAULT.raised,
  lineAccent: DEFAULT['line-accent'],
  accent: DEFAULT.accent,
  warn: DEFAULT.warn,
  danger: DEFAULT.danger,
  ember: DEFAULT.ember,
  hi: DEFAULT.hi,
  dim: DEFAULT.dim,
  faint: DEFAULT.faint,
  ghost: DEFAULT.ghost
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
