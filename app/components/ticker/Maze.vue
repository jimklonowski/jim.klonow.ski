<template>
  <div class="absolute inset-0">
    <canvas
      ref="canvas"
      class="block w-full h-full outline-none touch-none select-none"
      tabindex="0"
      role="img"
      :aria-label="`TICKER's capsule maze. ${announce}`"
      @pointerdown.prevent="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
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
// The capsule maze on a canvas, over the /ticker stage. The world comes from
// shared/utils/tickerMaze.ts; this file only draws it, feeds it input and keeps time, the way
// Breakout.vue does for the crusher. TICKER is its face sprite, chomping through the corridors;
// the ghosts are the crusher's can art in the four temperaments' inks, each wearing the first
// letter of its soda, or a germ blob where the month logged no soda for the slot. Walls are
// filled tiles with a bright top edge, like the world's.
//
// Steering: the arrow keys or WASD, or a swipe (a finger that moves a little sets the wish and
// re-anchors, so a thumb can steer without lifting); a tap or space starts. The polish — a
// shake on a lost life, the scare's flash, NEW BEST — is cosmetic and skipped under reduced
// motion; the short lockout after the end is not.
import { makeRng } from '#shared/utils/tickerRunner'
import {
  MAZE_COLS, MAZE_ROWS, autoMaze, createMaze, mazeFrightFlashing, mazePose, startMaze, steerMaze, stepMaze
} from '#shared/utils/tickerMaze'
import type { MazeDir, MazeGhost, MazeGhostInput, MazeState, MazeTemper } from '#shared/utils/tickerMaze'
import { tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerBuild, TickerInk, TickerProp } from '#shared/utils/tickerSprite'
import { CAN, renderCells } from '~/utils/tickerArt'
import type { Cells } from '~/utils/tickerArt'

const props = defineProps<{
  build: TickerBuild
  accessories: TickerProp[]
  night: boolean
  /** The high score to show beside the live one; the page owns it and updates it on `over`. */
  hi: number
  /** The four ghosts: the month's sodas as cans, germs in the empty slots. */
  ghosts: MazeGhostInput[]
  /** "vs coke, dr pepper + 2 germs" */
  title: string
  /** Seeds the ghosts' scared wandering, so everyone plays the same board on a day. */
  seed: number
  lives: number
}>()

