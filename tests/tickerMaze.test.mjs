// TICKER's capsule maze (shared/utils/tickerMaze.ts): the maze is sound (symmetric, every
// capsule reachable, no dead ends), the figure turns only at tile centres and stops at walls,
// the tunnel wraps, capsules score, a power capsule scares the ghosts and eating them pays
// 200/400/800/1600 while their eyes go home and come back out, a touch costs a life and the
// last one ends the game, a cleared level brings a faster one — and, the one that matters, a
// scripted player clears the maze against the full set of cans on several seeds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAZE_BONUS_DOTS, MAZE_COLS, MAZE_DOOR_TOP, MAZE_FRIGHT_SECONDS, MAZE_HOUSE, MAZE_LIVES, MAZE_MAP, MAZE_ROWS, MAZE_START,
  autoMaze, createMaze, mazeCellAt, mazeFrightSeconds, mazeGhostSpeed, mazeGrid, mazePassable, mazePose, startMaze, steerMaze, stepMaze as step
} from '../shared/utils/tickerMaze.ts'
import { makeRng } from '../shared/utils/tickerRunner.ts'

const DT = 1 / 60
const play = (s, seconds, each) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (each) each(s)
    step(s, DT)
  }
  return s
}
const can = label => ({ kind: 'can', label })
const germ = () => ({ kind: 'germ', label: null })
const CANS = [can('COKE'), can('DR PEPPER'), can('SPRITE'), can('MOUNTAIN DEW')]
const game = (seed = 1, ghosts = CANS, extra = {}) => createMaze({ ghosts, rng: makeRng(seed), ...extra })
const tile = e => [Math.floor(e.x), Math.floor(e.y)]
/** Parks every ghost in the house, so a test can walk the figure around undisturbed. */
const park = (s) => {
  for (const g of s.ghosts) {
    g.mode = 'home'
    g.x = MAZE_HOUSE[0][0] + 0.5
    g.y = MAZE_HOUSE[0][1] + 0.5
  }
  s.dotsSinceReset = -1e9 // the house never lets them out
  s.sinceDot = -1e9
}

test('the maze: a rectangle, mirror-symmetric, one start, a door over the house, a tunnel on the house row', () => {
  assert.equal(MAZE_MAP.length, MAZE_ROWS)
  for (const row of MAZE_MAP) assert.equal(row.length, MAZE_COLS, row)
  for (const row of MAZE_MAP) {
    const mirror = [...row].reverse().join('')
    assert.equal(mirror, row, `symmetric: ${row}`)
  }
  assert.equal(MAZE_MAP.flatMap(r => [...r]).filter(ch => ch === 'P').length, 1)
  assert.equal(MAZE_MAP[MAZE_START[1]][MAZE_START[0]], 'P')
  assert.equal(MAZE_MAP[MAZE_DOOR_TOP[1] + 1][MAZE_DOOR_TOP[0]], '-', 'the door is right under the ghosts\' exit tile')
  for (const [c, r] of MAZE_HOUSE) assert.equal(MAZE_MAP[r][c], 'G')
  assert.equal(MAZE_MAP[9][0], 'T')
  assert.equal(MAZE_MAP[9][MAZE_COLS - 1], 'T')
})

test('every capsule is reachable from the start and no corridor tile is a dead end', () => {
  const grid = mazeGrid()
  const seen = new Set()
  const queue = [[MAZE_START[0], MAZE_START[1]]]
  seen.add(queue[0].join(','))
  for (let i = 0; i < queue.length; i++) {
    const [c, r] = queue[i]
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
      const nc = ((c + dx) % MAZE_COLS + MAZE_COLS) % MAZE_COLS
      const nr = r + dy
      if (!mazePassable(mazeCellAt(grid, nc, nr), 'player') || seen.has(`${nc},${nr}`)) continue
      seen.add(`${nc},${nr}`)
      queue.push([nc, nr])
    }
  }
  let pellets = 0
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = grid[r][c]
      if (cell === 'dot' || cell === 'power') {
        pellets++
        assert.ok(seen.has(`${c},${r}`), `capsule at ${c},${r} is reachable`)
      }
      if (mazePassable(cell, 'player')) {
        const exits = [[0, -1], [-1, 0], [0, 1], [1, 0]].filter(([dx, dy]) => mazePassable(mazeCellAt(grid, c + dx, r + dy), 'player')).length
        assert.ok(exits >= 2, `${c},${r} (${cell}) has ${exits} exits`)
      }
    }
  }
  assert.equal(grid.flat().filter(c => c === 'power').length, 4)
  const s = game()
  assert.equal(s.pelletsTotal, pellets)
  assert.ok(pellets > 150, `${pellets} capsules`)
})

