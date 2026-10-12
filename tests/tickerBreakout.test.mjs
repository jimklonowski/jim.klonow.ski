// TICKER's can crusher (shared/utils/tickerBreakout.ts): the wall is laid out from the soda log,
// hits cost a can its ounces' worth of hp, the paddle's bounce angle follows where the ball
// landed, lives run out, a cleared wall ends the game — and, the one that matters, a scripted
// paddle clears every wall the log can make, on several seeds and on a phone-width stage.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BALL, BALL_MAX_SPEED, BALL_SPEED, BASE_LIVES, CAN_H, CAN_W, MAX_ANGLE, MIN_ANGLE, PADDLE_BASE_W, WALL_TOP,
  autoPlay, breakoutPose, canHp, createBreakout, landingX, launch, layoutCans, move, paddleTop, stepBreakout as step
} from '../shared/utils/tickerBreakout.ts'
import { makeRng } from '../shared/utils/tickerRunner.ts'

const DT = 1 / 60
const play = (s, seconds, each) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (each) each(s)
    step(s, DT)
  }
  return s
}
const can = (oz, week = 0) => ({ oz, week })
/** A month like a bad one: a few minis, cans and bottles across four weeks. */
const month = [
  can(7.5, 0), can(12, 0), can(20, 0),
  can(12, 1), can(12, 1), can(null, 1), can(7.5, 1),
  can(20, 2),
  can(12, 3), can(7.5, 3), can(12, 3), can(12, 3), can(12, 3), can(16, 3)
]
const game = (width = 600, seed = 1, cans = month, extra = {}) => createBreakout({ width, height: 320, cans, rng: makeRng(seed), ...extra })

test('hits per can follow the ounces', () => {
  assert.equal(canHp(7.5), 1)
  assert.equal(canHp(12), 2)
  assert.equal(canHp(16), 3)
  assert.equal(canHp(20), 3)
  assert.equal(canHp(null), 2, 'an unsized soda is a can')
})

test('the wall: one can per soda, oldest week on top, newest lowest, rows centred and wrapped to the width', () => {
  const cans = layoutCans(600, month)
  assert.equal(cans.length, month.length)
  const rowsByWeek = new Map()
  for (const c of cans) rowsByWeek.set(c.week, Math.min(rowsByWeek.get(c.week) ?? Infinity, c.y))
  assert.ok(rowsByWeek.get(3) < rowsByWeek.get(2) && rowsByWeek.get(2) < rowsByWeek.get(1) && rowsByWeek.get(1) < rowsByWeek.get(0), 'weeks descend')
  assert.equal(Math.min(...cans.map(c => c.y)), WALL_TOP)
  const week0 = cans.filter(c => c.week === 0)
  const left = Math.min(...week0.map(c => c.x))
  const right = Math.max(...week0.map(c => c.x + c.w))
  assert.ok(Math.abs((left + right) / 2 - 300) <= 1, 'the newest row is centred')
  // A narrow field fits five cans in a row, so the six-can week wraps onto a second.
  const narrow = layoutCans(120, month)
  const rows = new Set(narrow.filter(c => c.week === 3).map(c => c.y))
  assert.equal(rows.size, 2, `six cans wrap on 120px: ${rows.size} rows`)
  assert.ok(narrow.every(c => c.x >= 0 && c.x + c.w <= 120), 'nothing hangs off the field')
  assert.deepEqual([...new Set(cans.map(c => c.w))], [CAN_W])
  assert.deepEqual([...new Set(cans.map(c => c.h))], [CAN_H])
})

test('a month with no sodas is the good ending: nothing to shoot', () => {
  const s = game(600, 1, [])
  assert.equal(s.status, 'empty')
  assert.equal(s.cans.length, 0)
  launch(s)
  assert.equal(s.status, 'empty', 'no launch into nothing')
})

test('ready: the ball rides the figure; the first press launches it upward', () => {
  const s = game()
  assert.equal(s.status, 'ready')
  assert.equal(s.lives, BASE_LIVES)
  assert.equal(s.paddle.w, PADDLE_BASE_W)
  move(s, 100)
  assert.equal(s.ball.x, 100, 'the ball sits on the head while ready')
  assert.equal(breakoutPose(s), 'idle')
  play(s, 0.5)
  assert.equal(s.ball.vy, 0, 'nothing moves until launched')
  launch(s)
  assert.equal(s.status, 'running')
  assert.ok(s.ball.vy < 0, 'up')
  assert.ok(Math.abs(Math.hypot(s.ball.vx, s.ball.vy) - BALL_SPEED) < 1e-6)
  launch(s)
  assert.equal(s.status, 'running', 'a second press mid-flight does nothing')
})

test('today\'s recovery scales the paddle; a workout adds a life', () => {
  assert.equal(game(600, 1, month, { paddleScale: 0.7 }).paddle.w, Math.round(PADDLE_BASE_W * 0.7))
  assert.equal(game(600, 1, month, { lives: 4 }).lives, 4)
})

