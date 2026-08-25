<template>
  <UEmpty
    v-if="error"
    :title="title"
    :description="detail"
    :ui="tui"
    class="border border-dashed border-line-input my-4 mx-4 sm:mx-6"
  >
    <template #actions>
      <button
        type="button"
        class="tui-btn tui-btn-accent"
        @click="emit('retry')"
      >
        ⟳ RETRY
      </button>
    </template>
  </UEmpty>

  <UEmpty
    v-else-if="empty"
    :title="emptyTitle"
    :description="emptyDescription"
    :ui="tui"
    class="border border-dashed border-line-input my-4 mx-4 sm:mx-6"
  >
    <template
      v-if="$slots.actions"
      #actions
    >
      <slot name="actions" />
    </template>
  </UEmpty>
</template>

<script setup lang="ts">
// Shared fetch-failure / no-data panel for the read pages. Renders nothing when the page has
// data — drop it above the content and gate the content on `v-else` (or leave it ungated and
// let it show only on failure). The pages await their composables in setup, so by the time
// this renders the request has settled; in-flight loading is the NuxtLoadingIndicator's job.
const props = withDefaults(defineProps<{
  /** The composable's error ref value; truthy means the fetch failed. */
  error?: unknown
  /** True when the fetch succeeded but there is nothing to show. */
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  // `error` deliberately has no default: an `unknown`-typed default trips vue-tsc's
  // factory-function rule. An omitted prop is undefined, which is falsy — same behavior.
  empty: false,
  emptyTitle: 'No data yet',
  emptyDescription: ''
})

const emit = defineEmits<{ retry: [] }>()

const title = 'Data fetch failed'

// Surface the status line when the error carries one ("500 Internal Server Error"), but never
// dump a stack or HTML error page into the UI.
const detail = computed(() => {
  const e = props.error as { statusCode?: number, statusMessage?: string, message?: string } | null
  if (!e) return ''
  const msg = e.statusMessage || (typeof e.message === 'string' && e.message.length <= 120 ? e.message : '')
  return [e.statusCode, msg].filter(Boolean).join(' · ') || 'The request did not complete — the network or Worker may be having a moment.'
})

// Phosphor Terminal skin over UEmpty's slots.
const tui = {
  root: 'py-8',
  title: 'text-[13px] text-warn uppercase tracking-[0.12em] font-medium',
  description: 'text-[12px] text-muted mt-1.5',
  body: 'mt-3'
}
</script>