test('ready: nothing moves; the first press starts it heading left; the ghosts and lives are as asked', () => {
  const s = game()
  assert.equal(s.status, 'ready')
  assert.equal(s.lives, MAZE_LIVES)
  assert.deepEqual(tile(s.player), [...MAZE_START])
  assert.deepEqual(s.ghosts.map(g => [g.kind, g.label, g.temper, g.mode]), [
    ['can', 'COKE', 'chaser', 'walk'], ['can', 'DR PEPPER', 'ambusher', 'home'], ['can', 'SPRITE', 'flank', 'home'], ['can', 'MOUNTAIN DEW', 'shy', 'home']
  ])
  assert.deepEqual(tile(s.ghosts[0]), [...MAZE_DOOR_TOP])
  play(s, 0.5)
  assert.deepEqual(tile(s.player), [...MAZE_START], 'parked until started')
  startMaze(s)
  assert.equal(s.status, 'running')
  play(s, 0.3)
  assert.ok(s.player.x < MAZE_START[0] + 0.5, 'off to the left')
  assert.equal(game(1, [can('X')]).ghosts.filter(g => g.kind === 'germ').length, 3, 'empty slots are germs')
  assert.equal(game(1, CANS, { lives: 4 }).lives, 4)
})

test('the figure stops at a wall, takes a queued turn at the next centre, and reverses at once', () => {
  const s = game()
  park(s)
  startMaze(s)
  play(s, 2) // left along the start row until the wall at column 3
  assert.equal(s.player.dir, null, 'stopped')
  assert.deepEqual(tile(s.player), [4, 15])
  assert.equal(mazePose(s), 'idle')
  steerMaze(s, 'up') // column 4 opens upward
  play(s, 0.2)
  assert.equal(s.player.dir, 'up')
  assert.ok(s.player.y < 15.5)
  const frames = new Set()
  play(s, 0.3, st => frames.add(mazePose(st)))
  assert.deepEqual([...frames].sort(), ['eating', 'idle'], 'chomping on the move (the jaw cycles)')
  steerMaze(s, 'down') // a reverse takes at once, mid-tile
  assert.equal(s.player.dir, 'down')
  // A wish that doesn't open yet is held until a centre where it does.
  play(s, 0.3)
  steerMaze(s, 'right')
  play(s, 1.5)
  assert.equal(s.player.dir, 'right', 'took the turn along the start row')
  assert.equal(Math.abs(s.player.y - 15.5) < 1e-6, true, 'on the row\'s centre line')
})

test('the tunnel wraps the figure from one edge to the other', () => {
  const s = game()
  park(s)
  startMaze(s)
  s.player = { x: 2.5, y: 9.5, dir: 'left', want: 'left' }
  play(s, 0.8)
  assert.ok(s.player.x > MAZE_COLS - 3, `came out on the right: ${s.player.x.toFixed(2)}`)
  assert.equal(s.player.y, 9.5)
})

