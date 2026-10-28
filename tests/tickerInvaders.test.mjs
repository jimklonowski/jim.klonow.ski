// TICKER's soda invaders (shared/utils/tickerInvaders.ts): the wave sorts into the classic rows
// and germs fill a clean month, the invaders stream in and settle into a swaying formation, the
// figure moves, fires on a cooldown and clears the sky for a bonus and a faster wave, a diver
// peels off, drops an aimed bullet and comes back round to its slot, a bullet costs a life and
// the last one ends it, the beam captures the figure and shooting its captor in formation makes
// the dual figure — and, the one that matters, a scripted player clears the wave on several seeds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INV_BEAM_CHARGE, INV_BEAM_SECONDS, INV_COLS, INV_DUAL_DX, INV_ENTER_GAP, INV_ENTER_SECONDS, INV_ENTER_STAGGER, INV_EXTRA_LIFE_EVERY, INV_FIRE_SECONDS, INV_H, INV_LEVEL_SECONDS, INV_MAX, INV_MIN,
  INV_PLAYER_Y, INV_RESPAWN_SECONDS, INV_SHOTS, INV_W, autoInvaders, createInvaders, invadersDiveEvery, invadersPace, invadersPlayerBox, invadersPose,
  invadersSlots, invadersSway, invadersWaveFor, startInvaders, stepInvaders as step
} from '../shared/utils/tickerInvaders.ts'
import { makeRng } from '../shared/utils/tickerRunner.ts'

const DT = 1 / 60
const STILL = { dir: 0, fire: false }
const play = (s, seconds, input = STILL) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(s, DT, typeof input === 'function' ? input(s) : input)
  return s
}
const can = (kind = 'can', label = 'COKE') => ({ kind, label })
const germs = n => Array.from({ length: n }, () => ({ kind: 'germ', label: null }))
const game = (seed = 1, wave = germs(6), lives = 3) => createInvaders({ wave, lives, rng: makeRng(seed) })
/** A running game with everyone already in formation and the dives held off. */
const settled = (seed = 1, wave = germs(6), lives = 3) => {
  const s = game(seed, wave, lives)
  startInvaders(s)
  for (const v of s.invaders) {
    v.mode = 'formation'
    v.x = v.home.x
    v.y = v.home.y
  }
  s.entered = true
  s.nextDiveAt = Infinity
  return s
}
const slotted = s => s.invaders.filter(v => v.mode === 'formation').length
/** Park the figure under an x. */
const moveTo = (s, x) => {
  s.player.x = x
  return s
}
/** Fire once, straight up. */
const fire = s => step(s, DT, { dir: 0, fire: true })

test('the wave: sorted into rows by size, at most forty, germs fill a clean month; slots centred per row', () => {
  const mixed = [can('mini', 'SPRITE'), can('germ', null), can('tall', 'MTN DEW'), can('can'), can('tall', 'DR PEPPER'), can('mini')]
  assert.deepEqual(invadersWaveFor(mixed).map(w => w.kind), ['tall', 'tall', 'can', 'mini', 'mini', 'germ'], 'tall boys first, germs last')
  assert.equal(invadersWaveFor(mixed)[0].label, 'MTN DEW', 'a stable sort keeps the month\'s order within a kind')
  assert.deepEqual(invadersWaveFor([can()]).map(w => w.kind), ['can', 'germ', 'germ', 'germ', 'germ', 'germ'], `germs up to ${INV_MIN}`)
  assert.deepEqual(invadersWaveFor([]).map(w => w.kind), Array(INV_MIN).fill('germ'))
  assert.equal(invadersWaveFor(Array(60).fill(can())).length, INV_MAX)
  const six = invadersSlots(6)
  assert.equal(six.length, 6)
  assert.ok(six.every(p => p.y === six[0].y), 'one row')
  assert.ok(Math.abs((six[0].x + six[5].x) / 2 - INV_W / 2) < 1e-9, 'centred')
  const ten = invadersSlots(10)
  assert.equal(ten.filter(p => p.y === ten[0].y).length, INV_COLS, 'a full first row')
  assert.ok(ten[9].y > ten[0].y && Math.abs((ten[8].x + ten[9].x) / 2 - INV_W / 2) < 1e-9, 'the two left over, centred on the second row')
  assert.equal(invadersSway(0), 0)
  assert.ok(invadersSway(1) > 1, 'swaying right a second in')
})

