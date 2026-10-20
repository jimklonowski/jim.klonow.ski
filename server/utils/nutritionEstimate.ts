import type { EstimateConfidence, EstimateIndex, MealEstimate } from '#shared/utils/nutrition'
import { indexEstimates } from '#shared/utils/nutrition'
import { mealKey } from '#shared/utils/mealKey'
import { libraryLookup } from '#shared/utils/mealLibrary'

// Meal text → calories and macros from the model, once per distinct meal, cached in
// meal_estimates (migration 0012). This is the FALLBACK: the owner asks for it explicitly, and
// meals the code library (shared/utils/mealLibrary.ts) covers or a hand entry already holds are
// skipped, so a call only ever spends tokens on genuinely unknown strings. A hand correction
// (source 'manual') is never overwritten here — the upsert's WHERE keeps it.

// Structured-output schema: the response text is guaranteed to parse into this shape. Only
// `confidence` is an enum; nothing is nullable, so it sits well inside the accepted subset.
// No `minimum` on the numbers: the API rejects it for integer/number properties (400,
// "property 'minimum' is not supported", 2026-10-20) — the handler clamps to zero instead.
const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kcal: { type: 'integer' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          assumptions: { type: 'string' }
        },
        required: ['text', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence', 'assumptions'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
}

interface EstimateItem {
  text: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: EstimateConfidence
  assumptions: string
}

