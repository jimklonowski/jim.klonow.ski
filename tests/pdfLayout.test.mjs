// The in-app PDF viewer's arithmetic (shared/utils/pdfLayout.ts): how big a page's canvas is, and
// where pdf.js is told to fetch the files it does not bundle — which must be the folders
// nuxt.config.ts publishes, and must exist in the installed package.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { MAX_CANVAS_PIXELS, MAX_DENSITY, PDF_ASSET_BASE, PDF_ASSET_DIRS, pageScale, pdfAssetUrls } from '../shared/utils/pdfLayout.ts'

const LETTER = [612, 792]

test('a page is drawn at the screen\'s density, never over three, and never over twelve megapixels', () => {
  const [w, h] = LETTER
  assert.equal(pageScale(w, h, 358, 3), (358 * 3) / w, 'a phone: 358 CSS px at 3x')
  assert.equal(pageScale(w, h, 358, 4), (358 * MAX_DENSITY) / w, 'a 4x screen is drawn at 3x')
  assert.equal(pageScale(w, h, 880, 1), 880 / w)
  assert.equal(pageScale(w, h, 880, 0), 880 / w, 'no density reads as 1')
  // A wide sheet on a dense screen would be 3.4 MP x 9: capped.
  const big = pageScale(w, h, 1800, 3)
  const pixels = w * h * big * big
  assert.ok(Math.abs(pixels - MAX_CANVAS_PIXELS) < 1, `${pixels}`)
  assert.ok(big < (1800 * 3) / w)
  // What a phone page costs: about 1.5 MP, 6 MB of backing store — five of them in view is nothing.
  const phone = pageScale(w, h, 358, 3)
  assert.ok(w * h * phone * phone < 1_600_000)
})

test('pdf.js is pointed at this site\'s own copies of its on-demand files, by version, each with its trailing slash', () => {
  const urls = pdfAssetUrls('6.5.438')
  assert.deepEqual(urls, {
    cMapUrl: '/pdfjs/6.5.438/cmaps/',
    standardFontDataUrl: '/pdfjs/6.5.438/standard_fonts/',
    wasmUrl: '/pdfjs/6.5.438/wasm/',
    iccUrl: '/pdfjs/6.5.438/iccs/'
  })
  // Every URL is one of the published folders, and nothing published goes unused.
  const used = Object.values(urls).map(u => u.slice(`${PDF_ASSET_BASE}/6.5.438/`.length, -1)).sort()
  assert.deepEqual(used, [...PDF_ASSET_DIRS].sort())
})

test('the installed pdfjs-dist has the folders that are published, and the decoders a scanned report needs', () => {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('pdfjs-dist/package.json'))
  for (const dir of PDF_ASSET_DIRS) assert.ok(existsSync(join(root, dir)), `pdfjs-dist/${dir}`)
  for (const file of ['wasm/openjpeg.wasm', 'wasm/jbig2.wasm', 'wasm/qcms_bg.wasm', 'standard_fonts/LiberationSans-Regular.ttf']) {
    assert.ok(existsSync(join(root, file)), `pdfjs-dist/${file} — a pdf.js upgrade moved it: check pdfAssetUrls`)
  }
  // The renderer and the config agree on where they are served: both read these constants.
  const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
  assert.match(config, /PDF_ASSET_DIRS\.map\(/)
  assert.match(config, /baseURL: `\$\{PDF_ASSET_BASE\}\/\$\{pdfjsVersion\}\/\$\{dir\}`/)
  const renderer = readFileSync(new URL('../app/utils/pdfRender.ts', import.meta.url), 'utf8')
  assert.match(renderer, /pdfAssetUrls\(version\)/)
})
