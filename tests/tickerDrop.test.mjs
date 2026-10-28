// TICKER's capsule drop (shared/utils/tickerDrop.ts): the bottle starts with the right germs in
// the right rows and nothing that clears for free, a capsule enters at the neck and moves,
// turns (kicked off the right wall) and falls on the clock — faster held down — and locks as a
// linked pair, four of a colour go and pay, loose halves fall and a cascade doubles, a clean
// bottle brings a fuller, faster one, a bottle filled to the neck is the end — and, the one
// that matters, a scripted player cleans the bottle on several seeds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DROP_CLEAR_SECONDS, DROP_COLS, DROP_FALL_SECONDS, DROP_LEVEL_SECONDS, DROP_MAX_GERMS, DROP_ROWS, DROP_SPAWN_X, DROP_TOP_FREE_ROWS,
  autoDrop, createDrop, dropCascade, dropEmptyGrid, dropFallSeconds, dropGermRows, dropGermsFor, dropHeight, dropMatches, dropPieceCells,
  dropPlaceGerms, dropPose, dropResolve, dropSweep, moveDrop, rotateDrop, startDrop, stepDrop as step
} from '../shared/utils/tickerDrop.ts'
import { makeRng } from '../shared/utils/tickerRunner.ts'

const DT = 1 / 60
const play = (s, seconds, soft = false) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(s, DT, soft)
  return s
}
const germ = color => ({ color, kind: 'germ', link: null })
const half = (color, link = null) => ({ color, kind: 'half', link })
const game = (seed = 1, germs = 4) => createDrop({ germs, rng: makeRng(seed) })
const count = (grid, kind) => grid.flat().filter(c => c && (!kind || c.kind === kind)).length
/** A running game with the bottle laid out by hand and the capsule in hand as given. */
const staged = (cells, piece) => {
  const s = game()
  s.grid = dropEmptyGrid()
  for (const [x, y, cell] of cells) s.grid[y][x] = cell
  s.germs = count(s.grid, 'germ')
  s.germsTotal = s.germs
  s.piece = { x: DROP_SPAWN_X, y: 0, rot: 0, colors: [0, 0], ...piece }
  s.status = 'running'
  return s
}

test('the bottle: the right number of germs, only in the bottom rows, never three of a colour in a line, by seed', () => {
  for (const n of [4, 12, 24, DROP_MAX_GERMS]) {
    const grid = dropEmptyGrid()
    assert.equal(dropPlaceGerms(grid, n, makeRng(n)), n)
    assert.equal(count(grid), n)
    const rows = dropGermRows(n)
    for (let y = 0; y < DROP_ROWS; y++) {
      for (let x = 0; x < DROP_COLS; x++) {
        const c = grid[y][x]
        if (!c) continue
        assert.ok(y >= DROP_ROWS - rows && y >= DROP_TOP_FREE_ROWS, `germ at row ${y} of ${rows} rows for ${n}`)
        assert.ok(c.kind === 'germ' && c.link === null)
      }
    }
    assert.equal(dropMatches(grid).length, 0, 'nothing clears for free')
    const tooLong = (dx, dy) => {
      for (let y = 0; y < DROP_ROWS; y++) {
        for (let x = 0; x < DROP_COLS; x++) {
          const c = grid[y][x]
          if (!c) continue
          let run = 1
          while (grid[y + dy * run]?.[x + dx * run]?.color === c.color) run++
          if (run >= 3) return `${run} of colour ${c.color} from ${x},${y}`
        }
      }
      return null
    }
    assert.equal(tooLong(1, 0), null)
    assert.equal(tooLong(0, 1), null)
  }
  const a = dropEmptyGrid()
  const b = dropEmptyGrid()
  dropPlaceGerms(a, 10, makeRng(3))
  dropPlaceGerms(b, 10, makeRng(3))
  assert.deepEqual(a, b, 'the same seed lays the same bottle')
  assert.equal(dropGermsFor(1, 1), 4, 'never fewer than four')
  assert.equal(dropGermsFor(25, 1), 25)
  assert.equal(dropGermsFor(25, 3), 33)
  assert.equal(dropGermsFor(99, 1), DROP_MAX_GERMS)
  assert.equal(dropGermsFor(38, 4), DROP_MAX_GERMS)
  assert.equal(dropGermRows(4), 6)
  assert.equal(dropGermRows(40), DROP_ROWS - DROP_TOP_FREE_ROWS)
})

