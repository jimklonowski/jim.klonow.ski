<template>
  <span class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
    <button
      v-if="showNotes"
      type="button"
      class="cursor-pointer"
      :class="notes ? 'text-body' : 'text-faint hover:text-accent'"
      :aria-pressed="notes"
      @click="notes = !notes"
    >notes <span :class="notes ? 'text-accent' : 'text-faint'">[{{ notes ? 'on' : 'off' }}]</span></button>
    <span
      v-if="showNotes"
      class="text-ghost"
    >·</span>
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
withDefaults(defineProps<{
  /** Offer the protocol-notes toggle (the page draws annotations). */
  showNotes?: boolean
}>(), { showNotes: false })

const { days, smooth, notes } = useTrendRange()
</script>
