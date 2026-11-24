// The arithmetic of the in-app PDF viewer (app/utils/pdfRender.ts), kept apart from pdf.js and the
// DOM so the plain-node tests can run it.

/** Backing pixels per CSS pixel: sharp on a 3× phone without a canvas iOS refuses to allocate. */
export const MAX_DENSITY = 3
/** The most pixels one page's canvas may hold (about 48 MB of backing store). */
export const MAX_CANVAS_PIXELS = 12_000_000

/**
 * The scale a page is drawn at: `cssWidth` CSS pixels wide at the screen's density (never over
 * MAX_DENSITY), brought down when that would make a canvas of more than MAX_CANVAS_PIXELS.
 */
export function pageScale(baseWidth: number, baseHeight: number, cssWidth: number, devicePixelRatio: number): number {
  let scale = (cssWidth * Math.min(devicePixelRatio || 1, MAX_DENSITY)) / baseWidth
  const pixels = baseWidth * baseHeight * scale * scale
  if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels)
  return scale
}

/**
 * Where pdf.js fetches what it does not carry in its own bundle, by its version: the wasm image
 * decoders (JPEG 2000 and JBIG2 — what a scanner or a fax writes — and the colour engine), the
 * character maps, the standard fonts a PDF may name without embedding, and the ICC profiles.
 * nuxt.config.ts publishes those four folders of the pdfjs-dist package at these paths; the
 * version in the path means a new pdf.js never meets an old cached decoder. Each ends in a slash,
 * as pdf.js asks.
 */
export function pdfAssetUrls(version: string): { cMapUrl: string, standardFontDataUrl: string, wasmUrl: string, iccUrl: string } {
  const base = `${PDF_ASSET_BASE}/${version}`
  return { cMapUrl: `${base}/cmaps/`, standardFontDataUrl: `${base}/standard_fonts/`, wasmUrl: `${base}/wasm/`, iccUrl: `${base}/iccs/` }
}

export const PDF_ASSET_BASE = '/pdfjs'
/** The folders of the pdfjs-dist package published under PDF_ASSET_BASE/<version>/ (nuxt.config.ts). */
export const PDF_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const
