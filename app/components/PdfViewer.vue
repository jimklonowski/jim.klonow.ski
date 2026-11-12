<template>
  <!-- A source PDF read inside the app. Opened as a plain link, a PDF replaces the page, and the
       home-screen app has no back button to return with; here it is a full-screen sheet with a
       close button, the pages drawn by pdf.js (app/utils/pdfRender.ts, loaded on first open). -->
  <UModal
    v-model:open="open"
    fullscreen
    :title="title"
    description="Source document"
    :ui="{ description: 'sr-only', body: 'p-0 sm:p-0 flex flex-col min-h-0' }"
  >
    <template #body>
      <div
        data-pdf-viewer
        class="flex flex-col min-h-0 flex-1"
      >
        <div class="flex items-center gap-3 px-3 py-2 border-b border-line-soft text-meta text-muted">
          <span data-pdf-status>{{ status }}</span>
          <span class="flex-1" />
          <button
            type="button"
            class="tui-btn"
            :aria-pressed="zoomed"
            data-pdf-zoom
            @click="zoomed = !zoomed"
          >
            {{ zoomed ? 'FIT' : 'ZOOM 2×' }}
          </button>
          <button
            v-if="canShare"
            type="button"
            class="tui-btn"
            data-pdf-share
            @click="share"
          >
            SHARE
          </button>
        </div>
        <div class="flex-1 min-h-0 overflow-auto overscroll-contain bg-inset">
          <div
            ref="sheet"
            class="flex flex-col gap-2 p-2 mx-auto"
            :class="zoomed ? 'w-[200%] max-w-none' : 'w-full max-w-4xl'"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  /** Same-origin URL of the PDF (the session cookie rides along). */
  src: string | null
  title: string
}>()

const open = defineModel<boolean>('open', { default: false })

const sheet = useTemplateRef<HTMLElement>('sheet')
const zoomed = ref(false)
const status = ref('')
const file = shallowRef<File | null>(null)
const canShare = computed(() => !!file.value && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file.value] }))

let handle: { destroy: () => void } | null = null
// Each open gets a number; a load that finishes after the sheet closed or moved on is dropped.
let run = 0

function reset() {
  run++
  handle?.destroy()
  handle = null
  file.value = null
  zoomed.value = false
  sheet.value?.replaceChildren()
}

async function load(src: string) {
  const mine = ++run
  status.value = 'Loading…'
  try {
    const res = await fetch(src, { credentials: 'same-origin' })
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Sign in again to open this document.' : `The document could not be loaded (${res.status}).`)
    const blob = await res.blob()
    if (mine !== run) return
    file.value = new File([blob], `${props.title || 'document'}.pdf`, { type: 'application/pdf' })
    const { openPdf } = await import('~/utils/pdfRender')
    const pdf = await openPdf(await blob.arrayBuffer())
    if (mine !== run) return pdf.destroy()
    handle = pdf
    // The sheet mounts with the modal; wait for it before measuring.
    await nextTick()
    const el = sheet.value
    if (!el) return
    status.value = `${pdf.pages} page${pdf.pages === 1 ? '' : 's'}`
    await pdf.renderInto(el, Math.max(280, el.clientWidth - 16), () => mine !== run)
  }
  catch (e) {
    if (mine === run) status.value = e instanceof Error && e.message ? e.message : 'The document could not be shown.'
  }
}

watch([open, () => props.src], ([isOpen, src]) => {
  reset()
  if (isOpen && src) void load(src)
})

async function share() {
  if (!file.value) return
  try {
    await navigator.share({ files: [file.value], title: props.title })
  }
  catch {
    // Dismissing the share sheet rejects; nothing to report.
  }
}

onBeforeUnmount(reset)
</script>
