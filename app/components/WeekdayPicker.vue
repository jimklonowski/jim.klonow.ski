<template>
  <span class="flex items-center gap-1 flex-wrap">
    <button
      v-for="d in WEEKDAY_ORDER"
      :key="d"
      type="button"
      class="w-6 h-6 text-micro border cursor-pointer transition-colors"
      :class="model.includes(d)
        ? 'border-line-accent text-accent bg-inset'
        : 'border-line-soft text-faint hover:text-accent'"
      :aria-pressed="model.includes(d)"
      :aria-label="DAY_NAMES[d]"
      @click="toggle(d)"
    >{{ DAY_LETTERS[d] }}</button>
    <button
      type="button"
      class="ml-1.5 text-meta text-faint hover:text-accent cursor-pointer"
      @click="model = model.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6]"
    >{{ model.length === 7 ? 'none' : 'daily' }}</button>
  </span>
</template>

<script setup lang="ts">
// Weekday chips (Monday-first, the way a dosing week reads), with a daily/none toggle. Indices
// stay the stored 0 = Sunday form; the cycle form draws the same chips inline.
const model = defineModel<number[]>({ required: true })

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toggle(day: number) {
  model.value = model.value.includes(day)
    ? model.value.filter(d => d !== day)
    : [...model.value, day].sort((a, b) => a - b)
}
</script>
