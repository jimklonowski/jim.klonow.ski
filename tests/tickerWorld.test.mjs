// TICKER WORLD (shared/utils/tickerWorld.ts): the month becomes a level the generator promises
// is finishable — pits short of a jump, stairs a tile at a time — the physics do what they say
// (a tap clears a step, a hold reaches a platform three rows up, a pit costs a life and sends
// you back to the week's flag), and a scripted runner reaches the castle on every seed and on
// the hardest month the log can produce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_ROW, DAY_TILES, GROUND, WORLD_JUMP_V as JUMP_V, WORLD_GRAVITY as GRAVITY, HOLD_GRAVITY, MAX_PIT, PLATFORM, PLAYER_H, PLAYER_W, ROWS, START_TILES, TILE,
  autoRun, buildLevel, createWorld, dayAt, groundRowAt, groundRowFor, levelWidth, platformLength, startWorld as start, stepWorld, tileAt, worldPose
} from '../shared/utils/tickerWorld.ts'
import { makeRng } from '../shared/utils/tickerRunner.ts'

const DT = 1 / 60
const day = (over = {}) => ({ date: '2026-10-01', logged: true, doses: 2, sodas: [], workoutMin: 0, recovery: 70, draw: false, ...over })
const run = (s, seconds, input) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepWorld(s, DT, typeof input === 'function' ? input(s) : input)
  return s
}
const world = (days, seed = 1, extra = {}) => createWorld({ days, width: 720, height: 384, seed, ...extra })

/** A random month: logged or not, workouts, doses, recovery, a draw or two. */
function randomMonth(seed, n = 30) {
  const rng = makeRng(seed)
  return Array.from({ length: n }, (_, i) => day({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    logged: rng() > 0.2,
    doses: Math.floor(rng() * 5),
    sodas: rng() > 0.6 ? [{ oz: 12 }] : [],
    workoutMin: rng() > 0.5 ? 20 + Math.floor(rng() * 90) : 0,
    recovery: rng() > 0.1 ? Math.floor(30 + rng() * 69) : null,
    draw: rng() > 0.93
  }))
}

test('hills follow recovery, platforms follow the session length', () => {
  assert.equal(groundRowFor(null), BASE_ROW)
  assert.equal(groundRowFor(45), BASE_ROW)
  assert.equal(groundRowFor(65), BASE_ROW - 1)
  assert.equal(groundRowFor(90), BASE_ROW - 2)
  assert.equal(platformLength(10), 3)
  assert.equal(platformLength(60), 6)
  assert.equal(platformLength(300), 10)
})

test('a month lays out day by day: a pit for an unlogged day, a platform with capsules for a workout, flags at the weeks, a castle at the end', () => {
  const days = [
    day({ workoutMin: 45, doses: 3 }),
    day({ logged: false, doses: 0 }),
    day({ doses: 4 }),
    ...Array.from({ length: 5 }, () => day()),
    day({ draw: true }) // day 8: the second week
  ]
  const level = buildLevel(days, makeRng(1))
  assert.equal(level.cols, START_TILES + days.length * DAY_TILES + 10)
  // Day 0: a platform three rows above the ground, three capsules on it.
  const c0 = START_TILES
  const g0 = groundRowAt(level, c0 + 4)
  const platformCols = []
  for (let c = c0; c < c0 + DAY_TILES; c++) if (tileAt(level, c, g0 - 3) === PLATFORM) platformCols.push(c)
  assert.equal(platformCols.length, platformLength(45))
  assert.equal(level.capsules.filter(k => k.day === 0).length, 3)
  assert.ok(level.capsules.filter(k => k.day === 0).every(k => k.y < (g0 - 3) * TILE), 'the capsules sit on the platform')
  // Day 1: a pit of MAX_PIT tiles, flat ground on both sides.
  const c1 = START_TILES + DAY_TILES
  const pitCols = []
  for (let c = c1; c < c1 + DAY_TILES; c++) if (groundRowAt(level, c) === ROWS) pitCols.push(c)
  assert.equal(pitCols.length, MAX_PIT)
  assert.equal(groundRowAt(level, pitCols[0] - 1), groundRowAt(level, pitCols.at(-1) + 1), 'level edges')
  // Day 2: capsules along the ground.
  assert.equal(level.capsules.filter(k => k.day === 2).length, 4)
  // Week 2 starts at day 7 with a flag; the draw on day 8 is a block.
  assert.deepEqual(level.flags.map(f => f.week), [1])
  assert.equal(level.blocks.length, 1)
  assert.equal(level.blocks[0].day, 8)
  assert.ok(level.castleX < levelWidth(level) && level.castleX > (START_TILES + days.length * DAY_TILES) * TILE)
})

test('the generator never makes a step taller than a tile, however the recovery jumps around', () => {
  const days = [day({ recovery: 40 }), day({ recovery: 95 }), day({ recovery: 20 }), day({ recovery: 85 }), day({ recovery: null })]
  const level = buildLevel(days, makeRng(2))
  let prev = groundRowAt(level, 0)
  for (let c = 1; c < level.cols; c++) {
    const r = groundRowAt(level, c)
    if (r === ROWS || prev === ROWS) {
      prev = r
      continue
    }
    assert.ok(Math.abs(r - prev) <= 1, `col ${c}: ${prev} → ${r}`)
    prev = r
  }
})

