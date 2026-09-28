// TICKER's full-size sprite (shared/utils/tickerSprite.ts): every pose fills the canvas, keeps the
// same heart, and has limbs and props that actually attach to it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TICKER_COLS, TICKER_POSES, TICKER_ROWS, tickerSprite } from '../shared/utils/tickerSprite.ts'

const BODY = new Set(['rim', 'red', 'shade', 'hi', 'spec', 'eye', 'glint', 'blush', 'tongue'])
const ATTACHED = new Set(['limb', 'glove', 'shoe', 'clip', 'flag', 'mug', 'coffee', 'line'])

const cellAt = (cells, r, c) => (r < 0 || r >= TICKER_ROWS || c < 0 || c >= TICKER_COLS) ? null : cells[r * TICKER_COLS + c]

test('every pose fills the whole canvas', () => {
  for (const pose of TICKER_POSES) {
    assert.equal(tickerSprite(pose).length, TICKER_COLS * TICKER_ROWS, pose)
  }
})

test('the heart silhouette is the same in every pose', () => {
  const silhouette = cells => cells.map(c => BODY.has(c.ink)).join('')
  const idle = silhouette(tickerSprite('idle'))
  for (const pose of TICKER_POSES) assert.equal(silhouette(tickerSprite(pose)), idle, pose)
})

test('limbs and props connect to the heart (wave lines, steam and the sweat drop may float)', () => {
  for (const pose of TICKER_POSES) {
    const cells = tickerSprite(pose)
    const reached = new Set()
    const queue = []
    cells.forEach((c, i) => {
      if (!BODY.has(c.ink)) return
      reached.add(i)
      queue.push(i)
    })
    while (queue.length) {
      const i = queue.shift()
      const r = Math.floor(i / TICKER_COLS)
      const c = i % TICKER_COLS
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const n = cellAt(cells, r + dr, c + dc)
          const j = (r + dr) * TICKER_COLS + (c + dc)
          if (n && !reached.has(j) && ATTACHED.has(n.ink) && n.motion !== 'flicker') {
            reached.add(j)
            queue.push(j)
          }
        }
      }
    }
    const loose = cells
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => ATTACHED.has(c.ink) && c.motion !== 'flicker' && !reached.has(i))
      .map(({ i }) => `${Math.floor(i / TICKER_COLS)},${i % TICKER_COLS}`)
    assert.deepEqual(loose, [], `${pose}: detached cells`)
  }
})

test('each pose looks different, and only the expected ones animate', () => {
  const sig = pose => tickerSprite(pose).map(c => `${c.ink}:${c.motion}`).join('|')
  assert.equal(new Set(TICKER_POSES.map(sig)).size, TICKER_POSES.length)
  const motions = pose => new Set(tickerSprite(pose).map(c => c.motion).filter(Boolean))
  assert.ok(motions('idle').has('lid'), 'idle blinks')
  assert.ok(motions('talking').has('jaw'), 'talking moves its mouth')
  assert.ok(!motions('idle').has('jaw'), 'idle keeps its mouth still')
  assert.ok(!motions('flatline').has('lid'), 'X eyes do not blink')
})