test('ready, then a capsule enters at the neck lying flat; the next one is already drawn', () => {
  const s = game(2, 6)
  assert.equal(s.status, 'ready')
  assert.equal(s.piece, null)
  assert.equal(s.germs, 6)
  assert.equal(dropHeight(s.grid), 6)
  play(s, 1)
  assert.equal(s.status, 'ready', 'nothing moves before the press')
  startDrop(s)
  assert.equal(s.status, 'running')
  assert.deepEqual(dropPieceCells(s.piece).map(c => [c.x, c.y]), [[DROP_SPAWN_X, 0], [DROP_SPAWN_X + 1, 0]])
  assert.ok(s.next.every(c => c >= 0 && c <= 2))
  assert.equal(s.pieces, 0)
})

test('moving: to the walls and no further; turning cycles the halves and is kicked off the right wall', () => {
  const s = staged([], { colors: [1, 2] })
  for (let i = 0; i < 10; i++) moveDrop(s, 'left')
  assert.equal(s.piece.x, 0)
  assert.equal(moveDrop(s, 'left'), false)
  for (let i = 0; i < 10; i++) moveDrop(s, 'right')
  assert.equal(s.piece.x, DROP_COLS - 2, 'a lying capsule stops a column short of the wall')
  assert.ok(rotateDrop(s))
  assert.equal(s.piece.rot, 1)
  assert.deepEqual(dropPieceCells(s.piece), [{ x: 6, y: 0, color: 1 }, { x: 6, y: -1, color: 2 }], 'standing: the first half at the foot, the second up in the neck')
  assert.ok(moveDrop(s, 'right'))
  assert.equal(s.piece.x, DROP_COLS - 1, 'standing, it reaches the wall')
  assert.ok(rotateDrop(s), 'lying down against the wall')
  assert.equal(s.piece.rot, 2)
  assert.equal(s.piece.x, DROP_COLS - 2, 'kicked a column left')
  assert.deepEqual(dropPieceCells(s.piece).map(c => c.color), [1, 2])
  assert.deepEqual(dropPieceCells(s.piece).map(c => c.x), [7, 6], 'the halves swapped sides')
  rotateDrop(s)
  assert.equal(s.piece.rot, 3)
  rotateDrop(s)
  assert.equal(s.piece.rot, 0)
  // A turn with something in the way stays put.
  const t = staged([[3, 1, germ(0)]], { x: 3, y: 2, rot: 0 })
  assert.equal(rotateDrop(t), false, 'standing up would put a half in the germ')
  assert.equal(t.piece.rot, 0)
})

test('falling: a row on the clock, faster held down, then it locks as a pair and the next enters', () => {
  const s = staged([[7, 15, germ(1)]], { colors: [1, 2] })
  play(s, 0.6)
  assert.equal(s.piece.y, 0)
  play(s, 0.3)
  assert.equal(s.piece.y, 1, `a row after ${DROP_FALL_SECONDS}s`)
  play(s, 0.8, true)
  assert.equal(s.pieces, 1, 'held down, it reached the floor and locked')
  assert.deepEqual(s.grid[DROP_ROWS - 1].slice(3, 5), [half(1, 'right'), half(2, 'left')])
  assert.equal(s.status, 'running')
  assert.deepEqual([s.piece.x, s.piece.rot], [DROP_SPAWN_X, 0], 'the next one is in')
  assert.ok(s.piece.y <= 2, `and still near the neck (${s.piece.y})`)
  assert.equal(dropPose(s), 'eating', 'a chomp on the lock')
  play(s, 0.3)
  assert.equal(dropPose(s), 'idle')
  assert.equal(dropFallSeconds(1), DROP_FALL_SECONDS)
  assert.equal(dropFallSeconds(2), 0.7)
  assert.equal(dropFallSeconds(50), 0.2)
})

