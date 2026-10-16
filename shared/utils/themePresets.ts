// Display presets: the Phosphor Terminal palette (app/assets/css/main.css) as data, plus the
// alternatives derived from it. One source for three consumers — app/assets/css/themes.css (the
// generated `html[data-theme]` overrides), useTheme() (the picker and the theme-color meta), and
// tests/theme.test.mjs (drift against main.css, contrast gates). Plain TS so node can load it.
//
// Every color on the site is a `--color-*` token, so a preset is nothing more than new values for
// these tokens; a switch is pure CSS. Script that needs a color as a string passes `var(--color-x)`
// (app/utils/chartTheme.ts), which the SVG and DOM resolve against the active block.
import { contrast, hexToOklch, oklchToHex } from './oklch.ts'
import type { Oklch } from './oklch.ts'

export const THEME_IDS = ['phosphor', 'amber', 'ice', 'white', 'emkay', 'emkay-inverted'] as const
export type ThemeId = (typeof THEME_IDS)[number]
export const DEFAULT_THEME: ThemeId = 'phosphor'

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v)
}

/**
 * The tokens a preset sets, grouped as main.css declares them. Series-identity colors (indigo-dot,
 * soda, the peptide hues, the ticker's inks) are left out on purpose: they tell one series from
 * another and must not move with the theme.
 */
export const TOKEN_KEYS = [
  // Surfaces
  'bg', 'raised', 'inset', 'status', 'nav-active', 'row-hover',
  // Borders
  'line', 'line-soft', 'line-accent', 'line-input', 'line-field', 'line-row',
  // Accent and the status trio
  'accent', 'accent-hover', 'accent-bg', 'accent-bg-hover', 'warn', 'danger', 'ember', 'mark',
  // Range bands
  'band', 'band-outer',
  // Text ramp
  'hi', 'body', 'dim', 'muted', 'faint', 'ghost', 'nav-idle'
] as const
export type TokenKey = (typeof TOKEN_KEYS)[number]
export type Tokens = Record<TokenKey, string>

/** Nuxt UI's `primary` resolves through this scale (app.config.ts: `primary: 'phosphor'`). */
export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type ScaleStep = (typeof SCALE_STEPS)[number]
export type Scale = Record<ScaleStep, string>

export interface ThemePreset {
  id: ThemeId
  /** Picker label, terminal-cased. */
  label: string
  /** One line under the label. */
  blurb: string
  tokens: Tokens
  scale: Scale
}

/** The default. These are copies of main.css; tests/theme.test.mjs holds them equal. */
const PHOSPHOR: ThemePreset = {
  id: 'phosphor',
  label: 'PHOSPHOR',
  blurb: 'green phosphor on near-black — the original',
  tokens: {
    'bg': '#070a09',
    'raised': '#0d1310',
    'inset': '#0a0f0c',
    'status': '#090d0b',
    'nav-active': '#12211a',
    'row-hover': '#101a15',

    'line': '#1a2620',
    'line-soft': '#16211b',
    'line-accent': '#24382f',
    'line-input': '#1e2d26',
    'line-field': '#33503f',
    'line-row': '#10160f',

    'accent': '#2ce8a4',
    'accent-hover': '#7df0c9',
    'accent-bg': '#0f2418',
    'accent-bg-hover': '#173125',
    'warn': '#e8b34b',
    'danger': '#e86a5e',
    'ember': '#e8834b',
    'mark': '#5d7a6d',

    'band': '#1e3a2e',
    'band-outer': '#152b21',

    'hi': '#e6f2ec',
    'body': '#c7d4cd',
    'dim': '#a7bcb0',
    'muted': '#7a9688',
    'faint': '#62806f',
    'ghost': '#4a6357',
    'nav-idle': '#6b8578'
  },
  scale: {
    50: '#eafff7',
    100: '#c8ffe9',
    200: '#9bf8d8',
    300: '#7df0c9',
    400: '#2ce8a4',
    500: '#1fce8f',
    600: '#17a674',
    700: '#147f5b',
    800: '#135f46',
    900: '#114d3a',
    950: '#062a1f'
  }
}

