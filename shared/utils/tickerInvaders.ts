// TICKER's soda invaders — Galaga, where the formation is the soda log. One invader per soda
// logged in the trailing month, sorted into the classic rows by size: the tall boys (≥14 oz, two
// hits) at the top like the bosses, the cans in the middle, the minis at the bottom, and germs
// filling in when the month was too clean to make a formation. They stream in along curves,
// settle into a swaying formation, then peel off one or two at a time to dive at the figure and
// drop aimed bullets. A tall boy sometimes stops mid-dive and puts out a beam: a figure caught in
// it is carried up to the formation (a life), and shooting that tall boy while it sits in
// formation frees the captive, which docks alongside — the dual figure, twice the shots.
// Every invader down clears the wave; the next is the same month, faster.
//
// Pure and deterministic, like the other games: stepInvaders(state, dt, input) advances the
// clocks with the player's hand in `input`, and everything reads back as plain data for the
// component (app/components/ticker/Invaders.vue) to draw. The plain-node tests drive whole waves
// with a scripted player and a seeded random source — the proof that the formation is beatable.
//
// Units: cells and seconds. x grows right, y grows DOWN; (x, y) is an entity's centre. The field
// is INV_W wide and INV_H tall; the figure sits on the row INV_PLAYER_Y. Every export is named
// apart from the other games' (Nuxt auto-imports shared/utils as one registry).
import { MAX_DT } from './tickerRunner.ts'

export const INV_W = 24
export const INV_H = 26
/** Invaders per formation row. */
export const INV_COLS = 8
export const INV_ROWS = 5
export const INV_MAX = INV_COLS * INV_ROWS
/** Germs fill the formation up to this many when the month was too clean. */
export const INV_MIN = 6
export const INV_SLOT_DX = 1.6
export const INV_SLOT_DY = 1.6
export const INV_FORMATION_TOP = 2.4
export const INV_PLAYER_Y = INV_H - 2
export const INV_PLAYER_SPEED = 11
export const INV_SHOT_SPEED = 20
/** Shots in the air at once (twice that for the dual figure). */
export const INV_SHOTS = 2
export const INV_FIRE_SECONDS = 0.2
export const INV_BULLET_SPEED = 8
/** The formation sways side to side this far, this often. */
export const INV_SWAY = 1.6
export const INV_SWAY_SECONDS = 4
export const INV_ENTER_SECONDS = 1.8
export const INV_ENTER_GROUP = 8
export const INV_ENTER_GAP = 0.8
export const INV_ENTER_STAGGER = 0.18
/** A dive every so often, sooner each wave. */
export const INV_DIVE_EVERY = 2.4
export const INV_DIVE_LESS_PER_LEVEL = 0.2
export const INV_DIVE_MIN = 1
export const INV_DIVE_SECONDS = 2.8
export const INV_RETURN_SECONDS = 0.9
export const INV_DIVERS_MAX = 3
export const INV_BEAM_SECONDS = 2.4
export const INV_BEAM_HALF = 1.5
/** The beam builds for this long before it can catch anything: the warning. */
export const INV_BEAM_CHARGE = 0.5
export const INV_RESPAWN_SECONDS = 1.4
export const INV_IMMUNE_SECONDS = 1.5
export const INV_LEVEL_SECONDS = 1.6
export const INV_EXTRA_LIFE_EVERY = 10000
export const INV_MAX_LIVES = 5
export const INV_WAVE_BONUS = 100
/** A tall boy carrying the captive, shot in flight: the captive is lost, but it pays. */
export const INV_CAPTIVE_LOST_POINTS = 1000

export type InvaderKind = 'mini' | 'can' | 'tall' | 'germ'
/** Points in formation, then in flight. */
export const INV_POINTS: Record<InvaderKind, readonly [number, number]> = { mini: [50, 100], can: [80, 160], tall: [150, 400], germ: [30, 60] }
export const INV_HP: Record<InvaderKind, number> = { mini: 1, can: 1, tall: 2, germ: 1 }
/** Half extents of each kind's hit box. */
export const INV_BOX: Record<InvaderKind, readonly [number, number]> = { mini: [0.4, 0.55], can: [0.5, 0.75], tall: [0.6, 0.9], germ: [0.5, 0.5] }
export const INV_PLAYER_BOX: readonly [number, number] = [0.7, 0.6]
/** The second figure docks this far to the right. */
export const INV_DUAL_DX = 1.3

