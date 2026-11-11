// A photo of a product barcode → its digits (audit #43 item 81). Loaded lazily, only when SCAN
// is pressed: the decoder is zxing-wasm, about 1 MB of WebAssembly served from this site's own
// assets (the CSP allows no other origin, and 'wasm-unsafe-eval' is what lets it compile).
// Safari has no BarcodeDetector, so this is the path an iPhone takes; a browser that has one
// uses it first and never downloads the wasm.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { normalizeBarcode } from '#shared/utils/openFoodFacts'

/** A phone photo is 12 MP; the bars resolve fine at this size and decode in a fraction of the time. */
const MAX_SIDE = 1600

let prepared = false

/** The photo as pixels, scaled so its longer side is at most MAX_SIDE. */
async function pixelsOf(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** The first UPC/EAN in the photo as plain digits, or null when none could be read. */
export async function scanBarcode(file: Blob): Promise<string | null> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
  if (Native) {
    try {
      const found = await new Native({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }).detect(await createImageBitmap(file))
      const code = found.map(b => normalizeBarcode(b.rawValue)).find(Boolean)
      if (code) return code
    }
    catch {
      // Fall through to the wasm decoder: a native detector that throws is no answer.
    }
  }
  if (!prepared) {
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
    prepared = true
  }
  const results = await readBarcodes(await pixelsOf(file), { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 })
  return results.map(r => normalizeBarcode(r.text)).find(Boolean) ?? null
}
