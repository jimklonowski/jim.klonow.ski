<template>
  <UPopover
    v-if="sources.length"
    :content="{ side: 'bottom', align }"
  >
    <UButton
      variant="outline"
      size="xs"
      icon="i-lucide-file-text"
      trailing-icon="i-lucide-chevron-down"
    >
      Source PDFs ({{ sources.length }})
    </UButton>
    <template #content>
      <div class="p-2 max-h-80 overflow-y-auto min-w-56 space-y-0.5">
        <a
          v-for="src in sorted"
          :key="src"
          :href="src"
          target="_blank"
          class="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-elevated hover:text-primary transition-colors"
        >
          <UIcon
            name="i-lucide-file-text"
            class="w-3.5 h-3.5 shrink-0 text-muted"
          />
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