test('ready, then the wave streams in by groups and settles into a formation that sways; the dives wait for the last one', () => {
  const s = game(2, [...Array(10).fill(can())])
  assert.equal(s.status, 'ready')
  assert.equal(s.alive, 10)
  play(s, 1)
  assert.ok(s.invaders.every(v => v.mode === 'wait'), 'nothing moves before the press')
  startInvaders(s)
  assert.equal(s.status, 'running')
  play(s, 0.5)
  const entering = s.invaders.filter(v => v.mode === 'enter')
  assert.ok(entering.length >= 1 && entering.length < 10, `the first of the first group are in the air (${entering.length})`)
  assert.ok(s.invaders[8].mode === 'wait', 'the second group waits its turn')
  assert.equal(s.entered, false)
  assert.equal(s.nextDiveAt, Infinity)
  // The last to leave is the first group's eighth (0.3 + 7 staggers) or the second group's second (0.3 + 0.8 + 1 stagger); each flies 1.8 s.
  play(s, Math.max(7 * INV_ENTER_STAGGER, INV_ENTER_GAP + INV_ENTER_STAGGER) + 0.3 + INV_ENTER_SECONDS + 0.2 - 0.5)
  assert.equal(slotted(s), 10, 'everyone in a slot')
  assert.equal(s.entered, true)
  assert.ok(Number.isFinite(s.nextDiveAt) && s.nextDiveAt > s.elapsed, 'a dive is scheduled')
  s.nextDiveAt = Infinity // hold it, to watch the sway
  const v = s.invaders[0]
  const x0 = v.x
  play(s, 1)
  assert.ok(Math.abs(v.x - x0) > 0.3, 'the formation sways')
  assert.equal(v.y, v.home.y, 'but holds its row')
  assert.equal(invadersPose(s), 'idle')
})

test('the figure: walks to the walls and no further, fires on the cooldown with two shots in the air, the shots fly up and out', () => {
  const s = settled()
  play(s, 1, { dir: -1, fire: false })
  assert.equal(s.player.x, 1, 'the left wall')
  play(s, 3, { dir: 1, fire: false })
  assert.equal(s.player.x, INV_W - 1, 'the right wall')
  moveTo(s, 1) // nothing overhead to hit
  fire(s)
  assert.equal(s.shots.length, 1)
  fire(s)
  assert.equal(s.shots.length, 1, 'the cooldown')
  play(s, INV_FIRE_SECONDS, { dir: 0, fire: true })
  assert.equal(s.shots.length, INV_SHOTS)
  play(s, INV_FIRE_SECONDS, { dir: 0, fire: true })
  assert.equal(s.shots.length, INV_SHOTS, 'no third')
  assert.ok(s.shots[0].y < INV_PLAYER_Y - 2, 'on their way up')
  play(s, 2)
  assert.equal(s.shots.length, 0, 'gone off the top')
})

