<template>
  <div class="absolute inset-0">
    <canvas
      ref="canvas"
      class="block w-full h-full outline-none touch-none select-none"
      tabindex="0"
      role="img"
      :aria-label="`TICKER's runner. ${announce}`"
      @pointerdown.prevent="press"
    />
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ announce }}
    </p>
  </div>
</template>

<script setup lang="ts">
// The runner on a canvas, over the /ticker stage (the stage's own background shows through, so
// the night palette is already there). The world comes from shared/utils/tickerRunner.ts; this
// file only draws it, feeds it presses, and keeps time. TICKER is drawn from the same sprite
// cells as the companion, pre-rendered once per pose at the md cell size, wearing whatever the
// page passes in; the obstacles are drawn in the same cell style with the same inks.
//
// The polish — a shake and debris on the crash, a blink every hundred, a landing squash, slow
// clouds, a pulsing prompt — is cosmetic and skipped under reduced motion; the short lockout
// after a crash is not (a mashed key must not restart the run by accident).
import { CELL, FIGURE_H, PLAYER_X, createRunner, jump, runnerPose, step } from '#shared/utils/tickerRunner'
import type { Obstacle, ObstacleKind, RunnerState } from '#shared/utils/tickerRunner'
import { tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerBuild, TickerInk, TickerPose, TickerProp } from '#shared/utils/tickerSprite'

const props = defineProps<{
  build: TickerBuild
  accessories: TickerProp[]
  night: boolean
  /** The high score to show beside the live one; the page owns it and updates it on `over`. */
  hi: number
}>()

