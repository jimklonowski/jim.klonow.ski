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

test('the feed frames: the jab closes in and leaves a bead, the gulp holds a glass', () => {
  const inks = pose => tickerSprite(pose).cells.map(c => c.ink)
  const count = (pose, ink) => inks(pose).filter(i => i === ink).length
  assert.equal(count('jab1', 'drop'), 0, 'no bead before the needle is in')
  assert.equal(count('jab2', 'drop'), 1, 'one bead at the site')
  assert.equal(count('jab1', 'line'), count('jab2', 'line'), 'same needle both frames')
  const needleCol = pose => Math.min(...tickerSprite(pose).cells.map((c, i) => c.ink === 'line' ? i % 28 : Infinity))
  assert.ok(needleCol('jab2') < needleCol('jab1'), 'the needle moves toward the heart')
  assert.ok(count('gulp', 'bowl') >= 6 && count('gulp', 'drop') === 1, 'a glass with water in it')
  assert.ok(count('mixing', 'clip') === 1 && count('mixing', 'drop') === 1, 'powder in one vial, water in the other')
  for (const pose of ['jab1', 'jab2', 'gulp', 'mixing']) {
    const face = tickerSprite(pose, 'face')
    assert.equal(face.cells.some(c => c.motion === 'jaw'), false, `${pose}: mouth held, not chewing`)
  }
  // The bowl shows what the plate held (checked on the sitting pose, which has no wave lines or capsule of its own).
  const bowlInks = prop => new Set(tickerSprite('sit', 'full', [prop]).cells.map(c => c.ink))
  assert.ok(bowlInks('bowl-full').has('clip') && !bowlInks('bowl-full').has('line'), 'capsules only')
  assert.ok(bowlInks('bowl-shots').has('line') && !bowlInks('bowl-shots').has('clip'), 'syringes only')
  assert.ok(bowlInks('bowl-mixed').has('line') && bowlInks('bowl-mixed').has('clip'), 'one of each')
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

test('props compose over any pose, never over the heart, and only on the full figure', () => {
  const plain = tickerSprite('idle')
  const bowled = tickerSprite('idle', 'full', ['bowl-full'])
  assert.deepEqual([bowled.cols, bowled.rows], [plain.cols, plain.rows], 'a bowl on the floor fits the base canvas')
  const changed = bowled.cells.map((c, i) => (c.ink !== plain.cells[i].ink ? i : null)).filter(i => i != null)
  assert.ok(changed.length > 0, 'the bowl is drawn')
  for (const i of changed) assert.equal(BODY.has(plain.cells[i].ink), false, `cell ${i} was heart`)
  const inks = s => s.cells.map(c => c.ink).join()
  assert.notEqual(inks(tickerSprite('idle', 'full', ['bowl-empty'])), inks(bowled), 'full and empty bowls differ')
  assert.deepEqual(tickerSprite('idle', 'face', ['bowl-full', 'party-hat']), tickerSprite('idle', 'face'), 'the face figure takes no props')
  // Every pose keeps its own cells under a prop: only the prop's cells change.
  for (const pose of TICKER_POSES) {
    const bare = tickerSprite(pose)
    const propped = tickerSprite(pose, 'full', ['bowl-empty'])
    const diff = propped.cells.filter((c, i) => c.ink !== bare.cells[i].ink)
    assert.ok(diff.every(c => c.ink === 'bowl'), `${pose}: only bowl cells differ`)
  }
})

test('only wearables paint over the heart; everything else keeps every heart cell', () => {
  const plain = tickerSprite('idle')
  // Non-wearables: every body cell is where it was (allowing for rows added above the head).
  for (const prop of ['dumbbell', 'helmet', 'disc', 'cap', 'crown', 'calendar', 'bowl-full', 'party-hat']) {
    const s = tickerSprite('idle', 'full', [prop])
    assert.equal(s.cols, plain.cols, `${prop}: no sideways growth`)
    const dr = s.rows - plain.rows
    plain.cells.forEach((c, i) => {
      if (!BODY.has(c.ink)) return
      const r = Math.floor(i / plain.cols)
      const col = i % plain.cols
      assert.deepEqual(s.cells[(r + dr) * s.cols + col], c, `${prop}: heart cell ${r},${col}`)
    })
  }
  // Wearables change heart cells, nothing outside the base canvas, and the shades stop the blink.
  for (const prop of ['sweatband', 'shades', 'medal', 'lab-coat']) {
    const s = tickerSprite('idle', 'full', [prop])
    assert.deepEqual([s.cols, s.rows], [plain.cols, plain.rows], `${prop}: base canvas`)
    const over = s.cells.filter((c, i) => c.ink !== plain.cells[i].ink && BODY.has(plain.cells[i].ink))
    assert.ok(over.length > 0, `${prop}: sits on the heart`)
  }
  assert.ok(!tickerSprite('idle', 'full', ['shades']).cells.some(c => c.motion === 'lid'), 'lenses cover the lids')
  assert.ok(tickerSprite('idle', 'full', ['sweatband']).cells.some(c => c.motion === 'lid'), 'a sweatband leaves the eyes alone')
})

test('the build: a hatchling has no limbs, an elder carries a cane, built arms are thicker, the belly follows body fat', () => {
  const inks = s => s.cells.map(c => c.ink)
  const count = (s, ink) => inks(s).filter(i => i === ink).length
  const plain = tickerSprite('idle')
  assert.deepEqual(tickerSprite('idle', 'full', [], {}), plain, 'an empty build is the grown figure')
  assert.deepEqual(tickerSprite('idle', 'full', [], { tier: 'grown', arms: 'lean', belly: 'lean' }), plain)

  const hatchling = tickerSprite('idle', 'full', [], { tier: 'hatchling' })
  assert.equal(inks(hatchling).some(i => ATTACHED.has(i)), false, 'no limbs or props on a hatchling')
  assert.deepEqual([hatchling.cols, hatchling.rows], [plain.cols, plain.rows])

  const elder = tickerSprite('idle', 'full', [], { tier: 'elder' })
  assert.ok(count(elder, 'coffee') >= 6, 'the cane')
  assert.equal(elder.cells[15 * elder.cols + (-2 + 4)].ink, 'coffee', 'the cane reaches the floor')
  assert.deepEqual(inks(tickerSprite('sit', 'full', [], { tier: 'elder' })), inks(tickerSprite('sit')), 'no cane while sitting')

  const built = tickerSprite('idle', 'full', [], { arms: 'built' })
  assert.ok(count(built, 'limb') > count(plain, 'limb'), 'thicker arms')
  assert.equal(count(built, 'shoe'), count(plain, 'shoe'), 'legs untouched')

  for (const figure of FIGURES) {
    const soft = tickerSprite('idle', figure, [], { belly: 'soft' })
    const cut = tickerSprite('idle', figure, [], { belly: 'cut' })
    assert.ok(count(soft, 'hi') > count(tickerSprite('idle', figure), 'hi'), `${figure}: a soft belly is a highlight`)
    assert.ok(count(cut, 'rim') > count(tickerSprite('idle', figure), 'rim'), `${figure}: a cut belly is creases`)
  }
})

test('a prop above the head grows the canvas upward and leaves the figure where it stood', () => {
  const plain = tickerSprite('idle')
  const hatted = tickerSprite('idle', 'full', ['party-hat'])
  assert.equal(hatted.cols, plain.cols)
  assert.equal(hatted.rows, plain.rows + 3)
  // The original cells sit three rows lower; the new rows hold nothing but the hat.
  const shifted = hatted.cells.slice(3 * hatted.cols)
  assert.deepEqual(shifted, plain.cells)
  const hat = hatted.cells.slice(0, 3 * hatted.cols).filter(c => c.ink).map(c => c.ink)
  assert.deepEqual(new Set(hat), new Set(['hat', 'glove']))
})