/**
 * The accent scale's shape, read off the hand-picked phosphor one: per step, how far the
 * lightness sits from the accent toward white (steps under 400) or toward the 950 floor (over),
 * and the chroma as a share of the accent's. Step 400 is the accent itself.
 */
const SCALE_SHAPE: Record<ScaleStep, [lightness: number, chroma: number]> = {
  50: [1, 0.14],
  100: [0.83, 0.37],
  200: [0.55, 0.58],
  300: [0.32, 0.70],
  400: [0, 1],
  500: [0.126, 0.93],
  600: [0.322, 0.79],
  700: [0.518, 0.62],
  800: [0.688, 0.48],
  900: [0.788, 0.40],
  950: [1, 0.27]
}
const SCALE_TOP_L = 0.982
const SCALE_FLOOR_L = 0.256

/** The 50–950 scale for an accent, in the phosphor scale's shape. */
export function accentScale(accent: string): Scale {
  const a = hexToOklch(accent)
  const scale = {} as Scale
  for (const step of SCALE_STEPS) {
    const [t, c] = SCALE_SHAPE[step]
    const L = step < 400 ? a.L + (SCALE_TOP_L - a.L) * t : a.L - (a.L - SCALE_FLOOR_L) * t
    scale[step] = step === 400 ? accent : oklchToHex({ L, C: a.C * c, h: a.h })
  }
  return scale
}

/** The status trio keeps its own hues in every preset, so a flag reads as a flag whatever the theme. */
const STATUS: readonly TokenKey[] = ['warn', 'danger', 'ember']

/** Tokens that mean "the accent": its hover, the faces behind accent text, and the range bands
 * (inside the range is what the accent stands for). They take the accent's hue. */
const ACCENT_TINTED: readonly TokenKey[] = ['accent-hover', 'accent-bg', 'accent-bg-hover', 'band', 'band-outer']

/** Everything else — surfaces, lines, the text ramp, mark — takes the surface hue: the accent's,
 * or a second brand hue when the preset names one. */
const SURFACE_TINTED = TOKEN_KEYS.filter(k => k !== 'accent' && !STATUS.includes(k) && !ACCENT_TINTED.includes(k))

interface PresetSpec {
  id: ThemeId
  label: string
  blurb: string
  accent: string
  /** A second hue for the surfaces, lines and text — a brand pair like EMKAY's purple under its
   * orange. The accent's own when omitted. */
  tint?: string
  /** Tokens set by hand instead of derived — the status trio, when the accent lands on one. */
  tokens?: Partial<Tokens>
  /** A hand-picked scale; generated from the accent when omitted. */
  scale?: Scale
}

/** The two surfaces the text ramp was tuned against; derived first so the rest can be held to them. */
const SURFACES: readonly TokenKey[] = ['bg', 'raised']

/**
 * A preset from an accent (and optionally a surface hue). Every tinted phosphor token moves to
 * its new hue at the same perceptual lightness, with its chroma scaled by the new hue's share of
 * the phosphor accent's — so a grey accent gives neutral surfaces and a saturated one tinted
 * ones. Lightness alone does not carry WCAG contrast across hues exactly (a warm grey is a shade
 * dimmer than a cool one at the same OKLCH L), so each token is then lifted until it clears, on
 * both surfaces, the ratio its phosphor original had — the contrast the ramp was tuned for is the
 * invariant, not the number. Phase B tunes by eye through `tokens`.
 */
function derive(spec: PresetSpec): ThemePreset {
  const base = hexToOklch(PHOSPHOR.tokens.accent)
  const hue = { accent: hexToOklch(spec.accent), surface: hexToOklch(spec.tint ?? spec.accent) }
  const shift = (key: TokenKey, to: Oklch, lift = 0) => {
    const o = hexToOklch(PHOSPHOR.tokens[key])
    return oklchToHex({ L: o.L + lift, C: o.C * Math.min(1.3, to.C / base.C), h: to.h })
  }
  const tokens = { ...PHOSPHOR.tokens }
  for (const key of SURFACES) tokens[key] = shift(key, hue.surface)
  const held = (key: TokenKey, to: Oklch) => {
    const clears = (hex: string) => SURFACES.every(s => contrast(hex, tokens[s]) >= contrast(PHOSPHOR.tokens[key], PHOSPHOR.tokens[s]))
    let lift = 0
    let hex = shift(key, to)
    while (!clears(hex) && lift < 0.05) hex = shift(key, to, lift += 0.002)
    return hex
  }
  for (const key of SURFACE_TINTED) if (!SURFACES.includes(key)) tokens[key] = held(key, hue.surface)
  for (const key of ACCENT_TINTED) tokens[key] = held(key, hue.accent)
  tokens.accent = spec.accent
  Object.assign(tokens, spec.tokens)
  return { id: spec.id, label: spec.label, blurb: spec.blurb, tokens, scale: spec.scale ?? accentScale(spec.accent) }
}

