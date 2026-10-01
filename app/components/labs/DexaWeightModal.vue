<script setup lang="ts">
// Edits the scale weight that will be saved with a DEXA extraction. On the Live Lean Rx reports
// the header's "Weight" is typed in at check-in rather than measured, so it can lag the scan by
// a lot (Sep 2026: 155 lbs against a 169.8 lb total mass) — and the saved row's weight_lbs is
// what the DEXA page headlines and what Ask quotes for the scan. Nothing is written from here:
// the new value lands on the preview and SAVE TO SITE carries it, which the body spells out.
const props = defineProps<{
  /** The weight on the preview right now — the report's figure, or an earlier edit. */
  current: number | null
  /** What the report header stated; null when it had no weight line at all. */
  reported: number | null
  /** The scan's own total mass, for a sanity check against the typed-in figure. */
  totalMass: number | null
}>()
const emit = defineEmits<{ apply: [weight: number] }>()
const open = defineModel<boolean>('open', { default: false })

const draft = ref<number | null>(null)
watch(open, (isOpen) => {
  if (isOpen) draft.value = props.current
})

const valid = computed(() => typeof draft.value === 'number' && Number.isFinite(draft.value) && draft.value > 0)
const changed = computed(() => valid.value && draft.value !== props.current)

const lead = computed(() => {
  if (props.reported == null) return 'The report has no weight line, and a scan can\'t be saved without one.'
  const mass = props.totalMass != null ? ` This scan's own total mass is ${props.totalMass} lbs.` : ''
  return `The report header lists ${props.reported} lbs. That figure is typed in at check-in rather than measured by the scan, so it can lag.${mass}`
})

function apply() {
  if (!changed.value) return
  emit('apply', draft.value as number)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Edit Scale Weight"
    description="The weight saved alongside this scan"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-[12.5px] leading-[1.7] text-dim">
          {{ lead }}
        </p>

        <UFormField label="Scale weight (lbs)">
          <UInput
            v-model.number="draft"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.1"
            autofocus
            class="w-full"
            @keydown.enter="apply"
          />
        </UFormField>

        <div class="text-[11.5px] text-muted leading-[1.7] space-y-1.5">
          <p>
            <span class="text-hi">What changes:</span> the weight stored with this scan. The DEXA page shows it
            as "weighed" beside the scan date, and the Ask assistant quotes it when it describes this scan.
          </p>
          <p>
            <span class="text-hi">What doesn't:</span> every DEXA-measured figure — total mass, fat, lean and
            bone come from the scan itself — and the journal's daily weight log, which is separate.
          </p>
        </div>

        <p class="text-[11.5px] text-muted border border-line-input bg-inset px-2.5 py-2">
          ❯ Nothing is written yet. The new weight lands on the preview and is saved with SAVE TO SITE.
        </p>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="tui-btn"
            @click="open = false"
          >
            CANCEL
          </button>
          <UButton
            :disabled="!changed"
            @click="apply"
          >
            Use {{ valid ? `${draft} lbs` : 'this weight' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
