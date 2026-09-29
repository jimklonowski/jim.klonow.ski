<template>
  <!-- Every photo in a category, in date order, one frame at a time: drag the rail, step with
       ◂ ▸ or ← →, or play it through. The before/after slider answers "how far from A to B";
       this answers "how did it get there". -->
  <div class="max-w-[65vh] mx-auto">
    <div class="relative aspect-square border border-line-soft bg-inset overflow-hidden">
      <img
        v-if="current"
        :src="current.url"
        :alt="`${categoryLabel} photo from ${formatDate(current.date)}`"
        class="w-full h-full object-cover"
        :style="frameStyle(current)"
        draggable="false"
      >
      <div class="absolute bottom-0 inset-x-0 flex items-baseline justify-between gap-3 px-2.5 py-1.5 bg-bg/85 text-[11px]">
        <span class="num-display text-[13px] text-hi">{{ current ? formatDateTerse(current.date) : '' }}</span>
        <span class="text-muted truncate">{{ caption }}</span>
      </div>
    </div>

    <div class="flex items-center gap-2 mt-2.5">
      <button
        type="button"
        class="tui-btn px-2.5 disabled:opacity-40 disabled:cursor-default"
        :disabled="index === 0"
        aria-label="Previous photo"
        @click="step(-1)"
      >
        ◂
      </button>
      <button
        type="button"
        class="tui-btn px-2.5"
        :aria-label="playing ? 'Pause' : 'Play through'"
        :aria-pressed="playing"
        @click="togglePlay"
      >
        {{ playing ? '❚❚' : '▶' }}
      </button>
      <USlider
        v-model="index"
        :min="0"
        :max="last"
        :step="1"
        class="flex-1"
        aria-label="Photo"
        :aria-valuetext="current ? formatDate(current.date) : ''"
      />
      <button
        type="button"
        class="tui-btn px-2.5 disabled:opacity-40 disabled:cursor-default"
        :disabled="index === last"
        aria-label="Next photo"
        @click="step(1)"
      >
        ▸
      </button>
    </div>
    <p class="mt-1.5 text-[10.5px] text-ghost text-center hidden sm:block">
      ← → step · drag the rail to scrub
    </p>
  </div>
</template>

<script setup lang="ts">
import { diffDays, shiftDays } from '#shared/utils/dates'
import type { ProgressPhoto } from '~/composables/usePhotoEntries'

const props = defineProps<{
  /** One category's photos, oldest first. */
  photos: ProgressPhoto[]
  categoryLabel: string
  /** Logged weight by date (YYYY-MM-DD), for the caption. */
  weights: Map<string, number>
  /** The page's non-destructive reframe transform. */
  frameStyle: (photo: ProgressPhoto) => Record<string, string>
}>()

const index = ref(Math.max(0, props.photos.length - 1))
const last = computed(() => Math.max(0, props.photos.length - 1))
const current = computed(() => props.photos[index.value] ?? null)

// A new category (or a delete) changes the list under the playhead: land on the newest photo.
watch(() => props.photos, (list) => {
  stop()
  index.value = Math.max(0, list.length - 1)
})

// Weight within a few days of the photo: shots and weigh-ins rarely fall on the same morning.
const WEIGHT_WINDOW_DAYS = 3
function weightNear(date: string): number | null {
  for (let d = 0; d <= WEIGHT_WINDOW_DAYS; d++) {
    const w = props.weights.get(shiftDays(date, -d)) ?? props.weights.get(shiftDays(date, d))
    if (w != null) return w
  }
  return null
}

const caption = computed(() => {
  const photo = current.value
  const first = props.photos[0]
  if (!photo || !first) return ''
  const parts = [`${index.value + 1} / ${props.photos.length}`]
  const day = diffDays(first.date, photo.date)
  if (day > 0) parts.push(`day ${day}`)
  const w = weightNear(photo.date)
  const w0 = weightNear(first.date)
  if (w != null) {
    const delta = w0 != null && index.value > 0 ? w - w0 : null
    parts.push(delta != null ? `${w.toFixed(1)} lb (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})` : `${w.toFixed(1)} lb`)
  }
  return parts.join(' · ')
})

function step(dir: -1 | 1) {
  index.value = Math.min(last.value, Math.max(0, index.value + dir))
}

// Load the neighbours ahead of time, so stepping and playback don't flash an empty frame.
if (import.meta.client) {
  watch(index, (i) => {
    for (const j of [i - 1, i + 1, i + 2]) {
      const url = props.photos[j]?.url
      if (url) new Image().src = url
    }
  }, { immediate: true })
}

// --- playback: one frame per beat, stopping on the newest photo ---
const FRAME_MS = 700
const playing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function stop() {
  playing.value = false
  clearInterval(timer)
  timer = undefined
}

function togglePlay() {
  if (playing.value) return stop()
  // Playing from the end replays from the start.
  if (index.value === last.value) index.value = 0
  playing.value = true
  timer = setInterval(() => {
    if (index.value >= last.value) return stop()
    index.value++
  }, FRAME_MS)
}

// ← → step from anywhere on the page, except inside a field, a dialog, or a slider (which has its
// own arrow keys) — the same rule as the labs time scrubber.
function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const target = e.target instanceof HTMLElement ? e.target : null
  if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="slider"]')) return
  e.preventDefault()
  stop()
  step(e.key === 'ArrowLeft' ? -1 : 1)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stop()
})
</script>
