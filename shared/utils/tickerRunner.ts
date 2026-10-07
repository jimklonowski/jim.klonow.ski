// TICKER's runner — the /ticker mini-game: Chrome's dino, with soda cans and lab flags. TICKER
// runs along the floor at the left of the stage; cans scroll in from the right in clusters of
// one to three, and from a couple of hundred points lab-report flags float in at two heights —
// jump the low ones, run under the high ones (a jump into a high flag is the classic fake-out).
// Hit anything and it keels over.
//
// Pure and deterministic: the world advances by step(state, dt) and reads back as plain data;
// the component (app/components/ticker/Runner.vue) draws it and feeds it input. No DOM, so the
// plain-node tests can drive whole runs with a scripted jumper and a seeded random source — the
// proof that every obstacle is clearable at any speed it can appear at.
//
// Units: canvas pixels at the game's cell pitch (3px cells + 1px gap = 4px, the companion's md
// size) and seconds. x grows to the right; heights are measured UP from the ground line.

export const CELL = 4
export const FIGURE_COLS = 28
export const FIGURE_ROWS = 16
export const FIGURE_W = FIGURE_COLS * CELL
export const FIGURE_H = FIGURE_ROWS * CELL
/** Where the figure's canvas starts; it never moves — the world does. */
export const PLAYER_X = 48

/** The hitbox: the heart's trunk, not the whole canvas (the arms and a hat reach past it). */
export const HITBOX = { dx: 26, w: 48, dy: 4, h: 60 }
/** Pixels of overlap forgiven on every side — a brush is not a hit. */
export const FORGIVE = 3

export const GRAVITY = 1500
/** 460 px/s up at 1500 px/s² down: a 70px apex and 0.61s in the air. */
export const JUMP_V = 460
export const START_SPEED = 220
export const MAX_SPEED = 520
export const SPEED_PER_POINT = 0.3
export const PX_PER_POINT = 10
/** Flags start appearing from this score; the pairs and triples of cans from these speeds. */
export const FLAGS_FROM = 200
export const PAIR_FROM_SPEED = 300
export const TRIPLE_FROM_SPEED = 400
/** A frame longer than this is a tab that was hidden, not a slow device: don't tunnel. */
export const MAX_DT = 0.05
/** The run cycle swaps feet every stride. */
export const STRIDE_PX = 28

export type ObstacleKind = 'can' | 'cans2' | 'cans3' | 'flag-low' | 'flag-high'

export interface Obstacle {
  kind: ObstacleKind
  x: number
  w: number
  h: number
  /** Height of the obstacle's underside above the ground. */
  bottom: number
}

/** Cans: 4 cells wide, 7 tall, a cell apart. Flags: 5×5, the high one clear of a hatted head. */
export const OBSTACLE_SIZE: Record<ObstacleKind, { w: number, h: number, bottom: number }> = {
  'can': { w: 16, h: 28, bottom: 0 },
  'cans2': { w: 36, h: 28, bottom: 0 },
  'cans3': { w: 56, h: 28, bottom: 0 },
  'flag-low': { w: 20, h: 20, bottom: 16 },
  'flag-high': { w: 20, h: 20, bottom: 84 }
}

export type RunnerStatus = 'ready' | 'running' | 'over'

export interface RunnerState {
  status: RunnerStatus
  /** Canvas width — where obstacles spawn. */
  width: number
  distance: number
  score: number
  speed: number
  /** The figure's feet above the ground; 0 while running. */
  y: number
  vy: number
  obstacles: Obstacle[]
  /** The distance at which the next obstacle appears. */
  nextSpawnAt: number
  rng: () => number
}

export interface Box { x: number, w: number, bottom: number, h: number }

/** mulberry32 — a seedable source for the tests and for replays. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRunner(width: number, rng: () => number = Math.random): RunnerState {
  return {
    status: 'ready',
    width,
    distance: 0,
    score: 0,
    speed: START_SPEED,
    y: 0,
    vy: 0,
    obstacles: [],
    nextSpawnAt: 260,
    rng
  }
}

export function speedAt(score: number): number {
  return Math.min(MAX_SPEED, START_SPEED + score * SPEED_PER_POINT)
}

/** The gap to the next obstacle: room to land and jump again at this speed, give or take a third. */
function nextGap(speed: number, rng: () => number): number {
  return (380 + speed * 0.8) * (0.75 + rng() * 0.6)
}

