<template>
  <!-- Nothing for blank text: the chip sits under every meal input, filled or not. -->
  <span
    v-if="text?.trim()"
    class="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-meta"
  >
    <template v-if="estimate">
      <!-- Owner: the chip opens the figures form. Others read it. Label figures (library, hand)
           read as numbers; a model estimate reads as "≈ … est.". -->
      <button
        v-if="isOwner"
        type="button"
        class="text-left cursor-pointer hover:text-accent"
        :class="chipClass"
        :title="chipTitle"
        @click="openForm"
      >{{ chipText }}</button>
      <span
        v-else
        :class="chipClass"
        :title="chipTitle"
      >{{ chipText }}</span>
      <span class="text-faint">{{ sourceMark }}</span>
    </template>

    <span
      v-else-if="pending"
      class="text-faint"
    >estimating…</span>

    <template v-else>
      <!-- A close match that already has figures: one tap replaces the typed text with it. -->
      <template v-if="suggestion && canEdit">
        <span class="text-muted">did you mean</span>
        <button
          type="button"
          class="text-accent hover:text-accent-hover cursor-pointer text-left"
          :title="`Use this spelling — it already has figures (${Math.round(suggestion.score * 100)}% match)`"
          @click="emit('replace', suggestion.text)"
        >{{ suggestion.text }}</button>
        <span class="text-muted">?</span>
        <span
          v-if="isOwner"
          class="text-ghost"
        >·</span>
      </template>
      <template v-if="isOwner">
        <button
          type="button"
          class="text-faint hover:text-accent cursor-pointer"
          @click="openForm"
        >
          enter macros →
        </button>
        <span class="text-ghost">·</span>
        <button
          type="button"
          class="text-faint hover:text-accent cursor-pointer"
          title="Sends this one meal name to Claude for an estimate"
          @click="ask"
        >
          estimate with AI →
        </button>
      </template>
    </template>

    <!-- Wider than the default dialog so the four figure fields sit on one row with their labels
         on one line ("PROTEIN (G)" wrapped at the default width and pushed its input down). -->
    <UModal
      v-if="isOwner"
      v-model:open="formOpen"
      :title="estimate ? 'Correct the figures' : 'Enter the figures'"
      :description="text"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <p
            v-if="estimate?.assumptions"
            class="text-small text-muted"
          >
            {{ estimate.source === 'ai' ? 'Model assumed' : 'Portion' }}: {{ estimate.assumptions }}<span
              v-if="estimate.source === 'ai'"
              class="text-faint"
            > · {{ estimate.confidence }} confidence</span>
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <UFormField
              label="kcal"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="draft.kcal"
                type="number"
                inputmode="numeric"
                min="0"
                step="10"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Protein (g)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="draft.protein_g"
                type="number"
                inputmode="decimal"
                min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Carbs (g)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="draft.carbs_g"
                type="number"
                inputmode="decimal"
                min="0"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Fat (g)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="draft.fat_g"
                type="number"
                inputmode="decimal"
                min="0"
                class="w-full"
              />
            </UFormField>
          </div>
          <p class="text-micro text-faint">
            Label figures from the package or the chain's nutrition page are best. What you enter
            is kept for every spelling of this meal and is never re-estimated. A regular worth
            keeping in code with its source goes in shared/utils/mealLibrary.ts.
          </p>
          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="tui-btn"
              @click="formOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="saving"
              :disabled="!draftValid"
              @click="saveFigures"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </span>
</template>

<script setup lang="ts">
// The per-meal figures chip under a meal: "540 kcal · 28P 45C 26F" from the code library or a
// hand entry, "≈ 540 kcal · 28P 45C 26F est." from the model. With no figures it offers the
// close match that has them ("did you mean …?", emitting `replace` with that spelling), and for
// the owner the two ways in: enter the figures by hand (the preferred path), or ask the model
// for this one meal.
import { fmtKcal, fmtMacros, isLabelFigure, knownMeals, suggestMeal } from '#shared/utils/nutrition'

const props = defineProps<{
  text: string | null | undefined
}>()
const emit = defineEmits<{
  /** The user accepted a "did you mean" — the parent puts this spelling in the input. */
  replace: [text: string]
}>()

const toast = useToast()
const { isOwner, canEdit } = await useAuth()
const { data: entries } = await useJournalEntries()
const { index, lookup, isPending, estimate: requestEstimate, correct } = await useMealEstimates()

const estimate = computed(() => lookup(props.text))
const pending = computed(() => isPending(props.text))

const known = computed(() => knownMeals(entries.value ?? [], index.value))
const suggestion = computed(() => (estimate.value ? null : suggestMeal(props.text, known.value)))

const chipText = computed(() => {
  const e = estimate.value
  if (!e) return ''
  return `${isLabelFigure(e) ? '' : '≈ '}${fmtKcal(e.kcal)} kcal · ${fmtMacros(e)}`
})
const sourceMark = computed(() => {
  const e = estimate.value
  if (!e) return ''
  return e.source === 'library' ? '≡' : e.source === 'manual' ? '✎' : 'est.'
})
// A low-confidence model guess reads fainter; label figures read as the muted default.
const chipClass = computed(() => (estimate.value?.source === 'ai' && estimate.value.confidence === 'low' ? 'text-faint' : 'text-muted'))
const chipTitle = computed(() => {
  const e = estimate.value
  if (!e) return undefined
  if (e.source === 'library') return `meal library${e.assumptions ? ` — ${e.assumptions}` : ''}`
  if (e.source === 'manual') return `entered by hand${e.assumptions && e.assumptions !== 'corrected by hand' ? ` — ${e.assumptions}` : ''}`
  return [e.assumptions ? `model assumed: ${e.assumptions}` : null, `${e.confidence} confidence`].filter(Boolean).join(' · ')
})

async function ask() {
  if (!props.text) return
  try {
    const unmatched = await requestEstimate([props.text])
    if (unmatched.length) {
      toast.add({ title: 'No figures came back for that meal', description: 'The answer could not be pinned to it, so nothing was saved — try again or enter the figures.', color: 'warning' })
    }
  }
  catch (err) {
    toast.add({ title: 'Could not estimate that meal', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
}

// --- the figures form (enter or correct) ---
const formOpen = ref(false)
/** A figure label never wraps onto a second line — the four inputs must share one baseline. */
const FIELD_UI = { label: 'whitespace-nowrap' }
const saving = ref(false)
const draft = reactive<{ kcal: number | '', protein_g: number | '', carbs_g: number | '', fat_g: number | '' }>({ kcal: '', protein_g: '', carbs_g: '', fat_g: '' })

function openForm() {
  const e = estimate.value
  draft.kcal = e?.kcal ?? ''
  draft.protein_g = e?.protein_g ?? ''
  draft.carbs_g = e?.carbs_g ?? ''
  draft.fat_g = e?.fat_g ?? ''
  formOpen.value = true
}

const draftValid = computed(() =>
  [draft.kcal, draft.protein_g, draft.carbs_g, draft.fat_g].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
)

async function saveFigures() {
  if (!props.text || !draftValid.value) return
  saving.value = true
  try {
    await correct({
      text: props.text,
      kcal: Math.round(draft.kcal as number),
      protein_g: draft.protein_g as number,
      carbs_g: draft.carbs_g as number,
      fat_g: draft.fat_g as number
    })
    formOpen.value = false
    toast.add({ title: 'Figures saved', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Could not save the figures', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>
