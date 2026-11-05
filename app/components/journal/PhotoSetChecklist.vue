<script setup lang="ts">
// The slots of a photo set for one day, in shooting order, each marked on file / queued /
// missing — "5 of 8 shot" before the phone goes down (the accutane plan, item 7). Pure display:
// the page owns the set, the date and the queue.
import type { PhotoCategory } from '#shared/utils/photoCategories'
import { photoCategoryLabel } from '#shared/utils/photoCategories'
import { photoSet, type PhotoSetKey } from '#shared/utils/photoSets'
import type { ProgressPhoto } from '~/composables/usePhotoEntries'

const props = defineProps<{
  set: PhotoSetKey
  /** The session day the slots are counted for. */
  date: string
  /** Every photo on file (the component filters to the day). */
  photos: readonly ProgressPhoto[]
  /** Categories of the files queued for upload on that day, not yet on file. */
  queued?: readonly PhotoCategory[]
}>()

const emit = defineEmits<{ pick: [category: PhotoCategory] }>()

type SlotState = 'done' | 'queued' | 'missing'

const slots = computed(() => {
  const onFile = new Set(props.photos.filter(p => p.date === props.date).map(p => p.category))
  const queued = new Set(props.queued ?? [])
  return photoSet(props.set).categories.map((category, i) => ({
    category,
    n: i + 1,
    label: photoCategoryLabel(category),
    state: (onFile.has(category) ? 'done' : queued.has(category) ? 'queued' : 'missing') as SlotState
  }))
})

const shot = computed(() => slots.value.filter(s => s.state !== 'missing').length)
const summary = computed(() => `${shot.value} of ${slots.value.length} shot`)

const STATE_CLASS: Record<SlotState, string> = {
  done: 'border-line-accent text-accent',
  queued: 'border-warn/60 text-warn',
  missing: 'border-line-soft text-faint hover:text-muted hover:border-line-accent'
}
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-1.5">
      <!-- A button per slot: tapping an empty one arms it as the next single upload's category. -->
      <button
        v-for="s in slots"
        :key="s.category"
        type="button"
        class="inline-flex items-center gap-1.5 px-2 py-1 border text-meta uppercase tracking-[0.08em] cursor-pointer transition-colors"
        :class="STATE_CLASS[s.state]"
        :title="s.state === 'done' ? 'on file' : s.state === 'queued' ? 'queued' : 'not shot yet'"
        @click="emit('pick', s.category)"
      >
        <span class="num-display text-label">{{ s.n }}</span>
        <span>{{ s.label }}</span>
        <span
          v-if="s.state !== 'missing'"
          aria-hidden="true"
        >{{ s.state === 'done' ? '✓' : '…' }}</span>
        <span class="sr-only">{{ s.state === 'done' ? ', on file' : s.state === 'queued' ? ', queued' : ', not shot yet' }}</span>
      </button>
    </div>
    <p class="mt-1.5 text-meta text-muted">
      <span :class="shot === slots.length ? 'text-accent' : 'text-dim'">{{ summary }}</span>
      <template v-if="photoSet(set).hint">
        · {{ photoSet(set).hint }}
      </template>
    </p>
  </div>
</template>
