<template>
  <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 sm:px-6 py-3 border-b border-line">
    <!-- Plain text, unlike JournalHeader's hub link — /tools has no hub page yet
         (the naked URL redirects to the calculator, see nuxt.config routeRules). -->
    <span class="num-display text-hi text-[19px] leading-none">TOOLS</span>

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
// Title row shared by every /tools/* page, mirroring journal/Header.vue:
// "TOOLS / CALCULATOR · <meta>" plus a right-aligned actions slot.
defineProps<{
  /** Tool name, e.g. "CALCULATOR". */
  section?: string
  /** Plain-text meta after the section. */
  meta?: string
}>()
</script>
