// TICKER's sprites (shared/utils/tickerSprite.ts): every pose fills its canvas and keeps the same
// heart; the full figure's limbs and props attach to it; the face figure is the heart alone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TICKER_POSES, tickerSprite } from '../shared/utils/tickerSprite.ts'

const BODY = new Set(['rim', 'red', 'shade', 'hi', 'spec', 'eye', 'glint', 'blush', 'tongue'])
const ATTACHED = new Set(['limb', 'glove', 'shoe', 'clip', 'flag', 'mug', 'coffee', 'line'])
const FIGURES = ['full', 'face']

test('every pose fills its whole canvas', () => {
  assert.deepEqual([tickerSprite('idle').cols, tickerSprite('idle').rows], [28, 16])
  assert.deepEqual([tickerSprite('idle', 'face').cols, tickerSprite('idle', 'face').rows], [17, 15])
  for (const figure of FIGURES) {
    for (const pose of TICKER_POSES) {
      const s = tickerSprite(pose, figure)
      assert.equal(s.cells.length, s.cols * s.rows, `${figure} ${pose}`)
    }
  }
})

test('the heart silhouette is the same in every pose', () => {
  for (const figure of FIGURES) {
    const silhouette = pose => tickerSprite(pose, figure).cells.map(c => BODY.has(c.ink)).join('')
    const idle = silhouette('idle')
    for (const pose of TICKER_POSES) assert.equal(silhouette(pose), idle, `${figure} ${pose}`)
  }
})

test('the face figure is the full figure\'s heart, cropped: same face, no limbs or props', () => {
  for (const pose of TICKER_POSES) {
    const full = tickerSprite(pose)
    const face = tickerSprite(pose, 'face')
    for (let r = 0; r < face.rows; r++) {
      for (let c = 0; c < face.cols; c++) {
        const f = face.cells[r * face.cols + c]
        const g = full.cells[r * full.cols + c + 4]
        if (BODY.has(f.ink) || BODY.has(g.ink)) assert.deepEqual(f, g, `${pose} ${r},${c}`)
      }
    }
    const extras = face.cells.filter(c => c.ink && !BODY.has(c.ink)).map(c => c.ink)
    assert.deepEqual(extras, pose === 'worried' ? ['drop', 'drop'] : [], pose)
  }
})

test('limbs and props connect to the heart (wave lines, steam and the sweat drop may float)', () => {
  for (const pose of TICKER_POSES) {
    const { cols, rows, cells } = tickerSprite(pose)
    const cellAt = (r, c) => (r < 0 || r >= rows || c < 0 || c >= cols) ? null : cells[r * cols + c]
    const reached = new Set()
    const queue = []
    cells.forEach((c, i) => {
      if (!BODY.has(c.ink)) return
      reached.add(i)
      queue.push(i)
    })
    while (queue.length) {
      const i = queue.shift()
      const r = Math.floor(i / cols)
      const c = i % cols
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const n = cellAt(r + dr, c + dc)
          const j = (r + dr) * cols + (c + dc)
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
      .map(({ i }) => `${Math.floor(i / cols)},${i % cols}`)
    assert.deepEqual(loose, [], `${pose}: detached cells`)
  }
})

test('the pet poses: eating chews, the walk frames stride differently', () => {
  const motions = new Set(tickerSprite('eating').cells.map(c => c.motion).filter(Boolean))
  assert.ok(motions.has('jaw'), 'eating chews on the jaw cycle')
  const limbs = pose => tickerSprite(pose).cells.map((c, i) => c.ink === 'limb' || c.ink === 'shoe' ? i : null).filter(n => n != null).join(',')
  assert.notEqual(limbs('walk1'), limbs('walk2'), 'the stride alternates')
})

test('each pose looks different, and only the expected ones animate', () => {
  for (const figure of FIGURES) {
    const sig = pose => tickerSprite(pose, figure).cells.map(c => `${c.ink}:${c.motion}`).join('|')
    assert.equal(new Set(TICKER_POSES.map(sig)).size, TICKER_POSES.length, figure)
    const motions = pose => new Set(tickerSprite(pose, figure).cells.map(c => c.motion).filter(Boolean))
    assert.ok(motions('idle').has('lid'), `${figure}: idle blinks`)
    assert.ok(motions('talking').has('jaw'), `${figure}: talking moves its mouth`)
    assert.ok(!motions('idle').has('jaw'), `${figure}: idle keeps its mouth still`)
    assert.ok(!motions('flatline').has('lid'), `${figure}: X eyes do not blink`)
  }
})
