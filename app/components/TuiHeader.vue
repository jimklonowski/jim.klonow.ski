<template>
  <div class="tui-label flex items-baseline justify-between gap-3 min-w-0 select-none">
    <span class="truncate">┌ {{ label }}{{ !fill && dashes ? ` ${'─'.repeat(dashes)}` : '' }}</span>
    <!-- `fill`: the rule runs to the right edge (or to the slot) whatever the panel's width — a
         long run of the same glyph, clipped. Decorative, so hidden from assistive tech. -->
    <span
      v-if="fill"
      aria-hidden="true"
      class="flex-1 min-w-[2ch] -ml-1.5 overflow-hidden whitespace-nowrap"
    >{{ RULE }}</span>
    <span
      v-if="$slots.default"
      class="shrink-0 normal-case tracking-normal"
    ><slot /></span>
  </div>
</template>

<script setup lang="ts">
// TUI-ruled section header: `┌ LABEL ─────`. Every panel header in the Phosphor
// Terminal system uses this. Optional default slot renders right-aligned meta.
// `dashes` is a fixed count (tuned per label on most pages); `fill` makes the rule span the
// remaining width instead, so stacked headers in one column end at the same edge.
withDefaults(defineProps<{
  label: string
  dashes?: number
  fill?: boolean
}>(), {
  dashes: 14,
  fill: false
})

const RULE = '─'.repeat(240)
</script>
