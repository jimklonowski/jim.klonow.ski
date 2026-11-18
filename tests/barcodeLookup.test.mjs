// The barcode half of the figures forms (app/composables/useBarcodeLookup.ts) — audit #44 item
// 14. A lookup is a round trip and the form can change under it; these pin that only the latest
// run's answer is ever used. Runs in plain node over stubbed Nuxt globals and a $fetch whose
// answers the test releases by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.ref = v => ({ value: v })
globalThis.computed = fn => Object.defineProperty({}, 'value', { get: fn })
globalThis.onMounted = () => {}
globalThis.extractErrorMessage = (err, fallback) => err?.message ?? fallback
/** Every lookup asked for, each with the handles that answer it. */
let asked = []
globalThis.$fetch = (_url, { query }) => new Promise((resolve, reject) => asked.push({ code: query.code, resolve, reject }))

const { useBarcodeLookup } = await import('../app/composables/useBarcodeLookup.ts')

const A = '012345678905'
const B = '049000028911'
const figures = name => ({ name, per: '1 can (355 ml)', basis: 'serving', kcal: 140, protein_g: 0, carbs_g: 39, fat_g: 0, sodium_mg: 45, fiber_g: null, sugar_g: 39, caffeine_mg: null, serving_oz: 12, scaled: false })
const found = name => ({ found: true, figures: figures(name) })
/** Lets the awaits behind an answered lookup run. */
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function form() {
  asked = []
  const applied = []
  let started = 0
  const lookup = useBarcodeLookup((f, code) => {
    applied.push({ name: f.name, code })
    return { text: `Filled: ${f.name}`, tone: 'ok' }
  }, () => {
    started++
  })
  return { ...lookup, applied, started: () => started }
}

test('a lookup tells the form it began, and hands back the figures with the barcode they were found under', async () => {
  const f = form()
  f.barcode.value = ' 0123-4567 8905 '
  const run = f.lookUp()
  assert.equal(f.started(), 1)
  assert.equal(f.lookingUp.value, true)
  assert.equal(asked[0].code, A, 'spaces and dashes are not part of the code')
  asked[0].resolve(found('Product A'))
  await run
  assert.deepEqual(f.applied, [{ name: 'Product A', code: A }])
  assert.deepEqual(f.barcodeNote.value, { text: 'Filled: Product A', tone: 'ok' })
  assert.equal(f.lookingUp.value, false)
  // Not a barcode: nothing is asked and nothing begins.
  f.barcode.value = '12345'
  await f.lookUp()
  assert.equal(asked.length, 1)
  assert.equal(f.started(), 1)
})

test('an answer for a form that was reset is dropped: it fills nothing and writes no note', async () => {
  const f = form()
  f.barcode.value = A
  const run = f.lookUp()
  // The form is closed and opened again for another meal while the lookup is out.
  f.resetBarcode()
  assert.equal(f.lookingUp.value, false, 'the new form is not left spinning')
  assert.equal(f.barcode.value, '')
  asked[0].resolve(found('Product A'))
  await run
  await tick()
  assert.deepEqual(f.applied, [])
  assert.equal(f.barcodeNote.value, null)
  assert.equal(f.lookingUp.value, false)
})

test('a failure that comes back late is dropped too', async () => {
  const f = form()
  f.barcode.value = A
  const run = f.lookUp()
  f.resetBarcode()
  asked[0].reject(new Error('the lookup timed out'))
  await run
  await tick()
  assert.equal(f.barcodeNote.value, null, 'no "lookup failed" line on a form that never asked')
})

test('the new form\'s own lookup is the one that lands, whichever answer arrives first', async () => {
  for (const oldFirst of [true, false]) {
    const f = form()
    f.barcode.value = A
    const first = f.lookUp()
    f.resetBarcode()
    f.barcode.value = B
    const second = f.lookUp()
    assert.equal(asked.length, 2, 'the reset freed the form to look up again')
    const answer = i => asked[i].resolve(found(i ? 'Product B' : 'Product A'))
    if (oldFirst) {
      answer(0)
      await first
      assert.equal(f.lookingUp.value, true, 'the late answer does not stop the spinner of the lookup still out')
      answer(1)
    }
    else {
      answer(1)
      await second
      answer(0)
    }
    await Promise.all([first, second])
    await tick()
    assert.deepEqual(f.applied, [{ name: 'Product B', code: B }], oldFirst ? 'old answer first' : 'new answer first')
    assert.equal(f.barcodeNote.value.text, 'Filled: Product B')
    assert.equal(f.lookingUp.value, false)
  }
})

test('a second lookup that finds nothing still began: the form is told, so the first product can be let go', async () => {
  const f = form()
  f.barcode.value = A
  let run = f.lookUp()
  asked[0].resolve(found('Product A'))
  await run
  f.barcode.value = B
  run = f.lookUp()
  assert.equal(f.started(), 2, 'told at the start, not when (if) an answer comes')
  asked[1].resolve({ found: false, figures: null })
  await run
  assert.equal(f.applied.length, 1, 'only the first product was ever applied')
  assert.equal(f.barcodeNote.value.tone, 'warn')
  assert.match(f.barcodeNote.value.text, /no product with that barcode/)
  // And one that fails outright says so.
  run = f.lookUp()
  assert.equal(f.started(), 3)
  asked[2].reject(new Error('Open Food Facts did not answer'))
  await run
  assert.deepEqual(f.barcodeNote.value, { text: 'Open Food Facts did not answer', tone: 'warn' })
  assert.equal(f.lookingUp.value, false)
})
