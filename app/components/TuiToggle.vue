<script setup lang="ts" generic="V extends string | number">
// The terminal's inline option switch: `[week] month`, the chosen option bracketed and lit.
// The digest filter, the protocol timeline zoom and the trends range each had a copy. It's the
// TUI's own idiom rather than a tab strip, so it stays plain buttons (aria-pressed) instead of
// UTabs; see TuiTabs for the boxed strip.
//
// Text size and gap come from the caller's class; `buttonClass` sets case and tracking.
defineProps<{
  options: readonly { label: string, value: V }[]
  buttonClass?: string
}>()

const model = defineModel<V>({ required: true })
</script>

<template>
  <span class="flex">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="cursor-pointer"
      :class="[buttonClass, model === opt.value ? 'text-accent' : 'text-faint hover:text-accent']"
      :aria-pressed="model === opt.value"
      @click="model = opt.value"
    >{{ model === opt.value ? `[${opt.label}]` : opt.label }}</button>
  </span>
</template>
