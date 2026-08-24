<template>
  <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 sm:px-6 py-3 border-b border-line">
    <NuxtLink
      to="/journal"
      class="num-display text-hi text-[19px] leading-none hover:text-accent transition-colors"
    >
      JOURNAL
    </NuxtLink>

    <p
      v-if="meta"
      class="text-[11px] text-muted tracking-[0.06em] uppercase"
    >
      <span v-if="section">/ {{ section }} · </span>{{ meta }}<slot name="meta" />
    </p>
    <p
      v-else-if="section"
      class="text-[11px] text-muted tracking-[0.06em] uppercase"
    >
      / {{ section }}<slot name="meta" />
    </p>

    <div
      v-if="$slots.actions"
      class="flex flex-wrap items-center gap-2 ml-auto"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Title row shared by every /journal/* page: "JOURNAL / TRENDS · 11 METRICS" plus a
// right-aligned actions slot. The hub passes no `section` and gets "JOURNAL <meta>".
defineProps<{
  /** Spoke name, e.g. "TRENDS". Omit on the overview hub. */
  section?: string
  /** Plain-text meta after the section, e.g. "11 METRICS". */
  meta?: string
}>()
</script>
