<template>
  <div class="absolute inset-0">
    <canvas
      ref="canvas"
      class="block w-full h-full outline-none touch-none select-none"
      tabindex="0"
      role="img"
      :aria-label="`TICKER's soda invaders. ${announce}`"
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
// The soda invaders on a canvas, over the /ticker stage. The world comes from
// shared/utils/tickerInvaders.ts; this file only draws it, feeds it input and keeps time, the way
// Drop.vue does for the drop. The formation is the crusher's can art by size (minis small and
// warn-coloured, cans the crusher's blue-grey, tall boys big and red, dented after a hit) with
// the soda's letter on the body, germs the maze's blob; the figure is TICKER's face at the foot
// of the field, firing capsules, with the freed figure docked beside it after a rescue. A tall
// boy's beam is a cone of the accent with stripes running down it; a captured figure rides on
// its captor as a small face. Stars drift down behind everything.
//
// Keys: ← → (or A D) move; space or enter fires (held: on the cooldown) and starts; escape quits.
// Pointer: a finger (or the mouse button) held moves the figure to its column and fires while
// it's down; a tap starts. The polish — the stars, the bursts, the flicker, NEW BEST — is cosmetic
// and skipped under reduced motion; the short lockout after the end is not.
import { makeRng } from '#shared/utils/tickerRunner'
import {
  INV_BEAM_CHARGE, INV_BEAM_HALF, INV_DUAL_DX, INV_H, INV_PLAYER_Y, INV_W, autoInvaders, createInvaders, invadersPose, startInvaders, stepInvaders
} from '#shared/utils/tickerInvaders'
import type { Invader, InvaderInput, InvaderKind, InvadersInput, InvadersState } from '#shared/utils/tickerInvaders'
import { tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerBuild, TickerInk, TickerProp } from '#shared/utils/tickerSprite'
import { CAN, CAN_DENTED, renderCells } from '~/utils/tickerArt'
import type { Cells } from '~/utils/tickerArt'

const props = defineProps<{
  build: TickerBuild
  accessories: TickerProp[]
  night: boolean
  /** The high score to show beside the live one; the page owns it and updates it on `over`. */
  hi: number
  /** The formation: the month's sodas by size. */
  wave: InvaderInput[]
  /** "25 cans · 25 sodas this month" */
  title: string
  /** Seeds the dives, so everyone plays the same game on a day. */
  seed: number
  lives: number
}>()