test('ready stands still; the first press starts; a tap-jump clears a step and a held jump reaches a platform', () => {
  const s = world([day(), day()])
  run(s, 0.5, { left: false, right: true, jump: true, jumpHeld: true })
  assert.equal(s.player.x, s.level.spawnX, 'nothing moves until started')
  assert.equal(worldPose(s), 'idle')
  start(s)
  assert.equal(s.status, 'running')
  const tapApex = JUMP_V ** 2 / (2 * GRAVITY)
  const holdApex = JUMP_V ** 2 / (2 * HOLD_GRAVITY)
  assert.ok(tapApex > TILE * 1.5 && tapApex < TILE * 3, `a tap peaks at ${tapApex.toFixed(0)}px`)
  assert.ok(holdApex > TILE * 3 + PLAYER_H / 2 && holdApex < TILE * 6, `a hold peaks at ${holdApex.toFixed(0)}px`)
  // Measure the held jump in the sim.
  const y0 = s.player.y
  let top = y0
  run(s, 0.03, { left: false, right: false, jump: true, jumpHeld: true })
  run(s, 1.2, (st) => {
    top = Math.min(top, st.player.y)
    return { left: false, right: false, jump: false, jumpHeld: st.player.vy < 0 }
  })
  assert.ok(y0 - top > TILE * 3.5, `held jump rose ${(y0 - top).toFixed(0)}px`)
  assert.ok(s.player.onGround, 'and landed')
})

test('a pit costs a life and respawns at the spawn (or the last week flag); the last life ends the game', () => {
  const days = [day({ logged: false })]
  const s = world(days, 3, { lives: 2 })
  start(s)
  const walkIn = { left: false, right: true, jump: false, jumpHeld: false }
  let respawnX = null
  run(s, 12, (st) => {
    if (respawnX == null && st.lives === 1) respawnX = st.player.x // the frame it came back
    return walkIn
  })
  assert.ok(respawnX != null && respawnX < 3 * TILE, `back at the spawn after the first fall (x=${respawnX})`)
  assert.equal(s.status, 'over', 'walked straight back in: out of lives')
  assert.equal(worldPose(s), 'flatline')
  start(s)
  assert.equal(s.status, 'running')
  assert.equal(s.lives, 2)
  assert.equal(s.score, 0)
})

test('capsules are collected once, flags are checkpoints, the castle wins', () => {
  const days = Array.from({ length: 8 }, (_, i) => day({ doses: 2, workoutMin: 0, logged: true, date: `2026-10-0${i + 1}` }))
  const s = world(days, 4)
  run(s, 90, autoRun)
  assert.equal(s.status, 'cleared', `${s.status} at x=${s.player.x.toFixed(0)} of ${levelWidth(s.level)}`)
  assert.ok(s.collected > 0, 'ran through some ground capsules')
  assert.equal(s.checkpointWeek, 1, 'passed the week flag')
  assert.ok(s.score >= 200 + 50, 'the castle bonus')
  assert.equal(worldPose(s), 'petted')
  assert.ok(s.level.capsules.filter(c => c.taken).length === s.collected)
})

test('the camera leads the player and stops at the ends', () => {
  const s = world(randomMonth(5), 5)
  assert.equal(s.camera, 0)
  run(s, 20, autoRun)
  assert.ok(s.camera > 0 && s.camera <= levelWidth(s.level) - s.width)
  assert.ok(s.player.x - s.camera < s.width * 0.5, 'the player stays left of centre')
  assert.ok(dayAt(s) >= 0)
})

test('the scripted runner reaches the castle on every random month, and on the worst one the log can make', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const s = world(randomMonth(seed), seed)
    run(s, 240, autoRun)
    assert.equal(s.status, 'cleared', `seed ${seed}: ${s.status} at day ${dayAt(s)}, x=${s.player.x.toFixed(0)}, lives ${s.lives}`)
  }
  // Every other day unlogged, recovery swinging, workouts everywhere: pits and stairs back to back.
  const worst = Array.from({ length: 30 }, (_, i) => day({ logged: i % 2 === 0, recovery: i % 3 === 0 ? 95 : i % 3 === 1 ? 20 : 65, workoutMin: 90, doses: 4 }))
  const s = world(worst, 99)
  run(s, 240, autoRun)
  assert.equal(s.status, 'cleared', `worst month: ${s.status} at day ${dayAt(s)}, lives ${s.lives}`)
  // And on a phone-width view, which changes nothing about the level.
  const narrow = createWorld({ days: randomMonth(13), width: 358, height: 384, seed: 13 })
  run(narrow, 240, autoRun)
  assert.equal(narrow.status, 'cleared')
})

test('ground tiles are solid from the side; a platform is passed through from below', () => {
  const days = [day({ workoutMin: 60, doses: 0 })]
  const level = buildLevel(days, makeRng(1))
  const g = groundRowAt(level, START_TILES + 4)
  let platformCol = -1
  for (let c = START_TILES; c < START_TILES + DAY_TILES; c++) {
    if (tileAt(level, c, g - 3) === PLATFORM) {
      platformCol = c
      break
    }
  }
  assert.ok(platformCol > 0)
  assert.equal(tileAt(level, platformCol, g), GROUND)
  // Stand under the platform, jump straight up with a hold: the head passes the platform row.
  const s = world(days, 1)
  start(s)
  s.player.x = platformCol * TILE + 2
  let top = s.player.y
  run(s, 0.03, { left: false, right: false, jump: true, jumpHeld: true })
  run(s, 1.5, (st) => {
    top = Math.min(top, st.player.y)
    return { left: false, right: false, jump: false, jumpHeld: st.player.vy < 0 }
  })
  assert.ok(top + PLAYER_H <= (g - 3) * TILE + 1, `rose through the platform (top ${top.toFixed(0)}, platform row y ${(g - 3) * TILE})`)
  assert.ok(s.player.onGround && s.player.y + PLAYER_H <= (g - 3) * TILE + 0.5, `landed on it: feet at ${(s.player.y + PLAYER_H).toFixed(0)}`)
  assert.ok(PLAYER_W < 2 * TILE, 'the box fits a two-tile gap')
})