test('a shot takes a can in its slot for eighty, a tall boy for two shots and a hundred and fifty; a clear sky pays, then a faster wave', () => {
  const s = settled(1, [can('tall', 'MTN DEW'), can('can')])
  const [tall, soda] = s.invaders
  assert.equal(s.alive, 6, 'two sodas and four germs')
  moveTo(s, soda.home.x - invadersSway(s.elapsed - s.waveAt)) // under where it will be
  // The sway moves it as the shot flies; line up on where it is when the shot arrives instead.
  const aim = v => moveTo(s, v.home.x + invadersSway(s.elapsed - s.waveAt + (INV_PLAYER_Y - v.home.y) / 20))
  aim(soda)
  fire(s)
  play(s, 1.2)
  assert.equal(soda.mode, 'gone')
  assert.equal(s.score, 80)
  assert.equal(s.alive, 5)
  assert.equal(s.pops.at(-1).text, '80')
  assert.equal(s.bursts.at(-1).kind, 'kill')
  aim(tall)
  fire(s)
  play(s, 1.2)
  assert.equal(tall.hp, 1, 'dented')
  assert.equal(tall.mode, 'formation')
  assert.ok(s.bursts.some(b => b.kind === 'dent'))
  aim(tall)
  fire(s)
  play(s, 1.2)
  assert.equal(tall.mode, 'gone')
  assert.equal(s.score, 230)
  // The germs, one by one.
  for (const g of s.invaders.filter(v => v.kind === 'germ')) {
    aim(g)
    fire(s)
    play(s, 1.2)
    assert.equal(g.mode, 'gone', `germ ${g.id}`)
  }
  assert.equal(s.alive, 0)
  assert.equal(s.status, 'cleared')
  assert.equal(invadersPose(s), 'petted')
  assert.equal(s.score, 230 + 4 * 30 + 100, 'the wave bonus')
  assert.equal(s.wavesCleared, 0, 'counted once the next wave flies in')
  play(s, INV_LEVEL_SECONDS + 0.05)
  assert.equal(s.status, 'ready')
  assert.equal(s.level, 2)
  assert.equal(s.wavesCleared, 1)
  assert.equal(s.alive, 6, 'the same month again')
  assert.ok(s.invaders.every(v => v.mode === 'wait'))
  assert.equal(invadersDiveEvery(1), 2.4)
  assert.equal(+invadersDiveEvery(2).toFixed(6), 2.2)
  assert.equal(invadersDiveEvery(20), 1)
  assert.equal(invadersPace(1), 1)
  assert.ok(invadersPace(3) < 0.9 && invadersPace(50) === 0.55)
})

test('a dive: a can peels off, swoops through the figure\'s column dropping an aimed bullet, leaves off the bottom and comes back round to its slot; shot in flight it pays double', () => {
  const s = settled(3, [can(), can(), can(), can()])
  s.rng = () => 0 // the first slotted, out to the left
  s.nextDiveAt = s.elapsed
  moveTo(s, 20)
  step(s, DT)
  const diver = s.invaders.find(v => v.mode === 'dive')
  assert.ok(diver, 'one peeled off')
  assert.equal(diver.id, 0)
  assert.ok(Number.isFinite(s.nextDiveAt) && s.nextDiveAt > s.elapsed, 'the next is scheduled')
  assert.ok(Math.abs(diver.path.p3[0] - 20) <= 1.5 && diver.path.p3[1] > INV_H, 'the swoop ends in the figure\'s column, off the bottom')
  s.nextDiveAt = Infinity // just this one
  moveTo(s, 3) // out of its way: the swoop was aimed at where it stood
  let lowest = 0
  let dropped = false
  for (let i = 0; i < 60 * 3 && diver.mode === 'dive'; i++) {
    step(s, DT)
    lowest = Math.max(lowest, diver.y)
    if (s.bullets.length && !dropped) {
      dropped = true
      moveTo(s, 22) // the bullet is aimed at where the figure stands: step aside again
    }
  }
  assert.ok(lowest > INV_H, `went off the bottom (${lowest.toFixed(1)})`)
  assert.ok(dropped, 'dropped a bullet on the way')
  assert.equal(diver.mode, 'return')
  assert.ok(diver.y < 0, 'back in from the top')
  play(s, 1)
  assert.equal(diver.mode, 'formation', 'home')
  assert.equal(s.lives, 3, 'the figure, stepped aside, was never touched')
  // The bullet was aimed: it set off toward the figure, on the left by then.
  const b = s.bullets.find(b => b.vy > 0)
  if (b) assert.ok(b.vx <= 0, 'leaning toward the figure on the left')
  // In flight, a kill pays the flight price.
  s.rng = () => 0
  s.nextDiveAt = s.elapsed
  step(s, DT)
  const again = s.invaders.find(v => v.mode === 'dive')
  play(s, 0.5)
  moveTo(s, again.x)
  s.shots.push({ x: again.x, y: again.y + 0.2 })
  step(s, DT)
  assert.equal(again.mode, 'gone')
  assert.equal(s.score, 160)
})

