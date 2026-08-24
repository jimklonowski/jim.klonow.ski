<template>
  <div class="tui-label flex items-baseline justify-between gap-3 min-w-0 select-none">
    <span class="truncate">┌ {{ label }}{{ dashes ? ` ${'─'.repeat(dashes)}` : '' }}</span>
    <span
      v-if="$slots.default"
      class="shrink-0 normal-case tracking-normal"
    ><slot /></span>
  </div>
</template>

<script setup lang="ts">
// TUI-ruled section header: `┌ LABEL ─────`. Every panel header in the Phosphor
// Terminal system uses this. Optional default slot renders right-aligned meta.
withDefaults(defineProps<{
  label: string
  dashes?: number
}>(), {
  dashes: 14
})
</script>
