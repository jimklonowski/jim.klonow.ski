// TICKER's can crusher — Breakout, where the wall is the soda log. Every soda logged in the
// trailing month is a can, laid out in rows by week with the newest week lowest; the size on the
// entry sets how many hits it takes (a mini pops, a 12 oz dents, a 20 oz takes three). TICKER is
// the paddle, walking along the floor, and the ball bounces off the top of its head. Three lives,
// a combo for cans cleared without the ball touching the figure, and the wall cleared is the win.
//
// Pure and deterministic, like the runner: the world advances by step(state, dt, dir) and reads
// back as plain data; the component (app/components/ticker/Breakout.vue) draws it and feeds it
// input. The plain-node tests drive whole games with a scripted paddle and a seeded random source
// — the proof that every wall the log can produce is clearable.
//
// Units: canvas pixels (the runner's 4px cell pitch) and seconds. x grows right, y grows DOWN
// from the top of the playfield; `height` is the ground line, where the figure stands.
import { CELL, FIGURE_H, MAX_DT } from './tickerRunner.ts'

export const CAN_COLS = 4
export const CAN_ROWS = 7
export const CAN_W = CAN_COLS * CELL
export const CAN_H = CAN_ROWS * CELL
export const CAN_GAP_X = 4
export const CAN_GAP_Y = 6
/** Extra air between one week's rows and the next. */
export const WEEK_GAP = 8
/** The wall starts below the HUD line. */
export const WALL_TOP = 40
export const SIDE_MARGIN = 12
export const BALL = 6
export const BALL_SPEED = 240
export const BALL_MAX_SPEED = 420
export const SPEED_PER_CAN = 6
/** The crown of the heart, before today's recovery scales it. */
export const PADDLE_BASE_W = 64
export const PADDLE_SPEED = 460
/** The paddle's bounce: never straighter than this off vertical (a trapped vertical ball), never flatter than that. */
export const MIN_ANGLE = 0.25
export const MAX_ANGLE = 1.15
export const BASE_LIVES = 3
/** The figure's "ow"/"ha" frame after a hit, seconds. */
export const HIT_FLASH = 0.25
/** The walk cycle swaps feet every stride of paddle travel. (Named apart from the runner's STRIDE_PX: both modules are auto-imported.) */
export const PADDLE_STRIDE_PX = 24

export interface CanInput {
  /** Fluid ounces from the size label; null when the label carried none. */
  oz: number | null
  /** 0 = the newest week of the window, 1 the week before, … */
  week: number
}

export interface Can {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  week: number
}

export type BreakoutStatus = 'ready' | 'running' | 'over' | 'cleared' | 'empty'

export interface BreakoutState {
  status: BreakoutStatus
  width: number
  /** The ground line: the figure's feet. */
  height: number
  cans: Can[]
  paddle: { x: number, w: number }
  ball: { x: number, y: number, vx: number, vy: number }
  speed: number
  lives: number
  score: number
  /** Cans cleared since the ball last touched the figure. */
  combo: number
  elapsed: number
  /** When the last can was hit, for the figure's flash. */
  hitAt: number
  /** Paddle travel, for the walk cycle. */
  walked: number
  /** What the game was made from, so a restart rebuilds the same wall. */
  source: { cans: CanInput[], paddleScale: number, lives: number }
  rng: () => number
}

export interface BreakoutOptions {
  width: number
  height: number
  cans: CanInput[]
  rng?: () => number
  /** 0.7 (a rough night) to 1.2 (a great recovery). */
  paddleScale?: number
  lives?: number
}

/** Hits to pop a can of this size: a mini one, a 12 oz two, a 20 oz three; unsized reads as a can. */
export function canHp(oz: number | null): number {
  if (oz == null) return 2
  if (oz <= 8) return 1
  if (oz <= 13) return 2
  return 3
}

/** The wall: rows per week, oldest week at the top, each row centred; a wide week wraps. */
export function layoutCans(width: number, cans: CanInput[]): Can[] {
  const perRow = Math.max(1, Math.floor((width - SIDE_MARGIN * 2 + CAN_GAP_X) / (CAN_W + CAN_GAP_X)))
  const weeks = [...new Set(cans.map(c => c.week))].sort((a, b) => b - a)
  const out: Can[] = []
  let y = WALL_TOP
  for (const week of weeks) {
    const own = cans.filter(c => c.week === week)
    for (let i = 0; i < own.length; i += perRow) {
      const row = own.slice(i, i + perRow)
      const rowW = row.length * CAN_W + (row.length - 1) * CAN_GAP_X
      const x0 = Math.round((width - rowW) / 2)
      row.forEach((c, j) => {
        const hp = canHp(c.oz)
        out.push({ x: x0 + j * (CAN_W + CAN_GAP_X), y, w: CAN_W, h: CAN_H, hp, maxHp: hp, week })
      })
      y += CAN_H + CAN_GAP_Y
    }
    y += WEEK_GAP
  }
  return out
}

