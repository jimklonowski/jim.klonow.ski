// Unit tests for the scan-to-scan delta reader (app/utils/dexaDeltas.ts), audit #42 item 43.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEXA_NOISE, deltaInfo } from '../app/utils/dexaDeltas.ts'

test('a delta needs both readings; nothing to compare is null', () => {
  assert.equal(deltaInfo(null, 20, 1, 'down'), null)
  assert.equal(deltaInfo(17.6, undefined, 1, 'down'), null)
})

test('a move the decimals cannot show reads as ± 0, muted', () => {
  assert.deepEqual(deltaInfo(17.64, 17.6, 1, 'down'), { text: '± 0', class: 'text-muted' })
  assert.deepEqual(deltaInfo(1.2504, 1.25, 2, 'up'), { text: '± 0', class: 'text-muted' })
  assert.equal(deltaInfo(17.66, 17.6, 1, 'down').text, '▲ +0.1', 'past half a unit of the last decimal it is a move')
})

test('the glyph is the direction, the colour is direction × what is good', () => {
  assert.deepEqual(deltaInfo(17.6, 20.2, 1, 'down'), { text: '▼ −2.6', class: 'text-accent' }, 'body fat down is good')
  assert.deepEqual(deltaInfo(20.2, 17.6, 1, 'down'), { text: '▲ +2.6', class: 'text-warn' })
  assert.deepEqual(deltaInfo(143.9, 130, 1, 'up'), { text: '▲ +13.9', class: 'text-accent' }, 'lean up is good')
  assert.deepEqual(deltaInfo(130, 143.9, 1, 'up'), { text: '▼ −13.9', class: 'text-warn' })
  assert.deepEqual(deltaInfo(169.8, 155, 1, 'neutral'), { text: '▲ +14.8', class: 'text-muted' }, 'total mass has no good way')
})

test('a move inside the scanner\'s wobble shows its figure but stays muted', () => {
  assert.deepEqual(deltaInfo(1.257, 1.25, 3, 'up', DEXA_NOISE.bmd), { text: '▲ +0.007', class: 'text-muted' }, 'Jim\'s Sep 2026 BMD move')
  assert.deepEqual(deltaInfo(48.6, 47.2, 2, 'down', DEXA_NOISE.vat), { text: '▲ +1.40', class: 'text-muted' }, 'and his VAT move')
  assert.deepEqual(deltaInfo(44.2, 47.2, 2, 'down', DEXA_NOISE.vat), { text: '▼ −3.00', class: 'text-accent' }, 'at the floor it counts')
  assert.deepEqual(deltaInfo(170.4, 170, 1, 'up', DEXA_NOISE.mass), { text: '▲ +0.4', class: 'text-muted' })
  assert.deepEqual(deltaInfo(170.5, 170, 1, 'up', DEXA_NOISE.mass), { text: '▲ +0.5', class: 'text-accent' })
})

test('the noise table covers every figure the pages compare, each a positive floor', () => {
  assert.deepEqual(Object.keys(DEXA_NOISE).sort(), ['ag', 'bmd', 'mass', 'pct', 'regionPct', 'tScore', 'vat'])
  for (const [k, v] of Object.entries(DEXA_NOISE)) assert.ok(v > 0, `${k} > 0`)
  assert.ok(DEXA_NOISE.regionPct >= DEXA_NOISE.pct, 'a region\'s fat % wobbles at least as much as the total')
})
