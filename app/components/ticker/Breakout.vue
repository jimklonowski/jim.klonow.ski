<template>
  <div class="absolute inset-0">
    <canvas
      ref="canvas"
      class="block w-full h-full outline-none touch-none select-none"
      tabindex="0"
      role="img"
      :aria-label="`TICKER's can crusher. ${announce}`"
      @pointerdown.prevent="onPointerDown"
      @pointermove="onPointerMove"
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
// The can crusher on a canvas, over the /ticker stage. The world comes from
// shared/utils/tickerBreakout.ts; this file only draws it, feeds it input and keeps time, the
// way Runner.vue does for the runner. TICKER is the paddle, drawn from the companion's sprite
// cells and walking along the floor under the pointer or the arrow keys; the cans are the
// runner's can art, dented and crumpled as their hits run down.
//
// The polish — a shake on a lost life, a trail on the ball, a flash on a hit, NEW BEST — is
// cosmetic and skipped under reduced motion; the short lockout after the end is not (a mashed
// key must not start another game by accident).
import { CELL, FIGURE_H, FIGURE_W, makeRng } from '#shared/utils/tickerRunner'
import { BALL, CAN_COLS, CAN_ROWS, autoPlay, breakoutPose, createBreakout, launch, move, stepBreakout, wallBottom } from '#shared/utils/tickerBreakout'
import type { BreakoutState, CanInput } from '#shared/utils/tickerBreakout'
import { tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerBuild, TickerInk, TickerPose, TickerProp } from '#shared/utils/tickerSprite'
import { CAN, CAN_CRUMPLED, CAN_DENTED, renderCells } from '~/utils/tickerArt'
import type { Cells } from '~/utils/tickerArt'

const props = withDefaults(defineProps<{
  build: TickerBuild
  accessories: TickerProp[]
  night: boolean
  /** The high score to show beside the live one; the page owns it and updates it on `over`. */
  hi: number
  /** The wall: one entry per soda in the window. */
  cans: CanInput[]
  /** Seeds the serve angles, so everyone plays the same board on a day. */
  seed: number
  /** Today's recovery as a paddle width: 0.7 (rough) to 1.2 (great). */
  paddleScale: number
  lives: number
  /** "SEP 12 – OCT 12 · 14 cans · 168 oz" */
  title: string
  /** The month was clean, so this is last month's wall. */
  practice?: boolean
}>(), { practice: false })

