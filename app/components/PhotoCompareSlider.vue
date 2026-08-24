<template>
  <div
    ref="containerRef"
    class="relative w-full aspect-square overflow-hidden border border-line select-none touch-none cursor-ew-resize"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img
      :src="afterUrl"
      class="absolute inset-0 w-full h-full object-cover pointer-events-none"
      :style="afterStyle"
      draggable="false"
    >
    <img
      :src="beforeUrl"
      class="absolute inset-0 w-full h-full object-cover pointer-events-none"
      :style="{ clipPath: `inset(0 ${100 - pct}% 0 0)`, ...beforeStyle }"
      draggable="false"
    >

    <!-- Divider + drag handle -->
    <div
      class="absolute top-0 bottom-0 w-px bg-accent pointer-events-none"
      :style="{ left: `${pct}%` }"
    />
    <div
      class="absolute top-1/2 w-5 h-5 -mt-2.5 -ml-2.5 bg-bg border border-accent flex items-center justify-center text-[10px] text-accent pointer-events-none"
      :style="{ left: `${pct}%` }"
    >
      ‹›
    </div>

    <!-- Labels -->
    <span
      v-if="beforeLabel"
      class="absolute bottom-2 left-2 text-[10.5px] px-1.5 py-0.5 bg-bg/85 border border-line-input text-dim pointer-events-none"
    >
      {{ beforeLabel }}
    </span>
    <span
      v-if="afterLabel"
      class="absolute bottom-2 right-2 text-[10.5px] px-1.5 py-0.5 bg-bg/85 border border-line-input text-dim pointer-events-none"
    >
      {{ afterLabel }}
    </span>

    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  beforeUrl: string
  afterUrl: string
  beforeLabel?: string
  afterLabel?: string
  beforeStyle?: Record<string, string>
  afterStyle?: Record<string, string>
}>()

const containerRef = ref<HTMLElement | null>(null)
const pct = ref(50)
const dragging = ref(false)

// Recenter whenever a different pair is being compared.
watch(() => [props.beforeUrl, props.afterUrl], () => {
  pct.value = 50
})

function updateFromClientX(clientX: number) {
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const raw = ((clientX - rect.left) / rect.width) * 100
  pct.value = Math.min(100, Math.max(0, raw))
}

function onPointerDown(e: PointerEvent) {
  dragging.value = true
  containerRef.value?.setPointerCapture(e.pointerId)
  updateFromClientX(e.clientX)
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  updateFromClientX(e.clientX)
}
function onPointerUp() {
  dragging.value = false
}
</script>