const emit = defineEmits<{
  /** The run ended with this score. */
  over: [score: number]
  /** The player left (Escape or the page's QUIT); the score is the last run's. */
  quit: [score: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const announce = ref('press space or tap to run; escape quits')

/** The ground line sits this far above the canvas bottom — clear of the page's remark line. */
const GROUND_FROM_BOTTOM = 56
/** Presses this soon after a crash are the tail of the run, not a restart. */
const RESTART_LOCKOUT = 0.6
const SHAKE_SECONDS = 0.35
const BLINK_SECONDS = 0.55
const SQUASH_SECONDS = 0.09
const PAD = (n: number) => String(Math.min(99999, n)).padStart(5, '0')

type Cells = Array<[number, number, TickerInk]>

// Obstacle art in sprite cells: a can is 4×7 with a red band, a flag is a pole with a pennant.
const CAN: Cells = [
  [0, 1, 'bowl'], [0, 2, 'bowl'],
  [1, 0, 'bowl'], [1, 1, 'glove'], [1, 2, 'bowl'], [1, 3, 'bowl'],
  [2, 0, 'bowl'], [2, 1, 'flag'], [2, 2, 'flag'], [2, 3, 'bowl'],
  [3, 0, 'bowl'], [3, 1, 'flag'], [3, 2, 'flag'], [3, 3, 'bowl'],
  [4, 0, 'bowl'], [4, 1, 'glove'], [4, 2, 'bowl'], [4, 3, 'bowl'],
  [5, 0, 'bowl'], [5, 1, 'bowl'], [5, 2, 'bowl'], [5, 3, 'bowl'],
  [6, 1, 'bowl'], [6, 2, 'bowl']
]
const FLAG: Cells = [
  [0, 0, 'line'], [1, 0, 'line'], [2, 0, 'line'], [3, 0, 'line'], [4, 0, 'line'],
  [0, 1, 'flag'], [0, 2, 'flag'], [0, 3, 'flag'], [0, 4, 'flag'],
  [1, 1, 'flag'], [1, 2, 'flag'], [1, 3, 'flag'],
  [2, 1, 'flag'], [2, 2, 'flag']
]
const cans = (n: number): Cells => Array.from({ length: n }, (_, i) => CAN.map(([r, c, ink]) => [r, c + i * 5, ink] as [number, number, TickerInk])).flat()
const OBSTACLE_ART: Record<ObstacleKind, { cells: Cells, cols: number, rows: number }> = {
  'can': { cells: cans(1), cols: 4, rows: 7 },
  'cans2': { cells: cans(2), cols: 9, rows: 7 },
  'cans3': { cells: cans(3), cols: 14, rows: 7 },
  'flag-low': { cells: FLAG, cols: 5, rows: 5 },
  'flag-high': { cells: FLAG, cols: 5, rows: 5 }
}

/** Far-off dashes that drift at a quarter of the ground's pace: Chrome's clouds, TUI-style. */
const CLOUDS: Array<{ x: number, above: number, w: number }> = [
  { x: 120, above: 150, w: 28 },
  { x: 460, above: 118, w: 40 },
  { x: 760, above: 136, w: 22 },
  { x: 1040, above: 160, w: 34 }
]

interface Debris { x: number, y: number, vx: number, vy: number, ink: TickerInk }

// --- state that is not reactive on purpose (touched every frame) ------------------------------

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let state: RunnerState = createRunner(600)
let raf = 0
let last = 0
let now = 0
let paused = false
let reducedMotion = false
let reportedOver = false
let overAt = -1
let landedAt = -1
let airborne = false
let blinkUntil = -1
let lastHundred = 0
let bestAt = -1
let bestShown = false
let debris: Debris[] = []
let inks: Record<TickerInk, string>
let font = 'monospace'
let colors = { ground: '#333', text: '#888', faint: '#666', star: '#444', accent: '#4c6' }
const sprites = new Map<TickerPose, { image: HTMLCanvasElement, rows: number }>()
const art = new Map<ObstacleKind, HTMLCanvasElement>()
let ro: ResizeObserver | undefined

/** A cell list to a 1× canvas; the main context scales it with smoothing off, so pixels stay pixels. */
function render(cells: Cells, cols: number, rows: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = cols * CELL
  c.height = rows * CELL
  const g = c.getContext('2d')!
  for (const [r, col, ink] of cells) {
    g.fillStyle = inks[ink]
    g.fillRect(col * CELL, r * CELL, CELL - 1, CELL - 1)
  }
  return c
}

function prepare() {
  inks = resolveInks()
  colors = {
    ground: themeColor('--color-line-accent'),
    text: themeColor('--color-dim'),
    faint: themeColor('--color-faint'),
    star: themeColor('--color-ghost'),
    accent: themeColor('--color-accent')
  }
  font = canvas.value ? getComputedStyle(canvas.value).fontFamily : font
  sprites.clear()
  for (const pose of ['idle', 'walk1', 'walk2', 'happy', 'flatline'] as const) {
    // The shades fly off in the crash — the X eyes are the point.
    const worn = pose === 'flatline' ? props.accessories.filter(a => a !== 'shades') : props.accessories
    const s = tickerSprite(pose, 'full', worn, props.build)
    const cells: Cells = []
    s.cells.forEach((cell, i) => {
      if (cell.ink) cells.push([Math.floor(i / s.cols), i % s.cols, cell.ink])
    })
    sprites.set(pose, { image: render(cells, s.cols, s.rows), rows: s.rows })
  }
  art.clear()
  for (const [kind, a] of Object.entries(OBSTACLE_ART) as Array<[ObstacleKind, typeof OBSTACLE_ART[ObstacleKind]]>) {
    art.set(kind, render(a.cells, a.cols, a.rows))
  }
}

function resize() {
  const el = canvas.value
  const host = el?.parentElement
  if (!el || !host) return
  const dpr = window.devicePixelRatio || 1
  W = host.clientWidth
  H = host.clientHeight
  el.width = Math.round(W * dpr)
  el.height = Math.round(H * dpr)
  ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  state.width = W
}

// --- the crash ----------------------------------------------------------------------------------

/** Debris flies from the figure's front: a few cells of can, flag and heart, falling to the ground. */
function crash() {
  overAt = now
  if (reducedMotion) return
  const ground = H - GROUND_FROM_BOTTOM
  const x = PLAYER_X + 70
  const y = ground - 30
  const inksOut: TickerInk[] = ['bowl', 'flag', 'red', 'bowl', 'glove', 'red', 'bowl']
  debris = inksOut.map((ink, i) => ({
    x,
    y,
    vx: 60 + i * 35 + Math.random() * 40,
    vy: -(140 + Math.random() * 160),
    ink
  }))
}

function stepDebris(dt: number) {
  if (!debris.length) return
  const ground = H - GROUND_FROM_BOTTOM
  for (const d of debris) {
    d.vy += 900 * dt
    d.x += d.vx * dt
    d.y += d.vy * dt
  }
  debris = debris.filter(d => d.y < ground + 20 && now - overAt < 1.2)
}

// --- drawing ----------------------------------------------------------------------------------

function draw() {
  if (!ctx) return
  const g = ctx
  g.setTransform(g.getTransform().a, 0, 0, g.getTransform().d, 0, 0)
  g.clearRect(0, 0, W, H)

  // The crash: a shake that dies out over a third of a second.
  const shaking = overAt >= 0 && now - overAt < SHAKE_SECONDS && !reducedMotion
  if (shaking) {
    const k = 6 * (1 - (now - overAt) / SHAKE_SECONDS)
    g.translate(Math.round((Math.random() - 0.5) * 2 * k), Math.round((Math.random() - 0.5) * 2 * k))
  }

  const ground = H - GROUND_FROM_BOTTOM

  if (props.night) {
    for (const [i, [x, y]] of ([[0.12, 22], [0.31, 48], [0.57, 30], [0.78, 56], [0.91, 24]] as const).entries()) {
      g.globalAlpha = reducedMotion ? 0.8 : 0.45 + 0.4 * Math.sin(now * 1.3 + i * 1.7)
      g.fillStyle = colors.star
      g.fillRect(Math.round(W * x), y, 2, 2)
    }
    g.globalAlpha = 1
  }

  // Clouds, far off and slow; the ground, a dashed line that scrolls with the world; pebbles.
  g.strokeStyle = colors.ground
  g.lineWidth = 1
  g.setLineDash([4, 3])
  const span = W + 200
  for (const c of CLOUDS) {
    const x = (((c.x - state.distance * 0.25) % span) + span) % span - 100
    g.beginPath()
    g.moveTo(Math.round(x), ground - c.above + 0.5)
    g.lineTo(Math.round(x + c.w), ground - c.above + 0.5)
    g.stroke()
  }
  g.setLineDash([6, 6])
  g.lineDashOffset = -(state.distance % 12)
  g.beginPath()
  g.moveTo(0, ground + 0.5)
  g.lineTo(W, ground + 0.5)
  g.stroke()
  g.setLineDash([])
  g.fillStyle = colors.ground
  const pebbleSpan = W + 120
  for (let k = 0; k < 9; k++) {
    const x = (((k * 137 + 40) - state.distance * 0.9) % pebbleSpan + pebbleSpan) % pebbleSpan - 60
    g.fillRect(Math.round(x), ground + 8 + (k % 3) * 4, 2, 2)
  }

  for (const o of state.obstacles) drawObstacle(o, ground)

  // The figure, with a squash for a frame or two after landing.
  const pose = runnerPose(state)
  const sprite = sprites.get(pose)
  if (sprite) {
    const w = sprite.image.width
    const h = sprite.image.height
    const squash = !reducedMotion && landedAt >= 0 && now - landedAt < SQUASH_SECONDS
    if (squash) {
      const dw = Math.round(w * 1.08)
      const dh = Math.round(h * 0.92)
      g.drawImage(sprite.image, PLAYER_X - (dw - w) / 2, Math.round(ground - dh - state.y), dw, dh)
    }
    else {
      g.drawImage(sprite.image, PLAYER_X, Math.round(ground - sprite.rows * CELL - state.y))
    }
  }

  for (const d of debris) {
    g.fillStyle = inks[d.ink]
    g.fillRect(Math.round(d.x), Math.round(d.y), CELL - 1, CELL - 1)
  }

  // HUD, top right: the score blinks for half a second at every hundred, and NEW BEST shows the
  // moment the live score passes the record. The prompts sit above the figure's head.
  g.font = `11px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'right'
  g.fillStyle = colors.faint
  const blinkOff = blinkUntil >= 0 && now < blinkUntil && Math.floor((blinkUntil - now) / 0.09) % 2 === 1
  g.fillText(`HI ${PAD(props.hi)}  ${blinkOff ? '     ' : PAD(state.score)}`, W - 12, 10)
  if (bestAt >= 0 && now - bestAt < 1.6 && state.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('NEW BEST', W - 12, 26)
  }
  g.textAlign = 'center'
  const promptY = ground - FIGURE_H - 48
  if (state.status === 'ready') {
    g.globalAlpha = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(now * 3)
    g.fillStyle = colors.text
    g.fillText('space · tap to run', W / 2, promptY)
    g.globalAlpha = 1
    g.fillStyle = colors.faint
    g.fillText('esc quits', W / 2, promptY + 16)
  }
  else if (state.status === 'over') {
    g.fillStyle = colors.text
    g.fillText(state.score > 0 && state.score >= props.hi ? `GAME OVER · ${state.score} · NEW BEST` : `GAME OVER · ${state.score}`, W / 2, promptY)
    if (now - overAt >= RESTART_LOCKOUT) {
      g.fillStyle = colors.faint
      g.fillText('space · tap to run again   esc quits', W / 2, promptY + 16)
    }
  }
}

function drawObstacle(o: Obstacle, ground: number) {
  const image = art.get(o.kind)
  if (!image || !ctx) return
  ctx.drawImage(image, Math.round(o.x), Math.round(ground - o.bottom - o.h))
}

// --- time and input ---------------------------------------------------------------------------

function frame(ts: number) {
  const dt = (ts - last) / 1000
  last = ts
  now = ts / 1000
  if (!paused) {
    const wasRunning = state.status === 'running'
    step(state, dt)
    stepDebris(dt)
    // Landing, for the squash; a new hundred, for the blink; the record, for NEW BEST.
    if (state.y > 0) {
      airborne = true
    }
    else if (airborne) {
      airborne = false
      landedAt = now
    }
    const hundred = Math.floor(state.score / 100)
    if (hundred > lastHundred) {
      lastHundred = hundred
      if (!reducedMotion) blinkUntil = now + BLINK_SECONDS
    }
    if (!bestShown && props.hi > 0 && state.score > props.hi && state.status === 'running') {
      bestShown = true
      bestAt = now
    }
    if (wasRunning && state.status === 'over') crash()
  }
  if (state.status === 'over' && !reportedOver) {
    reportedOver = true
    announce.value = `game over at ${state.score}. space or tap to run again; escape quits`
    emit('over', state.score)
  }
  draw()
  raf = requestAnimationFrame(frame)
}

function press() {
  canvas.value?.focus({ preventScroll: true })
  const wasOver = state.status === 'over'
  if (wasOver && now - overAt < RESTART_LOCKOUT) return
  jump(state)
  if (wasOver) {
    reportedOver = false
    overAt = -1
    landedAt = -1
    airborne = false
    blinkUntil = -1
    lastHundred = 0
    bestAt = -1
    bestShown = false
    debris = []
  }
  if (state.status === 'running' && (wasOver || announce.value.startsWith('press'))) announce.value = 'running'
}

function quit() {
  emit('quit', state.score)
}

function onKey(e: KeyboardEvent) {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault()
    if (!e.repeat) press()
  }
  else if (e.code === 'Escape') {
    e.preventDefault()
    quit()
  }
}

function onVisibility() {
  paused = document.hidden
  if (!paused) last = performance.now()
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  prepare()
  state = createRunner(600)
  resize()
  ro = new ResizeObserver(resize)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.value?.focus({ preventScroll: true })
  last = performance.now()
  raf = requestAnimationFrame(frame)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisibility)
})

// A build or wardrobe change mid-game is rare (the page's data refreshing); redraw the figure.
watch(() => [props.build, props.accessories], prepare, { deep: true })

defineExpose({ quit })
</script>