const emit = defineEmits<{
  /** The game ended (or was left mid-way with points on the board) at this score; `cleared` when a level was eaten clean. */
  over: [score: number, cleared: boolean]
  /** The player left (Escape or the page's QUIT); the score is the last game's. */
  quit: [score: number]
  /** The stage height the maze needs at this width, in px. */
  fit: [height: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const announce = ref('space or tap to start; arrows, wasd or a swipe steer; escape quits')

const HUD_H = 36
/** Under the maze: clear of the page's remark line. */
const BOTTOM = 48
const MIN_TILE = 12
const MAX_TILE = 24
const RESTART_LOCKOUT = 0.6
const SHAKE_SECONDS = 0.3
/** A finger that travels this far sets the wish. */
const SWIPE_PX = 14
const POP_SECONDS = 0.9
const PAD = (n: number) => String(Math.min(99999, n)).padStart(5, '0')
/** Each temperament's can body (the band stays the soda red). */
const TEMPER_INK: Record<MazeTemper, TickerInk> = { chaser: 'shade', ambusher: 'blush', flank: 'drop', shy: 'clip' }
/** A germ: a 5×5 blob with two eyes. */
const GERM: Cells = [
  [0, 1, 'bowl'], [0, 2, 'bowl'], [0, 3, 'bowl'],
  [1, 0, 'bowl'], [1, 1, 'eye'], [1, 2, 'bowl'], [1, 3, 'eye'], [1, 4, 'bowl'],
  [2, 0, 'bowl'], [2, 1, 'bowl'], [2, 2, 'bowl'], [2, 3, 'bowl'], [2, 4, 'bowl'],
  [3, 0, 'bowl'], [3, 1, 'bowl'], [3, 2, 'bowl'], [3, 3, 'bowl'], [3, 4, 'bowl'],
  [4, 0, 'bowl'], [4, 2, 'bowl'], [4, 4, 'bowl']
]
/** The eyes going home. */
const EYES: Cells = [[0, 0, 'glint'], [0, 2, 'glint'], [1, 0, 'eye'], [1, 2, 'eye']]
/** The bonus vial: a cap, a neck, a body of liquid with a glint. */
const VIAL: Cells = [
  [0, 1, 'glint'],
  [1, 0, 'line'], [1, 1, 'line'], [1, 2, 'line'],
  [2, 0, 'drop'], [2, 1, 'spec'], [2, 2, 'drop'],
  [3, 0, 'drop'], [3, 1, 'spec'], [3, 2, 'drop'],
  [4, 0, 'drop'], [4, 1, 'drop'], [4, 2, 'drop'],
  [5, 0, 'drop'], [5, 1, 'drop'], [5, 2, 'drop']
]

type GhostLook = 'body' | 'fright' | 'flash' | 'eyes'

// --- state that is not reactive on purpose (touched every frame) ------------------------------

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
/** The tile, in px, and where the maze starts. */
let T = 16
let ox = 0
let oy = HUD_H
let state: MazeState | null = null
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
let fitted = 0
let inks: Record<TickerInk, string>
let font = 'monospace'
let colors = { wall: '#222', edge: '#333', text: '#888', faint: '#666', accent: '#4c6', life: '#c33', backing: '#000' }
const faces = new Map<string, { image: HTMLCanvasElement, cols: number, rows: number }>()
const ghostArt = new Map<string, HTMLCanvasElement>()
let vialArt: HTMLCanvasElement | null = null
let swipe: { x: number, y: number, moved: boolean } | null = null
let ro: ResizeObserver | undefined
let stopTheme: (() => void) | undefined

function paint(cells: Cells, cols: number, rows: number, px: number, gap: number, swap: Partial<Record<TickerInk, TickerInk>> = {}): HTMLCanvasElement {
  const mapped: Cells = cells.map(([r, c, ink]) => [r, c, swap[ink] ?? ink])
  return renderCells(mapped, cols, rows, inks, px, gap)
}

/** The face at 1px cells on small tiles, 2px on big ones — the sprite outgrows the tile the way the arcade's did. */
const facePx = () => (T >= 22 ? 2 : 1)
/** The cans and germs: 4px cells on big tiles down to 2px on the smallest. */
const artPx = () => (T >= 22 ? 4 : T >= 16 ? 3 : 2)

function prepare() {
  inks = resolveInks()
  colors = {
    wall: themeColor('--color-line-soft'),
    edge: themeColor('--color-line-accent'),
    text: themeColor('--color-dim'),
    faint: themeColor('--color-faint'),
    accent: themeColor('--color-accent'),
    life: themeColor('--color-danger'),
    backing: themeColor('--color-raised')
  }
  font = canvas.value ? getComputedStyle(canvas.value).fontFamily : font
  faces.clear()
  for (const pose of ['idle', 'eating', 'happy', 'worried', 'flatline', 'petted'] as const) {
    const worn = pose === 'flatline' ? props.accessories.filter(a => a !== 'shades') : props.accessories
    const s = tickerSprite(pose, 'face', worn, props.build)
    const cells: Cells = []
    s.cells.forEach((cell, i) => {
      if (cell.ink) cells.push([Math.floor(i / s.cols), i % s.cols, cell.ink])
    })
    faces.set(pose, { image: renderCells(cells, s.cols, s.rows, inks, facePx(), 0), cols: s.cols, rows: s.rows })
  }
  ghostArt.clear()
  const px = artPx()
  const gap = px >= 3 ? 1 : 0
  for (const temper of ['chaser', 'ambusher', 'flank', 'shy'] as const) {
    const body = TEMPER_INK[temper]
    ghostArt.set(`can:${temper}:body`, paint(CAN, 4, 7, px, gap, { bowl: body }))
    ghostArt.set(`germ:${temper}:body`, paint(GERM, 5, 5, px, gap, { bowl: body }))
  }
  ghostArt.set('can:fright', paint(CAN, 4, 7, px, gap, { bowl: 'line', flag: 'bowl', glove: 'line' }))
  ghostArt.set('can:flash', paint(CAN, 4, 7, px, gap, { bowl: 'spec', flag: 'line', glove: 'spec' }))
  ghostArt.set('germ:fright', paint(GERM, 5, 5, px, gap, { bowl: 'line' }))
  ghostArt.set('germ:flash', paint(GERM, 5, 5, px, gap, { bowl: 'spec' }))
  ghostArt.set('eyes', paint(EYES, 3, 2, px, gap))
  vialArt = paint(VIAL, 3, 6, px, gap)
}

function fresh(): MazeState {
  return createMaze({ ghosts: props.ghosts, rng: makeRng(props.seed), lives: props.lives })
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
  const tile = Math.max(MIN_TILE, Math.min(MAX_TILE, Math.floor((W - 8) / MAZE_COLS)))
  if (tile !== T || !faces.size) {
    T = tile
    prepare() // the art is sized to the tile
  }
  ox = Math.round((W - MAZE_COLS * T) / 2)
  oy = HUD_H
  // Tell the page how tall the stage has to be for this maze; it answers with a resize.
  const needed = HUD_H + MAZE_ROWS * T + BOTTOM
  if (needed !== fitted) {
    fitted = needed
    emit('fit', needed)
  }
}

// --- drawing ----------------------------------------------------------------------------------

const px = (x: number) => ox + x * T
const py = (y: number) => oy + y * T

function ghostLook(s: MazeState, g: MazeGhost): GhostLook {
  if (g.mode === 'eyes' || g.mode === 'enter') return 'eyes'
  if (g.mode === 'fright') {
    if (!mazeFrightFlashing(s)) return 'fright'
    if (reducedMotion) return 'flash'
    return Math.floor(now * 4) % 2 === 0 ? 'flash' : 'fright'
  }
  return 'body'
}

function drawGhost(g: MazeGhost, look: GhostLook) {
  const g2 = ctx!
  const image = look === 'eyes'
    ? ghostArt.get('eyes')
    : look === 'body'
      ? ghostArt.get(`${g.kind}:${g.temper}:body`)
      : ghostArt.get(`${g.kind}:${look}`)
  if (!image) return
  const cx = px(g.x)
  const cy = py(g.y)
  // The house ghosts bob; everyone else sits on their centre.
  const bob = g.mode === 'home' && !reducedMotion ? Math.round(Math.sin(now * 5 + g.id) * 2) : 0
  g2.drawImage(image, Math.round(cx - image.width / 2), Math.round(cy - image.height / 2 + bob))
  if (look === 'body' && g.kind === 'can' && g.label && T >= 16) {
    g2.font = `bold ${T >= 22 ? 9 : 8}px ${font}`
    g2.textAlign = 'center'
    g2.textBaseline = 'middle'
    g2.fillStyle = inks.spec
    g2.fillText(g.label.charAt(0), Math.round(cx), Math.round(cy + 1))
  }
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

  // The maze: walls as filled tiles with a bright top edge, the door as a dashed line, the
  // capsules as dots, the power capsules pulsing in the accent.
  const dot = T >= 18 ? 3 : 2
  const power = T >= 18 ? 7 : 5
  const pulse = reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(now * 4)
  for (let r = 0; r < MAZE_ROWS; r++) {
    const row = s.grid[r]!
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = row[c]!
      const x = px(c)
      const y = py(r)
      if (cell === 'wall') {
        g.fillStyle = colors.wall
        g.fillRect(x, y, T, T)
        if (s.grid[r - 1]?.[c] !== 'wall') {
          g.fillStyle = colors.edge
          g.fillRect(x, y, T, 1)
        }
      }
      else if (cell === 'door') {
        g.strokeStyle = colors.faint
        g.lineWidth = 1
        g.setLineDash([3, 3])
        g.beginPath()
        g.moveTo(x, y + T / 2 + 0.5)
        g.lineTo(x + T, y + T / 2 + 0.5)
        g.stroke()
        g.setLineDash([])
      }
      else if (cell === 'dot') {
        g.fillStyle = colors.text
        g.fillRect(Math.round(x + T / 2 - dot / 2), Math.round(y + T / 2 - dot / 2), dot, dot)
      }
      else if (cell === 'power') {
        g.globalAlpha = pulse
        g.fillStyle = colors.accent
        g.fillRect(Math.round(x + T / 2 - power / 2), Math.round(y + T / 2 - power / 2), power, power)
        g.globalAlpha = 1
      }
    }
  }

  // The bonus vial, while it's out.
  if (s.bonus && vialArt) {
    g.drawImage(vialArt, Math.round(px(s.bonus.x) - vialArt.width / 2), Math.round(py(s.bonus.y) - vialArt.height / 2))
  }

  // The ghosts: bodies first, eyes over everything.
  const looks = s.ghosts.map(gh => [gh, ghostLook(s, gh)] as const)
  for (const [gh, look] of looks) if (look !== 'eyes') drawGhost(gh, look)

  // The figure, facing the way it goes; keeled over at the end.
  if (s.status !== 'over' || now - endedAt < 2) {
    const face = faces.get(mazePose(s))
    if (face) {
      const cx = px(s.player.x)
      const cy = py(s.player.y)
      const flip = s.player.dir === 'left' || (s.player.dir == null && s.player.want === 'left')
      g.save()
      g.translate(Math.round(cx), Math.round(cy))
      if (flip) g.scale(-1, 1)
      g.drawImage(face.image, -Math.round(face.image.width / 2), -Math.round(face.image.height / 2))
      g.restore()
    }
  }
  for (const [gh, look] of looks) if (look === 'eyes') drawGhost(gh, look)

  // Score pops, floating up for most of a second.
  g.font = `bold 10px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const p of s.pops) {
    const age = s.elapsed - p.at
    if (age > POP_SECONDS) continue
    g.globalAlpha = 1 - age / POP_SECONDS
    g.fillStyle = colors.accent
    g.fillText(p.text, Math.round(px(p.x)), Math.round(py(p.y) - (reducedMotion ? 10 : 6 + age * 18)))
  }
  g.globalAlpha = 1

  // HUD: the game and the level, who it's against, then the scores top right, the lives as
  // squares under them, then the scare's chain or NEW BEST the moment it passes.
  g.font = `11px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  g.fillStyle = colors.faint
  g.fillText(`CAPSULE MAZE · L${s.level}`, 12, 10)
  g.font = `10px ${font}`
  g.fillText(props.title, 12, 23)
  g.font = `11px ${font}`
  g.textAlign = 'right'
  g.fillText(`HI ${PAD(props.hi)}  ${PAD(s.score)}`, W - 12, 10)
  for (let i = 0; i < s.lives; i++) {
    g.fillStyle = colors.life
    g.fillRect(W - 18 - i * 10, 27, 6, 6)
  }
  if (s.frightChain >= 2 && s.fright > 0 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText(`×${s.frightChain}`, W - 12, 40)
  }
  else if (bestAt >= 0 && now - bestAt < 1.6 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('NEW BEST', W - 12, 40)
  }

  // Prompts, on the corridor under the house.
  const lines: Array<[string, string, number]> = []
  const blink = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(now * 3)
  if (s.status === 'ready' && s.score === 0 && s.level === 1) {
    lines.push(['space · tap to start', colors.text, blink], ['arrows · wasd · swipe steer · esc quits', colors.faint, 1])
  }
  else if (s.status === 'ready') {
    lines.push([s.level > 1 && s.dotsEaten === 0 && s.lives === livesSeen ? `LEVEL ${s.level} · space · tap` : `${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left · space · tap`, colors.text, blink])
  }
  else if (s.status === 'cleared') {
    lines.push([`MAZE CLEARED · level ${s.level + 1} next`, colors.accent, 1])
  }
  else if (s.status === 'over') {
    const best = s.score > 0 && s.score >= props.hi ? ' · NEW BEST' : ''
    lines.push([`GAME OVER · ${s.score}${best}`, colors.text, 1])
    if (now - endedAt >= RESTART_LOCKOUT) lines.push(['space · tap for another go   esc quits', colors.faint, 1])
  }
  if (lines.length) {
    g.font = `11px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const y0 = py(11.5)
    lines.forEach(([text, color, alpha], i) => {
      const w = g.measureText(text).width + 16
      g.globalAlpha = 0.88
      g.fillStyle = colors.backing
      g.fillRect(Math.round(W / 2 - w / 2), Math.round(y0 + i * 16 - 8), Math.round(w), 16)
      g.globalAlpha = alpha
      g.fillStyle = color
      g.fillText(text, W / 2, y0 + i * 16)
    })
    g.globalAlpha = 1
  }
}

// --- time and input ---------------------------------------------------------------------------

function frame(ts: number) {
  const dt = (ts - last) / 1000
  last = ts
  now = ts / 1000
  const s = state
  if (s && !paused) {
    const wasLive = s.status !== 'over'
    stepMaze(s, dt)
    if (s.lives < livesSeen) {
      livesSeen = s.lives
      lostAt = now
      announce.value = s.lives > 0 ? `caught. ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left; space or tap to go again` : 'caught, and that was the last life'
    }
    else if (s.lives > livesSeen) {
      livesSeen = s.lives
    }
    if (!bestShown && props.hi > 0 && s.score > props.hi && s.status === 'running') {
      bestShown = true
      bestAt = now
    }
    if (wasLive && s.status === 'over') endedAt = now
  }
  if (s && s.status === 'over' && !reportedEnd) {
    reportedEnd = true
    announce.value = `game over at ${s.score}${s.levelsCleared ? `, ${s.levelsCleared} ${s.levelsCleared === 1 ? 'level' : 'levels'} eaten clean` : ''}. space or tap for another go; escape quits`
    emit('over', s.score, s.levelsCleared > 0)
  }
  draw()
  raf = requestAnimationFrame(frame)
}

/** The one-shot button: start, or restart after the lockout. */
function press() {
  canvas.value?.focus({ preventScroll: true })
  const s = state
  if (!s) return
  const ended = s.status === 'over'
  if (ended && now - endedAt < RESTART_LOCKOUT) return
  const before = s.status
  startMaze(s)
  if (ended) {
    reportedEnd = false
    endedAt = -1
    lostAt = -1
    livesSeen = s.lives
    bestAt = -1
    bestShown = false
  }
  if (before !== 'running' && s.status === 'running') announce.value = `running, ${s.pellets} capsules to eat`
}

function steer(d: MazeDir) {
  const s = state
  if (!s) return
  if (s.status === 'ready') press()
  steerMaze(s, d)
}

function onPointerDown(e: PointerEvent) {
  canvas.value?.setPointerCapture?.(e.pointerId)
  swipe = { x: e.clientX, y: e.clientY, moved: false }
}

function onPointerMove(e: PointerEvent) {
  if (!swipe) return
  const dx = e.clientX - swipe.x
  const dy = e.clientY - swipe.y
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return
  steer(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'))
  swipe = { x: e.clientX, y: e.clientY, moved: true }
}

function onPointerUp() {
  if (swipe && !swipe.moved) press()
  swipe = null
}

/** A game left with points on the board still counts: the record is posted before the stage is handed back. */
function reportIfLive() {
  const s = state
  if (!s || reportedEnd || s.score === 0 || s.status === 'over') return
  reportedEnd = true
  emit('over', s.score, s.levelsCleared > 0)
}

function quit() {
  reportIfLive()
  emit('quit', state?.score ?? 0)
}

const KEY_DIRS: Record<string, MazeDir> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down'
}

function onKey(e: KeyboardEvent) {
  // Not when something else owns the keyboard: the ⌘K palette's input, any field, any dialog.
  const target = e.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return
  const dir = KEY_DIRS[e.code]
  if (dir) {
    e.preventDefault()
    if (!e.repeat) steer(dir)
  }
  else if (e.code === 'Space' || e.code === 'Enter') {
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
  state = fresh()
  livesSeen = state.lives
  resize()
  // A preset picked mid-game re-reads the palette and rebakes the sprites.
  stopTheme = onThemeChange(prepare)
  ro = new ResizeObserver(resize)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.value?.focus({ preventScroll: true })
  if (import.meta.dev) {
    // Lets a headless check drive a whole game with the engine's scripted player and read the result.
    (window as unknown as Record<string, unknown>).__mazeDebug = {
      auto: () => (state ? autoMaze(state) : false),
      status: () => state?.status ?? null,
      score: () => state?.score ?? 0,
      level: () => state?.level ?? 0,
      pellets: () => state?.pellets ?? 0,
      lives: () => state?.lives ?? 0,
      dir: () => state?.player.dir ?? null,
      want: () => state?.player.want ?? null,
      tile: () => T
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
  document.removeEventListener('visibilitychange', onVisibility)
  if (import.meta.dev) delete (window as unknown as Record<string, unknown>).__mazeDebug
})

// A build or wardrobe change mid-game is rare (the page's data refreshing); redraw the figure.
watch(() => [props.build, props.accessories], prepare, { deep: true })

defineExpose({ quit })
</script>