const emit = defineEmits<{
  /** The game ended (or was left mid-way with points on the board) at this score; `cleared` when a wave was cleared. */
  over: [score: number, cleared: boolean]
  /** The player left (Escape or the page's QUIT); the score is the last game's. */
  quit: [score: number]
  /** The stage height the field needs at this width, in px. */
  fit: [height: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const announce = ref('space or tap to start; arrows move, space or a held finger fires; escape quits')

const HUD_H = 36
/** Under the field: clear of the page's remark line. */
const BOTTOM = 48
const MIN_TILE = 12
const MAX_TILE = 20
const RESTART_LOCKOUT = 0.6
const SHAKE_SECONDS = 0.3
const POP_SECONDS = 0.9
const STARS = 40
const PAD = (n: number) => String(Math.min(99999, n)).padStart(5, '0')
/** A germ: the maze's 5×5 blob with two eyes. */
const GERM: Cells = [
  [0, 1, 'bowl'], [0, 2, 'bowl'], [0, 3, 'bowl'],
  [1, 0, 'bowl'], [1, 1, 'eye'], [1, 2, 'bowl'], [1, 3, 'eye'], [1, 4, 'bowl'],
  [2, 0, 'bowl'], [2, 1, 'bowl'], [2, 2, 'bowl'], [2, 3, 'bowl'], [2, 4, 'bowl'],
  [3, 0, 'bowl'], [3, 1, 'bowl'], [3, 2, 'bowl'], [3, 3, 'bowl'], [3, 4, 'bowl'],
  [4, 0, 'bowl'], [4, 2, 'bowl'], [4, 4, 'bowl']
]
/** Each kind's can body colour and cell size at a 20px tile. */
const KIND_ART: Record<InvaderKind, { ink: TickerInk, px: number }> = { mini: { ink: 'clip', px: 3 }, can: { ink: 'bowl', px: 4 }, tall: { ink: 'shade', px: 5 }, germ: { ink: 'drop', px: 4 } }

// --- state that is not reactive on purpose (touched every frame) ------------------------------

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
/** The tile, in px, and where the field starts. */
let T = 16
let ox = 0
let oy = HUD_H
let state: InvadersState | null = null
let raf = 0
let last = 0
let now = 0
let paused = false
let reducedMotion = false
let coarse = false
let reportedEnd = false
let endedAt = -1
let lostAt = -1
let livesSeen = 0
let dualSeen = false
let bestAt = -1
let bestShown = false
let fitted = 0
let inks: Record<TickerInk, string>
let font = 'monospace'
let colors = { edge: '#333', text: '#888', faint: '#666', accent: '#4c6', danger: '#c55', backing: '#000' }
const faces = new Map<string, HTMLCanvasElement>()
let captiveFace: HTMLCanvasElement | null = null
const art = new Map<string, HTMLCanvasElement>()
const stars: Array<{ x: number, y: number, layer: number }> = []
/** Keys held: ← → for the walk, space for the fire. */
const held = { left: false, right: false, fire: false }
/** The finger (or mouse button) down: the column it asks for, in field units. */
let pointer: { x: number, moved: boolean } | null = null
let autoInput: InvadersInput | null = null
let ro: ResizeObserver | undefined
let stopTheme: (() => void) | undefined

/** The face at 2px cells on big tiles, 1px on small ones. */
const facePx = () => (T >= 18 ? 2 : 1)
/** Art cells scale with the tile: the sizes above at 20px, never under 2. */
const artPx = (base: number) => Math.max(2, Math.round((base * T) / MAX_TILE))

function paint(cells: Cells, cols: number, rows: number, px: number, swap: Partial<Record<TickerInk, TickerInk>> = {}): HTMLCanvasElement {
  const mapped: Cells = cells.map(([r, c, ink]) => [r, c, swap[ink] ?? ink])
  return renderCells(mapped, cols, rows, inks, px, px >= 3 ? 1 : 0)
}

function prepare() {
  inks = resolveInks()
  colors = {
    edge: themeColor('--color-line-accent'),
    text: themeColor('--color-dim'),
    faint: themeColor('--color-faint'),
    accent: themeColor('--color-accent'),
    danger: themeColor('--color-danger'),
    backing: themeColor('--color-raised')
  }
  font = canvas.value ? getComputedStyle(canvas.value).fontFamily : font
  faces.clear()
  for (const pose of ['idle', 'happy', 'worried', 'nervous', 'flatline', 'petted'] as const) {
    const worn = pose === 'flatline' ? props.accessories.filter(a => a !== 'shades') : props.accessories
    const s = tickerSprite(pose, 'face', worn, props.build)
    const cells: Cells = []
    s.cells.forEach((cell, i) => {
      if (cell.ink) cells.push([Math.floor(i / s.cols), i % s.cols, cell.ink])
    })
    faces.set(pose, renderCells(cells, s.cols, s.rows, inks, facePx(), 0))
    if (pose === 'worried') captiveFace = renderCells(cells, s.cols, s.rows, inks, 1, 0)
  }
  art.clear()
  for (const kind of ['mini', 'can', 'tall'] as const) {
    const { ink, px } = KIND_ART[kind]
    art.set(kind, paint(CAN, 4, 7, artPx(px), { bowl: ink }))
  }
  art.set('tall:dented', paint(CAN_DENTED, 4, 7, artPx(KIND_ART.tall.px), { bowl: 'shade' }))
  art.set('germ', paint(GERM, 5, 5, artPx(KIND_ART.germ.px), { bowl: 'drop' }))
}

function fresh(): InvadersState {
  return createInvaders({ wave: props.wave, lives: props.lives, rng: makeRng(props.seed) })
}

function seedStars() {
  stars.length = 0
  const rng = makeRng(props.seed ^ 0x5f3759df)
  for (let i = 0; i < STARS; i++) stars.push({ x: rng() * INV_W, y: rng() * INV_H, layer: i % 3 })
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
  const tile = Math.max(MIN_TILE, Math.min(MAX_TILE, Math.floor((W - 8) / INV_W)))
  if (tile !== T || !faces.size) {
    T = tile
    prepare() // the art is sized to the tile
  }
  ox = Math.round((W - INV_W * T) / 2)
  oy = HUD_H
  // Tell the page how tall the stage has to be for this field; it answers with a resize.
  const needed = HUD_H + INV_H * T + BOTTOM
  if (needed !== fitted) {
    fitted = needed
    emit('fit', needed)
  }
}

// --- drawing ----------------------------------------------------------------------------------

const px = (x: number) => ox + x * T
const py = (y: number) => oy + y * T

function drawImageAt(image: HTMLCanvasElement, x: number, y: number, flip = false) {
  const g = ctx!
  g.save()
  g.translate(Math.round(px(x)), Math.round(py(y)))
  if (flip) g.scale(-1, 1)
  g.drawImage(image, -Math.round(image.width / 2), -Math.round(image.height / 2))
  g.restore()
}

function drawInvader(v: Invader) {
  const g = ctx!
  const image = art.get(v.kind === 'tall' && v.hp === 1 ? 'tall:dented' : v.kind)
  if (!image) return
  // Divers lean into the turn; the germs wriggle.
  const flip = v.kind === 'germ' && !reducedMotion && Math.floor(now * 2 + v.id) % 2 === 1
  drawImageAt(image, v.x, v.y, flip)
  if (v.kind !== 'germ' && v.label && T >= 16) {
    g.font = `bold ${T >= 18 ? 9 : 8}px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = inks.spec
    g.fillText(v.label.charAt(0), Math.round(px(v.x)), Math.round(py(v.y) + 1))
  }
  if (v.captive && captiveFace) drawImageAt(captiveFace, v.x, v.y - 1.1)
}

/** The beam: a cone of the accent from under the tall boy to the foot of the field, stripes running down it; faint while it builds. */
function drawBeam(v: Invader, elapsed: number) {
  const g = ctx!
  const charge = Math.min(1, (elapsed - v.beamAt) / INV_BEAM_CHARGE)
  const top = v.y + 0.9
  const left = px(v.x - INV_BEAM_HALF)
  const right = px(v.x + INV_BEAM_HALF)
  const narrow = px(v.x - 0.5)
  const narrowR = px(v.x + 0.5)
  g.save()
  g.beginPath()
  g.moveTo(narrow, py(top))
  g.lineTo(narrowR, py(top))
  g.lineTo(right, py(INV_H))
  g.lineTo(left, py(INV_H))
  g.closePath()
  g.clip()
  g.globalAlpha = 0.08 + 0.14 * charge
  g.fillStyle = colors.accent
  g.fillRect(left, py(top), right - left, py(INV_H) - py(top))
  g.globalAlpha = 0.1 + 0.25 * charge
  const stripe = T * 0.6
  const offset = reducedMotion ? 0 : (now * T * 6) % stripe
  for (let y = py(top) - stripe + offset; y < py(INV_H); y += stripe) g.fillRect(left, Math.round(y), right - left, Math.max(1, Math.round(stripe * 0.35)))
  g.restore()
  g.globalAlpha = 1
}

function drawBurst(b: InvadersState['bursts'][number], age: number) {
  const g = ctx!
  const life = b.kind === 'player' ? 0.8 : b.kind === 'dent' ? 0.25 : 0.45
  if (age > life) return
  const k = age / life
  const cells = b.kind === 'player' ? 12 : b.kind === 'dent' ? 4 : 8
  const reach = (b.kind === 'player' ? 1.6 : b.kind === 'dent' ? 0.5 : 1.1) * (reducedMotion ? 0.6 : k)
  const size = Math.max(2, Math.round(T * (b.kind === 'player' ? 0.22 : 0.16)))
  g.globalAlpha = 1 - k
  g.fillStyle = b.kind === 'player' ? colors.danger : b.kind === 'dent' ? colors.faint : inks.spec
  for (let i = 0; i < cells; i++) {
    const ang = (i / cells) * Math.PI * 2 + (b.kind === 'player' ? 0 : 0.4)
    g.fillRect(Math.round(px(b.x + Math.cos(ang) * reach) - size / 2), Math.round(py(b.y + Math.sin(ang) * reach) - size / 2), size, size)
  }
  g.globalAlpha = 1
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

  // The field, with the stars drifting down behind everything.
  g.globalAlpha = 0.5
  g.fillStyle = colors.backing
  g.fillRect(ox, oy, INV_W * T, INV_H * T)
  g.globalAlpha = 1
  const speeds = [0.5, 1, 1.8]
  for (const st of stars) {
    const y = reducedMotion ? st.y : (st.y + now * speeds[st.layer]!) % INV_H
    g.globalAlpha = 0.2 + st.layer * 0.15
    g.fillStyle = colors.faint
    const d = st.layer === 2 ? 2 : 1
    g.fillRect(Math.round(px(st.x)), Math.round(py(y)), d, d)
  }
  g.globalAlpha = 1
  g.strokeStyle = colors.edge
  g.lineWidth = 1
  g.strokeRect(ox - 0.5, oy - 0.5, INV_W * T + 1, INV_H * T + 1)

  // The beams first, under everything else.
  for (const v of s.invaders) if (v.mode === 'beam') drawBeam(v, s.elapsed)

  // The invaders: the formation, then whoever's in the air over it.
  for (const v of s.invaders) if (v.mode === 'formation') drawInvader(v)
  for (const v of s.invaders) if (v.mode !== 'formation' && v.mode !== 'wait' && v.mode !== 'gone') drawInvader(v)

  // Shots up, bullets down.
  g.fillStyle = colors.accent
  const shotW = Math.max(2, Math.round(T * 0.15))
  const shotH = Math.max(4, Math.round(T * 0.5))
  for (const sh of s.shots) g.fillRect(Math.round(px(sh.x) - shotW / 2), Math.round(py(sh.y) - shotH / 2), shotW, shotH)
  g.fillStyle = colors.danger
  const bulletD = Math.max(3, Math.round(T * 0.18))
  for (const b of s.bullets) g.fillRect(Math.round(px(b.x) - bulletD / 2), Math.round(py(b.y) - bulletD / 2), bulletD, bulletD)

  // The figure, flickering while it can't be touched; keeled over at the end.
  const p = s.player
  const face = faces.get(invadersPose(s))
  const showFigure = p.alive ? true : s.status === 'over' && now - endedAt < 2
  if (face && showFigure) {
    const immune = p.alive && s.elapsed < p.immuneUntil
    g.globalAlpha = immune ? (reducedMotion ? 0.55 : Math.floor(now * 14) % 2 === 0 ? 1 : 0.3) : 1
    drawImageAt(face, p.x, INV_PLAYER_Y)
    if (p.dual) drawImageAt(face, p.x + INV_DUAL_DX, INV_PLAYER_Y)
    g.globalAlpha = 1
  }

  for (const b of s.bursts) drawBurst(b, s.elapsed - b.at)

  // Score pops, floating up for most of a second.
  g.font = `bold 10px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const pop of s.pops) {
    const age = s.elapsed - pop.at
    if (age > POP_SECONDS) continue
    g.globalAlpha = 1 - age / POP_SECONDS
    g.fillStyle = colors.accent
    g.fillText(pop.text, Math.round(px(pop.x)), Math.round(py(pop.y) - (reducedMotion ? 10 : 6 + age * 18)))
  }
  g.globalAlpha = 1

  // HUD: the game and the wave, the month, then the scores top right, the lives as squares under
  // them, then DUAL while the second figure is docked, or NEW BEST the moment it passes.
  g.font = `11px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  g.fillStyle = colors.faint
  g.fillText(`SODA INVADERS · W${s.level}`, 12, 10)
  g.font = `10px ${font}`
  g.fillText(props.title, 12, 23)
  g.font = `11px ${font}`
  g.textAlign = 'right'
  g.fillText(`HI ${PAD(props.hi)}  ${PAD(s.score)}`, W - 12, 10)
  for (let i = 0; i < s.lives; i++) {
    g.fillStyle = colors.danger
    g.fillRect(W - 18 - i * 10, 27, 6, 6)
  }
  if (p.dual && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('DUAL', W - 12, 40)
  }
  else if (bestAt >= 0 && now - bestAt < 1.6 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('NEW BEST', W - 12, 40)
  }

  // Prompts, across the middle of the field.
  const lines: Array<[string, string, number]> = []
  const blink = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(now * 3)
  const help = coarse ? 'hold a finger: it follows and fires' : '← → move · space fires · esc quits'
  if (s.status === 'ready' && s.level === 1) {
    lines.push(['space · tap to start', colors.text, blink], [help, colors.faint, 1])
  }
  else if (s.status === 'ready') {
    lines.push([`WAVE ${s.level} · ${s.alive} coming · space · tap`, colors.text, blink])
  }
  else if (s.status === 'cleared') {
    lines.push([`SKY CLEAR · wave ${s.level + 1} next`, colors.accent, 1])
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
    const y0 = py(INV_H / 2 + 2)
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

/** What the hands are asking for this frame: the keys, the finger, or the scripted player. */
function readInput(s: InvadersState): InvadersInput {
  if (autoInput) {
    const input = autoInput
    autoInput = null
    return input
  }
  let dir: -1 | 0 | 1 = held.left === held.right ? 0 : held.left ? -1 : 1
  let fire = held.fire
  if (pointer) {
    const diff = pointer.x - s.player.x
    if (Math.abs(diff) > 0.25) dir = diff < 0 ? -1 : 1
    fire = true
  }
  return { dir, fire }
}

function frame(ts: number) {
  const dt = (ts - last) / 1000
  last = ts
  now = ts / 1000
  const s = state
  if (s && !paused) {
    const wasLive = s.status !== 'over'
    const before = s.wavesCleared
    stepInvaders(s, dt, readInput(s))
    if (s.lives < livesSeen) {
      livesSeen = s.lives
      lostAt = now
      announce.value = s.lives > 0 ? `down. ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left` : 'down, and that was the last life'
    }
    else if (s.lives > livesSeen) {
      livesSeen = s.lives
    }
    if (s.player.dual !== dualSeen) {
      dualSeen = s.player.dual
      if (dualSeen) announce.value = 'rescued: the second figure docked, twice the shots'
    }
    if (s.wavesCleared > before) announce.value = `sky clear. wave ${s.level}, ${s.alive} coming; space or tap to send them in`
    if (!bestShown && props.hi > 0 && s.score > props.hi && s.status !== 'over') {
      bestShown = true
      bestAt = now
    }
    if (wasLive && s.status === 'over') endedAt = now
  }
  if (s && s.status === 'over' && !reportedEnd) {
    reportedEnd = true
    announce.value = `game over at ${s.score}${s.wavesCleared ? `, ${s.wavesCleared} ${s.wavesCleared === 1 ? 'wave' : 'waves'} cleared` : ''}. space or tap for another go; escape quits`
    emit('over', s.score, s.wavesCleared > 0)
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
  startInvaders(s)
  if (ended) {
    reportedEnd = false
    endedAt = -1
    lostAt = -1
    livesSeen = s.lives
    dualSeen = false
    bestAt = -1
    bestShown = false
  }
  if (before !== 'running' && s.status === 'running') announce.value = `running, ${s.alive} coming in`
}

/** Where a pointer is, in field units across. */
function fieldX(e: PointerEvent): number {
  const rect = canvas.value?.getBoundingClientRect()
  return rect ? (e.clientX - rect.left - ox) / T : INV_W / 2
}

function onPointerDown(e: PointerEvent) {
  canvas.value?.setPointerCapture?.(e.pointerId)
  const s = state
  if (s && s.status !== 'running') press()
  pointer = { x: fieldX(e), moved: false }
}

function onPointerMove(e: PointerEvent) {
  if (!pointer) return
  pointer.x = fieldX(e)
  pointer.moved = true
}

function onPointerUp() {
  pointer = null
}

/** A game left with points on the board still counts: the record is posted before the stage is handed back. */
function reportIfLive() {
  const s = state
  if (!s || reportedEnd || s.score === 0 || s.status === 'over') return
  reportedEnd = true
  emit('over', s.score, s.wavesCleared > 0)
}

function quit() {
  reportIfLive()
  emit('quit', state?.score ?? 0)
}

const MOVE_KEYS: Record<string, 'left' | 'right'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }
const FIRE_KEYS = new Set(['Space', 'Enter', 'KeyX', 'KeyZ', 'ArrowUp', 'KeyW'])

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
    held[move] = true
  }
  else if (FIRE_KEYS.has(e.code)) {
    e.preventDefault()
    if (e.repeat || !s) return
    if (s.status !== 'running') press()
    held.fire = true
  }
  else if (e.code === 'Escape') {
    e.preventDefault()
    quit()
  }
}

function onKeyUp(e: KeyboardEvent) {
  const move = MOVE_KEYS[e.code]
  if (move) held[move] = false
  else if (FIRE_KEYS.has(e.code)) held.fire = false
}

function release() {
  held.left = false
  held.right = false
  held.fire = false
  pointer = null
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
  livesSeen = state.lives
  seedStars()
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
    (window as unknown as Record<string, unknown>).__invadersDebug = {
      auto: () => {
        autoInput = state ? autoInvaders(state) : null
        return autoInput
      },
      status: () => state?.status ?? null,
      score: () => state?.score ?? 0,
      level: () => state?.level ?? 0,
      alive: () => state?.alive ?? 0,
      lives: () => state?.lives ?? 0,
      x: () => state?.player.x ?? 0,
      dual: () => state?.player.dual ?? false,
      shots: () => state?.shots.length ?? 0,
      invaders: () => state?.invaders.map(v => [v.kind, v.mode, v.captive]) ?? [],
      firing: () => held.fire || !!pointer,
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
  if (import.meta.dev) delete (window as unknown as Record<string, unknown>).__invadersDebug
})

// A build or wardrobe change mid-game is rare (the page's data refreshing); redraw the figure.
watch(() => [props.build, props.accessories], prepare, { deep: true })

defineExpose({ quit })
</script>