export interface InvaderInput {
  kind: InvaderKind
  /** The soda's name, for the can's letter; null for a germ or an unnamed soda. */
  label: string | null
}

export type InvaderMode = 'wait' | 'enter' | 'formation' | 'dive' | 'beam' | 'return' | 'gone'

interface Path { p0: Vec, p1: Vec, p2: Vec, p3: Vec }
type Vec = readonly [number, number]

export interface Invader {
  id: number
  kind: InvaderKind
  label: string | null
  hp: number
  /** The formation slot, without the sway. */
  home: { x: number, y: number }
  mode: InvaderMode
  x: number
  y: number
  path: Path | null
  /** 0..1 along the path. */
  t: number
  pathSeconds: number
  /** Seconds into the wave at which it enters. */
  enterAt: number
  /** This dive ends in a beam. */
  beamDive: boolean
  /** When the beam came on, and when it goes off. */
  beamAt: number
  beamUntil: number
  /** Bullets dropped this dive. */
  dropped: number
  /** Carrying the captured figure. */
  captive: boolean
}

export type InvadersStatus = 'ready' | 'running' | 'cleared' | 'over'

export interface InvadersPlayer {
  x: number
  alive: boolean
  dual: boolean
  diedAt: number
  immuneUntil: number
}

export interface InvadersBurst {
  x: number
  y: number
  at: number
  /** A kill, a dent on a tall boy, or the figure going down. */
  kind: 'kill' | 'dent' | 'player'
}

export interface InvadersPop {
  x: number
  y: number
  text: string
  at: number
}

export interface InvadersInput {
  /** -1 left, 0 still, 1 right. */
  dir: -1 | 0 | 1
  /** Held: fires on the cooldown while shots are free. */
  fire: boolean
}

export interface InvadersState {
  status: InvadersStatus
  level: number
  /** Waves cleared this game (the record's `cleared`). */
  wavesCleared: number
  score: number
  lives: number
  elapsed: number
  /** When the wave started (entrances are timed from here). */
  waveAt: number
  player: InvadersPlayer
  shots: Array<{ x: number, y: number }>
  bullets: Array<{ x: number, y: number, vx: number, vy: number }>
  invaders: Invader[]
  /** Invaders still to beat this wave. */
  alive: number
  /** Everyone has flown in; the dives can start. */
  entered: boolean
  nextDiveAt: number
  /** Tall-boy dives so far (every other one is a beam). */
  tallDives: number
  lastShotAt: number
  lastKillAt: number
  nextLifeAt: number
  clearedAt: number
  endedAt: number
  bursts: InvadersBurst[]
  pops: InvadersPop[]
  source: { wave: InvaderInput[], lives: number }
  rng: () => number
}

export interface InvadersOptions {
  wave: InvaderInput[]
  lives?: number
  rng?: () => number
}

const KIND_ORDER: Record<InvaderKind, number> = { tall: 0, can: 1, mini: 2, germ: 3 }

// --- the formation ------------------------------------------------------------------------------

/**
 * The wave's invaders in formation order: tall boys at the top, then cans, minis, germs — at
 * most INV_MAX, germs added up to INV_MIN when there are too few.
 */
export function invadersWaveFor(wave: InvaderInput[]): InvaderInput[] {
  const out = [...wave].slice(0, INV_MAX).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  while (out.length < INV_MIN) out.push({ kind: 'germ', label: null })
  return out
}

