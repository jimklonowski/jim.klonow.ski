<template>
  <span class="inline-flex leading-none">
    <span class="sr-only">{{ value }}</span>
    <span
      v-for="(ch, i) in chars"
      :key="i"
      aria-hidden="true"
      class="block h-[1em] overflow-hidden"
      :class="ch.digit === null ? '' : 'w-[1ch]'"
    >
      <span
        v-if="ch.digit !== null"
        class="tui-reel block"
        :style="{ transform: `translateY(-${ch.digit}em)` }"
      >
        <span
          v-for="d in DIGITS"
          :key="d"
          class="block h-[1em]"
        >{{ d }}</span>
      </span>
      <template v-else>{{ ch.text }}</template>
    </span>
  </span>
</template>

<script setup lang="ts">
// A number whose digits roll odometer-style when the value changes — the big readouts on the
// labs marker cards while the time scrubber moves. Each digit is a 0–9 reel translated to the
// current digit, so a value change is just a re-render and the CSS transition does the rolling.
// Sized in em, so it takes the parent's font-size; the parent should use a monospace face
// (1ch per digit keeps the columns from shifting).
const props = defineProps<{ value: string }>()

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

const chars = computed(() =>
  props.value.split('').map(text => ({ text, digit: /\d/.test(text) ? Number(text) : null }))
)
</script>

<style scoped>
.tui-reel {
  transition: transform 420ms cubic-bezier(0.22, 0.8, 0.2, 1);
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .tui-reel {
    transition: none;
  }
}
</style>
