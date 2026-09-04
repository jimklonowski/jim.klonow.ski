<template>
  <div
    class="sticky bottom-0 z-10 bg-status border-t transition-colors select-none"
    :class="scrubbed ? 'border-line-accent' : 'border-line'"
  >
    <div class="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2 px-4 sm:px-6 py-2.5">
      <!-- Readout: which draw the page is showing -->
      <div class="flex items-center justify-between gap-3 sm:w-65 lg:w-87.5 sm:shrink-0">
        <div class="min-w-0">
          <p class="tui-label whitespace-nowrap">
            {{ scrubbed ? `viewing draw ${viewedIndex + 1} of ${dates.length}` : `latest draw · ${dates.length} of ${dates.length}` }}
            <!-- Fasting moves up here on a phone, where the date row has no room for it -->
            <span class="sm:hidden">· {{ fastingText(viewedIndex) }}</span>
          </p>
          <p class="flex items-baseline gap-2.5 min-w-0">
            <span
              class="num-display text-[18px] leading-none whitespace-nowrap transition-colors"
              :class="scrubbed ? 'text-accent' : ''"
            >{{ formatDateTerse(viewedEntry.date) }}</span>
            <span class="text-[10.5px] text-muted tracking-[0.06em] uppercase truncate">
              <span class="hidden sm:inline">{{ fastingText(viewedIndex) }} · </span>{{ flagText(viewedIndex) }}
            </span>
          </p>
        </div>
        <button
          v-if="scrubbed"
          type="button"
          class="tui-btn tui-btn-accent sm:hidden"
          @click="go(last)"
        >
          ↩ LATEST
        </button>
      </div>

      <!-- Rail -->
      <div class="flex items-center gap-1.5 flex-1 min-w-0">
        <button
          type="button"
          class="tui-btn px-2.5 sm:hidden disabled:opacity-40 disabled:cursor-default"
          :disabled="viewedIndex === 0"
          aria-label="Previous draw"
          v-on="prevStep"
        >
          ◂
        </button>

        <div class="flex-1 min-w-0 px-5">
          <div
            ref="rail"
            class="relative h-11"
          >
            <!-- Ticks and flag dots. No pointer events: the slider underneath owns the drag. -->
            <div
              class="absolute inset-0 pointer-events-none"
              aria-hidden="true"
            >
              <div
                v-for="t in ticks"
                :key="t.date"
                class="absolute top-0 bottom-0 w-0"
                :style="{ left: `${t.left}%` }"
              >
                <span
                  v-if="t.flagColor"
                  class="absolute left-[-1.5px] top-1.5 w-0.75 h-0.75 rounded-full"
                  :style="{ background: t.flagColor }"
                />
                <span
                  class="absolute -left-px w-0.5 transition-[top,height,background-color] duration-200"
                  :class="t.active
                    ? 'top-3.5 h-4 bg-accent glow-dot'
                    : t.reached ? 'top-4.25 h-2.5 bg-[#5d7a6d]' : 'top-4.25 h-2.5 bg-line-field'"
                />
              </div>
            </div>

            <!-- The slider is the rail: hairline track, elapsed range, and a thumb kept invisible
                 (the active tick above draws the playhead) that still carries drag, focus, aria
                 and its own arrow/Home/End keys. One step per draw. -->
            <USlider
              :model-value="viewedIndex"
              :min="0"
              :max="last"
              :step="1"
              :ui="SLIDER_UI"
              aria-label="Viewed draw"
              :aria-valuetext="formatDate(viewedEntry.date)"
              @update:model-value="onSlide"
            />

            <!-- Date labels: click to jump, hover for that draw's details -->
            <div class="absolute left-0 right-0 top-7.75 pointer-events-none">
              <UTooltip
                v-for="t in ticks"
                :key="t.date"
                :delay-duration="0"
                :ui="TOOLTIP_UI"
              >
                <template #content>
                  <span class="flex flex-col gap-px text-[10.5px] leading-normal">
                    <span class="num-display text-[13px]">{{ formatDateTerse(t.date) }}</span>
                    <span class="text-muted tracking-[0.06em] uppercase">{{ drawMeta(t.index) }}</span>
                  </span>
                </template>
                <button
                  type="button"
                  class="absolute -translate-x-1/2 pointer-events-auto text-[10px] tracking-[0.06em] uppercase whitespace-nowrap cursor-pointer hover:text-accent transition-colors"
                  :class="[
                    t.active ? 'text-accent font-medium' : t.reached ? 'text-[#5d7a6d]' : 'text-ghost',
                    t.keyLabel ? '' : t.showLabel ? 'max-sm:hidden' : 'hidden'
                  ]"
                  :style="{ left: `${t.left}%` }"
                  @click="go(t.index)"
                >
                  {{ t.label }}
                </button>
              </UTooltip>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="tui-btn px-2.5 sm:hidden disabled:opacity-40 disabled:cursor-default"
          :disabled="!scrubbed"
          aria-label="Next draw"
          v-on="nextStep"
        >
          ▸
        </button>
      </div>

      <!-- Controls -->
      <div class="hidden sm:flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="tui-btn disabled:opacity-40 disabled:cursor-default"
          :disabled="viewedIndex === 0"
          v-on="prevStep"
        >
          ◂ PREV
        </button>
        <button
          type="button"
          class="tui-btn disabled:opacity-40 disabled:cursor-default"
          :disabled="!scrubbed"
          v-on="nextStep"
        >
          NEXT ▸
        </button>
        <!-- Kept in the layout while hidden so the rail doesn't resize on the first scrub -->
        <button
          type="button"
          class="tui-btn tui-btn-accent"
          :class="scrubbed ? '' : 'invisible'"
          :tabindex="scrubbed ? undefined : -1"
          @click="go(last)"
        >
          ↩ LATEST
        </button>
        <span class="hidden lg:inline text-[10px] text-ghost whitespace-nowrap ml-2">← → step draws</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LabsEntry } from '~/composables/useLabsEntries'
