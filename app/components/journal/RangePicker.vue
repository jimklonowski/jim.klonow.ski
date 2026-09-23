<template>
  <span class="flex items-center gap-2.5 text-[11px]">
    <button
      type="button"
      class="cursor-pointer"
      :class="smooth ? 'text-body' : 'text-faint hover:text-accent'"
      :aria-pressed="smooth"
      @click="smooth = !smooth"
    >7d avg <span :class="smooth ? 'text-accent' : 'text-faint'">[{{ smooth ? 'on' : 'off' }}]</span></button>
    <span class="text-ghost">·</span>
    <TuiToggle
      v-model="days"
      :options="TREND_RANGES.map(r => ({ label: r.label, value: r.days }))"
      class="gap-2"
    />
  </span>
</template>

<script setup lang="ts">
const { days, smooth } = useTrendRange()
</script>