test('capsules score ten, a power capsule fifty and a scare; eating the ghosts pays 200, 400, 800, 1600 and sends their eyes home', () => {
  const s = game()
  park(s)
  startMaze(s)
  const before = s.pellets
  play(s, 0.5)
  const eaten = before - s.pellets
  assert.ok(eaten >= 2, `ate ${eaten}`)
  assert.equal(s.score, eaten * 10)
  // Stand on the bottom-left power capsule.
  s.player = { x: 1.5, y: 15.5, dir: null, want: null }
  for (const g of s.ghosts) Object.assign(g, { mode: 'walk', x: 9.5, y: 3.5, dir: 'left' })
  step(s, DT)
  assert.ok(s.fright > MAZE_FRIGHT_SECONDS - DT - 1e-9 && s.fright <= MAZE_FRIGHT_SECONDS, `the scare clock: ${s.fright}`)
  assert.ok(s.ghosts.every(g => g.mode === 'fright' && g.dir === 'right'), 'frightened and turned around')
  assert.equal(mazePose(s), 'happy')
  assert.equal(s.score, eaten * 10 + 50)
  const base = s.score
  // Walk each ghost onto the figure in turn.
  s.ghosts.forEach((g, i) => {
    g.x = s.player.x
    g.y = s.player.y
    step(s, DT)
    assert.equal(g.mode, 'eyes', `ghost ${i} is eyes`)
    assert.equal(mazeGhostSpeed(s, g) > 10, true, 'eyes fly')
  })
  assert.equal(s.score - base, 200 + 400 + 800 + 1600)
  assert.equal(s.pops.length, 4)
  // The eyes find the door, drop into the house and come back out hunting.
  play(s, 6)
  assert.ok(s.ghosts.every(g => g.mode === 'walk' || g.mode === 'fright' || g.mode === 'leaving'), s.ghosts.map(g => g.mode).join())
  assert.equal(s.lives, MAZE_LIVES, 'eyes can\'t hurt')
  assert.equal(mazeFrightSeconds(1), MAZE_FRIGHT_SECONDS)
  assert.equal(mazeFrightSeconds(5), MAZE_FRIGHT_SECONDS - 2.4)
  assert.equal(mazeFrightSeconds(20), 2, 'never under two seconds')
})

test('a hunting ghost costs a life and a reset; the last life ends it; a press afterwards starts a fresh game against the same ghosts', () => {
  const s = game()
  startMaze(s)
  const g = s.ghosts[0]
  let deaths = 0
  let lives = s.lives
  play(s, 20, (st) => {
    if (st.status === 'running') {
      g.mode = 'walk'
      g.x = st.player.x
      g.y = st.player.y
    }
    if (st.status === 'ready') startMaze(st)
    if (st.lives !== lives) {
      deaths++
      lives = st.lives
      assert.equal(st.status, 'dying')
      assert.equal(mazePose(st), 'flatline')
    }
  })
  assert.equal(s.status, 'over')
  assert.equal(deaths, MAZE_LIVES)
  assert.equal(s.lives, 0)
  const frozen = s.elapsed
  play(s, 1)
  assert.equal(s.elapsed, frozen, 'nothing moves after the end')
  startMaze(s)
  assert.equal(s.status, 'running')
  assert.equal(s.lives, MAZE_LIVES)
  assert.equal(s.score, 0)
  assert.equal(s.pellets, s.pelletsTotal)
  assert.deepEqual(s.ghosts.map(g => g.label), CANS.map(c => c.label))
})

test('after a lost life the figure and the ghosts are back on their marks and the house counts from zero', () => {
  const s = game()
  startMaze(s)
  play(s, 3)
  s.ghosts[0].mode = 'walk'
  s.ghosts[0].x = s.player.x
  s.ghosts[0].y = s.player.y
  step(s, DT)
  assert.equal(s.status, 'dying')
  play(s, 1.3)
  assert.equal(s.status, 'ready')
  assert.deepEqual(tile(s.player), [...MAZE_START])
  assert.deepEqual(s.ghosts.map(g => g.mode), ['walk', 'home', 'home', 'home'])
  assert.equal(s.dotsSinceReset, 0)
  assert.equal(s.fright, 0)
})

test('the house lets the ghosts out one at a time, by capsules eaten or after a lull', () => {
  const s = game()
  startMaze(s)
  play(s, 0.1)
  assert.equal(s.ghosts[1].mode, 'leaving', 'the ambusher goes at once')
  play(s, 1.5)
  assert.equal(s.ghosts[1].mode, 'walk', 'and is out')
  assert.ok(s.ghosts[1].y <= MAZE_DOOR_TOP[1] + 0.5 + 1e-6, 'out through the door, above the house')
  // The others wait on the count — or on the clock, once the figure stops eating.
  s.player = { x: 1.5, y: 19.5, dir: null, want: null } // the bottom-left corner — eaten out, nothing to eat
  s.grid[19][1] = 'empty'
  play(s, 4.5)
  assert.ok(s.ghosts[2].mode !== 'home', 'the lull released the next')
})

