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

// --- shared by the delete endpoints ---

export const zIdOnly = z.object({ id: zId })