/** Where each invader of a wave sits: rows of INV_COLS, each row centred. */
export function invadersSlots(count: number): Array<{ x: number, y: number }> {
  const slots: Array<{ x: number, y: number }> = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / INV_COLS)
    const inRow = Math.min(INV_COLS, count - row * INV_COLS)
    const col = i % INV_COLS
    slots.push({ x: INV_W / 2 + (col - (inRow - 1) / 2) * INV_SLOT_DX, y: INV_FORMATION_TOP + row * INV_SLOT_DY })
  }
  return slots
}

/** The formation's sideways sway at a moment of the wave. */
export function invadersSway(waveTime: number): number {
  return INV_SWAY * Math.sin((2 * Math.PI * waveTime) / INV_SWAY_SECONDS)
}

/** The curve an invader flies in on: from a top corner, a swoop through the lower middle, up into its slot. */
function enterPath(home: { x: number, y: number }, side: -1 | 1): Path {
  return {
    p0: [side < 0 ? -1.5 : INV_W + 1.5, 1],
    p1: [INV_W / 2 - side * 7, INV_H * 0.62],
    p2: [home.x + side * 5, home.y + 5],
    p3: [home.x, home.y]
  }
}

function buildInvaders(wave: InvaderInput[]): Invader[] {
  const slots = invadersSlots(wave.length)
  return wave.map((w, i) => {
    const group = Math.floor(i / INV_ENTER_GROUP)
    const member = i % INV_ENTER_GROUP
    const side: -1 | 1 = group % 2 === 0 ? -1 : 1
    const home = slots[i]!
    return {
      id: i,
      kind: w.kind,
      label: w.label,
      hp: INV_HP[w.kind],
      home,
      mode: 'wait',
      x: side < 0 ? -2 : INV_W + 2,
      y: -2,
      path: enterPath(home, side),
      t: 0,
      pathSeconds: INV_ENTER_SECONDS,
      enterAt: 0.3 + group * INV_ENTER_GAP + member * INV_ENTER_STAGGER,
      beamDive: false,
      beamAt: -1,
      beamUntil: -1,
      dropped: 0,
      captive: false
    }
  })
}

export function createInvaders(o: InvadersOptions): InvadersState {
  const rng = o.rng ?? Math.random
  const wave = invadersWaveFor(o.wave)
  const lives = o.lives ?? 3
  return {
    status: 'ready',
    level: 1,
    wavesCleared: 0,
    score: 0,
    lives,
    elapsed: 0,
    waveAt: 0,
    player: { x: INV_W / 2, alive: true, dual: false, diedAt: -1, immuneUntil: -1 },
    shots: [],
    bullets: [],
    invaders: buildInvaders(wave),
    alive: wave.length,
    entered: false,
    nextDiveAt: Infinity,
    tallDives: 0,
    lastShotAt: -1,
    lastKillAt: -1,
    nextLifeAt: INV_EXTRA_LIFE_EVERY,
    clearedAt: -1,
    endedAt: -1,
    bursts: [],
    pops: [],
    source: { wave: o.wave, lives },
    rng
  }
}

/**
 * The one button. Ready: the wave flies in. Over: a fresh game against the same month.
 * Anything else: nothing.
 */
export function startInvaders(s: InvadersState): InvadersState {
  if (s.status === 'over') Object.assign(s, createInvaders({ rng: s.rng, ...s.source }))
  if (s.status === 'ready') {
    s.status = 'running'
    s.waveAt = s.elapsed
    s.entered = false
    s.nextDiveAt = Infinity
  }
  return s
}

// --- geometry -----------------------------------------------------------------------------------

function bezier(p: Path, t: number): [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * p.p0[0] + b * p.p1[0] + c * p.p2[0] + d * p.p3[0],
    a * p.p0[1] + b * p.p1[1] + c * p.p2[1] + d * p.p3[1]
  ]
}

/** A straight path, for the flight back to the slot. */
function line(from: Vec, to: Vec): Path {
  return { p0: from, p1: from, p2: to, p3: to }
}