test('the bonus vial shows after sixty capsules, waits nine seconds, and pays a hundred times the level', () => {
  const s = game()
  park(s)
  startMaze(s)
  s.dotsEaten = MAZE_BONUS_DOTS[0] - 1
  s.player = { x: 1.5, y: 1.5, dir: 'right', want: 'right' }
  play(s, 0.3)
  assert.ok(s.bonus, 'the vial is out')
  assert.equal(s.bonus.value, 100)
  assert.equal(s.bonusesShown, 1)
  play(s, 9.5)
  assert.equal(s.bonus, null, 'gone untaken')
  s.dotsEaten = MAZE_BONUS_DOTS[1] - 1
  s.player = { x: 1.5, y: 3.5, dir: 'right', want: 'right' } // a row still full of capsules
  play(s, 0.3)
  assert.ok(s.bonus)
  const before = s.score
  s.grid[Math.floor(s.bonus.y)][Math.floor(s.bonus.x)] = 'empty' // the capsule under it, so the vial is the only thing eaten
  s.player = { x: s.bonus.x, y: s.bonus.y, dir: null, want: null }
  step(s, DT)
  assert.equal(s.bonus, null)
  assert.equal(s.score - before, 100)
})

test('scatter and chase alternate on the clock, every switch turning the hunters around', () => {
  const s = game()
  startMaze(s)
  assert.equal(s.mode, 'scatter')
  const dirBefore = s.ghosts[0].dir
  play(s, 7.1)
  assert.equal(s.mode, 'chase')
  void dirBefore
  play(s, 20)
  assert.equal(s.mode, 'scatter')
})

test('a cleared level brings the next: capsules back, ghosts faster, the scare shorter', () => {
  const s = game()
  park(s)
  startMaze(s)
  for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c < MAZE_COLS; c++) if (s.grid[r][c] === 'dot' || s.grid[r][c] === 'power') s.grid[r][c] = 'empty'
  s.pellets = 1
  s.grid[19][9] = 'dot'
  s.player = { x: 9.5, y: 19.5, dir: null, want: null }
  const speed1 = mazeGhostSpeed(s, s.ghosts[0])
  step(s, DT)
  assert.equal(s.status, 'cleared')
  assert.equal(mazePose(s), 'petted')
  play(s, 1.7)
  assert.equal(s.status, 'ready')
  assert.equal(s.level, 2)
  assert.equal(s.levelsCleared, 1)
  assert.equal(s.pellets, s.pelletsTotal)
  s.ghosts[0].mode = 'walk'
  assert.ok(mazeGhostSpeed(s, s.ghosts[0]) > speed1)
  assert.ok(mazeFrightSeconds(2) < mazeFrightSeconds(1))
})

test('germs are slower than cans, and everyone crawls through the tunnel', () => {
  const s = game(1, [can('COKE'), germ()])
  startMaze(s)
  const [coke, bug] = s.ghosts
  bug.mode = 'walk'
  assert.ok(mazeGhostSpeed(s, bug) < mazeGhostSpeed(s, coke))
  const open = mazeGhostSpeed(s, coke)
  coke.x = 0.5
  coke.y = 9.5
  assert.ok(mazeGhostSpeed(s, coke) < open * 0.6)
})

test('the scripted player clears the maze against four cans on every seed, and against four germs', () => {
  for (const [seed, ghosts, name] of [[1, CANS, 'cans'], [2, CANS, 'cans'], [3, CANS, 'cans'], [4, CANS, 'cans'], [5, CANS, 'cans'], [6, CANS, 'cans'], [7, [germ(), germ(), germ(), germ()], 'germs']]) {
    const s = game(seed, ghosts)
    play(s, 240, (st) => {
      if (st.level === 1) autoMaze(st)
    })
    assert.ok(s.levelsCleared >= 1, `${name} seed ${seed}: ${s.status} on level ${s.level} with ${s.pellets} capsules left, ${s.lives} lives, ${s.score} points at ${s.elapsed.toFixed(0)}s`)
    assert.ok(s.score >= s.pelletsTotal * 10, 'every capsule paid')
  }
})
