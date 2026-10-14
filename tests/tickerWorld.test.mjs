// TICKER WORLD (shared/utils/tickerWorld.ts): the month becomes a level the generator promises
// is finishable — pits short of a jump, stairs a tile at a time — the physics do what they say
// (a tap clears a step, a hold reaches a platform three rows up, a pit costs a life and sends
// you back to the week's flag), the things that fight back behave (a soda is a can on patrol
// that a stomp crushes, a tall boy leaves a shell a touch kicks, germs keep a clean month
// honest, a side hit shrinks you before it costs a life), and a scripted runner reaches the
// castle on every seed and on the hardest month the log can produce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_ROW, BLOCK, BLOCK_POINTS, CAN_SPEED, COMBO_POINTS, CHAIN_POINTS, DAY_TILES, GROUND, WORLD_JUMP_V as JUMP_V, WORLD_GRAVITY as GRAVITY, HATCHLING_H, HATCHLING_W, HOLD_GRAVITY,
  GERM_SPEED, HURT_SECONDS, ITEM_POINTS, ITEM_RISE, MAX_PIT, MAX_SCOOPS, MOVER_SPEED, NEEDLE_EVERY, NEEDLE_FIRST, NEEDLE_SPEED, PLATE_SPEED, PLATFORM, PLAYER_H, PLAYER_W, POPPER_PERIOD, POPPER_UP, ROWS, SCOOP_POINTS, SCOOP_SPEED, SHELL_SPEED, STACK, STACK_POINTS, STAR_POINTS, STAR_SECONDS, START_TILES, STOMP_BOUNCE, TILE, WEEK_PACE,
  autoRun, blockLine, buildLevel, createWorld, dayAt, enemiesLeft, germCount, groundRowAt, groundRowFor, isShortSleep, isStarred, levelWidth, platformLength, popperBox, popperRise, popperSafeFor, stackHeight, startWorld as start, stepWorld, tileAt, worldFeats, worldPose, worldSummary
} from '../shared/utils/tickerWorld.ts'
import { makeRng } from '../shared/utils/tickerRunner.ts'

const DT = 1 / 60
const STILL = { left: false, right: false, jump: false, jumpHeld: false }
const RIGHT = { left: false, right: true, jump: false, jumpHeld: false }
const day = (over = {}) => ({ date: '2026-10-01', logged: true, doses: 2, sodas: [], workoutMin: 0, cardio: false, recovery: 70, sleepMin: null, draw: false, drawLabel: null, goldStar: false, ...over })
/** Shrinks the player the way a hit would, without the grace. */
const shrink = (s) => {
  const p = s.player
  p.x += (p.w - HATCHLING_W) / 2
  p.y += p.h - HATCHLING_H
  p.w = HATCHLING_W
  p.h = HATCHLING_H
  s.size = 'hatchling'
}
/** Stands the player under a block and jumps, holding, until it's hit. */
const bump = (s, block) => {
  const p = s.player
  const col = Math.floor(block.x / TILE)
  p.x = block.x - (p.w - TILE) / 2
  p.y = groundRowAt(s.level, col) * TILE - p.h
  p.vx = 0
  p.vy = 0
  p.onGround = true
  run(s, 0.03, { ...STILL, jump: true, jumpHeld: true })
  return until(s, () => block.hit, 1.5, { ...STILL, jumpHeld: true })
}
const onto = (s, it) => {
  const p = s.player
  p.x = it.x + it.w / 2 - p.w / 2
  p.y = it.y + it.h - p.h
  p.vx = 0
  p.vy = 0
}
/** Stands the player on the ground at x. */
const stand = (s, x) => {
  const p = s.player
  p.x = x
  p.y = groundRowAt(s.level, Math.floor((x + p.w / 2) / TILE)) * TILE - p.h
  p.vx = 0
  p.vy = 0
  p.onGround = true
}
/** The hidden blocks out of a test that jumps about under them for other reasons. */
const noHidden = (s) => {
  s.level.blocks = s.level.blocks.filter(b => !b.hidden)
}
const run = (s, seconds, input) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepWorld(s, DT, typeof input === 'function' ? input(s) : input)
  return s
}
/** Steps until `cond` holds (or `seconds` pass); returns whether it did. */
const until = (s, cond, seconds, input = STILL) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (cond(s)) return true
    stepWorld(s, DT, typeof input === 'function' ? input(s) : input)
  }
  return cond(s)
}
const world = (days, seed = 1, extra = {}) => createWorld({ days, width: 720, height: 384, seed, ...extra })
const dayCols = i => [START_TILES + i * DAY_TILES, START_TILES + (i + 1) * DAY_TILES]
const inDay = (e, i) => {
  const [c0, c1] = dayCols(i)
  return e.x >= c0 * TILE && e.x + e.w <= c1 * TILE
}
/** Drops the player onto an enemy from a little above it, feet first (already falling at `vy`). */
const dropOn = (s, e, above = 30, vy = 0) => {
  const p = s.player
  p.x = e.x + e.w / 2 - p.w / 2
  p.y = e.y - p.h - above
  p.vx = 0
  p.vy = vy
  p.onGround = false
}