/** The figure's hit box, wider with the second figure docked. */
export function invadersPlayerBox(p: InvadersPlayer): { x: number, hw: number, hh: number } {
  return p.dual
    ? { x: p.x + INV_DUAL_DX / 2, hw: INV_PLAYER_BOX[0] + INV_DUAL_DX / 2, hh: INV_PLAYER_BOX[1] }
    : { x: p.x, hw: INV_PLAYER_BOX[0], hh: INV_PLAYER_BOX[1] }
}

function overlapsPlayer(p: InvadersPlayer, x: number, y: number, hw: number, hh: number): boolean {
  const box = invadersPlayerBox(p)
  return Math.abs(x - box.x) < hw + box.hw && Math.abs(y - INV_PLAYER_Y) < hh + box.hh
}

/** Whether an invader is in the air (not waiting off-screen, not in its slot, not gone). */
export function invadersInFlight(v: Invader): boolean {
  return v.mode === 'enter' || v.mode === 'dive' || v.mode === 'beam' || v.mode === 'return'
}

/**
 * Where a diving invader crosses the figure's row: the span of x it covers while within a cell
 * and a half of the row, and how long until it gets there. Null for a swoop that never comes
 * down that far (a beam dive stops short).
 */
export function invadersCrossing(v: Invader): { from: number, to: number, seconds: number } | null {
  if (v.mode !== 'dive' || !v.path || v.beamDive) return null
  let from = Infinity
  let to = -Infinity
  let at = -1
  for (let t = v.t; t <= 1; t += 0.02) {
    const [x, y] = bezier(v.path, t)
    if (Math.abs(y - INV_PLAYER_Y) <= 1.5) {
      from = Math.min(from, x)
      to = Math.max(to, x)
      if (at < 0) at = t
    }
    else if (at >= 0) {
      break
    }
  }
  if (at < 0) return null
  return { from, to, seconds: (at - v.t) * v.pathSeconds }
}

/** The figure's x once the second one is docked: the left edge the engine clamps. */
function clampPlayer(p: InvadersPlayer) {
  const right = p.dual ? INV_W - 1 - INV_DUAL_DX : INV_W - 1
  p.x = Math.max(1, Math.min(right, p.x))
}

// --- the clocks -----------------------------------------------------------------------------------

function pop(s: InvadersState, x: number, y: number, text: string) {
  s.pops.push({ x, y, text, at: s.elapsed })
  if (s.pops.length > 8) s.pops.shift()
}

function burst(s: InvadersState, x: number, y: number, kind: InvadersBurst['kind']) {
  s.bursts.push({ x, y, at: s.elapsed, kind })
  if (s.bursts.length > 12) s.bursts.shift()
}

function award(s: InvadersState, points: number, x: number, y: number) {
  s.score += points
  pop(s, x, y, String(points))
  if (s.score >= s.nextLifeAt) {
    s.nextLifeAt += INV_EXTRA_LIFE_EVERY
    if (s.lives < INV_MAX_LIVES) {
      s.lives++
      pop(s, INV_W / 2, INV_PLAYER_Y - 3, '1UP')
    }
  }
}

/** An invader goes down: points by kind and whether it was in its slot, the captive freed or lost. */
function kill(s: InvadersState, v: Invader) {
  const inSlot = v.mode === 'formation'
  let points = INV_POINTS[v.kind][inSlot ? 0 : 1]
  if (v.captive) {
    v.captive = false
    if (inSlot) {
      // The rescue: the freed figure docks alongside.
      s.player.dual = true
      clampPlayer(s.player)
      pop(s, s.player.x, INV_PLAYER_Y - 2.5, 'RESCUED')
    }
    else {
      points = INV_CAPTIVE_LOST_POINTS
    }
  }
  v.mode = 'gone'
  v.hp = 0
  s.alive--
  s.lastKillAt = s.elapsed
  burst(s, v.x, v.y, 'kill')
  award(s, points, v.x, v.y)
}