import { BIOMARKERS } from '~/data/biomarkers'
import { drawFlags } from '#shared/utils/labsTimeline'

// The time-travel dock under /labs: one tick per draw, a playhead you can drag, click or
// arrow-key between draws, and a readout of what the page is showing. The model is the viewed
// draw's date, or null for the latest — the page owns it (in the URL) and cuts everything above
// the dock off at that date.
//
// Ticks are evenly spaced rather than laid out by date: the history runs back years, so a true
// timeline would pile the recent monthly draws — the ones you actually scrub between — into a
// sliver at the right edge. The tooltip and readout carry the real dates.
const props = defineProps<{
  /** Every draw, any order. */
  entries: LabsEntry[]
}>()

const viewedDate = defineModel<string | null>({ required: true })

const sorted = computed(() => [...props.entries].sort((a, b) => a.date.localeCompare(b.date)))
const dates = computed(() => sorted.value.map(e => e.date))
const last = computed(() => dates.value.length - 1)
const viewedIndex = computed(() => {
  const i = viewedDate.value ? dates.value.indexOf(viewedDate.value) : -1
  return i === -1 ? last.value : i
})
const viewedEntry = computed(() => sorted.value[viewedIndex.value]!)
const scrubbed = computed(() => viewedIndex.value !== last.value)

function go(index: number) {
  const i = Math.max(0, Math.min(last.value, index))
  viewedDate.value = i === last.value ? null : dates.value[i]!
}

function onSlide(value: number | number[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value
  if (v != null) go(Math.round(v))
}

function fastingText(index: number) {
  return sorted.value[index]!.fasting ? 'fasting' : 'non-fasting'
}
function flagText(index: number) {
  const flags = drawFlags(sorted.value[index]!.markers, BIOMARKERS)
  return flags.high + flags.low ? `${flags.high} high / ${flags.low} low` : 'no flags'
}
/** Tooltip line: fasting state, how big the panel was, and its flags. */
function drawMeta(index: number) {
  const { count } = drawFlags(sorted.value[index]!.markers, BIOMARKERS)
  return `${fastingText(index)} · ${count} markers · ${flagText(index)}`
}

// Labels read month + day, or month + year once the history spans more than one year — "JUN 27"
// nine years ago and "JUN 27" last month would otherwise look like the same draw.
const spansYears = computed(() => new Set(dates.value.map(d => d.slice(0, 4))).size > 1)
function tickLabel(date: string) {
  if (!spansYears.value) return formatDate(date, 'monthDay').toUpperCase()
  const month = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })
  return `${month} ’${date.slice(2, 4)}`.toUpperCase()
}

