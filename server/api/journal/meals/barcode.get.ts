import { normalizeBarcode, offFigures, type OffFigures, type OffProduct } from '#shared/utils/openFoodFacts'

// A barcode → the product's label figures from Open Food Facts (audit #43 item 81), to PREFILL
// the hand-entry form: nothing is stored here, and what the owner saves after checking it is a
// 'manual' row like any other. Owner-only: it is the owner's form, and it makes an outbound
// request. Only the barcode leaves the site — no session, no meal text.

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = 'code,product_name,brands,serving_size,nutriments'

export default defineEventHandler(async (event): Promise<{ found: boolean, code: string, figures: OffFigures | null }> => {
  requireOwner(event)
  const code = normalizeBarcode(String(getQuery(event).code ?? ''))
  if (!code) throw createError({ statusCode: 400, message: 'A barcode is 8, 12, 13 or 14 digits' })

  let body: { status?: number, product?: OffProduct }
  try {
    body = await $fetch(`${OFF_URL}/${code}.json`, {
      query: { fields: FIELDS },
      // Open Food Facts asks every client to name itself.
      headers: { 'User-Agent': 'jim.klonow.ski/1.0 (personal food log; label prefill)' },
      timeout: 8000
    })
  }
  catch (err) {
    // A 404 is OFF's "no such product"; anything else is their side or the network.
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 404) return { found: false, code, figures: null }
    throw createError({ statusCode: 502, message: 'Open Food Facts did not answer — type the figures from the label instead.' })
  }
  if (body?.status === 0 || !body?.product) return { found: false, code, figures: null }
  return { found: true, code, figures: offFigures(body.product) }
})