test('four of a colour across go and pay: germs a hundred, halves ten; the bottle keeps count', () => {
  const s = staged([[0, 15, germ(0)], [1, 15, germ(0)], [2, 15, germ(0)], [7, 15, germ(1)]], { colors: [0, 0] })
  assert.equal(s.germs, 4)
  play(s, 0.9, true)
  assert.equal(s.status, 'clearing')
  assert.equal(s.clearing.length, 5, 'three germs and both halves')
  assert.equal(dropPose(s), 'happy')
  play(s, DROP_CLEAR_SECONDS + 0.05)
  assert.equal(s.score, 320)
  assert.equal(s.germs, 1)
  assert.equal(s.pops.at(-1).text, '320')
  play(s, 0.3)
  assert.equal(s.status, 'running', 'nothing to fall, the next capsule is in')
  assert.equal(s.grid[15][7].color, 1, 'the odd germ stays')
  assert.equal(count(s.grid), 1)
})

test('the grid: a lone half falls, a standing pair falls on its foot, a lying pair hangs on one half, germs never move', () => {
  const grid = dropEmptyGrid()
  grid[10][0] = half(0)
  grid[9][2] = half(1, 'down')
  grid[10][2] = half(2, 'up')
  grid[10][4] = half(0, 'right')
  grid[10][5] = half(1, 'left')
  grid[11][5] = germ(2)
  grid[10][7] = germ(0)
  assert.ok(dropCascade(grid))
  assert.equal(grid[11][0].color, 0, 'the lone half fell')
  assert.deepEqual([grid[10][2], grid[11][2]], [half(1, 'down'), half(2, 'up')], 'the standing pair fell as one')
  assert.deepEqual([grid[10][4], grid[10][5]], [half(0, 'right'), half(1, 'left')], 'the lying pair hangs on the germ')
  assert.deepEqual(grid[10][7], germ(0), 'the germ stayed')
  while (dropCascade(grid)) { /* to the floor */ }
  assert.equal(grid[15][0].color, 0)
  assert.equal(grid[15][2].color, 2)
  assert.equal(grid[14][2].color, 1)
  // A half whose other half went is on its own and falls.
  const g2 = dropEmptyGrid()
  g2[14][0] = half(0, 'right')
  g2[14][1] = half(1, 'left')
  g2[15][0] = germ(0)
  g2[13][0] = half(0)
  g2[12][0] = half(0)
  assert.equal(dropMatches(g2).length, 4, 'a column of four')
  assert.deepEqual(dropSweep(g2, dropMatches(g2)), { germs: 1, halves: 3 })
  assert.equal(g2[14][1].link, null, 'widowed')
  assert.ok(dropCascade(g2))
  assert.equal(g2[15][1].color, 1)
})

test('a cascade: what falls into a line of four goes too, and the chain doubles the points', () => {
  // Column 0: a germ under two of its colour, then a row of four across row 12 holding a third one up.
  const cells = [
    [0, 15, germ(2)], [0, 14, half(2)], [0, 13, half(2)],
    [0, 12, half(0, 'right')], [1, 12, half(0, 'left')], [2, 12, half(0, 'right')], [3, 12, half(0, 'left')],
    [0, 11, half(2)],
    [7, 15, germ(1)]
  ]
  const grid = dropEmptyGrid()
  for (const [x, y, c] of cells) grid[y][x] = c
  assert.deepEqual(dropResolve(grid), { germs: 1, halves: 7 })
  assert.equal(count(grid), 1, 'only the odd germ is left')
  // The same through the game: a capsule locked out of the way sets it off.
  const s = staged(cells, { x: 5, colors: [1, 2] })
  play(s, 0.9, true)
  assert.equal(s.status, 'clearing')
  play(s, DROP_CLEAR_SECONDS + 0.05)
  assert.equal(s.score, 40, 'four halves')
  assert.equal(s.status, 'clearing', 'the fallen half made a column, flashing now')
  assert.equal(s.chain, 1)
  play(s, DROP_CLEAR_SECONDS + 0.05)
  assert.equal(s.score, 40 + (100 + 30) * 2, 'the chain doubled it')
  assert.equal(s.pops.at(-1).text, '260 ×2')
  assert.equal(s.germs, 1)
})