/** The figure is hit: the docked one goes first, then a life. */
function hurtPlayer(s: InvadersState) {
  const p = s.player
  if (!p.alive || s.elapsed < p.immuneUntil) return
  if (p.dual) {
    p.dual = false
    p.immuneUntil = s.elapsed + 1
    burst(s, p.x + INV_DUAL_DX, INV_PLAYER_Y, 'player')
    return
  }
  p.alive = false
  p.diedAt = s.elapsed
  s.lives--
  burst(s, p.x, INV_PLAYER_Y, 'player')
  if (s.lives <= 0) {
    s.status = 'over'
    s.endedAt = s.elapsed
  }
}

/** Caught in the beam: carried up to the formation on the tall boy. */
function capture(s: InvadersState, v: Invader) {
  const p = s.player
  p.alive = false
  p.diedAt = s.elapsed
  s.lives--
  v.captive = true
  v.beamUntil = -1
  startReturn(v, [v.x, v.y])
  pop(s, p.x, INV_PLAYER_Y - 2.5, 'CAUGHT')
  if (s.lives <= 0) {
    s.status = 'over'
    s.endedAt = s.elapsed
  }
}

function startReturn(v: Invader, from: Vec) {
  v.mode = 'return'
  ;[v.x, v.y] = from
  v.path = line(from, [v.home.x, v.home.y])
  v.t = 0
  v.pathSeconds = INV_RETURN_SECONDS
}

export function invadersDiveEvery(level: number): number {
  return Math.max(INV_DIVE_MIN, INV_DIVE_EVERY - INV_DIVE_LESS_PER_LEVEL * (level - 1))
}

/** Dives get quicker each wave. */
export function invadersPace(level: number): number {
  return Math.max(0.55, 1 - 0.07 * (level - 1))
}

/** A diver peels off its slot: a swoop out to one side and down through the figure's column, off the bottom. */
function launchDive(s: InvadersState, v: Invader) {
  const side: -1 | 1 = s.rng() < 0.5 ? -1 : 1
  const px = s.player.x
  v.mode = 'dive'
  v.t = 0
  v.dropped = 0
  v.pathSeconds = INV_DIVE_SECONDS * invadersPace(s.level)
  const beam = v.kind === 'tall' && !v.captive && !s.player.dual && !s.invaders.some(o => o.captive) && s.tallDives % 2 === 1
  if (v.kind === 'tall') s.tallDives++
  v.beamDive = beam
  if (beam) {
    // Out to the side and down to a hover over the figure's column, the beam below it.
    const hx = Math.max(3, Math.min(INV_W - 3, px))
    v.path = { p0: [v.x, v.y], p1: [v.x + side * 6, v.y + 3], p2: [hx - side * 3, INV_H - 11], p3: [hx, INV_H - 9] }
    v.pathSeconds = 1.4 * invadersPace(s.level)
  }
  else {
    v.path = { p0: [v.x, v.y], p1: [v.x + side * 6, v.y + 4], p2: [px - side * 6, INV_H - 5], p3: [px + side * 1.5, INV_H + 2.5] }
  }
}

/** A bullet aimed at the figure, never flatter than about 35° off straight down. */
function dropBullet(s: InvadersState, v: Invader) {
  const dx = s.player.x - v.x
  const dy = INV_PLAYER_Y - v.y
  let ang = Math.atan2(dy, dx)
  ang = Math.max(Math.PI / 2 - 0.6, Math.min(Math.PI / 2 + 0.6, ang))
  s.bullets.push({ x: v.x, y: v.y + 0.5, vx: Math.cos(ang) * INV_BULLET_SPEED, vy: Math.sin(ang) * INV_BULLET_SPEED })
  v.dropped++
}

function nextWave(s: InvadersState) {
  s.level++
  s.wavesCleared++
  s.invaders = buildInvaders(invadersWaveFor(s.source.wave))
  s.alive = s.invaders.length
  s.shots = []
  s.bullets = []
  s.entered = false
  s.nextDiveAt = Infinity
  s.player.alive = true
  s.player.immuneUntil = -1
  s.status = 'ready'
}