// The presets below are DRAFTS: derived, gated by tests/theme.test.mjs, not yet tuned by eye.

/** P3 amber phosphor on warm black. */
const AMBER = derive({
  id: 'amber',
  label: 'AMBER',
  blurb: 'amber phosphor on warm black',
  accent: '#ffb000',
  tokens: {
    // The accent sits on warn's own hue, so warn moves up to a lemon the eye can tell from it;
    // ember (30° off) and danger (50°) keep theirs.
    warn: '#f0e26a'
  }
})

/** Ice-blue phosphor on cool black — the VT220 look. */
const ICE = derive({
  id: 'ice',
  label: 'ICE',
  blurb: 'ice-blue phosphor on cool black',
  accent: '#6ec8ff'
})

/** White phosphor on neutral black — the monochrome one; the accent's near-zero chroma makes
 * every derived surface a plain grey. */
const WHITE = derive({
  id: 'white',
  label: 'WHITE',
  blurb: 'white phosphor on neutral black',
  accent: '#e8edf0'
})

/** The corporate pair: PMS 716 orange as the accent over surfaces tinted with PMS 525 purple. */
const EMKAY = derive({
  id: 'emkay',
  label: 'EMKAY',
  blurb: 'corporate orange on purple-black',
  accent: '#f68820',
  tint: '#4f286c',
  tokens: {
    // Ember sits a few degrees off the orange accent, so it moves to a hot pink — still heat, and
    // at home beside the purple — while warn and danger keep theirs.
    ember: '#e8609a'
  }
})

/** The pair the other way up: purple accent over orange-tinted surfaces. PMS 525 as printed
 * (#4f286c) is 1.8:1 on a near-black page — unreadable as link and label text — so the accent is
 * its hue lifted to 6.5:1; the deep purple itself shows in the derived accent faces and bands. */
const EMKAY_INVERTED = derive({
  id: 'emkay-inverted',
  label: 'EMKAY INVERTED',
  blurb: 'corporate purple on orange-black',
  accent: '#b27cdf',
  tint: '#f68820'
})

export const THEME_LIST: readonly ThemePreset[] = [PHOSPHOR, AMBER, ICE, WHITE, EMKAY, EMKAY_INVERTED]
export const PRESETS = Object.fromEntries(THEME_LIST.map(p => [p.id, p])) as Record<ThemeId, ThemePreset>

/** The `html[data-theme]` block for one preset. */
export function themeCss(p: ThemePreset): string {
  const vars = [
    ...TOKEN_KEYS.map(k => `  --color-${k}: ${p.tokens[k]};`),
    ...SCALE_STEPS.map(s => `  --color-phosphor-${s}: ${p.scale[s]};`)
  ]
  return `html[data-theme="${p.id}"] {\n${vars.join('\n')}\n}\n`
}

/** app/assets/css/themes.css in full: every preset but the default, which main.css already is. */
export function themesCss(): string {
  const header = [
    '/* GENERATED by scripts/theme/build-themes-css.mjs from shared/utils/themePresets.ts — do not edit.',
    '   Regenerate with `pnpm theme:css`; tests/theme.test.mjs fails while this file is stale.',
    '   Each block overrides the @theme tokens in main.css (phosphor, the default) for one preset;',
    '   `html[data-theme]` outranks Tailwind\'s `:root`, so the utilities follow. */',
    ''
  ].join('\n')
  return header + THEME_LIST.filter(p => p.id !== DEFAULT_THEME).map(themeCss).join('\n')
}
