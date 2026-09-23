// Request shapes for the write endpoints, as zod schemas.
//
// They live in shared/ rather than beside the handlers so they are plain data with no h3
// dependency: `pnpm test` loads them straight into node, and the client could reuse them for
// form validation later. The h3 glue that turns a failure into a 400 is server/utils/validate.ts.
//
// House rules for these schemas:
//   - every free-text field is length-bounded (an unbounded string is a free row-size attack,
//     and the demo sandbox is writable by anyone on the internet);
//   - every number is finite (JSON `NaN`/`Infinity` arrive as null, but a string "12" or an
//     object would otherwise bind straight into a REAL column);
//   - dates are real calendar days, so `ORDER BY date` and every `date >= ?` window hold;
//   - unknown keys are stripped rather than rejected, so an older client that still sends a
//     retired field keeps working.
import { z } from 'zod'
import { isIsoDate } from './time.ts'
import { DOSE_UNIT_VALUES } from '../types/journal.ts'

/** A real YYYY-MM-DD calendar day (rejects 2026-13-40, which `new Date()` would roll forward). */
export const zIsoDate = z.string().refine(isIsoDate, 'expected a YYYY-MM-DD date')

/** A 24-hour HH:MM clock time. The day form's time inputs and the soda widget both send this. */
export const zClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected an HH:MM time')

/** A database row id: SQLite rowids start at 1. */
export const zId = z.number().int().positive()

/** Bounded free text. Trailing/leading space is trimmed; `''` stays `''`. */
const zText = (max: number) => z.string().trim().max(max)

/** Bounded free text that stores NULL when blank or absent. */
const zOptText = (max: number) => zText(max).nullish().transform(v => v || null)

// Clearing a number input leaves `''`, not null: Vue's `v-model.number` only converts when
// parseFloat succeeds, and hands back the raw string when it doesn't. Every numeric field below
// is fed by such an input, so a blank one has to read as "absent" rather than as a type error —
// otherwise emptying a weight field would fail the whole save.
const blankAsAbsent = (v: unknown) => (v === '' ? undefined : v)

/** A finite number, or null when absent/blank. Still rejects "abc", NaN, objects. */
const zOptNum = z.preprocess(blankAsAbsent, z.number().finite().nullish()).transform(v => v ?? null)

/** A finite number with a fallback when absent/blank. */
const zNumWithDefault = (fallback: number, refine?: (s: z.ZodNumber) => z.ZodNumber) => {
  const base = z.number().finite()
  return z.preprocess(blankAsAbsent, (refine ? refine(base) : base).default(fallback))
}

/** A date column that may be empty. */
const zOptDate = zIsoDate.or(z.literal('')).nullish().transform(v => v || null)

// Dose units are stored lowercase; the picker has always sent lowercase, but a hand-edited or
// imported row can carry "IU", and rejecting that would block re-saving a day that already exists.
const zDoseUnit = z.string().transform(s => s.toLowerCase()).pipe(z.enum(DOSE_UNIT_VALUES))

// --- journal day ---

// `compound` may be '' and `dose` may be 0: "+ add" creates exactly that blank row, and a day
// is often saved with one still half-filled. Those stay permitted — this schema is here to keep
// the column types honest, not to become a form validator that blocks the daily log.
export const zPeptideEntry = z.object({
  time: zText(5).catch('').default(''),
  compound: zText(80),
  dose: zNumWithDefault(0, s => s.nonnegative()),
  unit: zDoseUnit.default('mg'),
  site: zText(40).default('')
})

export const zReconstitutionEntry = z.object({
  compound: zText(80),
  vial_amount: zNumWithDefault(0, s => s.nonnegative()),
  vial_unit: zDoseUnit.default('mg'),
  supplier: zText(80).default(''),
  bac_water_ml: zNumWithDefault(0, s => s.nonnegative())
})

export const zSodaEntry = z.object({
  time: zText(5).default(''),
  drink: zText(60).optional(),
  size: zText(40).optional()
})

const MEAL_KEYS = ['breakfast', 'snack', 'lunch', 'dinner'] as const

