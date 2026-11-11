// Open Food Facts → the hand-entry figures form (audit #43 item 81): a product's barcode looks
// up its label figures, which PREFILL the form on a meal's chip; the owner checks them against
// the package and saves, so the stored row is still a hand entry (source 'manual'), never an
// unreviewed import. This is the pure half: the barcode's shape and the product → per-serving
// figures mapping. The fetch lives in server/api/journal/meals/barcode.get.ts.

/** The digits of a UPC/EAN (8, 12, 13 or 14), or null. Spaces and dashes are tolerated. */
export function normalizeBarcode(text: string | null | undefined): string | null {
  const digits = (text ?? '').replace(/[\s-]/g, '')
  return /^\d{8}$|^\d{12,14}$/.test(digits) ? digits : null
}

/** The fields this reads from an Open Food Facts v2 product. */
export interface OffProduct {
  code?: string
  product_name?: string
  brands?: string
  serving_size?: string
  nutriments?: Record<string, number | string | undefined>
}

export interface OffFigures {
  /** "Chomps Original Beef Stick — Chomps" */
  name: string
  /** What the figures describe: the label's serving ("1 stick (32 g)"), or "100 g" when the product has no per-serving data. */
  per: string
  /** 'serving' = the label's own serving; '100g' = per 100 g, which the owner must scale. */
  basis: 'serving' | '100g'
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  /** null when the product carries neither sodium nor salt. */
  sodium_mg: number | null
  fiber_g: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The product's figures per serving when it has them, else per 100 g; null when it has no
 * energy figure at all (a product page with only a name). Sodium comes in grams (× 1000), or
 * is derived from salt (÷ 2.5) when only salt is given.
 */
export function offFigures(product: OffProduct | null | undefined): OffFigures | null {
  const n = product?.nutriments
  if (!n) return null
  const num = (key: string): number | null => {
    const v = n[key]
    const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
    return Number.isFinite(x) && x >= 0 ? x : null
  }
  const basis: OffFigures['basis'] = num('energy-kcal_serving') != null ? 'serving' : '100g'
  const s = basis === 'serving' ? '_serving' : '_100g'
  const kcal = num(`energy-kcal${s}`)
  if (kcal == null) return null
  const sodiumG = num(`sodium${s}`) ?? (num(`salt${s}`) != null ? num(`salt${s}`)! / 2.5 : null)
  const fiber = num(`fiber${s}`)
  const name = [product?.product_name?.trim(), product?.brands?.split(',')[0]?.trim()].filter(Boolean).join(' — ') || `barcode ${product?.code ?? ''}`.trim()
  return {
    name,
    per: basis === 'serving' ? (product?.serving_size?.trim() || '1 serving') : '100 g',
    basis,
    kcal: Math.round(kcal),
    protein_g: round1(num(`proteins${s}`) ?? 0),
    carbs_g: round1(num(`carbohydrates${s}`) ?? 0),
    fat_g: round1(num(`fat${s}`) ?? 0),
    sodium_mg: sodiumG != null ? Math.round(sodiumG * 1000) : null,
    fiber_g: fiber != null ? round1(fiber) : null
  }
}
