<template>
  <div>
    <TuiHeader
      :label="label"
      :dashes="dashes"
    >
      <span
        v-if="meta"
        class="text-[10.5px] text-muted"
      >{{ meta }}</span>
    </TuiHeader>

    <div class="bubble relative mt-3 bg-raised border border-line-input px-3.25 pt-1 pb-2.75">
      <div
        class="text-[12px] leading-[1.7] text-dim digest-prose"
        :class="{ wipe: wiping }"
      >
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// TICKER's digest panel (design_handoff_ticker, amended per Jim): TUI header and a
// full-width speech bubble. The companion itself lives in the digest column's footer
// (home/Digest.vue), which carries the speech chevron — a tail on a bubble here would
// scroll out of view with it.

withDefaults(defineProps<{
  label: string
  /** Right-aligned header meta, e.g. the period range. */
  meta?: string
  dashes?: number
}>(), {
  meta: '',
  dashes: 9
})

// --- Digest-arrival typing wipe -------------------------------------------
// clip-path sweep (~1.2s) that reveals the bubble text left-to-right; reduced
// motion disables the animation so the text simply appears.
const wiping = ref(false)
let wipeTimer: ReturnType<typeof setTimeout> | undefined

function wipe() {
  wiping.value = false
  clearTimeout(wipeTimer)
  // Re-add on the next frame so back-to-back wipes restart the animation.
  requestAnimationFrame(() => {
    wiping.value = true
    wipeTimer = setTimeout(() => {
      wiping.value = false
    }, 1300)
  })
}

onUnmounted(() => clearTimeout(wipeTimer))

defineExpose({ wipe })
</script>

<style scoped>
/* comark 0.6 wraps rendered markdown in .comark-content and gives every <p> a 20px
   top margin, which collapses out of the wrappers and pushes the whole prose block
   down — kill it on the bubble's first/last block so the padding is what you see.
   (:deep — the markdown renders inside slotted content, outside this scope.) */
.bubble :deep(.comark-content > :first-child) {
  margin-top: 0;
}
.bubble :deep(.comark-content > :last-child) {
  margin-bottom: 0;
}

.wipe {
  animation: ticker-type-on 1.2s steps(24, end);
}
@keyframes ticker-type-on {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0 0 0 0); }
}

@media (prefers-reduced-motion: reduce) {
  .wipe {
    animation: none;
  }
}
</style>
