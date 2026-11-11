import { indexDrinkLabels, type DrinkLabel, type DrinkLabels } from '#shared/utils/drinks'

// The owner's drink labels (drink_labels, migration 0024) for the server: the row parser the
// list endpoint shares, and the loader the estimate index carries them from — so the digests and
// the ask sheet sum a labelled drink from its label, like the pages do.

export function parseDrinkLabelRow(r: Record<string, unknown>): DrinkLabel {
  return {
    key: r.key as string,
    name: r.name as string,
    serving_oz: Number(r.serving_oz),
    kcal: Number(r.kcal),
    caffeine_mg: Number(r.caffeine_mg),
    sodium_mg: Number(r.sodium_mg),
    sugar_g: Number(r.sugar_g),
    barcode: (r.barcode as string | null) ?? null,
    updated_at: r.updated_at as string
  }
}

/** Every label on file, by key. Empty before migration 0024 — only that; another failure propagates. */
export async function loadDrinkLabels(db: D1Database): Promise<DrinkLabels> {
  try {
    const { results } = await db.prepare('SELECT * FROM drink_labels').all<Record<string, unknown>>()
    return indexDrinkLabels((results ?? []).map(parseDrinkLabelRow))
  }
  catch (err) {
    if (isMissingTable(err)) return new Map()
    throw err
  }
}