/** The y the ball bounces off: the top of the figure's head. */
export function paddleTop(s: BreakoutState): number {
  return s.height - FIGURE_H
}

/** The lowest edge of the wall, for sizing a stage around it; WALL_TOP when there is no wall. */
export function wallBottom(cans: Can[]): number {
  return cans.reduce((low, c) => Math.max(low, c.y + c.h), WALL_TOP)
}

export function createBreakout(o: BreakoutOptions): BreakoutState {
  const paddleScale = o.paddleScale ?? 1
  const lives = o.lives ?? BASE_LIVES
  const s: BreakoutState = {
    status: o.cans.length ? 'ready' : 'empty',
    width: o.width,
    height: o.height,
    cans: layoutCans(o.width, o.cans),
    paddle: { x: o.width / 2, w: Math.round(PADDLE_BASE_W * paddleScale) },
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    speed: BALL_SPEED,
    lives,
    score: 0,
    combo: 0,
    elapsed: 0,
    hitAt: -1,
    walked: 0,
    source: { cans: o.cans, paddleScale, lives },
    rng: o.rng ?? Math.random
  }
  serve(s)
  return s
}

/** The ball back on the figure's head, still. */
function serve(s: BreakoutState) {
  s.ball = { x: s.paddle.x, y: paddleTop(s) - BALL / 2 - 1, vx: 0, vy: 0 }
  s.combo = 0
}

/** Moves the paddle to x (pointer), clamped to the field. */
export function move(s: BreakoutState, x: number): BreakoutState {
  const half = s.paddle.w / 2
  const next = Math.min(s.width - half, Math.max(half, x))
  s.walked += Math.abs(next - s.paddle.x)
  s.paddle.x = next
  if (s.status === 'ready') s.ball.x = s.paddle.x
  return s
}

/**
 * The one button. Ready: launches the ball. Over or cleared: a fresh game on the same wall.
 * Running: nothing (no double-launch).
 */
export function launch(s: BreakoutState): BreakoutState {
  if (s.status === 'over' || s.status === 'cleared') {
    Object.assign(s, createBreakout({ width: s.width, height: s.height, rng: s.rng, ...s.source }))
  }
  if (s.status !== 'ready') return s
  s.status = 'running'
  const angle = (s.rng() * 2 - 1) * 0.5
  s.ball.vx = s.speed * Math.sin(angle)
  s.ball.vy = -s.speed * Math.cos(angle)
  return s
}

function bounceOffPaddle(s: BreakoutState) {
  // Where on the head it landed sets the angle: the edge sends it out flat, the middle up.
  const offset = Math.max(-1, Math.min(1, (s.ball.x - s.paddle.x) / (s.paddle.w / 2)))
  const angle = Math.sign(offset || 1) * Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, Math.abs(offset) * MAX_ANGLE))
  s.ball.vx = s.speed * Math.sin(angle)
  s.ball.vy = -s.speed * Math.cos(angle)
  s.ball.y = paddleTop(s) - BALL / 2
  s.combo = 0
}

function hitCan(s: BreakoutState, can: Can) {
  can.hp -= 1
  s.hitAt = s.elapsed
  if (can.hp <= 0) {
    s.score += 10 * can.maxHp * (1 + s.combo)
    s.combo += 1
    s.cans = s.cans.filter(c => c !== can)
  }
  else {
    s.score += 5
  }
  s.speed = Math.min(BALL_MAX_SPEED, s.speed + SPEED_PER_CAN)
  const mag = Math.hypot(s.ball.vx, s.ball.vy) || 1
  s.ball.vx = s.ball.vx / mag * s.speed
  s.ball.vy = s.ball.vy / mag * s.speed
}

/** One sub-step small enough that the ball can't pass through a can or the paddle. */
function advance(s: BreakoutState, t: number) {
  const b = s.ball
  b.x += b.vx * t
  b.y += b.vy * t
  const r = BALL / 2

  // Walls.
  if (b.x - r < 0) {
    b.x = r
    b.vx = Math.abs(b.vx)
  }
  else if (b.x + r > s.width) {
    b.x = s.width - r
    b.vx = -Math.abs(b.vx)
  }
  if (b.y - r < 0) {
    b.y = r
    b.vy = Math.abs(b.vy)
  }

  // The figure's head.
  const top = paddleTop(s)
  if (b.vy > 0 && b.y + r >= top && b.y - r <= top + CELL * 3
    && b.x + r >= s.paddle.x - s.paddle.w / 2 && b.x - r <= s.paddle.x + s.paddle.w / 2) {
    bounceOffPaddle(s)
    return
  }

  // The floor: a life.
  if (b.y - r > s.height) {
    s.lives -= 1
    if (s.lives <= 0) {
      s.status = 'over'
    }
    else {
      s.status = 'ready'
      serve(s)
    }
    return
  }

  // A can: the shallower overlap says which face it came through.
  for (const c of s.cans) {
    const ox = Math.min(b.x + r, c.x + c.w) - Math.max(b.x - r, c.x)
    const oy = Math.min(b.y + r, c.y + c.h) - Math.max(b.y - r, c.y)
    if (ox <= 0 || oy <= 0) continue
    if (ox < oy) {
      b.vx = b.x < c.x + c.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx)
      b.x += b.x < c.x + c.w / 2 ? -ox : ox
    }
    else {
      b.vy = b.y < c.y + c.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy)
      b.y += b.y < c.y + c.h / 2 ? -oy : oy
    }
    hitCan(s, c)
    if (!s.cans.length) s.status = 'cleared'
    return
  }
}

