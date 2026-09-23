<script setup lang="ts">
// "‹ PREV   page 2 / 7   NEXT ›", the ruled footer under a paged list (see usePagination).
// Hidden when everything fits on one page. The default slot sits after the page count, for a
// page-specific extra like the entries ledger's "jump to date".
defineProps<{ totalPages: number }>()
const page = defineModel<number>('page', { required: true })
</script>

<template>
  <div
    v-if="totalPages > 1"
    class="flex items-center px-4 sm:px-6 py-2.5 border-t border-line text-[11px]"
  >
    <button
      type="button"
      class="cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
      :class="page > 1 ? 'text-accent hover:text-accent-hover' : 'text-faint'"
      :disabled="page <= 1"
      @click="page--"
    >
      ‹ PREV
    </button>
    <span class="mx-auto text-muted">
      <span class="uppercase tracking-[0.06em]">page {{ page }} / {{ totalPages }}</span>
      <slot />
    </span>
    <button
      type="button"
      class="cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
      :class="page < totalPages ? 'text-accent hover:text-accent-hover' : 'text-faint'"
      :disabled="page >= totalPages"
      @click="page++"
    >
      NEXT ›
    </button>
  </div>
</template>