test('a bullet costs a life, the figure comes back in the middle immune for a moment; the last life is the end, and a press after is a fresh game', () => {
  const s = settled(4, germs(6), 2)
  moveTo(s, 12)
  s.bullets.push({ x: 12, y: INV_PLAYER_Y - 1, vx: 0, vy: 8 })
  play(s, 0.3)
  assert.equal(s.lives, 1)
  assert.equal(s.player.alive, false)
  assert.equal(invadersPose(s), 'worried')
  assert.ok(s.bursts.some(b => b.kind === 'player'))
  play(s, 0.5, { dir: 1, fire: true })
  assert.equal(s.shots.length, 0, 'no firing while down')
  play(s, INV_RESPAWN_SECONDS)
  assert.equal(s.player.alive, true)
  assert.equal(s.player.x, INV_W / 2)
  s.bullets.push({ x: INV_W / 2, y: INV_PLAYER_Y - 1, vx: 0, vy: 8 })
  play(s, 0.3)
  assert.equal(s.lives, 1, 'immune just after coming back')
  play(s, 1.5)
  s.bullets.push({ x: INV_W / 2, y: INV_PLAYER_Y - 1, vx: 0, vy: 8 })
  play(s, 0.3)
  assert.equal(s.lives, 0)
  assert.equal(s.status, 'over')
  assert.equal(invadersPose(s), 'flatline')
  const t = s.elapsed
  play(s, 1)
  assert.equal(s.elapsed, t, 'the clock stops')
  startInvaders(s)
  assert.equal(s.status, 'running', 'a fresh game')
  assert.equal(s.lives, 2)
  assert.equal(s.score, 0)
  assert.equal(s.alive, 6)
  // A diver into the figure takes both.
  const d = settled(5, [can()], 3)
  const v = d.invaders[0]
  v.mode = 'dive'
  v.path = { p0: [12, 20], p1: [12, 21], p2: [12, 23], p3: [12, 26] }
  v.t = 0
  v.pathSeconds = 1
  moveTo(d, 12)
  play(d, 0.8)
  assert.equal(v.mode, 'gone')
  assert.equal(d.lives, 2)
  assert.equal(d.score, 160, 'paid as a flight kill')
})

test('the beam: a tall boy\'s second dive stops and beams, the figure under it is carried off; its captor shot in formation frees it for the dual figure, which loses a figure before a life; shot in flight the captive is lost for a thousand', () => {
  const s = settled(6, [can('tall', 'MTN DEW'), can('can')], 3)
  const tall = s.invaders[0]
  s.rng = () => 0
  // The first tall dive is a plain one; the second beams.
  s.tallDives = 1
  s.nextDiveAt = s.elapsed
  moveTo(s, 12)
  step(s, DT)
  assert.equal(tall.mode, 'dive')
  assert.equal(tall.beamDive, true)
  s.nextDiveAt = Infinity // just this one
  moveTo(s, 2) // step aside while it comes down
  play(s, 1.5)
  assert.equal(tall.mode, 'beam')
  assert.ok(Math.abs(tall.x - 12) < 0.01 && tall.y === INV_H - 9, `hovering over where the figure stood (${tall.x.toFixed(1)}, ${tall.y})`)
  assert.equal(invadersPose(s), 'worried')
  assert.equal(s.player.alive, true, 'out of the beam, untouched')
  moveTo(s, 12) // and back under it, while it's still building
  step(s, DT)
  assert.equal(s.player.alive, true, 'the beam takes a moment to build')
  play(s, INV_BEAM_CHARGE)
  assert.equal(s.player.alive, false, 'caught')
  assert.equal(s.lives, 2)
  assert.equal(tall.captive, true)
  assert.equal(tall.mode, 'return')
  assert.equal(s.pops.at(-1).text, 'CAUGHT')
  play(s, 1.5)
  assert.equal(tall.mode, 'formation')
  assert.equal(s.player.alive, true)
  assert.equal(invadersPose(s), 'nervous')
  // A beam that catches nothing ends on its own.
  const idle = settled(6, [can('tall', 'MTN DEW')], 3)
  const t2 = idle.invaders[0]
  idle.rng = () => 0
  idle.tallDives = 1
  idle.nextDiveAt = idle.elapsed
  moveTo(idle, 12)
  step(idle, DT)
  moveTo(idle, 2)
  play(idle, 1.5)
  assert.equal(t2.mode, 'beam')
  play(idle, INV_BEAM_SECONDS + 0.1)
  assert.equal(t2.mode, 'return')
  assert.equal(idle.lives, 3)
  // The rescue: two shots into the captor in its slot.
  const aim = v => moveTo(s, v.home.x + invadersSway(s.elapsed - s.waveAt + (INV_PLAYER_Y - v.home.y) / 20))
  for (let i = 0; i < 2; i++) {
    aim(tall)
    fire(s)
    play(s, 1.2)
  }
  assert.equal(tall.mode, 'gone')
  assert.equal(s.player.dual, true)
  assert.equal(s.pops.some(p => p.text === 'RESCUED'), true)
  assert.equal(s.score, 150, 'a slot kill')
  const box = invadersPlayerBox(s.player)
  assert.ok(box.hw > 1 && Math.abs(box.x - (s.player.x + INV_DUAL_DX / 2)) < 1e-9, 'a wider box, centred between the two')
  moveTo(s, 2)
  fire(s)
  assert.equal(s.shots.length, 2, 'two shots a press')
  assert.ok(Math.abs(s.shots[1].x - s.shots[0].x - INV_DUAL_DX) < 1e-9)
  play(s, 2)
  s.bullets.push({ x: 2 + INV_DUAL_DX, y: INV_PLAYER_Y - 1, vx: 0, vy: 8 })
  play(s, 0.3)
  assert.equal(s.player.dual, false, 'the docked figure went')
  assert.equal(s.player.alive, true)
  assert.equal(s.lives, 2, 'no life lost')
  // A captor shot in flight: the captive is lost, the kill pays a thousand.
  const f = settled(7, [can('tall', 'MTN DEW')], 3)
  const t3 = f.invaders[0]
  t3.captive = true
  t3.mode = 'dive'
  t3.path = { p0: [4, 4], p1: [4, 8], p2: [4, 12], p3: [4, 30] }
  t3.t = 0
  t3.pathSeconds = 4
  moveTo(f, 20)
  play(f, 0.5)
  f.shots.push({ x: t3.x, y: t3.y + 0.2 }, { x: t3.x, y: t3.y + 0.5 })
  play(f, 0.1)
  assert.equal(t3.mode, 'gone')
  assert.equal(t3.captive, false)
  assert.equal(f.player.dual, false)
  assert.equal(f.score, 1000)
})