export const zJournalSave = z.object({
  date: zIsoDate,
  weight_lbs: zOptNum,
  bp_systolic: zOptNum,
  bp_diastolic: zOptNum,
  rhr: zOptNum,
  hrv: zOptNum,
  // A day's log is bounded: these caps are far above any real day and exist so one request
  // can't write a multi-megabyte JSON blob into the row.
  peptides: z.array(zPeptideEntry).max(50).default([]),
  reconstitutions: z.array(zReconstitutionEntry).max(50).default([]),
  sodas: z.array(zSodaEntry).max(50).default([]),
  food: z.object(Object.fromEntries(MEAL_KEYS.map(k => [k, zText(500).optional()]))).partial().default({}),
  notes: zText(20000).default('')
})

// --- sodas (quick-add widget) ---

export const zSodaAdd = z.object({
  date: zIsoDate.optional(),
  time: zClockTime.optional(),
  drink: zText(60).optional(),
  size: zText(40).optional()
})

export const zSodaRemove = z.object({
  date: zIsoDate,
  // A negative index is an invalid SQLite JSON path ('$[-1]'), which fails the whole statement.
  index: z.coerce.number().int().min(0)
})

// --- vials ---

export const zVialSave = z.object({
  id: zId.optional(),
  compound: zText(80).min(1, 'compound is required'),
  supplier: zOptText(80),
  vial_amount: z.number().finite().positive(),
  vial_unit: zDoseUnit.default('mg'),
  // Free-form on the wire; normalizeForm() maps it onto the VialForm union.
  form: z.string().max(20).nullish(),
  unit_count: z.preprocess(blankAsAbsent, z.number().finite().int().positive().nullish()).transform(v => v ?? null),
  quantity: zNumWithDefault(1, s => s.int().min(0)),
  status: z.enum(['sealed', 'active', 'finished']).default('sealed'),
  opened_date: zOptDate,
  bac_water_ml: zOptNum,
  lot: zOptText(60),
  expiry: zOptDate,
  cost: zOptNum,
  notes: zOptText(2000)
})

export const zVialOpen = z.object({
  id: zId,
  opened_date: zIsoDate.optional(),
  bac_water_ml: zOptNum
})

// --- supplements ---

export const zSupplementSave = z.object({
  id: zId.optional(),
  name: zText(120).min(1, 'name is required'),
  dose: zOptText(120),
  category: z.enum(['supplement', 'skin']).catch('supplement').default('supplement'),
  status: z.enum(['active', 'on_hand', 'stopped']).catch('active').default('active'),
  schedule: zText(120).default('daily').transform(v => v || 'daily'),
  started: zOptDate,
  stopped: zOptDate,
  notes: zOptText(2000),
  sort: zNumWithDefault(100, s => s.int())
})

// --- credentials ---

// A wrong type reads as a wrong credential (401 from safeEqual), not a 400: the endpoint's only
// answer to anything that isn't the password is "no", and saying which field was malformed
// would hand a prober the shape. The cap just bounds what the constant-time compare reads.
export const zPasswordLogin = z.object({ password: z.string().max(256).catch('') })
export const zPinLogin = z.object({ pin: z.string().max(64).catch('') })

// Share tokens are 32 base64url chars (newInviteToken); the range leaves room for older links.
export const zRedeem = z.object({ token: z.string().regex(/^[\w-]{16,64}$/, 'Missing share token') })

// --- AI ---

export const zDigestGenerate = z.object({
  kind: z.enum(['daily', 'weekly'], 'kind must be \'daily\' or \'weekly\''),
  endDate: zIsoDate.optional()
})

export const zSummaryGenerate = z.object({ date: zIsoDate })

// Stockpile text for the vials parser: the same 4,000-character cap the model prompt is sized for.
export const zVialParse = z.object({ text: zText(4000).min(1, 'Nothing to parse') })

// `messages` is checked by checkAskHistory (shared/utils/askHistory.ts), which the page's own
// trim is built against; this only makes sure the body is an object. `today` falls back to the
// server's local day when absent or malformed, as before.
export const zAsk = z.object({
  messages: z.unknown().optional(),
  today: zIsoDate.optional().catch(undefined)
})

// --- photos, vaccinations, profile ---

export const zPhotoUpdate = z.object({
  id: zId,
  date: zIsoDate.optional(),
  category: z.string().max(40).optional(),
  // The reframe tool's pan is a percentage and its zoom a multiplier; the caps are far outside
  // anything the UI can produce and only stop a hand-made request storing an absurd transform.
  frameOffsetX: z.number().finite().min(-1000).max(1000).optional(),
  frameOffsetY: z.number().finite().min(-1000).max(1000).optional(),
  frameScale: z.number().finite().positive().max(100).optional()
})

