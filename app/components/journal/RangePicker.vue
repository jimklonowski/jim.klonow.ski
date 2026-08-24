<template>
  <span class="flex items-center gap-2.5 text-[11px]">
    <button
      type="button"
      class="cursor-pointer"
      :class="smooth ? 'text-body' : 'text-faint hover:text-accent'"
      @click="smooth = !smooth"
    >7d avg <span :class="smooth ? 'text-accent' : 'text-faint'">[{{ smooth ? 'on' : 'off' }}]</span></button>
    <span class="text-ghost">·</span>
    <span class="flex gap-2">
      <button
        v-for="opt in TREND_RANGES"
        :key="opt.days"
        type="button"
        class="cursor-pointer"
        :class="days === opt.days ? 'text-accent' : 'text-faint hover:text-accent'"
        @click="days = opt.days"
      >{{ days === opt.days ? `[${opt.label}]` : opt.label }}</button>
    </span>
  </span>
</template>

<script setup lang="ts">
const { days, smooth } = useTrendRange()
</script>
