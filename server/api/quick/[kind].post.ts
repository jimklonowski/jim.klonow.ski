import type { H3Event } from 'h3'
import type { z } from 'zod'
import { zQuickMeal, zQuickWater, zSodaAdd } from '#shared/utils/schemas'
import { appendTapSql } from '#shared/utils/journalRemove'
import { hydrationOz, isSodaEntry, sodasOnly } from '#shared/utils/drinks'
import { isLabelFigure, lookupEstimate, type MealSlot } from '#shared/utils/nutrition'
import { isQuickKind, quickMealMessage, quickMealPlan, quickSodaMessage, quickWaterMessage } from '#shared/utils/quickLog'
import { lastSoda } from '#shared/utils/soda'
import { localTimeNow, localToday } from '#shared/utils/time'
import { WATER_DEFAULT_CUP_OZ, WATER_DEFAULT_GOAL_OZ, waterSetting } from '#shared/utils/water'
import type { SodaEntry, WaterEntry } from '#shared/types/journal'

// The quick-log endpoint (audit #43 item 69): `POST /api/quick/{water|soda|meal}` for an iOS
// Shortcut, an NFC tag, the Action Button or a Watch complication — callers with no browser and
// no session. The credential is its own secret, `Authorization: Bearer <QUICK_TOKEN>`: never the
// cookie key, never the webhook's token, so the phone holds a credential that can do exactly
// three things. With the secret unset the route answers 404, like the calendar feed.
//
// It writes what the site's own quick buttons write, by the same statements (the json_insert
// append of soda.post.ts / water.post.ts, the json_set of meal.post.ts), always to the real
// database and audited as the owner. A body is optional: water with no `oz` pours the profile's
// cup, soda with no `drink` repeats the last soda. A meal must already have LABEL figures — the
// code library or a hand entry — so a tap can never start a model estimate or leave a meal
// without figures. The answer carries `message`, one line for the Shortcut to show.

/** How far back the last soda is looked for. */
const LAST_SODA_DAYS = 60

