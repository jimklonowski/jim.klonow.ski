// server/utils/nutritionEstimate.ts — the model's meal figures and their cache, untested until
// audit #44 item 56. What matters here is what gets WRITTEN: a figure cached under a meal is
// trusted by every chip, total, digest and ask sheet from then on.
//
// No model is called. `createAnthropic` (a Nitro auto-import) is replaced with a stand-in that
// answers what each test scripts; the cache is the real meal_estimates table in node:sqlite.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { d1Of, freshDb, insert, rowsOf } from './_fixtures/d1.mjs'
import { installAutoImports } from './_fixtures/nitro.mjs'
import { mealKey } from '../shared/utils/mealKey.ts'
import { LIBRARY_TEXTS } from '../shared/utils/mealLibrary.ts'
import { MEAL_ESTIMATE_MANUAL_UPSERT } from '../shared/utils/mealEstimateSql.ts'

await installAutoImports()
const { estimateMeals, estimatesForKeys, loadEstimateIndex, parseEstimateRow } = await import('../server/utils/nutritionEstimate.ts')
const { AI_MODELS } = await import('../server/utils/ai.ts')

// The usage line each call logs, and the error log on a failed one: not this test's output.
console.info = () => {}
console.error = () => {}

const requests = []
let reply = () => {
  throw new Error('the model was called, and no test asked for that')
}
globalThis.createAnthropic = () => ({
  messages: {
    stream: (request) => {
      requests.push(request)
      return { finalMessage: async () => reply(request) }
    }
  }
})
/** The model answering `items`, cleanly. */
const answers = (items, stop = 'end_turn') => () => ({ content: [{ type: 'text', text: JSON.stringify({ items }) }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: stop })
const item = (text, over = {}) => ({ text, kcal: 500, protein_g: 30, carbs_g: 40, fat_g: 20, sodium_mg: 800, fiber_g: 5, confidence: 'medium', assumptions: '', ...over })
const cachedRow = (text, over = {}) => ({ key: mealKey(text), text, kcal: 400, protein_g: 20, carbs_g: 30, fat_g: 10, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...over })
const fresh = () => {
  const db = freshDb()
  requests.length = 0
  return { db, d1: d1Of(db), stored: () => rowsOf(db, 'SELECT * FROM meal_estimates ORDER BY key') }
}
const STEW = 'zzq mystery stew'
const LOAF = 'zzq nut loaf'

test('a stored row is read with its gaps as gaps', () => {
  const full = parseEstimateRow({ key: 'k', text: 't', kcal: '510', protein_g: '32.5', carbs_g: 40, fat_g: 21, sodium_mg: 900, fiber_g: 4.5, barcode: '0123', confidence: 'high', assumptions: 'one bowl', source: 'manual', model: null, created_at: 'c', updated_at: 'u' })
  assert.deepEqual(full, { key: 'k', text: 't', kcal: 510, protein_g: 32.5, carbs_g: 40, fat_g: 21, sodium_mg: 900, fiber_g: 4.5, barcode: '0123', confidence: 'high', assumptions: 'one bowl', source: 'manual', model: null, created_at: 'c', updated_at: 'u' })
  // A row from before sodium and fibre existed: no figure, never zero.
  const old = parseEstimateRow({ key: 'k', text: 't', kcal: 510, protein_g: 32, carbs_g: 40, fat_g: 21, sodium_mg: null, fiber_g: null, confidence: null, assumptions: null, source: 'ai', model: 'm', created_at: 'c', updated_at: 'u' })
  assert.deepEqual([old.sodium_mg, old.fiber_g, old.barcode, old.confidence, old.assumptions, old.source], [null, null, null, 'medium', null, 'ai'])
  assert.equal(parseEstimateRow({ source: 'something else' }).source, 'ai', 'only a hand entry is "manual"')
})

test('the index holds every cached meal by key, with the drink labels riding on it', async () => {
  const { db, d1 } = fresh()
  assert.equal((await loadEstimateIndex(d1)).size, 0)
  assert.equal((await loadEstimateIndex(d1)).drinks, undefined)
  insert(db, 'meal_estimates', cachedRow(STEW, { sodium_mg: 700 }))
  insert(db, 'drink_labels', { key: 'gatorade zero', name: 'Gatorade Zero', serving_oz: 20, kcal: 5, caffeine_mg: 0, sodium_mg: 270, sugar_g: 0, updated_at: 'u' })
  const index = await loadEstimateIndex(d1)
  assert.deepEqual([...index.keys()], [mealKey(STEW)])
  assert.equal(index.get(mealKey(STEW)).sodium_mg, 700)
  assert.equal(index.drinks.get('gatorade zero').sodium_mg, 270)
})

test('a database without the tables yet has no figures; any other failure is a failure', async () => {
  const { db, d1 } = fresh()
  db.exec('DROP TABLE meal_estimates')
  db.exec('DROP TABLE drink_labels')
  assert.equal((await loadEstimateIndex(d1)).size, 0, 'the sandbox before its migration')
  // An outage must not read as "no meal has figures" across every digest and ask sheet.
  const down = fresh()
  down.d1.fail(/FROM meal_estimates/)
  await assert.rejects(() => loadEstimateIndex(down.d1), /Network connection lost/)
  const labelsDown = fresh()
  labelsDown.d1.fail(/FROM drink_labels/)
  await assert.rejects(() => loadEstimateIndex(labelsDown.d1), /Network connection lost/)
})

test('rows are fetched by key, and no key is no query', async () => {
  const { db, d1 } = fresh()
  insert(db, 'meal_estimates', cachedRow(STEW))
  insert(db, 'meal_estimates', cachedRow(LOAF))
  assert.deepEqual(await estimatesForKeys(d1, []), [])
  assert.equal(d1.ran.length, 0)
  assert.deepEqual((await estimatesForKeys(d1, [mealKey(LOAF), 'no such key'])).map(r => r.text), [LOAF])
})

test('a meal already cached or in the code library never reaches the model', async () => {
  const { db, d1, stored } = fresh()
  insert(db, 'meal_estimates', cachedRow(STEW))
  const known = LIBRARY_TEXTS[0]
  const out = await estimateMeals(d1, [STEW, `  ${STEW.toUpperCase()}  `, known, '', '   '])
  assert.equal(requests.length, 0)
  assert.deepEqual(out, { estimates: [parseEstimateRow(stored()[0])], unmatched: [] })
  assert.equal(stored().length, 1, 'the library answers its own meals: no row is written for them')
})

test('unknown meals are asked for once each, in one call, and stored as the model\'s', async () => {
  const { db, d1, stored } = fresh()
  insert(db, 'meal_estimates', cachedRow(LOAF))
  reply = answers([
    item(STEW, { kcal: 512.6, protein_g: 31.26, carbs_g: 40.04, fat_g: 19.96, sodium_mg: 845.4, fiber_g: 5.55, confidence: 'low', assumptions: '  one bowl  ' }),
    item('2x zzq corn dog', { kcal: 640, confidence: 'high' })
  ])
  // The stew three ways (one key), the loaf (cached), and a second unknown meal.
  const out = await estimateMeals(d1, [STEW, 'ZZQ  Mystery stew', 'stew, zzq mystery', LOAF, '2 x zzq corn dog'])

  assert.equal(requests.length, 1)
  const [request] = requests
  assert.equal(request.model, AI_MODELS.nutrition)
  assert.equal(request.output_config.format.type, 'json_schema')
  assert.equal(request.output_config.effort, 'low')
  const prompt = request.messages[0].content
  assert.match(prompt, /\nMeals:\n1\. zzq mystery stew\n2\. 2 x zzq corn dog$/, 'only the unknown meals, each once, as first typed')
  assert.ok(!prompt.includes(LOAF))

  const rows = stored()
  assert.deepEqual(rows.map(r => r.text).sort(), ['2 x zzq corn dog', STEW, LOAF].sort())
  const stew = rows.find(r => r.key === mealKey(STEW))
  assert.deepEqual(
    [stew.kcal, stew.protein_g, stew.carbs_g, stew.fat_g, stew.sodium_mg, stew.fiber_g, stew.confidence, stew.assumptions, stew.source, stew.model, stew.barcode],
    [513, 31.3, 40, 20, 845, 5.6, 'low', 'one bowl', 'ai', AI_MODELS.nutrition, null],
    'whole kcal and sodium, one decimal of a gram'
  )
  assert.match(stew.prompt_hash, /^[0-9a-f]{8,}$/)
  assert.equal(stew.created_at, stew.updated_at)
  assert.equal(rows.find(r => r.text === '2 x zzq corn dog').assumptions, null, 'nothing assumed is stored as nothing')

  assert.deepEqual(out.unmatched, [])
  assert.deepEqual(out.estimates.map(e => [e.text, e.kcal, e.source]), [[LOAF, 400, 'ai'], [STEW, 513, 'ai'], ['2 x zzq corn dog', 640, 'ai']], 'the cached rows, then the new ones')
})

test('figures the model got wrong are clamped or left out, never stored as they came', async () => {
  const { d1, stored } = fresh()
  reply = answers([
    item(STEW, { kcal: -50, protein_g: -1, carbs_g: 12.34, fat_g: 0, sodium_mg: 'lots', fiber_g: null }),
    item(LOAF, { protein_g: 'plenty' })
  ])
  const out = await estimateMeals(d1, [STEW, LOAF])
  assert.deepEqual(stored().map(r => [r.text, r.kcal, r.protein_g, r.carbs_g, r.sodium_mg, r.fiber_g]), [[STEW, 0, 0, 12.3, null, null]], 'negatives are zero; a sodium that is not a number is no sodium')
  assert.deepEqual(out.unmatched, [LOAF], 'a meal without all four macros is left without figures, to be retried')
})

test('an answer that cannot be pinned to its meal is not cached under it', async () => {
  const { d1, stored } = fresh()
  // Two asked, one answered, and for some other dish: position would have filed it under the stew.
  reply = answers([item('a dish nobody asked about')])
  const out = await estimateMeals(d1, [STEW, LOAF])
  assert.deepEqual(stored(), [])
  assert.deepEqual(out, { estimates: [], unmatched: [STEW, LOAF] })
})

test('a hand entry saved while the model was answering stays a hand entry', async () => {
  const { db, d1, stored } = fresh()
  reply = (request) => {
    // The owner types the label figures in while the call is in flight.
    db.prepare(MEAL_ESTIMATE_MANUAL_UPSERT).run(mealKey(STEW), STEW, 300, 40, 10, 9, '2026-11-01T00:00:00.000Z', 600, 3, 'from the label', null)
    return answers([item(STEW, { kcal: 900 })])(request)
  }
  await estimateMeals(d1, [STEW])
  assert.deepEqual(stored().map(r => [r.kcal, r.protein_g, r.source, r.assumptions, r.model]), [[300, 40, 'manual', 'from the label', null]])
})

test('an answer that did not finish, or is not the shape asked for, saves nothing', async () => {
  const cases = [
    [() => ({ content: [{ type: 'text', text: '{"items": [' }], usage: {}, stop_reason: 'end_turn' }), /came back malformed — nothing was saved/],
    [() => ({ content: [{ type: 'text', text: '{"meals": []}' }], usage: {}, stop_reason: 'end_turn' }), /returned no items — nothing was saved/],
    [answers([item(STEW)], 'max_tokens'), /hit the output limit and was truncated — nothing was saved/],
    [answers([item(STEW)], 'refusal'), /declined/],
    [() => {
      throw new Error('socket hang up')
    }, /./]
  ]
  for (const [scripted, message] of cases) {
    const { d1, stored } = fresh()
    reply = scripted
    await assert.rejects(() => estimateMeals(d1, [STEW]), err => err.statusCode >= 500 && message.test(err.message), String(message))
    assert.deepEqual(stored(), [])
  }
})