test('a clean bottle: the level clears, the next holds four more germs and falls faster', () => {
  const s = staged([[0, 15, germ(0)], [0, 14, half(0)], [0, 13, half(0)]], { colors: [0, 1] })
  rotateDrop(s)
  for (let i = 0; i < 5; i++) moveDrop(s, 'left')
  assert.equal(s.piece.x, 0)
  play(s, 0.7, true)
  assert.equal(s.status, 'clearing')
  play(s, DROP_CLEAR_SECONDS + 0.05)
  assert.equal(s.germs, 0)
  play(s, 0.5)
  assert.equal(s.status, 'cleared')
  assert.equal(dropPose(s), 'petted')
  assert.equal(s.grid[15][0].color, 1, 'the other half fell to the floor first')
  assert.equal(s.levelsCleared, 0, 'counted once the next bottle is poured')
  play(s, DROP_LEVEL_SECONDS + 0.05)
  assert.equal(s.status, 'ready')
  assert.equal(s.level, 2)
  assert.equal(s.levelsCleared, 1)
  assert.equal(s.germs, 8, 'the first bottle had the minimum four')
  assert.equal(s.germsTotal, 8)
  assert.equal(s.piece, null)
  startDrop(s)
  assert.equal(s.status, 'running')
  play(s, 0.72)
  assert.equal(s.piece.y, 1, 'a row in 0.7s now')
})

test('the end: a capsule with nowhere to enter, or one that locks up in the neck; a press after is a fresh bottle', () => {
  const s = game(5, 9)
  s.grid[0][DROP_SPAWN_X] = germ(0)
  startDrop(s)
  assert.equal(s.status, 'over')
  assert.equal(dropPose(s), 'flatline')
  const t = s.elapsed
  play(s, 1)
  assert.equal(s.elapsed, t, 'the clock stops')
  startDrop(s)
  assert.equal(s.status, 'running', 'a fresh game')
  assert.equal(s.germs, 9, 'against the same month')
  assert.equal(s.score, 0)
  assert.equal(s.grid[0][DROP_SPAWN_X], null)
  const n = staged([[3, 1, germ(0)]], { x: 3, y: 0, rot: 1, colors: [1, 2] })
  play(n, 0.2, true)
  assert.equal(n.status, 'over', 'locked with a half up in the neck')
  assert.equal(count(n.grid), 1, 'nothing written')
  const w = staged([], { colors: [0, 1] })
  for (let y = 4; y < DROP_ROWS; y++) w.grid[y][6] = germ(y % 3)
  assert.equal(dropPose(w), 'worried', 'the bottle is nearly full')
})

test('the scripted player cleans the bottle: four germs on six seeds, twelve on two, a soda-heavy month on one', async (t) => {
  const run = (seed, germs, budget) => {
    const s = game(seed, germs)
    const frames = Math.round(budget / DT)
    for (let i = 0; i < frames && s.levelsCleared < 1 && s.status !== 'over'; i++) step(s, DT, autoDrop(s))
    return s
  }
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = run(seed, 4, 240)
    assert.ok(s.levelsCleared >= 1, `seed ${seed}: ${s.status} at ${s.elapsed.toFixed(0)}s, ${s.germs} germs left, ${s.pieces} capsules, ${s.score} pts`)
  }
  for (const seed of [1, 2]) {
    const s = run(seed, 12, 400)
    assert.ok(s.levelsCleared >= 1, `twelve germs, seed ${seed}: ${s.status} at ${s.elapsed.toFixed(0)}s, ${s.germs} germs left, ${s.pieces} capsules`)
  }
  const heavy = run(1, 25, 600)
  t.diagnostic(`25 germs: ${heavy.status} at ${heavy.elapsed.toFixed(0)}s, ${heavy.germs} left, ${heavy.pieces} capsules, ${heavy.score} pts`)
  assert.ok(heavy.levelsCleared >= 1, 'a soda-heavy month, cleaned')
})
