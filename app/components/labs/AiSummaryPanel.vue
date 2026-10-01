<script setup lang="ts">
// The "✦ LATEST DRAW AI SUMMARY" readout, shared by the labs index (draws) and the DEXA page
// (scans): the collapsible prose, its provenance line, and the owner's regen control. Regen
// posts { date } to the page's endpoint. That endpoint is PIN-gated like uploads (403 without
// the labs-upload-auth cookie), so a 403 opens the PIN modal and the retry runs after unlock.
// The parent owns the data: it passes the newest summary in and refreshes on `regenerated`.
interface AiSummary {
  date: string
  text: string
  model: string | null
  promptHash: string | null
  at: string | null
}

const props = withDefaults(defineProps<{
  summary: AiSummary | null
  /** The newest entry's date — what a regen targets. */
  latestDate: string
  /** POST endpoint taking { date }: /api/labs/generate-summary or /api/dexa/generate-summary. */
  endpoint: string
  /** 'draw' or 'scan' — in the heading and the working copy. */
  noun: string
  /** Shows the regen control; only the owner can write. */
  canRegenerate?: boolean
  /** Expanded on load — the pages open a summary written within the past week. */
  defaultOpen?: boolean
}>(), { canRegenerate: false, defaultOpen: false })
const emit = defineEmits<{ regenerated: [] }>()

const open = ref(props.defaultOpen)
const regenerating = ref(false)
const pinModalOpen = ref(false)
const toast = useToast()

const Noun = computed(() => props.noun.charAt(0).toUpperCase() + props.noun.slice(1))

async function regenerate() {
  if (regenerating.value) return
  regenerating.value = true
  open.value = true
  try {
    await $fetch(props.endpoint, { method: 'POST', body: { date: props.latestDate } })
    emit('regenerated')
    toast.add({ title: 'AI summary regenerated', description: `${Noun.value} from ${formatDate(props.latestDate)}`, color: 'success' })
  }
  catch (err) {
    const e = err as { statusCode?: number }
    if (e.statusCode === 403) {
      pinModalOpen.value = true
    }
    else {
      toast.add({ title: 'Summary generation failed', description: extractErrorMessage(err, 'Try again in a moment.'), color: 'error' })
    }
  }
  finally {
    regenerating.value = false
  }
}

async function onPinUnlocked() {
  pinModalOpen.value = false
  await regenerate()
}
</script>

<template>
  <div class="px-3.5 py-3 border border-line-input bg-inset">
    <div class="flex items-baseline gap-3">
      <span class="text-[10.5px] tracking-[0.14em] uppercase text-accent">✦ LATEST {{ noun.toUpperCase() }} AI SUMMARY</span>
      <span
        v-if="summary"
        class="text-[10.5px] text-muted tracking-[0.06em] uppercase"
      >{{ formatDate(summary.date, 'monthDay').toUpperCase() }}</span>
      <span class="ml-auto flex items-center gap-2.5 text-[11px]">
        <button
          type="button"
          class="text-accent hover:text-accent-hover cursor-pointer"
          @click="open = !open"
        >{{ open ? 'collapse ▴' : 'expand ▾' }}</button>
        <template v-if="canRegenerate">
          <span class="text-faint">·</span>
          <button
            type="button"
            class="text-accent hover:text-accent-hover cursor-pointer disabled:opacity-50"
            :disabled="regenerating"
            @click="regenerate"
          >{{ regenerating ? 'working ⟳' : 'regen ⟳' }}</button>
        </template>
      </span>
    </div>

    <p
      v-if="regenerating"
      class="mt-2 text-[12.5px] text-muted"
    >
      Comparing the {{ formatDate(latestDate) }} {{ noun }} against your history…
    </p>
    <p
      v-else-if="summary"
      class="mt-2 text-[12.5px] leading-[1.7] text-dim whitespace-pre-line"
      :class="open ? '' : 'line-clamp-1'"
    >
      {{ summary.text }}
    </p>
    <!-- Provenance: only summaries written since it was recorded carry it. -->
    <p
      v-if="!regenerating && open && summary?.model"
      class="mt-2 text-[10.5px] text-ghost tracking-[0.06em]"
      :title="summary.promptHash ? `prompt ${summary.promptHash}` : undefined"
    >
      written by {{ summary.model }}{{ summary.at ? ` · ${formatDate(summary.at.slice(0, 10), 'monthDay').toLowerCase()}` : '' }}
    </p>
    <p
      v-else-if="!regenerating && !summary"
      class="mt-2 text-[12.5px] text-muted"
    >
      No AI summary for this {{ noun }} yet{{ canRegenerate ? ' — hit regen to generate one.' : '.' }}
    </p>

    <!-- PIN gate for regeneration — the same second factor as the upload page -->
    <UModal
      v-model:open="pinModalOpen"
      title="Upload PIN required"
      description="Regenerating the AI summary is a write, so it needs your 9-digit upload PIN."
    >
      <template #body>
        <LabsPinForm
          variant="modal"
          button-label="Unlock & regenerate"
          @unlocked="onPinUnlocked"
        />
      </template>
    </UModal>
  </div>
</template>