test('the bounce off the head follows where the ball landed, clamped to a playable angle', () => {
  for (const [offset, expectSign] of [[0, 1], [0.5, 1], [-0.5, -1], [0.99, 1], [-0.99, -1]]) {
    const s = game()
    s.status = 'running'
    s.ball = { x: s.paddle.x + offset * (s.paddle.w / 2), y: paddleTop(s) - BALL / 2 + 1, vx: 0, vy: 200 }
    step(s, DT)
    const angle = Math.atan2(Math.abs(s.ball.vx), -s.ball.vy)
    assert.ok(s.ball.vy < 0, `offset ${offset}: back up`)
    assert.ok(angle >= MIN_ANGLE - 1e-6 && angle <= MAX_ANGLE + 1e-6, `offset ${offset}: angle ${angle.toFixed(2)}`)
    assert.equal(Math.sign(s.ball.vx), expectSign, `offset ${offset}: heads the way it hit`)
  }
})

test('a can takes hits down to zero, scores by its size and the combo, and speeds the ball up', () => {
  const s = game(600, 1, [can(20, 0), can(7.5, 0)])
  const bottle = s.cans.find(c => c.maxHp === 3)
  s.status = 'running'
  // Fire the ball straight up into the bottle from just beneath it, three times.
  for (let hit = 1; hit <= 3; hit++) {
    s.ball = { x: bottle.x + bottle.w / 2, y: bottle.y + bottle.h + BALL, vx: 0, vy: -BALL_SPEED }
    step(s, DT)
    assert.ok(s.ball.vy > 0, `hit ${hit}: bounced down`)
    assert.equal(breakoutPose(s), 'happy', 'the flash')
  }
  assert.ok(!s.cans.includes(bottle), 'popped on the third hit')
  assert.equal(s.score, 5 + 5 + 10 * 3, 'two dents, then a 20 oz at combo 0')
  assert.equal(s.combo, 1)
  assert.ok(s.speed > BALL_SPEED && s.speed <= BALL_MAX_SPEED)
  // The next can cleared before the ball touches the figure pays the combo.
  const mini = s.cans[0]
  s.ball = { x: mini.x + mini.w / 2, y: mini.y + mini.h + BALL, vx: 0, vy: -s.speed }
  step(s, DT)
  assert.equal(s.cans.length, 0)
  assert.equal(s.score, 40 + 10 * 1 * 2, 'a mini at combo 1 pays double')
  assert.equal(s.status, 'cleared')
  assert.equal(breakoutPose(s), 'petted')
})

test('the floor costs a life, the last life ends the game, and a press afterwards rebuilds the same wall', () => {
  const s = game()
  launch(s)
  move(s, 0) // the paddle out of the way: the ball will fall every time
  let lives = s.lives
  const seen = []
  play(s, 30, (st) => {
    if (st.lives !== lives) {
      seen.push(st.status)
      lives = st.lives
    }
    if (st.status === 'ready') launch(st)
  })
  assert.equal(s.status, 'over')
  assert.equal(s.lives, 0)
  assert.deepEqual(seen, ['ready', 'ready', 'over'], 'two serves back, then out')
  assert.equal(breakoutPose(s), 'flatline')
  const frozen = s.score
  play(s, 1)
  assert.equal(s.score, frozen, 'nothing moves after the end')
  launch(s)
  assert.equal(s.status, 'running')
  assert.equal(s.lives, BASE_LIVES)
  assert.equal(s.cans.length, month.length, 'the same wall again')
  assert.equal(s.score, 0)
})

test('landingX folds the ball\'s path back off the walls', () => {
  const s = game(200)
  s.status = 'running'
  s.ball = { x: 100, y: 100, vx: 300, vy: 100 } // heads right, far past the wall before it lands
  const x = landingX(s)
  assert.ok(x != null && x >= BALL / 2 && x <= 200 - BALL / 2, `in the field: ${x}`)
  s.ball.vy = -1
  assert.equal(landingX(s), null, 'a rising ball has no landing yet')
})

test('the scripted paddle clears the wall on every seed, and on a phone', () => {
  for (const [width, seed] of [[600, 1], [600, 2], [600, 3], [600, 4], [600, 5], [360, 6], [360, 7], [320, 8]]) {
    const s = game(width, seed)
    play(s, 240, autoPlay)
    assert.equal(s.status, 'cleared', `width ${width} seed ${seed}: ${s.status} with ${s.cans.length} cans left, ${s.lives} lives, ${s.score} points`)
    assert.ok(s.score > 0)
  }
})

test('a wall of one-hit minis and a wall of bottles are both clearable', () => {
  const minis = Array.from({ length: 24 }, (_, i) => can(7.5, Math.floor(i / 6)))
  const bottles = Array.from({ length: 12 }, (_, i) => can(20, Math.floor(i / 3)))
  for (const [name, cans] of [['minis', minis], ['bottles', bottles]]) {
    const s = game(600, 9, cans)
    play(s, 300, autoPlay)
    assert.equal(s.status, 'cleared', `${name}: ${s.status}, ${s.cans.length} left`)
  }
})
