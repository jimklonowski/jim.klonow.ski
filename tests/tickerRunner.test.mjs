// TICKER's runner (shared/utils/tickerRunner.ts): the world only moves once started, a jump
// clears what it should, a crash stops the score, the speed curve caps, and — the one that
// matters — a scripted jumper survives long runs on several seeds, so every obstacle is
// clearable at any speed it can appear at.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  autoJump, createRunner, hits, jump, makeRng, obstacleBox, playerBox, runnerPose, speedAt, step,
  FLAGS_FROM, JUMP_V, GRAVITY, MAX_SPEED, OBSTACLE_SIZE, PLAYER_X, HITBOX, START_SPEED
} from '../shared/utils/tickerRunner.ts'

const DT = 1 / 60
const run = (s, seconds, each) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (each) each(s)
    step(s, DT)
  }
  return s
}

test('a seeded source repeats itself', () => {
  const a = makeRng(7)
  const b = makeRng(7)
  assert.deepEqual([a(), a(), a()], [b(), b(), b()])
  assert.notEqual(makeRng(8)(), makeRng(9)())
})

test('ready stands still; the first press starts the run and jumps', () => {
  const s = createRunner(600, makeRng(1))
  run(s, 1)
  assert.equal(s.distance, 0)
  assert.equal(runnerPose(s), 'idle')
  jump(s)
  assert.equal(s.status, 'running')
  assert.equal(s.vy, JUMP_V)
  step(s, DT)
  assert.ok(s.y > 0 && s.distance > 0)
  assert.equal(runnerPose(s), 'happy')
})

test('a jump peaks near 70px and lands, and cannot double-jump', () => {
  const s = createRunner(600, makeRng(1))
  jump(s)
  let peak = 0
  for (let i = 0; i < 60; i++) {
    step(s, DT)
    if (s.y > 20) jump(s) // mid-air presses do nothing
    peak = Math.max(peak, s.y)
  }
  assert.ok(peak > 62 && peak < 72, `peak ${peak}`)
  assert.equal(s.y, 0)
  assert.equal(s.vy, 0)
  assert.equal(JUMP_V ** 2 / (2 * GRAVITY) > OBSTACLE_SIZE['flag-low'].bottom + OBSTACLE_SIZE['flag-low'].h, true, 'clears the low flag by height')
})

test('the hitbox is the trunk, with a brush forgiven', () => {
  const s = createRunner(600, makeRng(1))
  const me = playerBox(s)
  assert.deepEqual(me, { x: PLAYER_X + HITBOX.dx, w: HITBOX.w, bottom: HITBOX.dy, h: HITBOX.h })
  const can = { kind: 'can', ...OBSTACLE_SIZE.can, x: me.x + me.w - 2 }
  assert.equal(hits(me, obstacleBox(can)), false, 'two pixels of overlap is a brush')
  can.x = me.x + me.w - 8
  assert.equal(hits(me, obstacleBox(can)), true)
  const high = { kind: 'flag-high', ...OBSTACLE_SIZE['flag-high'], x: me.x }
  assert.equal(hits(me, obstacleBox(high)), false, 'a high flag passes over a standing figure')
  assert.equal(hits({ ...me, bottom: 40 }, obstacleBox(high)), true, 'and clips one that jumped into it')
})

test('running into a can ends the run and freezes the score', () => {
  const s = createRunner(600, makeRng(3))
  jump(s)
  run(s, 20) // never jumping again
  assert.equal(s.status, 'over')
  assert.equal(runnerPose(s), 'flatline')
  const frozen = s.score
  run(s, 2)
  assert.equal(s.score, frozen)
  assert.ok(frozen > 0 && frozen < 100, `fell at ${frozen}`)
  // A press after the crash is a fresh run.
  jump(s)
  assert.equal(s.status, 'running')
  assert.equal(s.score, 0)
  assert.equal(s.obstacles.length, 0)
})

test('the speed curve starts gentle and caps', () => {
  assert.equal(speedAt(0), START_SPEED)
  assert.equal(speedAt(1000), MAX_SPEED)
  assert.equal(speedAt(5000), MAX_SPEED)
  assert.ok(speedAt(500) > START_SPEED && speedAt(500) < MAX_SPEED)
})

test('obstacles spawn off the right edge and are swept once past the left', () => {
  const s = createRunner(600, makeRng(5))
  jump(s)
  run(s, 1.5, autoJump)
  assert.ok(s.obstacles.length > 0)
  assert.ok(s.obstacles.every(o => o.x <= 608))
  run(s, 30, autoJump)
  assert.ok(s.obstacles.every(o => o.x + o.w > 0), 'nothing lingers past the left edge')
})

test('flags only show up once the score allows them', () => {
  const s = createRunner(600, makeRng(11))
  jump(s)
  const seen = new Set()
  run(s, 60, (st) => {
    for (const o of st.obstacles) if (st.score < FLAGS_FROM) seen.add(o.kind)
    autoJump(st)
  })
  assert.ok(![...seen].some(k => k.startsWith('flag')), `early kinds: ${[...seen]}`)
})

test('the scripted jumper survives to the speed cap on every seed — every obstacle is clearable', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const s = createRunner(600, makeRng(seed))
    jump(s)
    run(s, 120, autoJump)
    assert.equal(s.status, 'running', `seed ${seed} crashed at ${s.score}`)
    assert.ok(s.score >= 1500, `seed ${seed}: ${s.score}`)
    assert.equal(s.speed, MAX_SPEED)
  }
})

test('a narrow phone stage is just as clearable', () => {
  for (const seed of [21, 22, 23]) {
    const s = createRunner(320, makeRng(seed))
    jump(s)
    run(s, 90, autoJump)
    assert.equal(s.status, 'running', `seed ${seed} crashed at ${s.score}`)
  }
})