// Label thinning: budget ~52px per label and show every nth, plus the first, last and active
// ticks always. Below sm only those three show at all (see the template).
const rail = ref<HTMLElement | null>(null)
const railWidth = ref(0)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!rail.value) return
  observer = new ResizeObserver(([entry]) => {
    railWidth.value = entry?.contentRect.width ?? 0
  })
  observer.observe(rail.value)
})
onBeforeUnmount(() => observer?.disconnect())
const stride = computed(() => railWidth.value ? Math.max(1, Math.ceil((dates.value.length * 52) / railWidth.value)) : 1)

const ticks = computed(() => dates.value.map((date, index) => {
  const flags = drawFlags(sorted.value[index]!.markers, BIOMARKERS)
  const active = index === viewedIndex.value
  // Within a stride of the playhead, the active label wins and the first/last label stands down.
  const nearActive = Math.abs(index - viewedIndex.value) < stride.value
  const keyLabel = active || ((index === 0 || index === last.value) && !nearActive)
  return {
    index,
    date,
    label: tickLabel(date),
    left: last.value ? (index / last.value) * 100 : 0,
    active,
    reached: index <= viewedIndex.value,
    keyLabel,
    // A stride label stands down when it would crowd the last label or the active one.
    showLabel: keyLabel || (
      index % stride.value === 0
      && last.value - index >= stride.value
      && !nearActive
    ),
    flagColor: flags.high ? '#e86a5e' : flags.low ? '#e8b34b' : null
  }
}))

// ← → step draws from anywhere on the page, except inside a text field, a dialog, or the slider
// thumb itself (which already steps on its own arrows).
function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const target = e.target instanceof HTMLElement ? e.target : null
  if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="slider"]')) return
  e.preventDefault()
  go(viewedIndex.value + (e.key === 'ArrowLeft' ? -1 : 1))
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Press-and-hold on a step button auto-advances, like a held arrow key. A tap still steps once on
// release, so a touch that turns into a scroll never steps; holding past a beat starts repeating
// until you let go or the rail runs out. The click that lands when a hold is released is the end
// of the press, not a fresh step, so it's swallowed — except keyboard activation (detail 0),
// which never comes from a hold.
const HOLD_DELAY_MS = 400
const HOLD_STEP_MS = 200
let holdTimer: ReturnType<typeof setTimeout> | undefined
let holdRepeat: ReturnType<typeof setInterval> | undefined
let held = false

function stopHold() {
  clearTimeout(holdTimer)
  clearInterval(holdRepeat)
  holdTimer = holdRepeat = undefined
  window.removeEventListener('pointerup', stopHold)
  window.removeEventListener('pointercancel', stopHold)
}

function stepHandlers(dir: -1 | 1) {
  const step = () => {
    const next = viewedIndex.value + dir
    if (next < 0 || next > last.value) return false
    go(next)
    return true
  }
  return {
    pointerdown(e: PointerEvent) {
      if (e.button !== 0) return
      held = false
      stopHold()
      // Listen on the window: the button may drift out from under the finger, or disable itself
      // when the hold reaches the end of the rail, and either way the release must still land.
      window.addEventListener('pointerup', stopHold)
      window.addEventListener('pointercancel', stopHold)
      holdTimer = setTimeout(() => {
        held = true
        if (!step()) return stopHold()
        holdRepeat = setInterval(() => {
          if (!step()) stopHold()
        }, HOLD_STEP_MS)
      }, HOLD_DELAY_MS)
    },
    click(e: MouseEvent) {
      if (held && e.detail !== 0) {
        held = false
        return
      }
      step()
    }
  }
}
const prevStep = stepHandlers(-1)
const nextStep = stepHandlers(1)
onBeforeUnmount(stopHold)

// Nuxt UI's slider restyled as the rail. The thumb stays transparent — the active tick draws the
// playhead — but keeps its hit area and shows an outline when focused from the keyboard.
const SLIDER_UI = {
  root: 'absolute inset-0 h-11 cursor-ew-resize',
  track: 'h-px bg-line-accent rounded-none',
  range: 'bg-faint rounded-none',
  thumb: 'rounded-none bg-transparent ring-0 opacity-0 focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent'
}
const TOOLTIP_UI = {
  content: 'h-auto px-2.5 py-1.5 bg-raised border border-line-accent ring-0 rounded-none shadow-none'
}
</script>
