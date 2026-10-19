// The SIZE setting behind the DISPLAY picker's third group: a factor every --text-* token in
// main.css is a multiple of (the reading ramp 1:1, the display figures at half rate — see the
// type ramp there). Data in one place for the generated app/assets/css/themes.css (an
// `html[data-scale]` block per non-default step), useTheme() and the picker, and
// tests/theme.test.mjs.

export const SCALE_IDS = ['s', 'm', 'l', 'xl'] as const
export type ScaleId = (typeof SCALE_IDS)[number]
export const DEFAULT_SCALE: ScaleId = 'm'

export function isScaleId(v: unknown): v is ScaleId {
  return typeof v === 'string' && (SCALE_IDS as readonly string[]).includes(v)
}

export interface ScalePreset {
  id: ScaleId
  /** Picker label. */
  label: string
  /** One line under the label. */
  blurb: string
  /** What --type-scale becomes. 1 is the design as drawn. */
  factor: number
}

export const SCALE_LIST: readonly ScalePreset[] = [
  { id: 's', label: 'S', blurb: 'compact', factor: 0.92 },
  { id: 'm', label: 'M', blurb: 'as designed', factor: 1 },
  { id: 'l', label: 'L', blurb: 'larger', factor: 1.12 },
  { id: 'xl', label: 'XL', blurb: 'largest', factor: 1.25 }
]

export const SCALES = Object.fromEntries(SCALE_LIST.map(s => [s.id, s])) as Record<ScaleId, ScalePreset>

/** The `html[data-scale]` block for one step. */
export function scaleCss(s: ScalePreset): string {
  return `html[data-scale="${s.id}"] {\n  --type-scale: ${s.factor};\n}\n`
}

/** Every step but the default, which main.css already is. */
export function scalesCss(): string {
  return SCALE_LIST.filter(s => s.id !== DEFAULT_SCALE).map(scaleCss).join('\n')
}
