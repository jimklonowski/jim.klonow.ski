<template>
  <div class="absolute inset-0">
    <canvas
      ref="canvas"
      class="block w-full h-full outline-none touch-none select-none"
      tabindex="0"
      role="img"
      :aria-label="`TICKER's capsule drop. ${announce}`"
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
// The capsule drop on a canvas, over the /ticker stage. The world comes from
// shared/utils/tickerDrop.ts; this file only draws it, feeds it input and keeps time, the way
// Maze.vue does for the maze. The bottle is an outline with an open neck over the two columns a
// capsule enters at; germs are the maze's blob in the three capsule colours (the theme's accent,
// warn and danger), halves are rounded tiles joined along their link; TICKER stands at the
// bottle's shoulder with the next capsule shown beside it.
//
// Keys: ← → (or A D) move, held for a walk; ↑ W X Z turn; ↓ S held drops; space or enter
// starts, and turns once a capsule is in hand; escape quits. Touch: a finger dragged across
// walks the capsule a column at a time, a tap turns it, a swipe down holds it down until the
// finger lifts. The polish — the flash, the germs' wriggle, NEW BEST — is cosmetic and skipped
// under reduced motion; the short lockout after the end is not.
import { makeRng } from '#shared/utils/tickerRunner'
import {
  DROP_COLS, DROP_ROWS, DROP_SPAWN_X, autoDrop, createDrop, dropPieceCells, dropPose, moveDrop, rotateDrop, startDrop, stepDrop
} from '#shared/utils/tickerDrop'
import type { DropCell, DropColor, DropDir, DropState } from '#shared/utils/tickerDrop'
import { tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerBuild, TickerInk, TickerProp } from '#shared/utils/tickerSprite'
import { renderCells } from '~/utils/tickerArt'
import type { Cells } from '~/utils/tickerArt'

const props = defineProps<{
  build: TickerBuild
  accessories: TickerProp[]
  night: boolean
  /** The high score to show beside the live one; the page owns it and updates it on `over`. */
  hi: number
  /** Germs in the first bottle: the month's sodas. */
  germs: number
  /** "25 germs · 25 sodas this month" */
  title: string
  /** Seeds the bottle and the capsules, so everyone plays the same game on a day. */
  seed: number
}>()