test('an extra life every ten thousand, up to five', () => {
  const s = settled(8, [can('tall', 'X')], 3)
  s.score = INV_EXTRA_LIFE_EVERY - 100
  const tall = s.invaders[0]
  tall.hp = 1
  s.shots.push({ x: tall.x, y: tall.y })
  step(s, DT)
  assert.equal(s.lives, 4)
  assert.equal(s.pops.at(-1).text, '1UP')
  assert.equal(s.nextLifeAt, 2 * INV_EXTRA_LIFE_EVERY)
})

test('the scripted player clears the wave: a clean month on six seeds, a soda-heavy month on two, the full forty on one', async (t) => {
  const month = [
    ...Array(4).fill(can('tall', 'MTN DEW')), ...Array(12).fill(can('can', 'COKE')), ...Array(9).fill(can('mini', 'SPRITE'))
  ]
  const run = (seed, wave, budget) => {
    const s = game(seed, wave, 3)
    const frames = Math.round(budget / DT)
    for (let i = 0; i < frames && s.wavesCleared < 1 && s.status !== 'over'; i++) step(s, DT, autoInvaders(s))
    return s
  }
  const report = s => `${s.status} at ${s.elapsed.toFixed(0)}s, ${s.alive} left, ${s.lives} lives, ${s.score} pts`
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = run(seed, [], 120)
    assert.ok(s.wavesCleared >= 1, `clean month, seed ${seed}: ${report(s)}`)
  }
  for (const seed of [1, 2]) {
    const s = run(seed, month, 240)
    assert.ok(s.wavesCleared >= 1, `25 sodas, seed ${seed}: ${report(s)}`)
    t.diagnostic(`25 sodas, seed ${seed}: ${report(s)}`)
  }
  const full = run(1, Array(40).fill(can('can', 'COKE')), 360)
  t.diagnostic(`40 cans: ${report(full)}`)
  assert.ok(full.wavesCleared >= 1, `forty cans: ${report(full)}`)
})