/** Advance the clocks by dt seconds (clamped) with the player's hand. */
export function stepInvaders(s: InvadersState, dt: number, input: InvadersInput = { dir: 0, fire: false }): InvadersState {
  if (s.status === 'over') return s
  const t = Math.min(MAX_DT, Math.max(0, dt))
  s.elapsed += t
  if (s.status === 'ready') return s
  if (s.status === 'cleared') {
    if (s.elapsed - s.clearedAt >= INV_LEVEL_SECONDS) nextWave(s)
    return s
  }

  const p = s.player
  const waveTime = s.elapsed - s.waveAt
  const sway = invadersSway(waveTime)

  // The figure: a step, a shot.
  if (p.alive) {
    p.x += input.dir * INV_PLAYER_SPEED * t
    clampPlayer(p)
    const cap = p.dual ? INV_SHOTS * 2 : INV_SHOTS
    if (input.fire && s.elapsed - s.lastShotAt >= INV_FIRE_SECONDS && s.shots.length < cap) {
      s.shots.push({ x: p.x, y: INV_PLAYER_Y - 0.8 })
      if (p.dual) s.shots.push({ x: p.x + INV_DUAL_DX, y: INV_PLAYER_Y - 0.8 })
      s.lastShotAt = s.elapsed
    }
  }
  else if (s.elapsed - p.diedAt >= INV_RESPAWN_SECONDS) {
    p.alive = true
    p.x = INV_W / 2
    p.immuneUntil = s.elapsed + INV_IMMUNE_SECONDS
    s.bullets = []
  }

  for (const sh of s.shots) sh.y -= INV_SHOT_SPEED * t
  s.shots = s.shots.filter(sh => sh.y > -1)
  for (const b of s.bullets) {
    b.x += b.vx * t
    b.y += b.vy * t
  }
  s.bullets = s.bullets.filter(b => b.y < INV_H + 1 && b.x > -1 && b.x < INV_W + 1)

  // The invaders, by mode.
  let divers = 0
  for (const v of s.invaders) {
    switch (v.mode) {
      case 'wait':
        if (waveTime >= v.enterAt) {
          v.mode = 'enter'
          v.t = 0
        }
        break
      case 'enter': {
        v.t = Math.min(1, v.t + t / v.pathSeconds)
        ;[v.x, v.y] = bezier(v.path!, v.t)
        if (v.t >= 1) v.mode = 'formation'
        break
      }
      case 'formation':
        v.x = v.home.x + sway
        v.y = v.home.y
        break
      case 'dive': {
        divers++
        v.t = Math.min(1, v.t + t / v.pathSeconds)
        ;[v.x, v.y] = bezier(v.path!, v.t)
        const bullets = s.level >= 2 ? 2 : 1
        if (!v.beamDive && p.alive && v.dropped < bullets && v.y < INV_PLAYER_Y - 6 && v.t >= 0.25 * (v.dropped + 1)) dropBullet(s, v)
        if (v.t >= 1) {
          if (v.beamDive) {
            v.mode = 'beam'
            v.beamAt = s.elapsed
            v.beamUntil = s.elapsed + INV_BEAM_SECONDS
          }
          else {
            startReturn(v, [v.home.x + sway, -1.5])
          }
        }
        break
      }
      case 'beam':
        divers++
        if (s.elapsed >= v.beamUntil) startReturn(v, [v.x, v.y])
        break
      case 'return': {
        v.t = Math.min(1, v.t + t / v.pathSeconds)
        ;[v.x, v.y] = bezier(v.path!, v.t)
        if (v.t >= 1) v.mode = 'formation'
        break
      }
      case 'gone':
        break
    }
  }
  if (!s.entered && s.invaders.every(v => v.mode !== 'wait' && v.mode !== 'enter')) {
    s.entered = true
    s.nextDiveAt = s.elapsed + 1.2
  }

  // A dive, when it's time and the figure is there to dive at.
  if (s.entered && p.alive && s.elapsed >= s.nextDiveAt && divers < INV_DIVERS_MAX) {
    const n = s.level >= 3 ? 2 : 1
    for (let i = 0; i < n && divers < INV_DIVERS_MAX; i++) {
      const slotted = s.invaders.filter(v => v.mode === 'formation')
      if (!slotted.length) break
      launchDive(s, slotted[Math.floor(s.rng() * slotted.length)]!)
      divers++
    }
    s.nextDiveAt = s.elapsed + invadersDiveEvery(s.level)
  }

  // Shots into invaders.
  s.shots = s.shots.filter((sh) => {
    for (const v of s.invaders) {
      if (v.mode === 'wait' || v.mode === 'gone') continue
      const [hw, hh] = INV_BOX[v.kind]
      if (Math.abs(sh.x - v.x) >= hw + 0.1 || Math.abs(sh.y - v.y) >= hh + 0.3) continue
      v.hp--
      if (v.hp > 0) {
        burst(s, v.x, v.y, 'dent')
      }
      else {
        if (v.mode === 'beam') v.beamUntil = -1
        kill(s, v)
      }
      return false
    }
    return true
  })

  // Bullets, divers and the beam into the figure.
  if (p.alive && s.status === 'running') {
    const box = invadersPlayerBox(p)
    const hit = s.bullets.findIndex(b => Math.abs(b.x - box.x) < box.hw && Math.abs(b.y - INV_PLAYER_Y) < box.hh + 0.2)
    if (hit >= 0) {
      s.bullets.splice(hit, 1)
      hurtPlayer(s)
    }
  }
  for (const v of s.invaders) {
    if (!p.alive || s.status !== 'running') break
    if (v.mode === 'beam' && !p.dual && s.elapsed >= p.immuneUntil && s.elapsed >= v.beamAt + INV_BEAM_CHARGE && Math.abs(p.x - v.x) < INV_BEAM_HALF - 0.2) {
      capture(s, v)
      break
    }
    if (!invadersInFlight(v) || v.mode === 'return') continue
    const [hw, hh] = INV_BOX[v.kind]
    if (overlapsPlayer(p, v.x, v.y, hw, hh) && s.elapsed >= p.immuneUntil) {
      kill(s, v)
      hurtPlayer(s)
    }
  }

  // A clear sky.
  if (s.status === 'running' && s.alive === 0) {
    s.status = 'cleared'
    s.clearedAt = s.elapsed
    s.bullets = []
    award(s, INV_WAVE_BONUS * s.level, INV_W / 2, INV_H / 2)
  }

  s.bursts = s.bursts.filter(b => s.elapsed - b.at < 1)
  return s
}