const emit = defineEmits<{
  /** The game ended (or was left mid-way with points on the board) at this score; `cleared` when a bottle was cleaned. */
  over: [score: number, cleared: boolean]
  /** The player left (Escape or the page's QUIT); the score is the last game's. */
  quit: [score: number]
  /** The stage height the bottle needs at this width, in px. */
  fit: [height: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const announce = ref('space or tap to start; arrows move and turn, down drops; escape quits')

const HUD_H = 36
/** Under the bottle: clear of the page's remark line. */
const BOTTOM = 48
const MIN_TILE = 14
const MAX_TILE = 24
/** Room either side of the bottle, in tiles, for the figure and the next capsule. */
const SIDE_TILES = 3
const RESTART_LOCKOUT = 0.6
/** A held ← or → walks after this long, a column this often. */
const DAS_DELAY = 0.17
const DAS_RATE = 0.06
const POP_SECONDS = 0.9
const PAD = (n: number) => String(Math.min(99999, n)).padStart(5, '0')
/** A germ: the maze's 5×5 blob with two eyes. */
const GERM: Cells = [
  [0, 1, 'bowl'], [0, 2, 'bowl'], [0, 3, 'bowl'],
  [1, 0, 'bowl'], [1, 1, 'eye'], [1, 2, 'bowl'], [1, 3, 'eye'], [1, 4, 'bowl'],
  [2, 0, 'bowl'], [2, 1, 'bowl'], [2, 2, 'bowl'], [2, 3, 'bowl'], [2, 4, 'bowl'],
  [3, 0, 'bowl'], [3, 1, 'bowl'], [3, 2, 'bowl'], [3, 3, 'bowl'], [3, 4, 'bowl'],
  [4, 0, 'bowl'], [4, 2, 'bowl'], [4, 4, 'bowl']
]

// --- state that is not reactive on purpose (touched every frame) ------------------------------

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
/** The tile, in px, and where the bottle's row 0 starts. */
let T = 16
let ox = 0
let oy = HUD_H
let state: DropState | null = null
let raf = 0
let last = 0
let now = 0
let paused = false
let reducedMotion = false
let coarse = false
let reportedEnd = false
let endedAt = -1
let bestAt = -1
let bestShown = false
let fitted = 0
let inks: Record<TickerInk, string>
let font = 'monospace'
let colors = { edge: '#333', text: '#888', faint: '#666', accent: '#4c6', backing: '#000', c: ['#4c6', '#ca4', '#c55'] }
const faces = new Map<string, HTMLCanvasElement>()
const germArt: HTMLCanvasElement[] = []
/** Keys held: ← → for the walk, ↓ for the drop. */
const held: Partial<Record<'left' | 'right', { since: number, last: number }>> = {}
let keySoft = false
let pointerSoft = false
let autoSoft = false
let drag: { x: number, y: number, moved: boolean } | null = null
let ro: ResizeObserver | undefined
let stopTheme: (() => void) | undefined

/** The face at 2px cells on big tiles, 1px on small ones. */
const facePx = () => (T >= 20 ? 2 : 1)

function prepare() {
  inks = resolveInks()
  colors = {
    edge: themeColor('--color-line-accent'),
    text: themeColor('--color-dim'),
    faint: themeColor('--color-faint'),
    accent: themeColor('--color-accent'),
    backing: themeColor('--color-raised'),
    c: [themeColor('--color-accent'), themeColor('--color-warn'), themeColor('--color-danger')]
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
    faces.set(pose, renderCells(cells, s.cols, s.rows, inks, facePx(), 0))
  }
  germArt.length = 0
  const px = Math.max(2, Math.floor((T - 4) / 5))
  for (const color of colors.c) germArt.push(renderCells(GERM, 5, 5, { ...inks, bowl: color }, px, 0))
}

function fresh(): DropState {
  return createDrop({ germs: props.germs, rng: makeRng(props.seed) })
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
  const tile = Math.max(MIN_TILE, Math.min(MAX_TILE, Math.floor((W - 8) / (DROP_COLS + 2 * SIDE_TILES))))
  if (tile !== T || !faces.size) {
    T = tile
    prepare() // the art is sized to the tile
  }
  ox = Math.round((W - DROP_COLS * T) / 2)
  oy = HUD_H + T // a tile of neck above row 0
  // Tell the page how tall the stage has to be for this bottle; it answers with a resize.
  const needed = HUD_H + T + DROP_ROWS * T + BOTTOM
  if (needed !== fitted) {
    fitted = needed
    emit('fit', needed)
  }
}

// --- drawing ----------------------------------------------------------------------------------

const px = (x: number) => ox + x * T
const py = (y: number) => oy + y * T

/** A capsule half: a rounded tile, square along its link so a pair reads as one pill. */
function drawHalf(x: number, y: number, color: DropColor, link: DropDir | null, flash = false) {
  const g = ctx!
  const r = Math.floor(T / 2) - 1
  const radii = [r, r, r, r] // tl, tr, br, bl
  if (link === 'right') radii[1] = radii[2] = 0
  else if (link === 'left') radii[0] = radii[3] = 0
  else if (link === 'down') radii[2] = radii[3] = 0
  else if (link === 'up') radii[0] = radii[1] = 0
  g.fillStyle = flash ? inks.spec : colors.c[color]!
  g.beginPath()
  g.roundRect(px(x) + 1, py(y) + 1, T - 2, T - 2, radii)
  g.fill()
  if (!flash && T >= 16) {
    g.globalAlpha = 0.55
    g.fillStyle = inks.spec
    g.fillRect(px(x) + 4, py(y) + 4, 2, 2)
    g.globalAlpha = 1
  }
}

function drawGerm(x: number, y: number, cell: DropCell, flash = false) {
  const g = ctx!
  if (flash) {
    g.fillStyle = inks.spec
    g.fillRect(px(x) + 2, py(y) + 2, T - 4, T - 4)
    return
  }
  const art = germArt[cell.color]
  if (!art) return
  const cx = px(x) + T / 2
  const cy = py(y) + T / 2
  // The germs wriggle: a flip every half second, each on its own beat.
  const flip = !reducedMotion && Math.floor(now * 2 + x + y) % 2 === 1
  g.save()
  g.translate(Math.round(cx), Math.round(cy))
  if (flip) g.scale(-1, 1)
  g.drawImage(art, -Math.round(art.width / 2), -Math.round(art.height / 2))
  g.restore()
}

function drawBottle() {
  const g = ctx!
  const left = ox - 4
  const right = ox + DROP_COLS * T + 4
  const top = oy - 4
  const bottom = oy + DROP_ROWS * T + 4
  const neckL = px(DROP_SPAWN_X) - 4
  const neckR = px(DROP_SPAWN_X + 2) + 4
  const neckTop = HUD_H + 2
  g.globalAlpha = 0.5
  g.fillStyle = colors.backing
  g.fillRect(left, top, right - left, bottom - top)
  g.fillRect(neckL, neckTop, neckR - neckL, top - neckTop)
  g.globalAlpha = 1
  g.strokeStyle = colors.edge
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(neckL, neckTop)
  g.lineTo(neckL, top)
  g.lineTo(left + 6, top)
  g.arcTo(left, top, left, top + 6, 6)
  g.lineTo(left, bottom - 6)
  g.arcTo(left, bottom, left + 6, bottom, 6)
  g.lineTo(right - 6, bottom)
  g.arcTo(right, bottom, right, bottom - 6, 6)
  g.lineTo(right, top + 6)
  g.arcTo(right, top, right - 6, top, 6)
  g.lineTo(neckR, top)
  g.lineTo(neckR, neckTop)
  g.stroke()
}

function draw() {
  if (!ctx || !state) return
  const g = ctx
  const s = state
  g.setTransform(g.getTransform().a, 0, 0, g.getTransform().d, 0, 0)
  g.clearRect(0, 0, W, H)

  drawBottle()

  // What's settled in the bottle, the matched cells flashing.
  const flashing = new Set(s.clearing.map(c => c.y * DROP_COLS + c.x))
  const flashOn = reducedMotion || Math.floor(now * 8) % 2 === 0
  for (let y = 0; y < DROP_ROWS; y++) {
    for (let x = 0; x < DROP_COLS; x++) {
      const cell = s.grid[y]![x]
      if (!cell) continue
      const flash = flashing.has(y * DROP_COLS + x) && flashOn
      if (cell.kind === 'germ') drawGerm(x, y, cell, flash)
      else drawHalf(x, y, cell.color, cell.link, flash)
    }
  }

  // The capsule in hand, up in the neck or on its way down.
  if (s.piece && (s.status === 'running' || s.status === 'over')) {
    const [a, b] = dropPieceCells(s.piece)
    const linkA: DropDir = a.x < b.x ? 'right' : a.x > b.x ? 'left' : a.y < b.y ? 'down' : 'up'
    const back: Record<DropDir, DropDir> = { left: 'right', right: 'left', up: 'down', down: 'up' }
    drawHalf(a.x, a.y, a.color, linkA)
    drawHalf(b.x, b.y, b.color, back[linkA])
  }

  // The figure at the left shoulder, the next capsule at the right.
  const face = faces.get(dropPose(s))
  if (face && (s.status !== 'over' || now - endedAt < 2)) {
    const cx = Math.round(ox / 2)
    const cy = Math.round(oy + T * 1.5)
    g.drawImage(face, cx - Math.round(face.width / 2), cy - Math.round(face.height / 2))
  }
  const nx = ox + DROP_COLS * T + Math.round((W - ox - DROP_COLS * T) / 2)
  g.font = `10px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'top'
  g.fillStyle = colors.faint
  g.fillText('NEXT', nx, oy)
  const save = { ox, oy }
  ox = nx - T
  oy = oy + 14
  drawHalf(0, 0, s.next[0], 'right')
  drawHalf(1, 0, s.next[1], 'left')
  ox = save.ox
  oy = save.oy

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

  // HUD: the game and the level, the month, then the scores top right with the germs left under
  // them, then the chain or NEW BEST the moment it passes.
  g.font = `11px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  g.fillStyle = colors.faint
  g.fillText(`CAPSULE DROP · L${s.level}`, 12, 10)
  g.font = `10px ${font}`
  g.fillText(props.title, 12, 23)
  g.font = `11px ${font}`
  g.textAlign = 'right'
  g.fillText(`HI ${PAD(props.hi)}  ${PAD(s.score)}`, W - 12, 10)
  g.font = `10px ${font}`
  g.fillText(`${s.germs} germ${s.germs === 1 ? '' : 's'} left`, W - 12, 23)
  g.font = `11px ${font}`
  if (s.chain >= 2 && (s.status === 'clearing' || s.status === 'falling')) {
    g.fillStyle = colors.accent
    g.fillText(`×${2 ** Math.min(4, s.chain - 1)}`, W - 12, 40)
  }
  else if (bestAt >= 0 && now - bestAt < 1.6 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('NEW BEST', W - 12, 40)
  }

  // Prompts, across the middle of the bottle.
  const lines: Array<[string, string, number]> = []
  const blink = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(now * 3)
  const help = coarse ? 'drag moves · tap turns · swipe down drops' : '← → move · ↑ turns · ↓ drops · esc quits'
  if (s.status === 'ready' && s.level === 1) {
    lines.push(['space · tap to start', colors.text, blink], [help, colors.faint, 1])
  }
  else if (s.status === 'ready') {
    lines.push([`LEVEL ${s.level} · ${s.germs} germs · space · tap`, colors.text, blink])
  }
  else if (s.status === 'cleared') {
    lines.push([`BOTTLE CLEAN · level ${s.level + 1} next`, colors.accent, 1])
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
    const y0 = py(7.5)
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
    // A held arrow walks the capsule after a beat.
    for (const dir of ['left', 'right'] as const) {
      const h = held[dir]
      if (h && now - h.since >= DAS_DELAY && now - h.last >= DAS_RATE) {
        moveDrop(s, dir)
        h.last = now
      }
    }
    const wasLive = s.status !== 'over'
    const before = s.levelsCleared
    stepDrop(s, dt, keySoft || pointerSoft || autoSoft)
    autoSoft = false
    if (s.levelsCleared > before) announce.value = `bottle clean. level ${s.level}, ${s.germs} germs; space or tap to pour`
    if (!bestShown && props.hi > 0 && s.score > props.hi && s.status !== 'over') {
      bestShown = true
      bestAt = now
    }
    if (wasLive && s.status === 'over') endedAt = now
  }
  if (s && s.status === 'over' && !reportedEnd) {
    reportedEnd = true
    announce.value = `game over at ${s.score}${s.levelsCleared ? `, ${s.levelsCleared} ${s.levelsCleared === 1 ? 'bottle' : 'bottles'} cleaned` : ''}. space or tap for another go; escape quits`
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
  startDrop(s)
  if (ended) {
    reportedEnd = false
    endedAt = -1
    bestAt = -1
    bestShown = false
  }
  if (before !== 'running' && s.status === 'running') announce.value = `running, ${s.germs} germs in the bottle`
}

/** Space, or a tap: the button when nothing is in hand, a turn when something is. */
function pressOrTurn() {
  const s = state
  if (!s) return
  if (s.status === 'running') rotateDrop(s)
  else press()
}

function onPointerDown(e: PointerEvent) {
  canvas.value?.setPointerCapture?.(e.pointerId)
  drag = { x: e.clientX, y: e.clientY, moved: false }
}

function onPointerMove(e: PointerEvent) {
  const s = state
  if (!drag || !s || pointerSoft) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  const column = T * 0.8
  if (dy >= T * 1.2 && dy > Math.abs(dx)) {
    pointerSoft = true
    drag.moved = true
    return
  }
  if (Math.abs(dx) >= column) {
    const dir = dx < 0 ? 'left' : 'right'
    if (s.status === 'running') moveDrop(s, dir)
    drag.x += Math.sign(dx) * column
    drag.moved = true
  }
}

function onPointerUp() {
  if (drag && !drag.moved) pressOrTurn()
  drag = null
  pointerSoft = false
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

const MOVE_KEYS: Record<string, 'left' | 'right'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }
const TURN_KEYS = new Set(['ArrowUp', 'KeyW', 'KeyX', 'KeyZ'])
const DROP_KEYS = new Set(['ArrowDown', 'KeyS'])

function onKey(e: KeyboardEvent) {
  // Not when something else owns the keyboard: the ⌘K palette's input, any field, any dialog.
  const target = e.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return
  const s = state
  const move = MOVE_KEYS[e.code]
  if (move) {
    e.preventDefault()
    if (e.repeat || !s) return
    if (s.status === 'ready') press()
    moveDrop(s, move)
    held[move] = { since: now, last: now }
  }
  else if (TURN_KEYS.has(e.code)) {
    e.preventDefault()
    if (e.repeat || !s) return
    if (s.status === 'ready') press()
    rotateDrop(s)
  }
  else if (DROP_KEYS.has(e.code)) {
    e.preventDefault()
    keySoft = true
  }
  else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    if (!e.repeat) pressOrTurn()
  }
  else if (e.code === 'Escape') {
    e.preventDefault()
    quit()
  }
}

function onKeyUp(e: KeyboardEvent) {
  const move = MOVE_KEYS[e.code]
  if (move === 'left') delete held.left
  else if (move === 'right') delete held.right
  else if (DROP_KEYS.has(e.code)) keySoft = false
}

function release() {
  delete held.left
  delete held.right
  keySoft = false
}

function onVisibility() {
  paused = document.hidden
  if (paused) release()
  else last = performance.now()
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  coarse = window.matchMedia('(pointer: coarse)').matches
  state = fresh()
  resize()
  // A preset picked mid-game re-reads the palette and rebakes the sprites.
  stopTheme = onThemeChange(prepare)
  ro = new ResizeObserver(resize)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.value?.focus({ preventScroll: true })
  if (import.meta.dev) {
    // Lets a headless check drive a whole game with the engine's scripted player and read the result.
    (window as unknown as Record<string, unknown>).__dropDebug = {
      auto: () => {
        autoSoft = state ? autoDrop(state) : false
        return autoSoft
      },
      status: () => state?.status ?? null,
      score: () => state?.score ?? 0,
      level: () => state?.level ?? 0,
      germs: () => state?.germs ?? 0,
      piece: () => (state?.piece ? [state.piece.x, state.piece.y, state.piece.rot] : null),
      soft: () => keySoft || pointerSoft,
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
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', release)
  document.removeEventListener('visibilitychange', onVisibility)
  if (import.meta.dev) delete (window as unknown as Record<string, unknown>).__dropDebug
})

// A build or wardrobe change mid-game is rare (the page's data refreshing); redraw the figure.
watch(() => [props.build, props.accessories], prepare, { deep: true })

defineExpose({ quit })
</script>
