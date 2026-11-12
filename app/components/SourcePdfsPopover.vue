<template>
  <UPopover
    v-if="sources.length"
    v-model:open="listOpen"
    :content="{ side: 'bottom', align }"
  >
    <button
      type="button"
      class="tui-btn"
    >
      SOURCE PDFS ({{ sources.length }}) ▾
    </button>
    <template #content>
      <div class="py-1 max-h-80 overflow-y-auto min-w-64">
        <!-- Still a real link: a modified click or a middle click opens the file in a new tab. A
             plain click or tap reads it in the in-app viewer, which has a way back. -->
        <a
          v-for="src in sorted"
          :key="src"
          :href="src"
          target="_blank"
          data-source-pdf
          class="flex items-center gap-2 text-small px-3 py-1.5 text-dim hover:bg-nav-active hover:text-accent transition-colors"
          @click="view($event, src)"
        >
          <span class="text-faint shrink-0">▪</span>
          <span class="truncate">{{ pdfLabel(src) }}</span>
        </a>
      </div>
    </template>
  </UPopover>
  <PdfViewer
    v-model:open="viewerOpen"
    :src="viewing"
    :title="viewing ? pdfLabel(viewing) : ''"
  />
</template>

<script setup lang="ts">
// Source-PDF list popover shared by the labs and dexa headers (and anywhere else draws carry
// source documents). Newest first.
const props = withDefaults(defineProps<{
  sources: string[]
  align?: 'start' | 'center' | 'end'
}>(), { align: 'start' })

const sorted = computed(() => [...props.sources].reverse())

const listOpen = ref(false)
const viewerOpen = ref(false)
const viewing = ref<string | null>(null)

function view(e: MouseEvent, src: string) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  listOpen.value = false
  viewing.value = src
  viewerOpen.value = true
}
</script>
