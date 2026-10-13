<template>
  <div class="absolute inset-0">
    <canvas
      ref="canvas"
      class="block w-full h-full outline-none touch-none select-none"
      tabindex="0"
      role="img"
      :aria-label="`TICKER World. ${announce}`"
      @pointerdown.prevent="onTap"
    />
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ announce }}
    </p>
    <!-- On-stage buttons for touch: run left, run right, jump. Held, not tapped. -->
    <!-- They sit above the page's remark line (the bottom ~44px of the stage) and over the
         figure's start, where thumbs rest; translucent so the ground still reads through. -->
    <div
      v-if="touch"
      class="absolute inset-x-0 bottom-11 flex items-end justify-between px-3 pointer-events-none"
      aria-hidden="true"
    >
      <div class="flex gap-2 pointer-events-auto">
        <button
          type="button"
          class="pad"
          @pointerdown.prevent="hold('left', true)"
          @pointerup="hold('left', false)"
          @pointercancel="hold('left', false)"
          @pointerleave="hold('left', false)"
        >
          ◀
        </button>
        <button
          type="button"
          class="pad"
          @pointerdown.prevent="hold('right', true)"
          @pointerup="hold('right', false)"
          @pointercancel="hold('right', false)"
          @pointerleave="hold('right', false)"
        >
          ▶
        </button>
      </div>
      <button
        type="button"
        class="pad pointer-events-auto"
        @pointerdown.prevent="hold('jump', true)"
        @pointerup="hold('jump', false)"
        @pointercancel="hold('jump', false)"
        @pointerleave="hold('jump', false)"
      >
        ▲
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// TICKER World on a canvas, over the /ticker stage. The level comes from
// shared/utils/tickerWorld.ts (buildLevel from the month's days, stepWorld with the player's
// input); this file draws it, keeps time and feeds it input, the way Runner.vue and Breakout.vue
// do for theirs. The figure is the companion's sprite at 3px cells; the tiles are TUI blocks in
// the theme's colours; each day is labelled at the top of the playfield, so the level reads as
// the calendar it is.
//
// Session one: ground, hills, pits, platforms, capsules, week flags, the castle. The soda cans,
// the shrink on a hit and the draw blocks' reveals come next.
import { tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerBuild, TickerInk, TickerPose, TickerProp } from '#shared/utils/tickerSprite'
import {
  DAY_TILES, GROUND, PLATFORM, PLAYER_ART_DX, PLAYER_H, ROWS, START_TILES, TILE,
  autoRun, createWorld, dayAt, levelWidth, start, stepWorld, tileAt, worldPose
} from '#shared/utils/tickerWorld'
import type { DayInput, WorldInput, WorldState } from '#shared/utils/tickerWorld'
import { FLAG, renderCells } from '~/utils/tickerArt'
import type { Cells } from '~/utils/tickerArt'

const props = defineProps<{
  build: TickerBuild
  accessories: TickerProp[]
  night: boolean
  /** The high score to show beside the live one; the page owns it and updates it on `over`. */
  hi: number
  /** The month, oldest first; the castle is the last day. */
  days: DayInput[]
  /** Seeds where the platforms sit, so everyone plays the same month on a day. */
  seed: number
  lives: number
}>()

