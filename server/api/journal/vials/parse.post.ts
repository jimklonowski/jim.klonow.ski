import { KNOWN_COMPOUNDS } from '../../../../app/data/journal'
import { normalizeForm, isPillForm } from '#shared/utils/vialForm'
import type { ParsedVial } from '#shared/types/journal'

// Freeform stockpile text -> proposed sealed rows for the inventory confirm table.
// Owner-only like every Claude-spending endpoint (digests, lab summaries).

const MAX_TEXT_LENGTH = 4000

// Structured-output schema — the API guarantees the response text is JSON matching this.
// unit_count is a plain integer (0 = not a pill bottle) rather than nullable to stay inside the
// schema subset structured outputs accept; the handler maps 0 back to null.
const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    vials: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          compound: { type: 'string' },
          form: { type: 'string', enum: ['vial', 'tablet', 'capsule'] },
          vial_amount: { type: 'number' },
          vial_unit: { type: 'string', enum: ['mg', 'mcg', 'iu'] },
          unit_count: { type: 'integer', minimum: 0 },
          quantity: { type: 'integer', minimum: 1 },
          notes: { type: 'string' },
          assumption: { type: 'string' }
        },
        required: ['compound', 'form', 'vial_amount', 'vial_unit', 'unit_count', 'quantity', 'notes', 'assumption'],
        additionalProperties: false
      }
    }
  },
  required: ['vials'],
  additionalProperties: false
}

function buildPrompt(text: string): string {
  return `Parse this freeform description of a personal peptide/hormone stockpile into inventory rows.

Canonical compound names — when a product matches one of these, use it EXACTLY as written here:
${KNOWN_COMPOUNDS.join(', ')}

Common colloquial mappings: "primo"/"primobolan" (injectable) = Methenolone Enanthate, oral primo = Methenolone Acetate, "test cyp"/"test c" = Testosterone Cypionate, "test e" = Testosterone Enanthate, "anavar"/"var" = Oxandrolone, "reta" = Retatrutide, "sema" = Semaglutide, "tirz" = Tirzepatide, "GH" = HGH. A product with genuinely no match keeps its name as written.

Rules:
- One row per distinct product (compound + strength + form). Do not invent products that are not in the text.
- form: "vial" for lyophilized powder, injectable oils/solutions and injector pens; "tablet" or "capsule" for pill bottles (default to "tablet" when the text just says pills/tabs/orals).
- vial_amount is the TOTAL content of ONE unit of the product (one vial, one pen, one whole bottle of pills), in vial_unit.
- Injectable oils given as a concentration (e.g. "200mg/ml") with no stated vial volume: assume a 10 mL vial and record that in assumption.
- Pill bottles: one row per strength; unit_count = pills per bottle and vial_amount = unit_count x per-pill strength (100 x 25mg tabs -> unit_count 100, vial_amount 2500), so logged doses deplete the bottle. Unknown count: assume 100 and record that in assumption. unit_count is 0 for anything that is not a pill bottle.
- Lyophilized peptide powder: one row per compound + vial size, in the labeled unit. If the text names powders without sizes, emit one row per compound with vial_amount 0 and an assumption asking for the size — never guess peptide vial sizes.
- quantity = how many identical units are on hand. Unknown: 1, recorded in assumption.
- notes: worth-keeping facts from the text (form like "injector pen", storage). assumption: ONLY what you guessed beyond the text; empty string when nothing was assumed.

Stockpile text:
${text}`
}

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<{ text?: string }>(event)
  const text = body?.text?.trim()
  if (!text) throw createError({ statusCode: 400, message: 'Nothing to parse' })
  if (text.length > MAX_TEXT_LENGTH) {
    throw createError({ statusCode: 400, message: `Text too long (${MAX_TEXT_LENGTH} char max)` })
  }

  const startedAt = Date.now()
  let response
  try {
    response = await createAnthropic().messages.create({
      model: AI_MODELS.parse,
      // This model runs adaptive thinking by default and max_tokens caps thinking + output
      // together: at 4096 a long stockpile could spend the whole budget reasoning and return
      // truncated JSON, which JSON.parse then threw on as an unhandled 500. Low effort suits a
      // mapping task, and the headroom means the cap is no longer what ends the response.
      max_tokens: 16_000,
      output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA }, effort: 'low' },
      messages: [{ role: 'user', content: buildPrompt(text) }]
    })
  }
  catch (err) {
    throw aiError(err, 'parse')
  }
  logAiUsage('parse', AI_MODELS.parse, response.usage, response.stop_reason, startedAt)
  assertCompleted(response.stop_reason, 'parse')

  const raw = textOf(response.content)
  if (!raw) throw createError({ statusCode: 502, message: 'Parse produced no output — try rephrasing' })

  // Raw model output follows PARSE_SCHEMA (unit_count 0 = not a bottle); the response is ParsedVial.
  let parsed: { vials: (Omit<ParsedVial, 'unit_count'> & { unit_count: number })[] }
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    throw createError({ statusCode: 502, message: 'Parse returned malformed output — try rephrasing' })
  }
  if (!Array.isArray(parsed?.vials)) {
    throw createError({ statusCode: 502, message: 'Parse returned no rows — try rephrasing' })
  }
  const vials: ParsedVial[] = parsed.vials.map((v) => {
    const form = normalizeForm(v.form)
    return { ...v, form, unit_count: isPillForm(form) && v.unit_count > 0 ? v.unit_count : null }
  })
  return { vials }
})
