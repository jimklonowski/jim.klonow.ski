// The monospace faces behind the DISPLAY picker's FONT group. Like the color presets
// (themePresets.ts) they are data in one place for three consumers: the generated
// app/assets/css/themes.css (an `html[data-font]` block over the three face tokens), useTheme()
// and the picker, and tests/theme.test.mjs (the default pinned to main.css). Departure Mono, the
// display face for the big numbers, is not a choice — it is part of the terminal's identity.
//
// Every web face here must also be listed under `fonts.families` in nuxt.config.ts, where
// @nuxt/fonts self-hosts it and `preload: false` keeps the alternates off every page's <head>;
// tests/theme.test.mjs checks both.

export const FONT_IDS = ['jetbrains', 'plex', 'fira', 'source', 'geist', 'system'] as const
export type FontId = (typeof FONT_IDS)[number]
export const DEFAULT_FONT: FontId = 'jetbrains'

export function isFontId(v: unknown): v is FontId {
  return typeof v === 'string' && (FONT_IDS as readonly string[]).includes(v)
}

export interface FontPreset {
  id: FontId
  /** Picker label, terminal-cased. */
  label: string
  /** One line under the label. */
  blurb: string
  /** The web font's family name as @nuxt/fonts knows it; null for the system stack. */
  family: string | null
  /** The full `font-family` value the face tokens take. */
  stack: string
}

/** What follows the web face: the same tail main.css gives JetBrains Mono. */
const TAIL = 'ui-monospace, \'Cascadia Mono\', monospace'

const web = (id: FontId, label: string, blurb: string, family: string): FontPreset =>
  ({ id, label, blurb, family, stack: `'${family}', ${TAIL}` })

export const FONT_LIST: readonly FontPreset[] = [
  web('jetbrains', 'JETBRAINS MONO', 'the original', 'JetBrains Mono'),
  web('plex', 'IBM PLEX MONO', 'softer, rounder', 'IBM Plex Mono'),
  web('fira', 'FIRA CODE', 'with ligatures', 'Fira Code'),
  web('source', 'SOURCE CODE PRO', 'the classic', 'Source Code Pro'),
  web('geist', 'GEIST MONO', 'tight and modern', 'Geist Mono'),
  {
    id: 'system',
    label: 'SYSTEM',
    blurb: 'your OS face, no download',
    family: null,
    stack: 'ui-monospace, \'SF Mono\', Menlo, Consolas, \'Cascadia Mono\', \'Liberation Mono\', monospace'
  }
]

export const FONTS = Object.fromEntries(FONT_LIST.map(f => [f.id, f])) as Record<FontId, FontPreset>

/** The `html[data-font]` block for one face: the three Tailwind face tokens main.css sets. */
export function fontCss(f: FontPreset): string {
  return `html[data-font="${f.id}"] {\n  --font-mono: ${f.stack};\n  --font-sans: ${f.stack};\n  --font-serif: ${f.stack};\n}\n`
}

/** Every face but the default, which main.css already is. */
export function fontsCss(): string {
  return FONT_LIST.filter(f => f.id !== DEFAULT_FONT).map(fontCss).join('\n')
}