const emit = defineEmits<{
  /** The game ended with this score; `cleared` when the whole wall went. */
  over: [score: number, cleared: boolean]
  /** The player left (Escape or the page's QUIT); the score is the last game's. */
  quit: [score: number]
  /**
   * The stage height this wall needs, in px — the wall, room for the prompts and the ball, the
   * figure and the ground. The runner's stage is 17rem; a month of cans is about twice that.
   */
  fit: [height: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const announce = ref('press space or tap to launch; arrows or the pointer move; escape quits')

/** The ground line sits this far above the canvas bottom — clear of the page's remark line. */
const GROUND_FROM_BOTTOM = 56
/** Between the wall's lowest can and the figure's head: the prompt lines, then room for the ball to fly. */
const PROMPT_SPACE = 76
const FLIGHT_SPACE = 40
const MIN_STAGE = 420
/** Presses this soon after the end are the tail of the game, not a restart. */
const RESTART_LOCKOUT = 0.6
const SHAKE_SECONDS = 0.3
const TRAIL = 6
const PAD = (n: number) => String(Math.min(99999, n)).padStart(5, '0')

// --- state that is not reactive on purpose (touched every frame) ------------------------------

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let state: BreakoutState | null = null
let raf = 0
let last = 0
let now = 0
let paused = false
let reducedMotion = false
let reportedEnd = false
let endedAt = -1
let lostAt = -1
let livesSeen = 0
let bestAt = -1
let bestShown = false
let trail: Array<{ x: number, y: number }> = []
let fitted = 0
let inks: Record<TickerInk, string>
let font = 'monospace'
let colors = { ground: '#333', text: '#888', faint: '#666', star: '#444', accent: '#4c6', life: '#c33' }
const sprites = new Map<TickerPose, { image: HTMLCanvasElement, rows: number }>()
const art = new Map<'full' | 'dented' | 'crumpled', HTMLCanvasElement>()
const pressed = new Set<string>()
let ro: ResizeObserver | undefined
let stopTheme: (() => void) | undefined

const render = (cells: Cells, cols: number, rows: number) => renderCells(cells, cols, rows, inks)

function prepare() {
  inks = resolveInks()
  colors = {
    ground: themeColor('--color-line-accent'),
    text: themeColor('--color-dim'),
    faint: themeColor('--color-faint'),
    star: themeColor('--color-ghost'),
    accent: themeColor('--color-accent'),
    life: themeColor('--color-danger')
  }
  font = canvas.value ? getComputedStyle(canvas.value).fontFamily : font
  sprites.clear()
  for (const pose of ['idle', 'walk1', 'walk2', 'happy', 'petted', 'flatline'] as const) {
    // The shades fly off at the end — the X eyes are the point.
    const worn = pose === 'flatline' ? props.accessories.filter(a => a !== 'shades') : props.accessories
    const s = tickerSprite(pose, 'full', worn, props.build)
    const cells: Cells = []
    s.cells.forEach((cell, i) => {
      if (cell.ink) cells.push([Math.floor(i / s.cols), i % s.cols, cell.ink])
    })
    sprites.set(pose, { image: render(cells, s.cols, s.rows), rows: s.rows })
  }
  art.clear()
  art.set('full', render(CAN, CAN_COLS, CAN_ROWS))
  art.set('dented', render(CAN_DENTED, CAN_COLS, CAN_ROWS))
  art.set('crumpled', render(CAN_CRUMPLED, CAN_COLS, CAN_ROWS))
}

function fresh(): BreakoutState {
  return createBreakout({
    width: W,
    height: H - GROUND_FROM_BOTTOM,
    cans: props.cans,
    rng: makeRng(props.seed),
    paddleScale: props.paddleScale,
    lives: props.lives
  })
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
  // A game that hasn't started re-lays its wall for the new width; one in progress keeps it.
  if (!state || (state.score === 0 && (state.status === 'ready' || state.status === 'empty'))) {
    state = fresh()
    livesSeen = state.lives
    // Tell the page how tall the stage has to be for this wall; it answers with a resize.
    const needed = Math.max(MIN_STAGE, wallBottom(state.cans) + PROMPT_SPACE + FLIGHT_SPACE + FIGURE_H + GROUND_FROM_BOTTOM)
    if (needed !== fitted) {
      fitted = needed
      emit('fit', needed)
    }
  }
  else {
    state.width = W
    state.height = H - GROUND_FROM_BOTTOM
  }
}

// --- drawing ----------------------------------------------------------------------------------

function canArt(hp: number, maxHp: number): HTMLCanvasElement | undefined {
  if (hp >= maxHp) return art.get('full')
  if (hp === 1 && maxHp >= 3) return art.get('crumpled')
  return art.get('dented')
}

function draw() {
  if (!ctx || !state) return
  const g = ctx
  const s = state
  g.setTransform(g.getTransform().a, 0, 0, g.getTransform().d, 0, 0)
  g.clearRect(0, 0, W, H)

  // A lost life: a shake that dies out in a third of a second.
  const shaking = lostAt >= 0 && now - lostAt < SHAKE_SECONDS && !reducedMotion
  if (shaking) {
    const k = 5 * (1 - (now - lostAt) / SHAKE_SECONDS)
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

  // The ground, a dashed line; it doesn't scroll — nothing here goes anywhere.
  g.strokeStyle = colors.ground
  g.lineWidth = 1
  g.setLineDash([6, 6])
  g.beginPath()
  g.moveTo(0, ground + 0.5)
  g.lineTo(W, ground + 0.5)
  g.stroke()
  g.setLineDash([])

  // The wall.
  for (const c of s.cans) {
    const image = canArt(c.hp, c.maxHp)
    if (image) g.drawImage(image, c.x, c.y)
  }

  // The ball and its trail.
  if (s.status === 'running' || s.status === 'ready') {
    if (!reducedMotion) {
      trail.forEach((p, i) => {
        g.globalAlpha = 0.12 + (0.4 * (i + 1)) / trail.length
        g.fillStyle = colors.accent
        g.fillRect(Math.round(p.x - BALL / 2), Math.round(p.y - BALL / 2), BALL, BALL)
      })
      g.globalAlpha = 1
    }
    g.fillStyle = colors.accent
    g.fillRect(Math.round(s.ball.x - BALL / 2), Math.round(s.ball.y - BALL / 2), BALL, BALL)
  }

  // The figure, centred on the paddle.
  const sprite = sprites.get(breakoutPose(s))
  if (sprite) {
    g.drawImage(sprite.image, Math.round(s.paddle.x - FIGURE_W / 2), Math.round(ground - sprite.rows * CELL))
  }

  // HUD, top right (the page's window and clock sit top left): the scores, the lives as hearts
  // under them, then the combo or NEW BEST the moment it passes.
  g.font = `11px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'right'
  g.fillStyle = colors.faint
  g.fillText(`HI ${PAD(props.hi)}  ${PAD(s.score)}`, W - 12, 10)
  for (let i = 0; i < s.lives; i++) {
    g.fillStyle = colors.life
    g.fillRect(W - 18 - i * 10, 27, 6, 6)
  }
  if (s.combo >= 2 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText(`×${s.combo}`, W - 12, 40)
  }
  else if (bestAt >= 0 && now - bestAt < 1.6 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('NEW BEST', W - 12, 40)
  }

  // Prompts, above the figure's head.
  g.textAlign = 'center'
  const promptY = ground - sprite!.rows * CELL - 46
  const pulse = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(now * 3)
  if (s.status === 'empty') {
    g.fillStyle = colors.text
    g.fillText('nothing to shoot. good.', W / 2, promptY)
    g.fillStyle = colors.faint
    g.fillText('esc quits', W / 2, promptY + 16)
  }
  else if (s.status === 'ready' && s.score === 0 && s.lives === props.lives) {
    g.fillStyle = colors.faint
    g.fillText(props.title, W / 2, promptY - 18)
    if (props.practice) g.fillText('last month\'s wall — this month is clean', W / 2, promptY - 4)
    g.globalAlpha = pulse
    g.fillStyle = colors.text
    g.fillText('space · tap to launch', W / 2, promptY + 12)
    g.globalAlpha = 1
    g.fillStyle = colors.faint
    g.fillText('arrows or the pointer move · esc quits', W / 2, promptY + 28)
  }
  else if (s.status === 'ready') {
    g.globalAlpha = pulse
    g.fillStyle = colors.text
    g.fillText(`${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left · space · tap to serve`, W / 2, promptY)
    g.globalAlpha = 1
  }
  else if (s.status === 'over' || s.status === 'cleared') {
    g.fillStyle = s.status === 'cleared' ? colors.accent : colors.text
    const best = s.score > 0 && s.score >= props.hi ? ' · NEW BEST' : ''
    g.fillText(s.status === 'cleared' ? `WALL CLEARED · ${s.score}${best}` : `GAME OVER · ${s.score}${best}`, W / 2, promptY)
    if (now - endedAt >= RESTART_LOCKOUT) {
      g.fillStyle = colors.faint
      g.fillText('space · tap for another go   esc quits', W / 2, promptY + 16)
    }
  }
}

// --- time and input ---------------------------------------------------------------------------

function dir(): -1 | 0 | 1 {
  const left = pressed.has('ArrowLeft') || pressed.has('KeyA')
  const right = pressed.has('ArrowRight') || pressed.has('KeyD')
  return left === right ? 0 : left ? -1 : 1
}

function frame(ts: number) {
  const dt = (ts - last) / 1000
  last = ts
  now = ts / 1000
  const s = state
  if (s && !paused) {
    const wasLive = s.status === 'running' || s.status === 'ready'
    stepBreakout(s, dt, dir())
    if (s.status === 'running' && !reducedMotion) {
      trail.push({ x: s.ball.x, y: s.ball.y })
      if (trail.length > TRAIL) trail.shift()
    }
    else if (s.status !== 'running') {
      trail = []
    }
    if (s.lives < livesSeen) {
      livesSeen = s.lives
      lostAt = now
      if (s.status === 'ready') announce.value = `missed. ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left; space or tap to serve`
    }
    if (!bestShown && props.hi > 0 && s.score > props.hi && s.status === 'running') {
      bestShown = true
      bestAt = now
    }
    if (wasLive && (s.status === 'over' || s.status === 'cleared')) endedAt = now
  }
  if (s && (s.status === 'over' || s.status === 'cleared') && !reportedEnd) {
    reportedEnd = true
    announce.value = s.status === 'cleared'
      ? `wall cleared at ${s.score}. space or tap for another go; escape quits`
      : `game over at ${s.score}. space or tap for another go; escape quits`
    emit('over', s.score, s.status === 'cleared')
  }
  draw()
  raf = requestAnimationFrame(frame)
}

function press() {
  canvas.value?.focus({ preventScroll: true })
  const s = state
  if (!s) return
  const ended = s.status === 'over' || s.status === 'cleared'
  if (ended && now - endedAt < RESTART_LOCKOUT) return
  launch(s)
  if (ended) {
    reportedEnd = false
    endedAt = -1
    lostAt = -1
    livesSeen = s.lives
    bestAt = -1
    bestShown = false
    trail = []
  }
  if (s.status === 'running') announce.value = `running, ${s.cans.length} cans left`
}

function onPointerDown(e: PointerEvent) {
  const s = state
  const rect = canvas.value?.getBoundingClientRect()
  if (s && rect) move(s, e.clientX - rect.left)
  press()
}

function onPointerMove(e: PointerEvent) {
  const s = state
  const rect = canvas.value?.getBoundingClientRect()
  if (s && rect) move(s, e.clientX - rect.left)
}

function quit() {
  emit('quit', state?.score ?? 0)
}

function onKey(e: KeyboardEvent) {
  // Not when something else owns the keyboard: the ⌘K palette's input, any field, any dialog.
  const target = e.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
    e.preventDefault()
    pressed.add(e.code)
  }
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault()
    if (!e.repeat) press()
  }
  else if (e.code === 'Escape') {
    e.preventDefault()
    quit()
  }
}

function onKeyUp(e: KeyboardEvent) {
  pressed.delete(e.code)
}

function onVisibility() {
  paused = document.hidden
  if (!paused) last = performance.now()
  if (paused) pressed.clear()
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  prepare()
  // A preset picked mid-game re-reads the palette and rebakes the sprites.
  stopTheme = onThemeChange(prepare)
  resize()
  ro = new ResizeObserver(resize)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.value?.focus({ preventScroll: true })
  if (state?.status === 'empty') announce.value = 'nothing to shoot: no sodas in the window. escape quits'
  if (import.meta.dev) {
    // Lets a headless check drive a whole game with the engine's scripted paddle and read the result.
    (window as unknown as Record<string, unknown>).__crusherDebug = {
      auto: () => (state ? autoPlay(state) : false),
      status: () => state?.status ?? null,
      score: () => state?.score ?? 0,
      cans: () => state?.cans.length ?? 0
    }
  }
  last = performance.now()
  raf = requestAnimationFrame(frame)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  stopTheme?.()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('visibilitychange', onVisibility)
  if (import.meta.dev) delete (window as unknown as Record<string, unknown>).__crusherDebug
})

// A build or wardrobe change mid-game is rare (the page's data refreshing); redraw the figure.
watch(() => [props.build, props.accessories], prepare, { deep: true })

defineExpose({ quit })
</script>