function spawn(s: RunnerState) {
  const r = s.rng()
  let kind: ObstacleKind
  if (s.score >= FLAGS_FROM && r < 0.3) {
    kind = s.rng() < 0.5 ? 'flag-low' : 'flag-high'
  }
  else if (s.speed >= TRIPLE_FROM_SPEED && r < 0.5) {
    kind = 'cans3'
  }
  else if (s.speed >= PAIR_FROM_SPEED && r < 0.7) {
    kind = 'cans2'
  }
  else {
    kind = 'can'
  }
  const size = OBSTACLE_SIZE[kind]
  s.obstacles.push({ kind, x: s.width + 8, ...size })
  s.nextSpawnAt = s.distance + nextGap(s.speed, s.rng)
}

/**
 * The one input. Ready: starts the run (and jumps). Running: jumps if on the ground. Over:
 * starts a fresh run with the same width and random source.
 */
export function jump(s: RunnerState): RunnerState {
  if (s.status === 'over') {
    const fresh = createRunner(s.width, s.rng)
    Object.assign(s, fresh)
  }
  if (s.status === 'ready') s.status = 'running'
  if (s.y === 0 && s.vy === 0) s.vy = JUMP_V
  return s
}

export function playerBox(s: RunnerState): Box {
  return { x: PLAYER_X + HITBOX.dx, w: HITBOX.w, bottom: s.y + HITBOX.dy, h: HITBOX.h }
}

export function obstacleBox(o: Obstacle): Box {
  return { x: o.x, w: o.w, bottom: o.bottom, h: o.h }
}

export function hits(a: Box, b: Box): boolean {
  const ax0 = a.x + FORGIVE
  const ax1 = a.x + a.w - FORGIVE
  const ay0 = a.bottom + FORGIVE
  const ay1 = a.bottom + a.h - FORGIVE
  return ax0 < b.x + b.w && ax1 > b.x && ay0 < b.bottom + b.h && ay1 > b.bottom
}

/** Advance the world by dt seconds (clamped). Only a running world moves. */
export function step(s: RunnerState, dt: number): RunnerState {
  if (s.status !== 'running') return s
  const t = Math.min(MAX_DT, Math.max(0, dt))

  // The figure.
  if (s.y > 0 || s.vy !== 0) {
    s.vy -= GRAVITY * t
    s.y += s.vy * t
    if (s.y <= 0) {
      s.y = 0
      s.vy = 0
    }
  }

  // The world.
  const dx = s.speed * t
  s.distance += dx
  s.score = Math.floor(s.distance / PX_PER_POINT)
  s.speed = speedAt(s.score)
  for (const o of s.obstacles) o.x -= dx
  s.obstacles = s.obstacles.filter(o => o.x + o.w > 0)
  if (s.distance >= s.nextSpawnAt) spawn(s)

  // The crash.
  const me = playerBox(s)
  if (s.obstacles.some(o => hits(me, obstacleBox(o)))) s.status = 'over'
  return s
}

/** Which of the companion's poses the renderer should draw. */
export function runnerPose(s: RunnerState): 'idle' | 'walk1' | 'walk2' | 'happy' | 'flatline' {
  if (s.status === 'ready') return 'idle'
  if (s.status === 'over') return 'flatline'
  if (s.y > 0) return 'happy'
  return Math.floor(s.distance / STRIDE_PX) % 2 === 0 ? 'walk1' : 'walk2'
}

/**
 * A scripted jumper for the tests (and a reference for how far ahead a human has to react):
 * jump when the next thing that must be jumped is about a quarter second out, and never jump
 * at a high flag. Returns true when it pressed.
 */
export function autoJump(s: RunnerState): boolean {
  if (s.status !== 'running' || s.y > 0) return false
  const front = PLAYER_X + HITBOX.dx + HITBOX.w
  const next = s.obstacles
    .filter(o => o.kind !== 'flag-high' && o.x + o.w > PLAYER_X + HITBOX.dx)
    .sort((a, b) => a.x - b.x)[0]
  if (!next) return false
  const lead = next.x - front
  if (lead < 0 || lead > s.speed * 0.26) return false
  // Not into a high flag that is right there.
  const overhead = s.obstacles.find(o => o.kind === 'flag-high' && o.x < front + s.speed * 0.7 && o.x + o.w > PLAYER_X)
  if (overhead) return false
  jump(s)
  return true
}