/** Which of the companion's faces the renderer should draw. */
export function invadersPose(s: InvadersState): 'idle' | 'happy' | 'worried' | 'nervous' | 'flatline' | 'petted' {
  if (s.status === 'over') return 'flatline'
  if (s.status === 'cleared') return 'petted'
  if (!s.player.alive || s.invaders.some(v => v.mode === 'beam')) return 'worried'
  if (s.invaders.some(v => v.captive)) return 'nervous'
  if (s.lastKillAt >= 0 && s.elapsed - s.lastKillAt < 0.3) return 'happy'
  return 'idle'
}

// --- the scripted player (tests, and the dev hook) ---------------------------------------------

/** How far a scripted player keeps from a bullet's landing, a diver's crossing, the beam. */
export const INV_BOT_DODGE = 0.9
/** How far ahead it looks for a threat, in seconds. */
export const INV_BOT_HORIZON = 1.2

/**
 * A scripted player: starts when ready, then each call steps clear of anything about to reach
 * its row (a bullet's landing, the span a diver crosses, a beam coming or on) — the side with
 * nothing on it, or away from the nearest when both have something — and otherwise lines up
 * under the nearest invader, the formation's sway allowed for, and fires when it's under one. It
 * never shoots a tall boy carrying the captive in flight. Returns the frame's input.
 */
