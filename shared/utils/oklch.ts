// OKLCH ⇄ sRGB hex, for deriving theme presets (shared/utils/themePresets.ts) and the contrast
// gates in tests/theme.test.mjs. Perceptual lightness is what makes "the same palette at another
// hue" come out with the same contrast ratios; sRGB hue rotation would not. Plain TS, no imports,
// so the node test runner and scripts/theme/build-themes-css.mjs can load it.
//
// Matrices from Björn Ottosson's reference implementation (https://bottosson.github.io/posts/oklab/).

export interface Oklch {
  /** 0 (black) – 1 (white). */
  L: number
  /** 0 (grey) – ~0.37 at the sRGB gamut's most saturated corner. */
  C: number
  /** Degrees, 0–360. Meaningless when C is ~0. */
  h: number
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

// (Named apart from pixelCanvas.ts's hexToRgb: Nuxt auto-imports every export under shared/utils,
// so two exports with one name would shadow each other.)

/** `#rrggbb` → [r, g, b] in 0–255. Throws on anything else: a token with a bad value is a bug. */
export function hexChannels(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`)
  const n = parseInt(m[1]!, 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

export function channelsToHex([r, g, b]: [number, number, number]): string {
  const clamp = (c: number) => Math.min(255, Math.max(0, Math.round(c)))
  return `#${[r, g, b].map(c => clamp(c).toString(16).padStart(2, '0')).join('')}`
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexChannels(hex).map(c => srgbToLinear(c / 255)) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

/** Linear sRGB channels for an OKLCH color, unclamped — out of gamut when any falls outside 0–1. */
function oklchToLinear({ L, C, h }: Oklch): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ]
}

/**
 * OKLCH → `#rrggbb`. A color outside the sRGB gamut (a saturated amber at high lightness, say)
 * is brought in by reducing chroma at the same lightness and hue, so a derived palette keeps its
 * lightness steps — and so its contrast ratios — rather than clipping to a different tone.
 */
export function oklchToHex(color: Oklch): string {
  let C = color.C
  let rgb = oklchToLinear({ ...color, C })
  const inGamut = (v: number[]) => v.every(c => c >= -0.0005 && c <= 1.0005)
  for (let i = 0; i < 40 && !inGamut(rgb); i++) {
    C *= 0.92
    rgb = oklchToLinear({ ...color, C })
  }
  return channelsToHex(rgb.map(c => linearToSrgb(Math.min(1, Math.max(0, c))) * 255) as [number, number, number])
}

/** WCAG 2 relative luminance of an sRGB hex. */
export function luminance(hex: string): number {
  const [r, g, b] = hexChannels(hex).map(c => srgbToLinear(c / 255)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio, 1–21. Order of the arguments does not matter. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Smallest angle between two hues, 0–180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
