// "Everyone plays the same board on a day" has to hold for every game of a sitting, not only the
// first (audit #44 item 47). A game made from a seed keeps it and begins its source again on a
// restart; the crusher, the maze, the drop and the invaders used to hand a restart the stream the
// game before had been drawing from, so the second game's serves, bottle and dives were anyone's
// guess. The world always rebuilt from its seed; it is held to the same rule here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng, rngFor } from '../shared/utils/tickerRunner.ts'
import { createBreakout, launch } from '../shared/utils/tickerBreakout.ts'
import { createMaze, startMaze } from '../shared/utils/tickerMaze.ts'
import { createDrop, startDrop } from '../shared/utils/tickerDrop.ts'
import { createInvaders, startInvaders } from '../shared/utils/tickerInvaders.ts'
import { createWorld, startWorld } from '../shared/utils/tickerWorld.ts'

const SEED = 20261124
const draws = (rng, n = 6) => Array.from({ length: n }, () => rng())
/** A game that has been going a while: its source is well down the stream. */
const wearOut = s => draws(s.rng, 37)

test('rngFor: a seed is the game\'s own stream and wins over an rng; an rng alone is the caller\'s; neither is Math.random', () => {
  assert.deepEqual(draws(rngFor({ seed: SEED })), draws(makeRng(SEED)))
  assert.deepEqual(draws(rngFor({ seed: SEED, rng: makeRng(3) })), draws(makeRng(SEED)))
  const mine = makeRng(3)
  assert.equal(rngFor({ rng: mine }), mine)
  assert.equal(rngFor({}), Math.random)
  assert.deepEqual(draws(rngFor({ seed: 0 })), draws(makeRng(0)), 'a seed of zero is a seed')
})

test('the can crusher: a restart serves the day\'s first serve again', () => {
  const cans = [{ oz: 12, week: 0 }, { oz: 20, week: 1 }]
  const s = createBreakout({ width: 600, height: 320, cans, seed: SEED })
  launch(s)
  const first = [s.ball.vx, s.ball.vy]
  wearOut(s)
  s.status = 'over'
  launch(s) // one press: a fresh game, launched
  assert.equal(s.status, 'running')
  assert.deepEqual([s.ball.vx, s.ball.vy], first)
  s.status = 'cleared'
  launch(s)
  assert.deepEqual([s.ball.vx, s.ball.vy], first, 'and after a cleared wall')
  // A caller's own stream (the scripted games in the other test files) carries on down it, as before.
  const t = createBreakout({ width: 600, height: 320, cans, rng: makeRng(SEED) })
  launch(t)
  assert.deepEqual([t.ball.vx, t.ball.vy], first, 'the same first serve either way')
  t.status = 'over'
  launch(t)
  assert.notDeepEqual([t.ball.vx, t.ball.vy], first)
})

test('the capsule maze: a restart gives the ghosts the day\'s wandering again', () => {
  const s = createMaze({ ghosts: [{ kind: 'can', label: 'COKE' }], seed: SEED })
  startMaze(s)
  const first = draws(s.rng)
  wearOut(s)
  s.status = 'over'
  startMaze(s)
  assert.equal(s.status, 'running')
  assert.deepEqual(draws(s.rng), first)
  assert.deepEqual(first, draws(makeRng(SEED)), 'which is the seed\'s stream from its start')
})

test('the capsule drop: a restart is the day\'s bottle and the day\'s capsules again', () => {
  const board = s => JSON.stringify([s.grid, s.piece, s.next])
  const s = createDrop({ germs: 12, seed: SEED })
  startDrop(s)
  const first = board(s)
  wearOut(s)
  s.status = 'over'
  startDrop(s) // one press: a fresh bottle with its first capsule in the neck
  assert.equal(s.status, 'running')
  assert.equal(board(s), first)
  const other = createDrop({ germs: 12, seed: SEED + 1 })
  startDrop(other)
  assert.notEqual(board(other), first, 'another day is another bottle')
})

test('the soda invaders: a restart flies the day\'s dives again', () => {
  const s = createInvaders({ wave: [{ kind: 'can', label: 'COKE' }, { kind: 'tall', label: 'DEW' }], seed: SEED })
  startInvaders(s)
  const first = draws(s.rng)
  wearOut(s)
  s.status = 'over'
  startInvaders(s)
  assert.equal(s.status, 'running')
  assert.deepEqual(draws(s.rng), first)
})

test('the world: a restart is the same month, germ for germ', () => {
  const day = (date, over = {}) => ({ date, logged: true, doses: 2, sodas: [], workoutMin: 0, cardio: false, recovery: 30, sleepMin: null, draw: false, drawLabel: null, goldStar: false, ...over })
  const days = [day('2026-11-01', { sodas: [{ oz: 12 }] }), day('2026-11-02'), day('2026-11-03', { workoutMin: 40 })]
  const things = s => JSON.stringify([s.level.enemies, s.level.capsules, s.level.blocks])
  const s = createWorld({ days, width: 720, height: 384, seed: SEED })
  const first = things(s)
  startWorld(s)
  wearOut(s)
  s.status = 'over'
  startWorld(s)
  assert.equal(things(s), first)
})