export function autoInvaders(s: InvadersState): InvadersInput {
  if (s.status === 'ready') {
    startInvaders(s)
    return { dir: 0, fire: false }
  }
  const p = s.player
  if (s.status !== 'running' || !p.alive) return { dir: 0, fire: false }
  const box = invadersPlayerBox(p)
  const leftWall = 1 + (box.hw - INV_PLAYER_BOX[0])
  const rightWall = INV_W - 1 - (box.hw - INV_PLAYER_BOX[0])

  // Everything about to reach the row, as the spans of x the box's centre must stay out of.
  const threats: Array<{ from: number, to: number }> = []
  for (const b of s.bullets) {
    if (b.vy <= 0) continue
    const tHit = (INV_PLAYER_Y - b.y) / b.vy
    // A threat until it is clear of the row — one just past the centre line still lands.
    if (tHit > INV_BOT_HORIZON || b.y > INV_PLAYER_Y + box.hh + 0.3) continue
    const xAt = b.x + b.vx * Math.max(0, tHit)
    threats.push({ from: xAt - box.hw - INV_BOT_DODGE, to: xAt + box.hw + INV_BOT_DODGE })
  }
  for (const v of s.invaders) {
    const [hw] = INV_BOX[v.kind]
    if (v.mode === 'beam' || (v.mode === 'dive' && v.beamDive && v.t > 0.4)) {
      const x = v.mode === 'beam' ? v.x : v.path!.p3[0]
      threats.push({ from: x - INV_BEAM_HALF - box.hw - 0.5, to: x + INV_BEAM_HALF + box.hw + 0.5 })
      continue
    }
    const cross = invadersCrossing(v)
    if (cross && cross.seconds <= INV_BOT_HORIZON) threats.push({ from: cross.from - hw - box.hw - INV_BOT_DODGE, to: cross.to + hw + box.hw + INV_BOT_DODGE })
  }
  const covered = (x: number) => threats.some(t => x > t.from && x < t.to)
  if (covered(box.x)) {
    // Out by the nearer clear edge; cornered on both sides, away from the nearest threat's middle.
    const exit = (dir: -1 | 1) => {
      for (let d = 0.25; d <= 12; d += 0.25) {
        const x = box.x + dir * d
        if (x < leftWall || x > rightWall) return Infinity
        if (!covered(x)) return d
      }
      return Infinity
    }
    const left = exit(-1)
    const right = exit(1)
    if (left < Infinity || right < Infinity) return { dir: left <= right ? -1 : 1, fire: false }
    const nearest = threats.reduce((a, t) => (Math.abs((t.from + t.to) / 2 - box.x) < Math.abs((a.from + a.to) / 2 - box.x) ? t : a))
    const dir: -1 | 1 = (nearest.from + nearest.to) / 2 > box.x ? -1 : 1
    return { dir: dir < 0 && box.x - leftWall < 1 ? 1 : dir > 0 && rightWall - box.x < 1 ? -1 : dir, fire: false }
  }

  // Then a target: the invader whose column is nearest, the lower ones preferred a little.
  const travel = (y: number) => Math.max(0, INV_PLAYER_Y - 0.8 - y) / INV_SHOT_SPEED
  let best: { x: number, cost: number } | null = null
  for (const v of s.invaders) {
    if (v.mode === 'wait' || v.mode === 'gone' || v.mode === 'beam') continue
    if (v.captive && v.mode !== 'formation') continue
    if (v.y > INV_PLAYER_Y - 2) continue
    const x = v.mode === 'formation' ? v.home.x + invadersSway(s.elapsed - s.waveAt + travel(v.y)) : v.x
    if (x < 0.5 || x > INV_W - 0.5) continue
    const cost = Math.abs(x - p.x) + (v.mode === 'formation' ? 0.08 * (INV_PLAYER_Y - v.y) : 0.6)
    if (!best || cost < best.cost) best = { x, cost }
  }
  if (!best) return { dir: 0, fire: false }
  const diff = best.x - p.x
  let dir: -1 | 0 | 1 = Math.abs(diff) > 0.15 ? (diff < 0 ? -1 : 1) : 0
  // Never a step into something about to land there: wait for it to pass.
  if (dir && covered(box.x + dir * 1)) dir = 0
  return { dir, fire: Math.abs(diff) < 0.45 }
}