function buildPrompt(texts: string[]): string {
  return `Estimate the nutrition of each meal description below. They are entries from one person's daily food journal (US Midwest; chain restaurants, Costco and simple home cooking are typical). Return exactly one item per input, in the same order, with "text" echoing the input verbatim.

Rules:
- Estimate what was eaten as described, as ONE eating occasion. Honor quantity prefixes ("2 x", "2x", "two") by multiplying.
- Named chain or packaged items: use the chain's published nutrition for the standard item (e.g. a Costco food-court slice, a McDonald's double cheeseburger with a medium fries, a Chipotle chicken bowl with rice, beans, salsa and cheese, a Steak 'n Shake double with tots).
- A "protein shake" / "protein + creatine" / "protein + creatine shake" = one scoop of whey in water (about 120 kcal, 25 g protein); creatine adds nothing.
- Home meals without amounts: a normal adult plate (about 6 oz of the protein, 1 cup of the starch, a serving of vegetables). "Leftover X" = one normal portion of X. A named fruit = one typical serving.
- Snack-sized text ("sourdough snack", "beef sticks", "mozzarella sticks") = a snack portion, not a meal.
- confidence: "high" for chain or packaged items with published figures, "medium" for home meals and generic items, "low" for vague or unusual text.
- assumptions: one short clause naming the portion you assumed (e.g. "2 slices Costco cheese pizza"); an empty string when the text left nothing to assume.
- kcal to the nearest 10; grams as whole numbers.

Meals:
${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
}

/** Every cached estimate, keyed — '' rows on a database without the table yet (the sandbox before its migration). */
export async function loadEstimateIndex(db: D1Database): Promise<EstimateIndex> {
  try {
    const { results } = await db.prepare('SELECT * FROM meal_estimates').all<Record<string, unknown>>()
    return indexEstimates((results ?? []).map(parseEstimateRow))
  }
  catch {
    return new Map()
  }
}

export function parseEstimateRow(r: Record<string, unknown>): MealEstimate {
  return {
    key: r.key as string,
    text: r.text as string,
    kcal: Number(r.kcal),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
    confidence: (r.confidence as EstimateConfidence) ?? 'medium',
    assumptions: (r.assumptions as string | null) ?? null,
    source: r.source === 'manual' ? 'manual' : 'ai',
    model: (r.model as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string
  }
}

/** The rows for a set of keys, in no particular order. */
export async function estimatesForKeys(db: D1Database, keys: string[]): Promise<MealEstimate[]> {
  if (!keys.length) return []
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ')
  const { results } = await db.prepare(`SELECT * FROM meal_estimates WHERE key IN (${placeholders})`).bind(...keys).all<Record<string, unknown>>()
  return (results ?? []).map(parseEstimateRow)
}

/**
 * Estimates for `texts`: cached rows where they exist, one model call for the rest, the new rows
 * written and returned together. Texts that normalize to the same key are estimated once.
 */
export async function estimateMeals(db: D1Database, texts: string[]): Promise<MealEstimate[]> {
  const byKey = new Map<string, string>()
  for (const t of texts) {
    const key = mealKey(t)
    if (key && !byKey.has(key)) byKey.set(key, t.trim())
  }
  const keys = [...byKey.keys()]
  const cached = await estimatesForKeys(db, keys)
  const have = new Set(cached.map(r => r.key))
  // Not cached AND not in the code library — the library answers those without a token spent.
  const todo = keys.filter(k => !have.has(k)).map(k => byKey.get(k)!).filter(t => !libraryLookup(t))
  if (!todo.length) return cached

  const prompt = buildPrompt(todo)
  const startedAt = Date.now()
  let response
  try {
    response = await createAnthropic().messages.create({
      model: AI_MODELS.nutrition,
      // Thinking plus output share this cap; 50 short items are a few thousand tokens of JSON.
      max_tokens: 16_000,
      output_config: { format: { type: 'json_schema', schema: ESTIMATE_SCHEMA } },
      messages: [{ role: 'user', content: prompt }]
    })
  }
  catch (err) {
    throw aiError(err, 'nutrition')
  }
  logAiUsage('nutrition', AI_MODELS.nutrition, response.usage, response.stop_reason, startedAt)
  assertCompleted(response.stop_reason, 'nutrition')

  const raw = textOf(response.content)
  let parsed: { items: EstimateItem[] }
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    throw createError({ statusCode: 502, message: 'The nutrition estimate came back malformed — nothing was saved.' })
  }
  if (!Array.isArray(parsed?.items)) {
    throw createError({ statusCode: 502, message: 'The nutrition estimate returned no items — nothing was saved.' })
  }

  // Match by the echoed text first (the schema asks for it verbatim), by position as a fallback.
  const now = new Date().toISOString()
  const hash = promptHash(prompt)
  const rows: MealEstimate[] = []
  todo.forEach((text, i) => {
    const key = mealKey(text)
    const item = parsed.items.find(it => mealKey(it.text) === key) ?? parsed.items[i]
    if (!item || !Number.isFinite(item.kcal)) return
    rows.push({
      key,
      text,
      kcal: Math.max(0, Math.round(item.kcal)),
      protein_g: Math.max(0, Math.round(item.protein_g * 10) / 10),
      carbs_g: Math.max(0, Math.round(item.carbs_g * 10) / 10),
      fat_g: Math.max(0, Math.round(item.fat_g * 10) / 10),
      confidence: item.confidence ?? 'medium',
      assumptions: item.assumptions?.trim() || null,
      source: 'ai',
      model: AI_MODELS.nutrition,
      created_at: now,
      updated_at: now
    })
  })

  if (rows.length) {
    // A manual row that appeared since the SELECT above stays manual.
    await db.batch(rows.map(r => db.prepare(`
      INSERT INTO meal_estimates (key, text, kcal, protein_g, carbs_g, fat_g, confidence, assumptions, source, model, prompt_hash, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ai', ?9, ?10, ?11, ?11)
      ON CONFLICT(key) DO UPDATE SET
        text = excluded.text, kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g, confidence = excluded.confidence, assumptions = excluded.assumptions,
        model = excluded.model, prompt_hash = excluded.prompt_hash, updated_at = excluded.updated_at
      WHERE meal_estimates.source != 'manual'
    `).bind(r.key, r.text, r.kcal, r.protein_g, r.carbs_g, r.fat_g, r.confidence, r.assumptions, r.model, hash, now)))
  }
  return [...cached, ...rows]
}