export const zVaccinationSave = z.object({
  id: zId.optional(),
  date: zIsoDate,
  vaccine: zText(120).min(1, 'Missing vaccine field'),
  product: zOptText(120),
  notes: zOptText(2000)
})

// The key is checked against PROFILE_FIELDS in the handler (a select field also checks its
// options there); '' or a missing value clears the fact.
export const zProfileSave = z.object({
  key: z.string().max(40),
  value: zText(200).nullish().transform(v => v ?? '')
})

// --- cycles ---

// Types and bounds only. The cross-field rules (a week within the plan's span, planned_days
// within planned_weeks × 7, actual_end after the start) stay in the handler, where each can name
// the plan row it's about ("Bad dose for Primo") instead of a zod path.
export const zCycleSave = z.object({
  id: zId.optional(),
  name: zText(120).min(1, 'Missing name field'),
  goal: zOptText(500),
  start_date: zIsoDate,
  // Absent means an older client, or the dossier's END TODAY round-trip posting the cycle back as-is.
  start_precision: z.enum(['day', 'month', 'quarter'], 'Bad start_precision').default('day'),
  planned_weeks: z.number().int().min(1).max(52),
  planned_days: z.preprocess(blankAsAbsent, z.number().int().positive().nullish()).transform(v => v ?? null),
  actual_end: zOptDate,
  compounds: z.array(z.record(z.string(), z.unknown())).min(1, 'A cycle needs at least one compound').max(40),
  notes: zOptText(5000)
})

// --- lab / DEXA saves (hand-edited extraction JSON) ---

// The marker, qualitative and source lists stay `unknown` here on purpose: sanitizeMarkers /
// sanitizeQualitative / sanitizeSources (server/utils/labs.ts) whitelist them field by field,
// which is stricter than any shape zod could state. The DEXA blocks are stored as JSON, so they
// only have to be objects.
const zJsonBlock = z.record(z.string(), z.unknown()).nullish()
export const zLabsSave = z.object({
  date: zIsoDate,
  _type: z.enum(['bloodwork', 'dexa', 'echo']).optional(),
  fasting: z.boolean().optional().catch(undefined),
  markers: z.unknown().optional(),
  qualitative: z.unknown().optional(),
  sources: z.unknown().optional(),
  weight_lbs: z.number().finite().nullish().catch(null),
  ag_ratio: z.number().finite().nullish().catch(null),
  total: zJsonBlock,
  regions: zJsonBlock,
  vat: zJsonBlock,
  bone_density: zJsonBlock,
  symmetry: zJsonBlock
})

// --- Apple Health webhook (Health Auto Export) ---

// A third-party payload, so malformed items are skipped rather than failing the batch: a metric
// without a data array used to throw mid-loop and lose every good reading after it.
const zHealthMetric = z.object({
  name: z.string(),
  units: z.string().optional(),
  data: z.array(z.record(z.string(), z.unknown())).default([])
})
const keepValid = <T>(item: z.ZodType<T>) => z.array(z.unknown()).default([])
  .transform(items => items.flatMap((x) => {
    const r = item.safeParse(x)
    return r.success ? [r.data] : []
  }))
export const zHealthWebhook = z.object({
  data: z.object({
    metrics: keepValid(zHealthMetric),
    workouts: keepValid(z.record(z.string(), z.unknown()))
  }).default({ metrics: [], workouts: [] })
})

// --- share links ---

// Out-of-range values are clamped rather than rejected, as the endpoint always has: the UI only
// offers presets, and the caps exist so a hand-crafted request can't overflow Date (an unbounded
// expiresDays made toISOString() throw) or store a pathological row.
const clampedCount = (cap: number) => z.preprocess(blankAsAbsent, z.number().finite().nullish())
  .transform(v => (v != null && v > 0 ? Math.min(Math.floor(v), cap) : null))

export const zInviteCreate = z.object({
  role: z.enum(['friend', 'doctor'], 'role must be "friend" or "doctor"'),
  // Shown on the sharing page and stored forever, so bounded; trimmed to 80 rather than refused.
  label: z.string().nullish().transform(v => v?.trim().slice(0, 80) || null),
  // Ten years; the UI offers 7/30/90 days or none.
  expiresDays: clampedCount(3650),
  maxUses: clampedCount(10_000)
})

export const zInviteRevoke = z.object({
  // A sha256 hex digest; anything much longer isn't an invite id.
  id: z.string().min(1).max(128)
})

// --- shared by the delete endpoints ---

export const zIdOnly = z.object({ id: zId })