/** A random month: logged or not, workouts, doses, recovery, a draw or two. */
function randomMonth(seed, n = 30) {
  const rng = makeRng(seed)
  return Array.from({ length: n }, (_, i) => {
    const sodaRoll = rng()
    return day({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      logged: rng() > 0.2,
      doses: Math.floor(rng() * 5),
      sodas: sodaRoll > 0.85 ? [{ oz: 20 }, { oz: 12 }, { oz: 12 }] : sodaRoll > 0.6 ? [{ oz: rng() > 0.5 ? 20 : 12 }] : [],
      workoutMin: rng() > 0.5 ? 20 + Math.floor(rng() * 90) : 0,
      cardio: rng() > 0.5,
      recovery: rng() > 0.1 ? Math.floor(30 + rng() * 69) : null,
      sleepMin: rng() > 0.15 ? 240 + Math.floor(rng() * 300) : null,
      draw: rng() > 0.9
    })
  })
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
  const shown = level.blocks.filter(b => !b.hidden)
  assert.equal(shown.length, 1)
  assert.equal(shown[0].day, 8)
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

test('sodas patrol their day as cans (a tall boy for a big one), germs follow recovery with a floor, and nothing stands on the runway or a pit day', () => {
  assert.equal(germCount(null), 1)
  assert.equal(germCount(90), 0)
  assert.equal(germCount(55), 1)
  assert.equal(germCount(30), 3)
  const days = [
    day({ sodas: [{ oz: 12 }, { oz: 20 }], recovery: 70 }), // a can, a tall boy, one germ
    day({ recovery: 90 }), // green and nothing logged against it: the floor puts one germ in
    day({ sodas: [{ oz: 12 }], recovery: 90 }), // the can is the day's actor: no germ
    day({ recovery: 30 }), // three germs
    day({ logged: false, sodas: [{ oz: 12 }] }), // a pit day: nothing
    day({ recovery: null }) // unknown: one germ
  ]
  const level = buildLevel(days, makeRng(3))
  const kinds = i => level.enemies.filter(e => e.day === i).map(e => e.kind).sort()
  assert.deepEqual(kinds(0), ['can', 'germ', 'tall'])
  assert.deepEqual(kinds(1), ['germ'])
  assert.deepEqual(kinds(2), ['can'])
  assert.deepEqual(kinds(3), ['germ', 'germ', 'germ'])
  assert.deepEqual(kinds(4), [])
  assert.deepEqual(kinds(5), ['germ'])
  for (const e of level.enemies) {
    assert.ok(inDay(e, e.day), `${e.kind} of day ${e.day} stands in its day (x=${e.x})`)
    const col = Math.floor((e.x + e.w / 2) / TILE)
    assert.equal(e.y + e.h, groundRowAt(level, col) * TILE, `${e.kind} stands on the ground`)
    assert.equal(e.mode, 'walk')
    assert.equal(e.awake, false, 'asleep until the camera comes')
  }
  const tall = level.enemies.find(e => e.kind === 'tall')
  const can = level.enemies.find(e => e.kind === 'can')
  assert.ok(tall.h > can.h && tall.w > can.w, 'a tall boy is bigger')
})

test('ready stands still; the first press starts; a tap-jump clears a step and a held jump reaches a platform', () => {
  const s = world([day({ recovery: 90 }), day({ recovery: 90 })]) // green, so nothing walks into the measurement
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

test('a stomp crushes a can, bounces the player and climbs the combo; landing resets it; holding jump turns the bounce into a jump', () => {
  const days = [day({ sodas: [{ oz: 12 }, { oz: 12 }, { oz: 12 }, { oz: 12 }], recovery: 90, doses: 0 })] // four cans, no germs, no capsules in the way
  const s = world(days, 4)
  start(s)
  noHidden(s)
  const cans = s.level.enemies.filter(e => e.kind === 'can')
  assert.equal(cans.length, 4)
  dropOn(s, cans[0])
  assert.ok(until(s, () => cans[0].mode === 'crushed', 1), 'the can is crushed')
  assert.equal(s.score, COMBO_POINTS[0])
  assert.equal(s.combo, 1)
  assert.equal(s.crushed, 1)
  assert.ok(s.player.vy < 0 && !s.player.onGround, 'bounced')
  assert.ok(Math.abs(s.player.vy) <= STOMP_BOUNCE + 1, `a plain bounce (${s.player.vy.toFixed(0)})`)
  assert.deepEqual(s.pops.map(p => p.text), ['100'])
  // Still in the air: onto the next can, then the next.
  dropOn(s, cans[1], 10)
  assert.ok(until(s, () => cans[1].mode === 'crushed', 1), 'the second')
  assert.equal(s.score, COMBO_POINTS[0] + COMBO_POINTS[1])
  dropOn(s, cans[2], 10)
  assert.ok(until(s, () => cans[2].mode === 'crushed', 1), 'the third')
  assert.equal(s.combo, 3)
  assert.deepEqual(s.pops.map(p => p.text), ['100', '200', '400'])
  // Land, and the combo is over: the fourth is worth 100 again.
  assert.ok(until(s, st => st.player.onGround, 2), 'landed')
  assert.equal(s.combo, 0)
  dropOn(s, cans[3])
  assert.ok(until(s, () => cans[3].mode === 'crushed', 1, { ...STILL, jumpHeld: true }), 'the fourth')
  assert.equal(s.score, 100 + 200 + 400 + 100)
  assert.ok(Math.abs(s.player.vy) > STOMP_BOUNCE + 50, `a held bounce is a jump (${s.player.vy.toFixed(0)})`)
  assert.ok(until(s, () => cans[3].mode === 'gone', 1), 'a crushed can clears away')
  assert.equal(enemiesLeft(s), 0)
})

test('five stomps in one flight: an extra life, capped', () => {
  const days = [day({ sodas: [{ oz: 12 }, { oz: 12 }, { oz: 12 }, { oz: 12 }], recovery: 90, doses: 0 }), day({ sodas: [{ oz: 12 }], recovery: 90, doses: 0 })]
  const s = world(days, 5)
  start(s)
  noHidden(s)
  const cans = s.level.enemies.filter(e => e.kind === 'can')
  cans.forEach((e) => {
    e.awake = true
  })
  for (const can of cans) {
    dropOn(s, can, 10)
    assert.ok(until(s, () => can.mode === 'crushed', 1))
  }
  assert.equal(s.lives, 4, 'the fifth stomp was a 1UP')
  assert.equal(s.pops.at(-1).text, '1UP')
  assert.equal(s.score, 100 + 200 + 400 + 800)
})

test('a touch from the side shrinks a grown heart and buys a moment; a touch while small costs a life; the respawn is grown', () => {
  const days = [day({ sodas: [{ oz: 12 }], recovery: 90 })]
  const s = world(days, 6)
  start(s)
  const can = s.level.enemies[0]
  const p = s.player
  assert.equal(s.size, 'grown')
  assert.deepEqual([p.w, p.h], [PLAYER_W, PLAYER_H])
  // Stand on the ground just left of the can and walk into it.
  p.x = can.x - p.w - 20
  p.y = can.y + can.h - p.h
  const feet = p.y + p.h
  assert.ok(until(s, st => st.size === 'hatchling', 2, RIGHT), 'shrunk')
  assert.deepEqual([p.w, p.h], [HATCHLING_W, HATCHLING_H])
  assert.equal(p.y + p.h, feet, 'the feet stayed put')
  assert.equal(s.lives, 3)
  assert.equal(worldPose(s), 'worried')
  assert.ok(s.hurtUntil - s.elapsed > HURT_SECONDS - 0.1, 'untouchable for a moment')
  // Walking on through the can while untouchable costs nothing.
  run(s, 0.5, RIGHT)
  assert.equal(s.lives, 3)
  assert.equal(can.mode, 'walk')
  // The moment over, meet the can again: a life, and back at the spawn, grown.
  s.hurtUntil = 0
  p.x = can.x + can.w + 20
  p.vx = 0
  assert.ok(until(s, st => st.lives === 2, 3, { ...STILL, left: true }), 'a life')
  assert.equal(s.size, 'grown')
  assert.equal(p.x, s.level.spawnX)
  assert.ok(s.hurtUntil > s.elapsed, 'a breath after the respawn')
})

test('a tall boy takes two stomps: the first leaves a shell, a touch kicks it, it crushes what it meets and turns at a wall; a stomp stops it, another crushes it', () => {
  const days = [day({ sodas: [{ oz: 20 }, { oz: 12 }, { oz: 12 }], recovery: 90, doses: 0 })]
  const s = world(days, 7)
  start(s)
  noHidden(s)
  const [tall, canA, canB] = s.level.enemies
  assert.equal(tall.kind, 'tall')
  dropOn(s, tall)
  assert.ok(until(s, () => tall.mode === 'shell', 1), 'dented, not crushed')
  assert.equal(tall.vx, 0)
  assert.equal(s.score, 100)
  // Step off it on the way down (a straight bounce lands on it again), then walk into it from
  // the left: it slides right, away from the player.
  const p = s.player
  p.x = tall.x - p.w - 30
  assert.ok(until(s, st => st.player.onGround, 2))
  assert.equal(tall.mode, 'shell')
  p.vx = 0
  assert.ok(until(s, () => tall.vx !== 0, 2, RIGHT), 'kicked')
  assert.equal(tall.vx, SHELL_SPEED)
  assert.equal(s.lives, 3, 'the kicker is not hurt by its own kick')
  assert.ok(until(s, () => canA.mode === 'crushed' && canB.mode === 'crushed', 6), 'it crushes the two cans ahead')
  assert.equal(s.score, 100 + CHAIN_POINTS[0] + CHAIN_POINTS[1])
  assert.equal(tall.chain, 2)
  assert.ok(until(s, () => tall.vx < 0, 8), 'turned at the end of the world')
  // Stop it with a stomp (it's quick: drop onto it already falling), step off, then crush it with another.
  tall.x = p.x + 200
  dropOn(s, tall, 4, 250)
  assert.ok(until(s, () => tall.vx === 0 && tall.mode === 'shell', 1), 'stopped')
  p.x = tall.x - p.w - 30
  assert.ok(until(s, st => st.player.onGround, 2))
  assert.equal(tall.mode, 'shell')
  dropOn(s, tall)
  assert.ok(until(s, () => tall.mode === 'crushed', 1), 'crushed')
  assert.equal(s.crushed, 3)
})

test('a sliding shell hurts; the player passes through a crushed one', () => {
  const days = [day({ sodas: [{ oz: 20 }], recovery: 90 })]
  const s = world(days, 8)
  start(s)
  const tall = s.level.enemies[0]
  tall.awake = true
  tall.mode = 'shell'
  tall.vx = -SHELL_SPEED
  tall.at = -1
  const p = s.player
  p.x = tall.x - 120
  p.y = tall.y + tall.h - p.h
  assert.ok(until(s, st => st.size === 'hatchling', 2), 'the shell coming back is a hit')
})

test('cans keep to their day and turn at a ledge; germs hop, wander and fall into a pit', () => {
  // Day 1 and the pit day are level with each other: a germ can't climb a stair, only wander off a ledge.
  const days = [day({ sodas: [{ oz: 12 }], recovery: 90 }), day({ recovery: 50 }), day({ logged: false, recovery: 50 })]
  const s = world(days, 9, { width: 1600 })
  start(s)
  const can = s.level.enemies.find(e => e.kind === 'can')
  const germ = s.level.enemies.find(e => e.kind === 'germ')
  const [c0, c1] = dayCols(0)
  let turns = 0
  let hopped = false
  let dir = can.dir
  s.player.y = -1000 // out of everyone's way
  s.player.vy = 0
  run(s, 25, (st) => {
    if (can.dir !== dir) {
      turns += 1
      dir = can.dir
    }
    if (germ.mode === 'walk' && !germ.onGround && germ.vy < 0) hopped = true
    st.player.y = -1000
    st.player.vy = 0
    return STILL
  })
  assert.ok(can.x >= c0 * TILE && can.x + can.w <= c1 * TILE, `the can stayed in its day (x=${can.x.toFixed(0)})`)
  assert.ok(turns >= 2, `and paced it (${turns} turns)`)
  assert.equal(can.mode, 'walk')
  assert.ok(Math.abs(can.vx), CAN_SPEED)
  assert.ok(hopped, 'the germ hops')
  assert.equal(germ.mode, 'gone', 'and wandered into the pit')
})

test('two sodas stack a wall late in the day (three high from three, two under a platform); it blocks a walk, a held jump clears it, a kicked shell knocks it down', () => {
  assert.equal(stackHeight(day({ sodas: [{ oz: 12 }] })), 0)
  assert.equal(stackHeight(day({ sodas: [{ oz: 12 }, { oz: 12 }] })), 2)
  assert.equal(stackHeight(day({ sodas: [{ oz: 12 }, { oz: 12 }, { oz: 12 }, { oz: 12 }] })), 3)
  assert.equal(stackHeight(day({ sodas: [{ oz: 12 }, { oz: 12 }, { oz: 12 }], workoutMin: 30 })), 2)
  assert.equal(stackHeight(day({ sodas: [{ oz: 12 }, { oz: 12 }], logged: false })), 0)
  const days = [day({ sodas: [{ oz: 20 }, { oz: 12 }, { oz: 12 }], recovery: 90, doses: 0 })]
  const level = buildLevel(days, makeRng(11))
  const col = START_TILES + 17
  const g = groundRowAt(level, col + 1)
  assert.equal(tileAt(level, col, g - 1), STACK)
  assert.equal(tileAt(level, col, g - 2), STACK)
  assert.equal(tileAt(level, col, g - 3), STACK)
  assert.equal(tileAt(level, col, g - 4), 0)
  assert.equal(groundRowAt(level, col), g - 3, 'the wall counts as something to stand on')
  // Walking into it stops you.
  const s = world(days, 11)
  start(s)
  s.level.enemies.forEach((e) => {
    e.mode = 'gone'
  })
  const p = s.player
  p.x = col * TILE - 120
  p.y = g * TILE - p.h
  run(s, 1.5, RIGHT)
  assert.ok(p.x + p.w <= col * TILE + 0.01 && p.x + p.w > col * TILE - 2, `stopped at the wall (front at ${(p.x + p.w).toFixed(1)}, wall at ${col * TILE})`)
  assert.equal(s.lives, 3)
  // The runner clears it with a held jump.
  p.x = col * TILE - 160
  p.vx = 0
  run(s, 3, autoRun)
  assert.ok(p.x > (col + 1) * TILE, `past the wall (x=${p.x.toFixed(0)})`)
  assert.equal(s.lives, 3)
  // A kicked shell takes it down: three cans, three hundred points, the tiles gone.
  const s2 = world(days, 11)
  start(s2)
  const tall = s2.level.enemies.find(e => e.kind === 'tall')
  s2.level.enemies.forEach((e) => {
    if (e !== tall) e.mode = 'gone'
  })
  tall.awake = true
  tall.mode = 'shell'
  tall.x = col * TILE - 200
  tall.vx = SHELL_SPEED
  tall.dir = 1
  tall.at = -1
  s2.player.y = -1000
  const before = s2.score
  assert.ok(until(s2, st => tileAt(st.level, col, g - 1) === 0, 3, (st) => {
    st.player.y = -1000
    st.player.vy = 0
    return STILL
  }), 'the wall came down')
  assert.equal(tileAt(s2.level, col, g - 3), 0)
  assert.equal(s2.score - before, 3 * STACK_POINTS)
  assert.equal(s2.pops.at(-1).text, String(3 * STACK_POINTS))
  run(s2, 0.4, (st) => {
    st.player.y = -1000
    st.player.vy = 0
    return STILL
  })
  assert.equal(tall.mode, 'shell', 'and the shell kept going')
  assert.ok(tall.x > (col + 1) * TILE, `through (x=${tall.x.toFixed(0)})`)
})

test('a draw day fires needles from off the right while you are in it: a side hit hurts, a stomp crushes, and bumping the block from below stops them', () => {
  const days = [day({ draw: true, recovery: 90, sodas: [], doses: 0 })]
  const s = world(days, 12)
  start(s)
  noHidden(s)
  s.level.enemies.forEach((e) => {
    e.mode = 'gone'
  })
  const needlesSoFar = () => s.level.enemies.filter(e => e.kind === 'needle')
  const p = s.player
  const c0 = START_TILES
  const g = groundRowAt(s.level, c0 + 4)
  // Stand in the day; the first needle comes after NEEDLE_FIRST, from the right edge of the screen, at chest height.
  p.x = (c0 + 6) * TILE
  p.y = g * TILE - p.h
  assert.equal(needlesSoFar().length, 0)
  run(s, NEEDLE_FIRST + 0.05, STILL)
  assert.equal(needlesSoFar().length, 1, 'the first needle')
  const n1 = needlesSoFar()[0]
  assert.ok(n1.x > s.camera + s.width - 40 && n1.x <= s.camera + s.width + 20, `from the right edge (x=${n1.x.toFixed(0)}, edge ${(s.camera + s.width).toFixed(0)})`)
  assert.ok(n1.y + n1.h <= g * TILE - 24 && n1.y >= g * TILE - 60, `at chest height (y=${n1.y.toFixed(0)}, ground ${g * TILE})`)
  assert.equal(n1.vx, -NEEDLE_SPEED)
  // It reaches the standing player and hurts.
  assert.ok(until(s, st => st.size === 'hatchling', 4, STILL), 'hit by the needle')
  assert.ok(until(s, () => n1.mode === 'gone', 6, STILL), 'and it flies off the left')
  // The next ones keep coming every NEEDLE_EVERY while the player stays.
  const count = needlesSoFar().length
  run(s, NEEDLE_EVERY + 0.05, STILL)
  assert.ok(needlesSoFar().length > count, 'another came')
  // A stomp crushes one like anything else.
  const flying = needlesSoFar().find(e => e.mode === 'walk')
  s.hurtUntil = 0
  flying.x = p.x
  dropOn(s, flying, 6, 250)
  assert.ok(until(s, () => flying.mode === 'crushed', 1), 'stomped')
  assert.equal(s.crushed, 1)
  // Bump the block from below: spent, points, and no more needles.
  const block = s.level.blocks[0]
  assert.equal(tileAt(s.level, Math.floor(block.x / TILE), Math.floor(block.y / TILE)), BLOCK)
  p.x = block.x - (p.w - TILE) / 2
  p.y = g * TILE - p.h
  p.vx = 0
  p.vy = 0
  p.onGround = true
  const score = s.score
  run(s, 0.03, { ...STILL, jump: true, jumpHeld: true })
  assert.ok(until(s, () => block.hit, 1.2, { ...STILL, jumpHeld: true }), 'bumped')
  assert.equal(s.score - score, BLOCK_POINTS)
  assert.ok(p.y >= block.y + TILE - 0.01, 'the head stopped under it')
  const after = needlesSoFar().length
  run(s, NEEDLE_EVERY * 2, STILL)
  assert.equal(needlesSoFar().length, after, 'no more needles once the block is spent')
  // An unlogged draw day fires none: the pit is its hazard.
  const quiet = world([day({ draw: true, logged: false })], 12)
  start(quiet)
  quiet.player.x = (START_TILES + 3) * TILE
  run(quiet, 3, STILL)
  assert.equal(quiet.level.enemies.filter(e => e.kind === 'needle').length, 0)
})

test('a cardio day\'s platform slides and carries you; its capsules hang along its run', () => {
  const days = [day({ workoutMin: 40, cardio: true, doses: 3, recovery: 90 })]
  const level = buildLevel(days, makeRng(13))
  assert.equal(level.movers.length, 1)
  const m = level.movers[0]
  let platformTiles = 0
  for (let c = 0; c < level.cols; c++) for (let r = 0; r < ROWS; r++) if (tileAt(level, c, r) === PLATFORM) platformTiles++
  assert.equal(platformTiles, 0, 'no fixed platform on a cardio day')
  assert.equal(m.w, platformLength(40) * TILE)
  assert.ok(m.minX < m.maxX && m.x >= m.minX && m.x <= m.maxX)
  assert.equal(Math.abs(m.vx), MOVER_SPEED)
  const caps = level.capsules.filter(k => k.day === 0)
  assert.equal(caps.length, 3)
  assert.ok(caps.every(k => k.y < m.y && k.x >= m.minX && k.x <= m.maxX + m.w), 'strung along the run')
  // Ride it: land on the bar, then stand still and move with it.
  const s = world(days, 13)
  start(s)
  s.level.enemies.forEach((e) => {
    e.mode = 'gone'
  })
  const mover = s.level.movers[0]
  const p = s.player
  p.x = mover.x + mover.w / 2 - p.w / 2
  p.y = mover.y - p.h - 20
  p.vx = 0
  p.onGround = false
  assert.ok(until(s, st => st.player.onGround && st.player.ride === 0, 1, STILL), 'landed on it')
  const x0 = p.x
  const mx0 = mover.x
  run(s, 0.5, STILL)
  assert.ok(Math.abs((p.x - x0) - (mover.x - mx0)) < 0.5, `carried along (${(p.x - x0).toFixed(1)} vs ${(mover.x - mx0).toFixed(1)})`)
  assert.ok(Math.abs(mover.vx) === MOVER_SPEED && (mover.x - mx0) !== 0)
  // It turns at the ends of its run.
  let turned = false
  const dir = Math.sign(mover.vx)
  run(s, 12, () => {
    if (Math.sign(mover.vx) !== dir) turned = true
    return STILL
  })
  assert.ok(turned, 'turned around')
  assert.ok(p.onGround && p.ride === 0, 'still riding')
  // Jump off: no longer carried.
  run(s, 0.05, { ...STILL, jump: true })
  assert.equal(p.ride, -1)
})

test('a short night makes its day slippery: a released run slides further', () => {
  assert.equal(isShortSleep(day({ sleepMin: 300 })), true)
  assert.equal(isShortSleep(day({ sleepMin: 420 })), false)
  assert.equal(isShortSleep(day({ sleepMin: null })), false)
  const slide = (sleepMin) => {
    const s = world([day({ sleepMin, recovery: 90, doses: 0 })], 14)
    start(s)
    s.level.enemies.forEach((e) => {
      e.mode = 'gone'
    })
    run(s, 0.6, RIGHT)
    const x0 = s.player.x
    run(s, 1, STILL)
    return s.player.x - x0
  }
  const normal = slide(480)
  const short = slide(300)
  assert.ok(short > normal * 2.5, `slid ${short.toFixed(0)}px on a short night vs ${normal.toFixed(0)}px`)
})

test('every pit has a popper that rises on a cycle and hurts; the runner waits for it to sink', () => {
  const days = [day({ recovery: 50 }), day({ logged: false, recovery: 50 }), day({ recovery: 50 })]
  const level = buildLevel(days, makeRng(15))
  assert.equal(level.poppers.length, 1)
  const pp = level.poppers[0]
  const pitStart = START_TILES + DAY_TILES + 8
  assert.ok(pp.x > pitStart * TILE && pp.x < (pitStart + MAX_PIT) * TILE, 'in the pit')
  assert.equal(pp.base, groundRowAt(level, pitStart - 1) * TILE)
  // The cycle: up for POPPER_UP of every POPPER_PERIOD.
  let up = 0
  for (let t = 0; t < POPPER_PERIOD; t += 0.01) if (popperRise(pp, t - pp.phase) > 0) up += 0.01
  assert.ok(Math.abs(up - POPPER_UP) < 0.03, `up ${up.toFixed(2)}s of ${POPPER_PERIOD}`)
  assert.equal(popperRise(pp, -pp.phase + POPPER_UP / 2), 1)
  assert.equal(popperRise(pp, -pp.phase + POPPER_UP + 0.1), 0)
  assert.equal(popperSafeFor(pp, -pp.phase + POPPER_UP + 0.01, 1), true)
  assert.equal(popperSafeFor(pp, -pp.phase + POPPER_PERIOD - 0.5, 1), false)
  assert.equal(popperBox(pp, -pp.phase + POPPER_UP + 0.1), null)
  // Standing over it as it rises: a hit.
  const s = world(days, 15)
  start(s)
  s.level.enemies.forEach((e) => {
    e.mode = 'gone'
  })
  const p = s.player
  const ride = () => {
    p.x = pp.x - p.w / 2
    p.y = pp.base - p.h
    p.vy = 0
    p.onGround = true
  }
  ride()
  assert.ok(until(s, st => st.size === 'hatchling', POPPER_PERIOD + 0.5, () => {
    ride()
    return STILL
  }), 'the popper got the heart standing over it')
  // The runner crosses it without a scratch: it waits, then goes.
  const s2 = world(days, 15)
  let waited = false
  run(s2, 20, (st) => {
    const i = autoRun(st)
    if (st.status === 'running' && !i.right && st.player.onGround) waited = true
    return i
  })
  assert.equal(s2.status, 'cleared')
  assert.ok(s2.lives >= 3, `no life lost (${s2.lives})`)
  assert.equal(s2.size, 'grown')
  assert.ok(waited, 'it waited at the edge at least once')
})

test('blocks: a draw day\'s says its label, a gold-star day gets one of its own, one green day hides a star and one day hides a heart, and a hidden block is not there until found', () => {
  const days = [
    day({ draw: true, drawLabel: 'Quest · 12 markers', recovery: 90 }),
    day({ goldStar: true, workoutMin: 30, recovery: 50 }),
    day({ goldStar: true, draw: true, recovery: 50 }), // a draw wins
    day({ goldStar: true, logged: false }), // not logged: no block
    day({ recovery: 85 })
  ]
  const level = buildLevel(days, makeRng(21))
  const kinds = level.blocks.map(b => `${b.day}:${b.kind}${b.hidden ? '?' : ''}`).sort()
  const star = level.blocks.find(b => b.kind === 'star')
  const heart = level.blocks.find(b => b.kind === 'heart')
  assert.ok(star && [0, 4].includes(star.day), `the star hides on a green day (day ${star?.day})`)
  assert.ok(heart && days[heart.day].logged, `the heart hides on a logged day (day ${heart?.day})`)
  assert.deepEqual(kinds.filter(k => !k.endsWith('?')).sort(), ['0:draw', '1:gold', '2:draw'])
  for (const b of level.blocks) {
    const col = Math.floor(b.x / TILE)
    const row = Math.floor(b.y / TILE)
    assert.equal(tileAt(level, col, row), b.hidden ? 0 : BLOCK, `${b.kind} ${b.hidden ? 'is not in the grid yet' : 'is solid'}`)
    assert.equal(row, groundRowAt(level, col) - 4, 'four rows up')
  }
  assert.equal(blockLine(level.blocks[0], days[0]), 'Quest · 12 markers')
  assert.equal(blockLine(level.blocks[1], days[1]), 'every dose · moved')
  assert.equal(blockLine(star, days[star.day]), 'a green day')
  assert.equal(blockLine(heart, days[heart.day]), 'an extra heart')
  assert.equal(blockLine({ ...level.blocks[0] }, { ...days[0], drawLabel: null }), 'a draw day')
})

test('a bump as a hatchling lets out the plate, which walks and grows you back; as grown, the shaker; a hit with the shaker costs only the shaker', () => {
  const days = [day({ draw: true, drawLabel: 'CHW · 14 markers', recovery: 50, doses: 0 }), day({ goldStar: true, workoutMin: 30, recovery: 50, doses: 0, sodas: [{ oz: 12 }] })]
  const s = world(days, 22)
  start(s)
  s.level.enemies.forEach((e) => {
    e.mode = 'gone'
  })
  const p = s.player
  shrink(s)
  const draw = s.level.blocks.find(b => b.kind === 'draw')
  const score = s.score
  assert.ok(bump(s, draw), 'bumped the draw block')
  assert.equal(s.score - score, BLOCK_POINTS)
  assert.deepEqual(s.reveal && s.reveal.text, 'CHW · 14 markers')
  assert.equal(s.level.items.length, 1)
  const plate = s.level.items[0]
  assert.equal(plate.kind, 'plate')
  assert.ok(plate.y > draw.y - plate.h, 'still inside the block')
  run(s, ITEM_RISE + 0.05, STILL)
  assert.ok(plate.y <= draw.y - plate.h + 1, `on top of the block (y=${plate.y.toFixed(0)}, block ${draw.y})`)
  run(s, 0.5, STILL)
  assert.equal(Math.abs(plate.vx), PLATE_SPEED, 'walking')
  // Catch it: it grows the hatchling back.
  onto(s, plate)
  run(s, DT * 2, STILL)
  assert.equal(plate.taken, true)
  assert.equal(s.size, 'grown')
  assert.deepEqual([p.w, p.h], [PLAYER_W, PLAYER_H])
  assert.equal(s.score - score, BLOCK_POINTS + ITEM_POINTS)
  // Grown: the gold block lets out the shaker, which sits on the block.
  const gold = s.level.blocks.find(b => b.kind === 'gold')
  assert.ok(bump(s, gold), 'bumped the gold block')
  assert.equal(s.reveal.text, 'every dose · moved')
  const shaker = s.level.items.find(it => it.kind === 'shaker')
  assert.ok(shaker)
  run(s, ITEM_RISE + 0.3, STILL)
  assert.equal(shaker.y, gold.y - shaker.h, 'sitting on the block')
  onto(s, shaker)
  run(s, DT * 2, STILL)
  assert.equal(s.power, 'shaker')
  assert.equal(s.size, 'grown')
  // A can: the hit takes the shaker and nothing else.
  const can = s.level.enemies.find(e => e.kind === 'can')
  can.mode = 'walk'
  can.awake = true
  p.x = can.x - p.w - 20
  p.y = can.y + can.h - p.h
  p.vx = 0
  p.vy = 0
  p.onGround = true
  assert.ok(until(s, st => st.power === 'none', 2, RIGHT), 'the shaker is gone')
  assert.equal(s.size, 'grown')
  assert.equal(s.lives, 3)
  assert.ok(s.hurtUntil > s.elapsed, 'with the usual grace')
})

test('the shaker throws scoops that bounce along and crush what they hit; two at a time; a wall ends one', () => {
  const days = [day({ recovery: 90, doses: 0, sodas: [{ oz: 12 }] })]
  const s = world(days, 23)
  start(s)
  s.power = 'shaker'
  const can = s.level.enemies.find(e => e.kind === 'can')
  s.level.enemies.forEach((e) => {
    if (e !== can) e.mode = 'gone'
  })
  // On the day's flat ground (a scoop dies on a stair's riser like any wall), the can well ahead.
  const p = s.player
  stand(s, (START_TILES + 4) * TILE)
  can.awake = true
  can.dir = 1
  can.x = p.x + p.w + 150
  can.y = p.y + p.h - can.h
  p.facing = 1
  stepWorld(s, DT, { ...STILL, fire: true })
  assert.equal(s.level.scoops.filter(sc => sc.alive).length, 1)
  assert.equal(s.level.scoops[0].vx, SCOOP_SPEED)
  let bounced = false
  let last = s.level.scoops[0].vy
  assert.ok(until(s, (st) => {
    const sc = st.level.scoops[0]
    if (sc.alive && last > 0 && sc.vy < 0) bounced = true
    last = sc.vy
    return can.mode === 'crushed'
  }, 2, STILL), 'the scoop got the can')
  assert.ok(bounced, 'bouncing along')
  assert.equal(s.level.scoops[0].alive, false, 'and was spent')
  assert.equal(s.pops.at(-1).text, String(SCOOP_POINTS))
  assert.equal(s.crushed, 1)
  // Two at a time.
  for (let i = 0; i < 4; i++) stepWorld(s, DT, { ...STILL, fire: true })
  assert.equal(s.level.scoops.filter(sc => sc.alive).length, MAX_SCOOPS)
  run(s, 3, STILL)
  assert.equal(s.level.scoops.filter(sc => sc.alive).length, 0, 'they die of old age')
  // Facing the world's edge: a wall ends a scoop at once.
  p.x = 20
  p.facing = -1
  stepWorld(s, DT, { ...STILL, fire: true })
  assert.ok(until(s, st => !st.level.scoops.at(-1).alive, 0.5, STILL), 'into the wall')
  // Without the shaker nothing is thrown.
  s.power = 'none'
  const n = s.level.scoops.length
  stepWorld(s, DT, { ...STILL, fire: true })
  assert.equal(s.level.scoops.length, n)
})

test('the hidden star: eight seconds untouchable, every touch a crush with climbing points; the hidden heart is an extra life; a death clears the lot', () => {
  const days = [day({ recovery: 90, doses: 0, sodas: [{ oz: 12 }, { oz: 20 }] })]
  const s = world(days, 24)
  start(s)
  const p = s.player
  const [can, tall] = s.level.enemies
  // Parked until the walk: the pair patrol right under the hidden block.
  s.level.enemies.forEach((e) => {
    e.mode = 'gone'
  })
  const star = s.level.blocks.find(b => b.kind === 'star')
  const heart = s.level.blocks.find(b => b.kind === 'heart')
  const col = Math.floor(star.x / TILE)
  const row = Math.floor(star.y / TILE)
  assert.equal(tileAt(s.level, col, row), 0, 'nothing there yet')
  assert.ok(bump(s, star), 'the head found it')
  assert.equal(tileAt(s.level, col, row), BLOCK, 'and now it is a block')
  assert.ok(p.y >= star.y + TILE - 0.01, 'the head stopped under it')
  const item = s.level.items.find(it => it.kind === 'star')
  run(s, ITEM_RISE + 0.1, STILL)
  onto(s, item)
  run(s, DT * 2, STILL)
  assert.ok(isStarred(s))
  assert.ok(s.starUntil - s.elapsed > STAR_SECONDS - 0.2)
  // Down on the day's flat ground, walk into the can and the tall boy: crushed, 100 then 200, nothing lost.
  stand(s, (START_TILES + 4) * TILE)
  for (const e of [can, tall]) {
    e.mode = 'walk'
    e.awake = true
  }
  can.x = p.x + p.w + 30
  tall.x = p.x + p.w + 120
  can.y = p.y + p.h - can.h
  tall.y = p.y + p.h - tall.h
  const score = s.score
  assert.ok(until(s, st => st.crushed === 2, 3, RIGHT), 'both crushed by a touch')
  assert.equal(s.score - score, STAR_POINTS[0] + STAR_POINTS[1])
  assert.equal(s.size, 'grown')
  assert.equal(s.lives, 3)
  run(s, STAR_SECONDS, STILL)
  assert.equal(isStarred(s), false, 'it wears off')
  // The heart.
  assert.ok(bump(s, heart))
  const life = s.level.items.find(it => it.kind === 'heart')
  run(s, ITEM_RISE + 0.1, STILL)
  onto(s, life)
  run(s, DT * 2, STILL)
  assert.equal(s.lives, 4)
  assert.equal(s.pops.at(-1).text, '1UP')
  // A death takes the shaker and the star with it.
  s.power = 'shaker'
  s.starUntil = s.elapsed + 5
  s.size = 'hatchling'
  p.y = 2000
  run(s, 0.1, STILL)
  assert.equal(s.lives, 3)
  assert.equal(s.power, 'none')
  assert.equal(isStarred(s), false)
  assert.equal(s.size, 'grown')
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

test('the scripted runner reaches the castle on every random month, and on the worst one the log can make — and meets the enemies on the way', () => {
  let crushed = 0
  let hits = 0
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const s = world(randomMonth(seed), seed)
    let small = false
    run(s, 240, (st) => {
      if (st.size === 'hatchling') small = true
      return autoRun(st)
    })
    assert.equal(s.status, 'cleared', `seed ${seed}: ${s.status} at day ${dayAt(s)}, x=${s.player.x.toFixed(0)}, lives ${s.lives}`)
    assert.ok(s.level.enemies.length >= s.level.days.length * 0.8, `seed ${seed}: the month is populated (${s.level.enemies.length} enemies)`)
    crushed += s.crushed
    if (small || s.lives < 3) hits += 1
  }
  assert.ok(crushed >= 12, `the runner lands on things (${crushed} crushed over 12 months)`)
  assert.ok(hits >= 1, 'and gets hit now and then')
  // Every other day unlogged (a popper in every pit), recovery swinging, workouts everywhere
  // (half of them sliding), two sodas a day (a can, a tall boy, a wall), short nights throughout,
  // a draw every fifth day: pits, stairs, walls, needles and ice back to back.
  const worst = Array.from({ length: 30 }, (_, i) => day({ logged: i % 2 === 0, recovery: i % 3 === 0 ? 95 : i % 3 === 1 ? 20 : 65, workoutMin: 90, cardio: i % 4 === 0, doses: 4, sodas: [{ oz: 20 }, { oz: 12 }], sleepMin: 300, draw: i % 5 === 0 }))
  const s = world(worst, 99)
  run(s, 300, autoRun)
  assert.equal(s.status, 'cleared', `worst month: ${s.status} at day ${dayAt(s)}, lives ${s.lives}`)
  // And on a phone-width view, which changes nothing about the level.
  const narrow = createWorld({ days: randomMonth(13), width: 358, height: 384, seed: 13 })
  run(narrow, 240, autoRun)
  assert.equal(narrow.status, 'cleared')
})

test('another go after the end is a fresh month: the cans are back, the heart is grown, the pops are gone', () => {
  const s = world([day({ sodas: [{ oz: 12 }], recovery: 90 })], 10, { lives: 1 })
  start(s)
  const can = s.level.enemies[0]
  dropOn(s, can)
  assert.ok(until(s, () => can.mode === 'crushed', 1))
  s.size = 'hatchling'
  s.player.y = 2000
  run(s, 0.1, STILL)
  assert.equal(s.status, 'over')
  start(s)
  assert.equal(s.status, 'running')
  assert.equal(s.level.enemies[0].mode, 'walk')
  assert.equal(s.size, 'grown')
  assert.deepEqual(s.pops, [])
  assert.equal(s.crushed, 0)
})

test('ground tiles are solid from the side; a platform is passed through from below', () => {
  const days = [day({ workoutMin: 60, doses: 0, recovery: 90 })]
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
  noHidden(s)
  s.level.enemies.forEach((e) => {
    e.mode = 'gone' // the germ on the floor is not the subject here
  })
  s.player.x = platformCol * TILE + 2
  s.player.y = g * TILE - PLAYER_H // standing on this day's ground, not the lower runway's
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

test('walkers pick up the pace with every week into the month', () => {
  const days = Array.from({ length: 30 }, (_, i) => day({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, sodas: [{ oz: 12 }], recovery: 50 }))
  const s = world(days, 31)
  start(s)
  s.player.y = -1000
  for (const e of s.level.enemies) e.awake = true
  stepWorld(s, DT, STILL)
  const speed = i => Math.abs(s.level.enemies.find(e => e.kind === 'can' && e.day === i).vx)
  const germ = i => Math.abs(s.level.enemies.find(e => e.kind === 'germ' && e.day === i).vx)
  assert.equal(speed(0), CAN_SPEED)
  assert.equal(speed(6), CAN_SPEED)
  assert.ok(Math.abs(speed(7) - CAN_SPEED * (1 + WEEK_PACE)) < 1e-9)
  assert.ok(Math.abs(speed(21) - CAN_SPEED * (1 + 3 * WEEK_PACE)) < 1e-9)
  assert.ok(Math.abs(germ(28) - GERM_SPEED * (1 + 4 * WEEK_PACE)) < 1e-9)
})

test('the month\'s figures: every hit is kept by day and cause, the worst day is named, and a finished month earns its feats', () => {
  const days = Array.from({ length: 7 }, (_, i) => day({ date: `2026-10-0${i + 1}`, sodas: i < 2 ? [{ oz: 12 }] : [], recovery: 90, doses: 0 }))
  const s = world(days, 32)
  start(s)
  noHidden(s)
  const cans = s.level.enemies.filter(e => e.kind === 'can')
  assert.equal(s.cansTotal, 2)
  assert.deepEqual(worldFeats(s), [], 'nothing until the month is finished')
  // A clean run: both cans stomped, then the castle.
  for (const can of cans) {
    can.awake = true
    dropOn(s, can)
    assert.ok(until(s, () => can.mode === 'crushed', 1))
  }
  assert.equal(s.cansCrushed, 2)
  s.player.x = s.level.castleX
  run(s, DT, STILL)
  assert.equal(s.status, 'cleared')
  assert.deepEqual(worldFeats(s), ['clean-month', 'no-hit-week'])
  const clean = worldSummary(s)
  assert.equal(clean.cleared, true)
  assert.equal(clean.worstDay, null)
  assert.deepEqual([clean.crushed, clean.cansCrushed, clean.cansTotal, clean.losses, clean.hits.length], [2, 2, 2, 0, 0])
  // The same month, badly: a hit on day 0, two on day 1 (one of them a life), the pit on an unlogged day.
  const rough = [...days.slice(0, 6), day({ date: '2026-10-07', logged: false })]
  const s2 = world(rough, 32)
  start(s2)
  noHidden(s2)
  const [a, b] = s2.level.enemies.filter(e => e.kind === 'can')
  const p = s2.player
  const into = (can) => {
    can.awake = true
    can.mode = 'walk'
    stand(s2, can.x - p.w - 20)
    s2.hurtUntil = 0
    return until(s2, st => st.hits.length > hitsBefore, 2, RIGHT)
  }
  let hitsBefore = 0
  assert.ok(into(a), 'a hit on day 0')
  assert.deepEqual(s2.hits, [{ day: 0, by: 'can' }])
  assert.equal(s2.size, 'hatchling')
  hitsBefore = 1
  assert.ok(into(b), 'a life on day 1')
  assert.equal(s2.lives, 2)
  assert.equal(s2.size, 'grown')
  hitsBefore = 2
  assert.ok(into(b), 'another hit on day 1')
  assert.deepEqual(s2.hits.map(h => `${h.day}:${h.by}`), ['0:can', '1:can', '1:can'])
  // Into the pit on the unlogged day.
  s2.hurtUntil = 0
  stand(s2, (START_TILES + 6 * DAY_TILES + 8) * TILE)
  p.y = 2000
  run(s2, 0.1, STILL)
  assert.equal(s2.lives, 1)
  assert.deepEqual(s2.hits.at(-1), { day: 6, by: 'pit' })
  const sum = worldSummary(s2)
  assert.equal(sum.cleared, false)
  assert.equal(sum.losses, 2)
  assert.deepEqual(sum.worstDay, { day: 1, date: '2026-10-02', hits: 2, by: ['can'] })
  assert.deepEqual(worldFeats(s2), [], 'an unfinished month earns nothing')
  // Finished anyway: the hits rule out the clean week; a chain of three counts.
  s2.bestChain = 3
  s2.status = 'cleared'
  assert.deepEqual(worldFeats(s2), ['chain-3'])
  // A tie goes to the later day; a day with two causes lists the commoner first.
  s2.hits = [{ day: 2, by: 'germ' }, { day: 4, by: 'needle' }, { day: 4, by: 'germ' }, { day: 4, by: 'germ' }, { day: 2, by: 'popper' }, { day: 2, by: 'germ' }]
  const tie = worldSummary(s2).worstDay
  assert.deepEqual(tie, { day: 4, date: '2026-10-05', hits: 3, by: ['germ', 'needle'] })
})