const emit = defineEmits<{
  /** The game ended with this score; `cleared` when the castle was reached. */
  over: [score: number, cleared: boolean]
  /** The player left (Escape or the page's QUIT); the score is the last game's. */
  quit: [score: number]
  /** The stage height the playfield needs, in px. */
  fit: [height: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const announce = ref('press space or tap to start; arrows run, space jumps; escape quits')
/** Coarse pointer: show the on-stage buttons. */
const touch = ref(false)

/** The figure's cell size here: smaller than the companion's md, so it fits a two-tile gap. */
const PX = 3
/** Space above the playfield for the HUD. */
const HUD_H = 36
const RESTART_LOCKOUT = 0.6
const SHAKE_SECONDS = 0.3
const PAD = (n: number) => String(Math.min(99999, n)).padStart(5, '0')
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const dayLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

// --- state that is not reactive on purpose (touched every frame) ------------------------------

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let state: WorldState | null = null
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
let inks: Record<TickerInk, string>
let font = 'monospace'
let colors = { ground: '#333', fill: '#111', text: '#888', faint: '#666', star: '#444', accent: '#4c6', life: '#c33', platform: '#6f8aa0', raised: '#101410', warn: '#e8b34b' }
const sprites = new Map<TickerPose, { image: HTMLCanvasElement, rows: number }>()
let flagArt: HTMLCanvasElement | null = null
const held = { left: false, right: false, jump: false }
let jumpPressed = false
let ro: ResizeObserver | undefined

function prepare() {
  inks = resolveInks()
  colors = {
    ground: themeColor('--color-line-accent'),
    fill: themeColor('--color-inset'),
    text: themeColor('--color-dim'),
    faint: themeColor('--color-faint'),
    star: themeColor('--color-ghost'),
    accent: themeColor('--color-accent'),
    life: themeColor('--color-danger'),
    platform: inks.bowl,
    raised: themeColor('--color-raised'),
    warn: themeColor('--color-warn')
  }
  font = canvas.value ? getComputedStyle(canvas.value).fontFamily : font
  sprites.clear()
  for (const pose of ['idle', 'walk1', 'walk2', 'happy', 'petted', 'flatline'] as const) {
    const worn = pose === 'flatline' ? props.accessories.filter(a => a !== 'shades') : props.accessories
    const s = tickerSprite(pose, 'full', worn, props.build)
    const cells: Cells = []
    s.cells.forEach((cell, i) => {
      if (cell.ink) cells.push([Math.floor(i / s.cols), i % s.cols, cell.ink])
    })
    sprites.set(pose, { image: renderCells(cells, s.cols, s.rows, inks, PX, 0), rows: s.rows })
  }
  flagArt = renderCells(FLAG, 5, 5, inks, 4, 1)
}

function fresh(): WorldState {
  return createWorld({ days: props.days, width: W, height: ROWS * TILE, seed: props.seed, lives: props.lives })
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
  if (!state) {
    state = fresh()
    livesSeen = state.lives
  }
  else {
    state.width = W
  }
}

// --- drawing ----------------------------------------------------------------------------------

function draw() {
  if (!ctx || !state) return
  const g = ctx
  const s = state
  g.setTransform(g.getTransform().a, 0, 0, g.getTransform().d, 0, 0)
  g.clearRect(0, 0, W, H)

  const shaking = lostAt >= 0 && now - lostAt < SHAKE_SECONDS && !reducedMotion
  if (shaking) {
    const k = 5 * (1 - (now - lostAt) / SHAKE_SECONDS)
    g.translate(Math.round((Math.random() - 0.5) * 2 * k), Math.round((Math.random() - 0.5) * 2 * k))
  }

  const top = H - ROWS * TILE
  const cam = Math.round(s.camera)
  const level = s.level

  // Stars drift at a tenth of the camera: the far distance.
  if (props.night) {
    for (const [i, [x, y]] of ([[0.12, 22], [0.31, 48], [0.57, 30], [0.78, 56], [0.91, 24], [0.45, 70], [0.68, 40]] as const).entries()) {
      g.globalAlpha = reducedMotion ? 0.8 : 0.45 + 0.4 * Math.sin(now * 1.3 + i * 1.7)
      g.fillStyle = colors.star
      g.fillRect((((Math.round(W * x) - cam * 0.1) % W) + W) % W, top + y, 2, 2)
    }
    g.globalAlpha = 1
  }

  // The day ticks along the top of the playfield: a faint rule and the date at each day's start.
  g.font = `9px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  const firstCol = Math.max(0, Math.floor(cam / TILE) - 1)
  const lastCol = Math.min(level.cols - 1, Math.ceil((cam + W) / TILE) + 1)
  for (let i = 0; i < level.days.length; i++) {
    const col = START_TILES + i * DAY_TILES
    if (col < firstCol - DAY_TILES || col > lastCol) continue
    const x = col * TILE - cam
    g.fillStyle = colors.faint
    g.globalAlpha = 0.5
    g.fillRect(x, top, 1, 8)
    g.globalAlpha = 1
    g.fillText(`${dayLabel(level.days[i]!.date)} · ${weekdayOf(level.days[i]!.date)}`, x + 4, top + 2)
  }

  // Tiles: ground as filled blocks with a bright top edge, platforms as thin bars.
  for (let c = firstCol; c <= lastCol; c++) {
    for (let r = 0; r < ROWS; r++) {
      const t = tileAt(level, c, r)
      if (t === GROUND) {
        const x = c * TILE - cam
        const y = top + r * TILE
        g.fillStyle = colors.fill
        g.fillRect(x, y, TILE, TILE)
        g.fillStyle = colors.ground
        if (tileAt(level, c, r - 1) !== GROUND) g.fillRect(x, y, TILE, 2)
        g.globalAlpha = 0.35
        g.fillRect(x + TILE - 1, y, 1, TILE)
        g.globalAlpha = 1
      }
      else if (t === PLATFORM) {
        g.fillStyle = colors.platform
        g.fillRect(c * TILE - cam, top + r * TILE + 2, TILE, 5)
      }
    }
  }

  // Capsules: a two-tone pill, bobbing a little.
  for (const cap of level.capsules) {
    if (cap.taken) continue
    const x = Math.round(cap.x - cam)
    if (x < -20 || x > W + 20) continue
    const bob = reducedMotion ? 0 : Math.round(Math.sin(now * 3 + cap.x * 0.05) * 2)
    const y = top + Math.round(cap.y) + bob
    g.fillStyle = inks.glove
    g.fillRect(x - 4, y - 7, 8, 7)
    g.fillStyle = inks.red
    g.fillRect(x - 4, y, 8, 7)
    g.fillStyle = inks.spec
    g.fillRect(x - 3, y - 6, 2, 2)
  }

  // Week flags, with their world label.
  for (const f of level.flags) {
    const x = Math.round(f.x - cam)
    if (x < -40 || x > W + 40) continue
    const ground = groundY(s, f.x)
    g.fillStyle = colors.faint
    g.fillRect(x, top + ground - 64, 2, 64)
    if (flagArt) g.drawImage(flagArt, x + 2, top + ground - 64)
    g.fillStyle = f.week <= s.checkpointWeek ? colors.accent : colors.faint
    g.font = `10px ${font}`
    g.textAlign = 'center'
    g.fillText(`1-${f.week + 1}`, x + 1, top + ground - 78)
  }

  // Draw blocks: a question tile, lit until it's hit (its reveal comes in session two).
  for (const b of level.blocks) {
    const x = Math.round(b.x - cam)
    if (x < -30 || x > W + 30) continue
    const y = top + b.y
    g.fillStyle = b.hit ? colors.fill : colors.raised
    g.fillRect(x, y, TILE, TILE)
    g.strokeStyle = b.hit ? colors.faint : colors.warn
    g.lineWidth = 1
    g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
    g.fillStyle = b.hit ? colors.faint : colors.warn
    g.font = `bold 13px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('?', x + TILE / 2, y + TILE / 2 + 1)
    g.textBaseline = 'top'
  }

  // The castle: a house with a door and a roof, on the ground at the end.
  {
    const x = Math.round(level.castleX - cam)
    if (x > -120 && x < W + 40) {
      const ground = groundY(s, level.castleX)
      const w = TILE * 3
      const h = TILE * 3
      const y = top + ground - h
      g.fillStyle = colors.raised
      g.fillRect(x, y, w, h)
      g.strokeStyle = colors.ground
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
      g.fillStyle = colors.ground
      g.beginPath()
      g.moveTo(x - 6, y)
      g.lineTo(x + w / 2, y - 22)
      g.lineTo(x + w + 6, y)
      g.closePath()
      g.fill()
      g.fillStyle = colors.fill
      g.fillRect(x + w / 2 - 8, y + h - 26, 16, 26)
      g.fillStyle = colors.accent
      g.fillRect(x + w / 2 + 3, y + h - 14, 2, 2)
      g.fillStyle = colors.faint
      g.font = `9px ${font}`
      g.textAlign = 'center'
      g.fillText('HOME', x + w / 2, y - 34)
    }
  }

  // The figure.
  const sprite = sprites.get(worldPose(s))
  if (sprite) {
    const p = s.player
    const x = Math.round(p.x - cam + PLAYER_ART_DX)
    const y = top + Math.round(p.y + PLAYER_H - sprite.rows * PX)
    if (p.facing < 0) {
      g.save()
      g.translate(x + sprite.image.width, y)
      g.scale(-1, 1)
      g.drawImage(sprite.image, 0, 0)
      g.restore()
    }
    else {
      g.drawImage(sprite.image, x, y)
    }
  }

  // HUD: the day on the left, the scores and lives on the right.
  g.font = `11px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  g.fillStyle = colors.faint
  const d = dayAt(s)
  const dayText = d >= 0 ? `1-${Math.floor(d / 7) + 1}  ${dayLabel(level.days[d]!.date)} · ${weekdayOf(level.days[d]!.date)}` : d < 0 && s.player.x >= level.castleX - TILE * 2 ? 'HOME' : `1-1  ${dayLabel(level.days[0]!.date)}`
  g.fillText(dayText, 12, 10)
  g.fillStyle = colors.accent
  g.fillText(`${s.collected}/${level.capsules.length} capsules`, 12, 24)
  g.textAlign = 'right'
  g.fillStyle = colors.faint
  g.fillText(`HI ${PAD(props.hi)}  ${PAD(s.score)}`, W - 12, 10)
  for (let i = 0; i < s.lives; i++) {
    g.fillStyle = colors.life
    g.fillRect(W - 18 - i * 10, 27, 6, 6)
  }
  if (bestAt >= 0 && now - bestAt < 1.6 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('NEW BEST', W - 12, 40)
  }

  // Prompts, centred on the stage.
  g.textAlign = 'center'
  const promptY = top + 90
  const pulse = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(now * 3)
  const first = level.days[0]?.date
  const lastDay = level.days.at(-1)?.date
  if (s.status === 'ready') {
    g.fillStyle = colors.faint
    g.fillText(`${first ? dayLabel(first) : ''} – ${lastDay ? dayLabel(lastDay) : ''} · ${level.days.length} DAYS · ${level.capsules.length} CAPSULES`, W / 2, promptY - 18)
    g.globalAlpha = pulse
    g.fillStyle = colors.text
    g.fillText('space · tap to start', W / 2, promptY + 4)
    g.globalAlpha = 1
    g.fillStyle = colors.faint
    g.fillText(touch.value ? '◀ ▶ run · ▲ jump (hold for height) · esc quits' : '← → run · space jumps (hold for height) · esc quits', W / 2, promptY + 20)
  }
  else if (s.status === 'over' || s.status === 'cleared') {
    g.fillStyle = s.status === 'cleared' ? colors.accent : colors.text
    const best = s.score > 0 && s.score >= props.hi ? ' · NEW BEST' : ''
    g.fillText(s.status === 'cleared' ? `MADE IT HOME · ${s.score}${best}` : `GAME OVER · ${s.score}${best}`, W / 2, promptY)
    if (now - endedAt >= RESTART_LOCKOUT) {
      g.fillStyle = colors.faint
      g.fillText('space · tap for another go   esc quits', W / 2, promptY + 16)
    }
  }
}

/** The ground's y (playfield px) under a level x, for standing things on it. */
function groundY(s: WorldState, x: number): number {
  const col = Math.floor(x / TILE)
  for (let r = 0; r < ROWS; r++) if (tileAt(s.level, col, r) === GROUND) return r * TILE
  return ROWS * TILE
}

// --- time and input ---------------------------------------------------------------------------

function frame(ts: number) {
  const dt = (ts - last) / 1000
  last = ts
  now = ts / 1000
  const s = state
  if (s && !paused) {
    const input: WorldInput = { left: held.left, right: held.right, jump: jumpPressed, jumpHeld: held.jump }
    jumpPressed = false
    const wasLive = s.status === 'running'
    stepWorld(s, dt, input)
    if (s.lives < livesSeen) {
      livesSeen = s.lives
      lostAt = now
      if (s.status === 'running') announce.value = `fell. ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`
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
      ? `made it home at ${s.score}. space or tap for another go; escape quits`
      : `game over at ${s.score}. space or tap for another go; escape quits`
    emit('over', s.score, s.status === 'cleared')
  }
  draw()
  raf = requestAnimationFrame(frame)
}

/** The one-shot button: start, restart after the lockout, or (while running) a jump. */
function press() {
  canvas.value?.focus({ preventScroll: true })
  const s = state
  if (!s) return
  const ended = s.status === 'over' || s.status === 'cleared'
  if (ended && now - endedAt < RESTART_LOCKOUT) return
  if (s.status === 'running') {
    jumpPressed = true
    return
  }
  const started = start(s)
  if (ended) {
    reportedEnd = false
    endedAt = -1
    lostAt = -1
    livesSeen = started.lives
    bestAt = -1
    bestShown = false
  }
  if (started.status === 'running') announce.value = 'running'
}

function onTap() {
  press()
}

function hold(key: 'left' | 'right' | 'jump', down: boolean) {
  if (key === 'jump' && down && !held.jump) press()
  held[key] = down
}

function quit() {
  emit('quit', state?.score ?? 0)
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    e.preventDefault()
    held.left = true
  }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    e.preventDefault()
    held.right = true
  }
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault()
    if (!e.repeat) press()
    held.jump = true
  }
  else if (e.code === 'Escape') {
    e.preventDefault()
    quit()
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') held.left = false
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') held.right = false
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') held.jump = false
}

function onVisibility() {
  paused = document.hidden
  if (!paused) last = performance.now()
  if (paused) {
    held.left = false
    held.right = false
    held.jump = false
  }
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  touch.value = window.matchMedia('(pointer: coarse)').matches
  prepare()
  resize()
  emit('fit', ROWS * TILE + HUD_H)
  ro = new ResizeObserver(resize)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.value?.focus({ preventScroll: true })
  if (import.meta.dev) {
    // Lets a headless check drive the month with the engine's scripted runner and read the result.
    (window as unknown as Record<string, unknown>).__worldDebug = {
      state: () => state,
      status: () => state?.status ?? null,
      score: () => state?.score ?? 0,
      day: () => (state ? dayAt(state) : -1),
      x: () => state?.player.x ?? 0,
      width: () => (state ? levelWidth(state.level) : 0),
      drive: (input: WorldInput) => {
        held.left = input.left
        held.right = input.right
        held.jump = input.jumpHeld
        if (input.jump) press()
      },
      /** One frame of the engine's scripted runner, through the same input path a thumb uses. */
      auto: () => {
        if (!state) return
        const i = autoRun(state)
        held.left = i.left
        held.right = i.right
        held.jump = i.jumpHeld
        if (i.jump) press()
      }
    }
  }
  last = performance.now()
  raf = requestAnimationFrame(frame)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('visibilitychange', onVisibility)
  if (import.meta.dev) delete (window as unknown as Record<string, unknown>).__worldDebug
})

watch(() => [props.build, props.accessories], prepare, { deep: true })

defineExpose({ quit })
</script>

<style scoped>
/* The touch pads: big, translucent, and they must not scroll or zoom the page under a thumb. */
.pad {
  width: 48px;
  height: 48px;
  border: 1px solid var(--color-line-input);
  background: color-mix(in srgb, var(--color-raised) 55%, transparent);
  color: var(--color-dim);
  font-size: 18px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.pad:active {
  color: var(--color-accent);
  border-color: var(--color-accent);
}
</style>
