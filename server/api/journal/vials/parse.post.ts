import Anthropic from '@anthropic-ai/sdk'
import { KNOWN_COMPOUNDS } from '../../../../app/data/journal'

// Freeform stockpile text -> proposed sealed-vial rows for the inventory confirm table.
// Owner-only like every Claude-spending endpoint (digests, lab summaries).

export interface ParsedVial {
  compound: string
  vial_amount: number
  vial_unit: 'mg' | 'mcg' | 'iu'
  quantity: number
  notes: string
  assumption: string
}

const MAX_TEXT_LENGTH = 4000

// Structured-output schema — the API guarantees the response text is JSON matching this.
const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    vials: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          compound: { type: 'string' },
          vial_amount: { type: 'number' },
          vial_unit: { type: 'string', enum: ['mg', 'mcg', 'iu'] },
          quantity: { type: 'integer', minimum: 1 },
          notes: { type: 'string' },
          assumption: { type: 'string' }
        },
        required: ['compound', 'vial_amount', 'vial_unit', 'quantity', 'notes', 'assumption'],
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
- vial_amount is the TOTAL content of ONE unit of the product (one vial, one pen, one bottle of tablets), in vial_unit.
- Injectable oils given as a concentration (e.g. "200mg/ml") with no stated vial volume: assume a 10 mL vial and record that in assumption.
- Tablets: one row per strength; vial_amount = tablet count x per-tablet strength, so logged doses deplete the bottle; put the count math in notes. Unknown count: assume 100 tablets and record that in assumption.
- Lyophilized peptide powder: one row per compound + vial size, in the labeled unit. If the text names powders without sizes, emit one row per compound with vial_amount 0 and an assumption asking for the size — never guess peptide vial sizes.
- quantity = how many identical units are on hand. Unknown: 1, recorded in assumption.
- notes: worth-keeping facts from the text (form like "injector pen", per-tab math, storage). assumption: ONLY what you guessed beyond the text; empty string when nothing was assumed.

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

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const anthropic = new Anthropic({ apiKey })
  const response = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,
    output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(text) }]
  })

  const raw = response.content.find(b => b.type === 'text')?.text
  if (!raw) throw createError({ statusCode: 502, message: 'Parse produced no output — try rephrasing' })

  const parsed = JSON.parse(raw) as { vials: ParsedVial[] }
  return { vials: parsed.vials }
})