async function quickBody<S extends z.ZodTypeAny>(event: H3Event, schema: S): Promise<z.infer<S>> {
  // An NFC tap may send no body, or an empty one: both are "all defaults".
  const raw = await readRawBody(event).catch(() => null)
  let json: unknown = {}
  if (raw?.trim()) {
    try {
      json = JSON.parse(raw)
    }
    catch {
      throw createError({ statusCode: 400, message: 'The body is not JSON' })
    }
  }
  const parsed = schema.safeParse(json ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') })
  return parsed.data
}

export default defineEventHandler(async (event) => {
  const token = process.env.QUICK_TOKEN
  if (!token) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  if (!safeEqual(getHeader(event, 'authorization'), `Bearer ${token}`)) {
    // Only a refused request spends the per-IP allowance: a guesser is cut off, and a run of
    // the owner's own taps is never throttled.
    await enforceRateLimit(event, 'credentials', 'quick')
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  const kind = getRouterParam(event, 'kind')
  if (!isQuickKind(kind)) throw createError({ statusCode: 404, message: 'Quick-log takes water, soda or meal' })

  // The token is the owner's: the writes go to the real database and into the audit log, as
  // the owner's own taps on the site do (getDb and recordAudit read this).
  event.context.auth = { role: 'owner', inviteId: null, issuedAt: Math.floor(Date.now() / 1000) }
  const db = getDb(event)

  if (kind === 'water') {
    const body = await quickBody(event, zQuickWater)
    const date = body.date ?? localToday()
    const time = body.time ?? localTimeNow()
    const { results } = await db.prepare('SELECT key, value FROM profile WHERE key IN (\'cup_oz\', \'water_goal_oz\')').all<{ key: string, value: string }>()
    const profile = Object.fromEntries((results ?? []).map(r => [r.key, r.value]))
    const oz = body.oz ?? waterSetting(profile, 'cup_oz', WATER_DEFAULT_CUP_OZ)

    const before = await auditBefore(event, 'journal_entries', date)
    const held = (JSON.parse((before?.water as string | null | undefined) ?? '[]') as unknown[]).length
    await db.prepare(appendTapSql('water')).bind(date, JSON.stringify({ time, oz, id: body.id }), body.id ?? null).run()
    const row = await db.prepare('SELECT water, sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ water: string | null, sodas: string | null }>()
    const water = JSON.parse(row?.water ?? '[]') as WaterEntry[]
    const appended = water.length > held
    if (appended) await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `+ ${oz} oz water on ${date} (quick-log)` })
    const total = hydrationOz({ water, sodas: JSON.parse(row?.sodas ?? '[]') as SodaEntry[] })
    const goal = waterSetting(profile, 'water_goal_oz', WATER_DEFAULT_GOAL_OZ)
    return { ok: true, kind, date, appended, oz, totalOz: total, goalOz: goal, message: appended ? quickWaterMessage(oz, total, goal) : `That pour was already logged. ${total} of ${goal} oz today.` }
  }

  if (kind === 'soda') {
    const body = await quickBody(event, zSodaAdd)
    const date = body.date ?? localToday()
    const time = body.time ?? localTimeNow()
    let drink = body.drink || undefined
    let size = body.size || undefined
    if (!drink) {
      // No drink named: the last soda, as the site's + SODA button repeats it.
      const { results } = await db.prepare('SELECT date, sodas FROM journal_entries WHERE date <= ?1 AND sodas IS NOT NULL AND sodas != \'[]\' ORDER BY date DESC LIMIT ?2')
        .bind(date, LAST_SODA_DAYS).all<{ date: string, sodas: string }>()
      const last = lastSoda((results ?? []).map(r => ({ date: r.date, sodas: JSON.parse(r.sodas) as SodaEntry[] })))
      drink = last?.drink || undefined
      size = size ?? (last?.size || undefined)
    }

    const before = await auditBefore(event, 'journal_entries', date)
    const held = (JSON.parse((before?.sodas as string | null | undefined) ?? '[]') as unknown[]).length
    await db.prepare(appendTapSql('sodas')).bind(date, JSON.stringify({ time, drink, size, id: body.id }), body.id ?? null).run()
    const row = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ sodas: string }>()
    const sodas = JSON.parse(row?.sodas ?? '[]') as SodaEntry[]
    const appended = sodas.length > held
    if (appended) await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `+ ${drink ?? 'soda'} on ${date} (quick-log)` })
    const count = sodasOnly(sodas).length
    return { ok: true, kind, date, appended, drink: drink ?? null, size: size ?? null, sodasToday: count, message: quickSodaMessage(drink, size, isSodaEntry({ drink }), count, appended) }
  }

  // kind === 'meal'
  const body = await quickBody(event, zQuickMeal)
  const date = body.date ?? localToday()
  const time = body.time ?? localTimeNow()
  const estimate = lookupEstimate(await loadEstimateIndex(db), body.text)
  if (!estimate || !isLabelFigure(estimate)) {
    throw createError({ statusCode: 422, message: `"${body.text}" has no label figures. Quick-log takes meals from the library and ones whose figures you entered by hand; log anything else on the site.` })
  }
  const before = await auditBefore(event, 'journal_entries', date)
  const food = JSON.parse((before?.food as string | null | undefined) || '{}') as Partial<Record<MealSlot, string>>
  const plan = quickMealPlan(food, time, body.text, body.slot)
  if (!plan.unchanged) {
    // The slot is a validated enum or slotForTime's own value, so the JSON path is safe.
    await db.prepare(`
      INSERT INTO journal_entries (date, food) VALUES (?1, json_object(?2, ?3))
      ON CONFLICT(date) DO UPDATE SET food = json_set(COALESCE(food, '{}'), '$.' || ?2, ?3)
    `).bind(date, plan.slot, plan.text).run()
    await recordAudit(event, { table: 'journal_entries', key: date, before, summary: `${plan.slot} on ${date}: ${plan.text} (quick-log)` })
  }
  return { ok: true, kind, date, slot: plan.slot, text: plan.text, appended: !plan.unchanged, kcal: estimate.kcal, protein_g: estimate.protein_g, message: quickMealMessage(plan, body.text, estimate) }
})
