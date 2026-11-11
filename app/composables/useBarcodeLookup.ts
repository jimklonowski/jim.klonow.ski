import { normalizeBarcode, type OffFigures } from '#shared/utils/openFoodFacts'

export interface BarcodeNote {
  text: string
  tone: 'ok' | 'warn'
}

/**
 * The barcode half of a figures form (audit #43 item 81) — a meal's figures and a drink's label
 * share it. The digits (typed, pasted, or read off a photo of the barcode) go to
 * /api/journal/meals/barcode, which asks Open Food Facts; `apply` puts the answer into the
 * caller's form and returns the line that says where it came from. Nothing is saved here: the
 * owner still checks the figures against the package and presses Save.
 */
export function useBarcodeLookup(apply: (figures: OffFigures) => BarcodeNote) {
  const barcode = ref('')
  const lookingUp = ref(false)
  const barcodeNote = ref<BarcodeNote | null>(null)
  const barcodeValid = computed(() => normalizeBarcode(barcode.value) != null)
  // Shown once mounted (the scanner needs a browser): a photo of the barcode is decoded on the
  // device — natively where the browser can, else by the lazily loaded zxing-wasm reader
  // (app/utils/barcodeScan.ts), which is what an iPhone uses.
  const canScan = ref(false)
  onMounted(() => {
    canScan.value = true
  })

  async function lookUp() {
    const code = normalizeBarcode(barcode.value)
    if (!code || lookingUp.value) return
    lookingUp.value = true
    barcodeNote.value = null
    try {
      const res = await $fetch<{ found: boolean, figures: OffFigures | null }>('/api/journal/meals/barcode', { query: { code } })
      if (!res.found) barcodeNote.value = { text: 'Open Food Facts has no product with that barcode — type the figures from the label.', tone: 'warn' }
      else if (!res.figures) barcodeNote.value = { text: 'The product is listed but carries no nutrition figures — type them from the label.', tone: 'warn' }
      else barcodeNote.value = apply(res.figures)
    }
    catch (err) {
      barcodeNote.value = { text: extractErrorMessage(err, 'The lookup failed — type the figures from the label.'), tone: 'warn' }
    }
    finally {
      lookingUp.value = false
    }
  }

  /** A photo of the barcode → its digits → the lookup. */
  async function onScanFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    lookingUp.value = true
    barcodeNote.value = { text: 'Reading the barcode…', tone: 'ok' }
    try {
      // Loaded on first use: the decoder is ~1 MB and most visits never scan.
      const { scanBarcode } = await import('~/utils/barcodeScan')
      const code = await scanBarcode(file)
      lookingUp.value = false
      if (!code) {
        barcodeNote.value = { text: 'No barcode could be read from that photo — try again closer and square-on, or type the digits.', tone: 'warn' }
        return
      }
      barcode.value = code
      await lookUp()
    }
    catch {
      lookingUp.value = false
      barcodeNote.value = { text: 'That photo could not be read — type the digits instead.', tone: 'warn' }
    }
  }

  function resetBarcode() {
    barcode.value = ''
    barcodeNote.value = null
  }

  return { barcode, lookingUp, barcodeNote, barcodeValid, canScan, lookUp, onScanFile, resetBarcode }
}