/**
 * Advance the world by dt seconds (clamped); `dir` is the keyboard's -1 / 0 / 1 for the paddle.
 * (stepBreakout, not step: the runner's step is auto-imported under that name.)
 */
export function stepBreakout(s: BreakoutState, dt: number, dir = 0): BreakoutState {
  if (s.status === 'over' || s.status === 'cleared' || s.status === 'empty') return s
  const t = Math.min(MAX_DT, Math.max(0, dt))
  s.elapsed += t
  if (dir) move(s, s.paddle.x + dir * PADDLE_SPEED * t)
  if (s.status !== 'running') return s
  // Sub-steps of at most a ball's width, so nothing is tunnelled through at top speed.
  const n = Math.max(1, Math.ceil((s.speed * t) / (BALL - 1)))
  for (let i = 0; i < n && s.status === 'running'; i++) advance(s, t / n)
  return s
}

/** Which of the companion's poses the renderer should draw. */
export function breakoutPose(s: BreakoutState): 'idle' | 'walk1' | 'walk2' | 'happy' | 'petted' | 'flatline' {
  if (s.status === 'over') return 'flatline'
  if (s.status === 'cleared') return 'petted'
  if (s.hitAt >= 0 && s.elapsed - s.hitAt < HIT_FLASH) return 'happy'
  if (s.status === 'running' && s.walked > 0) return Math.floor(s.walked / PADDLE_STRIDE_PX) % 2 === 0 ? 'walk1' : 'walk2'
  return 'idle'
}

/** Where a falling ball will cross the paddle line, walls included. */
export function landingX(s: BreakoutState): number | null {
  const b = s.ball
  if (b.vy <= 0) return null
  const dy = paddleTop(s) - BALL / 2 - b.y
  if (dy < 0) return b.x
  let x = b.x + b.vx * (dy / b.vy)
  const span = s.width - BALL
  // Fold the straight-line x back into the field for each wall it would have bounced off.
  x = ((x - BALL / 2) % (2 * span) + 2 * span) % (2 * span)
  if (x > span) x = 2 * span - x
  return x + BALL / 2
}

/** The can the scripted paddle aims at: the lowest, or — after a dry spell — each in turn, so a corner can is tried from other angles. */
function aimTarget(s: BreakoutState): Can | null {
  if (!s.cans.length) return null
  if (s.hitAt >= 0 && s.elapsed - s.hitAt > 6) return s.cans[Math.floor(s.elapsed / 3) % s.cans.length]!
  return s.cans.reduce((a, c) => (c.y > a.y ? c : a))
}

/**
 * A scripted paddle for the tests: launches, then meets the ball where it will land, placed so
 * the bounce heads for a can — straight at it, or off a side wall when straight would be too
 * flat — the Breakout habit of aiming at the wall rather than merely returning the ball. Returns
 * true when it did something.
 */
export function autoPlay(s: BreakoutState): boolean {
  if (s.status === 'ready') {
    launch(s)
    return true
  }
  if (s.status !== 'running') return false
  const landing = landingX(s)
  if (landing == null) return false
  const target = aimTarget(s)
  if (!target) {
    move(s, landing)
    return true
  }
  const y0 = paddleTop(s) - BALL / 2
  const cx = target.x + target.w / 2
  const cy = target.y + target.h / 2
  // Candidate directions: direct, and mirrored through either side wall. Each is clamped into the
  // playable range; the one that needs the least clamping wins.
  let angle = MIN_ANGLE
  let error = Infinity
  for (const tx of [cx, -cx, 2 * s.width - cx]) {
    const a = Math.atan2(tx - landing, y0 - cy)
    const clamped = Math.sign(a || 1) * Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, Math.abs(a)))
    const err = Math.abs(clamped - a)
    if (err < error) {
      error = err
      angle = clamped
    }
  }
  // bounceOffPaddle: angle = sign(offset) · clamp(|offset| · MAX_ANGLE), so offset = angle / MAX_ANGLE.
  move(s, landing - (angle / MAX_ANGLE) * (s.paddle.w / 2))
  return true
}
