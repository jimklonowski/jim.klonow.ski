<template>
  <UPopover
    v-if="sources.length"
    :content="{ side: 'bottom', align }"
    :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
  >
    <button
      type="button"
      class="tui-btn"
    >
      SOURCE PDFS ({{ sources.length }}) ▾
    </button>
    <template #content>
      <div class="py-1 max-h-80 overflow-y-auto min-w-64">
        <a
          v-for="src in sorted"
          :key="src"
          :href="src"
          target="_blank"
          class="flex items-center gap-2 text-[12px] px-3 py-1.5 text-dim hover:bg-nav-active hover:text-accent transition-colors"
        >
          <span class="text-faint shrink-0">▪</span>
          <span class="truncate">{{ pdfLabel(src) }}</span>
        </a>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
// Source-PDF list popover shared by the labs and dexa headers (and anywhere else draws carry
// source documents). Newest first.
const props = withDefaults(defineProps<{
  sources: string[]
  align?: 'start' | 'center' | 'end'
}>(), { align: 'start' })

const sorted = computed(() => [...props.sources].reverse())
</script>
