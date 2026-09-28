<template>
  <div>
    <button
      type="button"
      class="tui-btn tui-btn-accent w-full justify-center"
      :disabled="disabled"
      @click="emit('new')"
    >
      + NEW CONVERSATION
    </button>

    <TuiHeader
      label="SAVED"
      :dashes="4"
      class="mt-4"
    >
      <span class="text-[10.5px] text-muted normal-case">{{ threads.length || '' }}</span>
    </TuiHeader>

    <ul
      v-if="threads.length"
      class="mt-2 space-y-px"
    >
      <li
        v-for="t in threads"
        :key="t.id"
        class="group flex items-start gap-2 px-2 py-1.5 border-l-2 transition-colors"
        :class="t.id === activeId ? 'border-accent bg-row-hover' : 'border-transparent hover:bg-row-hover'"
      >
        <button
          type="button"
          class="flex-1 min-w-0 text-left cursor-pointer disabled:cursor-default"
          :disabled="disabled"
          @click="emit('open', t.id)"
        >
          <span
            class="block text-[12px] leading-snug line-clamp-2"
            :class="t.id === activeId ? 'text-hi' : 'text-dim'"
          >{{ t.title }}</span>
          <span class="block mt-0.5 text-[10.5px] text-faint">{{ when(t.updatedAt) }} · {{ t.exchanges }} {{ t.exchanges === 1 ? 'question' : 'questions' }}</span>
        </button>
        <button
          type="button"
          class="tui-row-action shrink-0 text-[11px] text-faint hover:text-danger cursor-pointer disabled:cursor-default"
          :aria-label="`Delete conversation: ${t.title}`"
          :disabled="disabled"
          @click="emit('delete', t)"
        >
          ✕
        </button>
      </li>
    </ul>
    <p
      v-else
      class="mt-2 text-[11.5px] text-muted leading-[1.6]"
    >
      Conversations are saved as you go, so you can come back to one.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { AskThreadSummary } from '#shared/types/ask'
import { HOME_TZ } from '#shared/utils/time'

// The saved-conversation list on /ask: in the side rail on wide screens, in a slide-over on
// narrow ones. Stateless; the page owns the threads and what opening one does.
defineProps<{
  threads: AskThreadSummary[]
  activeId: number | null
  /** While an answer streams — switching or deleting mid-answer would orphan it. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  new: []
  open: [id: number]
  delete: [thread: AskThreadSummary]
}>()

// Home timezone on both sides: the server renders in UTC otherwise, and a time that differs
// between the SSR pass and the browser breaks hydration.
function when(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: HOME_TZ })
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: HOME_TZ })
}
</script>
