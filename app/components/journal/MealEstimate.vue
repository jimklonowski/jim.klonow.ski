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
        @click="openForm()"
      >{{ chipText }}</button>
      <span
        v-else
        :class="chipClass"
        :title="chipTitle"
      >{{ chipText }}</span>
      <!-- The glyph is for the eye; a reader gets the word instead. -->
      <span
        class="text-faint"
        aria-hidden="true"
      >{{ sourceMark }}</span>
      <span class="sr-only">{{ sourceLabel }}</span>
    </template>

    <span
      v-else-if="pending"
      class="text-faint"
    >estimating…</span>

    <!-- A plus-joined text with a part nobody knows: the known parts read as figures, each
         unknown one gets its own "enter macros", and the model is asked about the unknown
         parts only — never about the combo, so a priced part is never re-estimated. -->
    <template v-else-if="parts">
      <template
        v-for="(part, i) in parts"
        :key="part.text"
      >
        <span
          v-if="i"
          class="text-ghost"
        >+</span>
        <span
          v-if="part.estimate"
          class="text-muted"
          :title="`${part.text}: ${fmtMacros(part.estimate)}`"
        >{{ part.text }} {{ isLabelFigure(part.estimate) ? '' : '≈ ' }}{{ fmtKcal(part.estimate.kcal) }}</span>
        <template v-else>
          <span class="text-faint">{{ part.text }}</span>
          <button
            v-if="isOwner"
            type="button"
            class="text-faint hover:text-accent cursor-pointer"
            :title="`Enter the figures for ${part.text}`"
            @click="openForm(part.text)"
          >enter →</button>
        </template>
      </template>
      <template v-if="isOwner">
        <span class="text-ghost">·</span>
        <button
          type="button"
          class="text-faint hover:text-accent cursor-pointer"
          :title="`Sends ${unknownParts.join(', ')} to Claude for an estimate`"
          @click="ask"
        >
          estimate {{ unknownParts.length === 1 ? 'it' : 'them' }} with AI →
        </button>
      </template>
    </template>

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
          @click="openForm()"
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
      :title="estimate && formText === text ? 'Correct the figures' : 'Enter the figures'"
      :description="formText"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <p
            v-if="estimate?.assumptions && formText === text"
            class="text-small text-muted"
          >
            {{ estimate.parts ? 'Summed from' : estimate.source === 'ai' ? 'Model assumed' : 'Portion' }}: {{ estimate.assumptions }}<span
              v-if="estimate.source === 'ai' && !estimate.parts"
              class="text-faint"
            > · {{ estimate.confidence }} confidence</span>
          </p>
          <p
            v-if="estimate?.parts && formText === text"
            class="text-small text-warn"
          >
            This is a sum of parts. Figures saved here are kept for the whole combo and will shadow
            the parts' own — to fix one part, enter its figures on its own instead.
          </p>
          <!-- Barcode → Open Food Facts (item 81): prefills the fields below; nothing is saved
               until the figures have been checked against the package and Save is pressed. -->
          <div
            class="flex flex-wrap items-end gap-2"
            data-barcode
          >
            <UFormField
              label="Barcode"
              class="flex-1 min-w-40"
              :ui="FIELD_UI"
            >
              <UInput
                v-model="barcode"
                inputmode="numeric"
                placeholder="the digits under the bars"
                class="w-full"
                @keydown.enter.prevent="lookUp()"
              />
            </UFormField>
            <button
              type="button"
              class="tui-btn"
              :disabled="lookingUp || !barcodeValid"
              @click="lookUp()"
            >
              {{ lookingUp ? 'LOOKING UP…' : 'LOOK UP' }}
            </button>
            <!-- A photo of the barcode (the phone's camera opens), decoded on the device. -->
            <template v-if="canScan">
              <button
                type="button"
                class="tui-btn"
                :disabled="lookingUp"
                @click="scanInput?.click()"
              >
                SCAN
              </button>
              <input
                ref="scanInput"
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden"
                @change="onScanFile"
              >
            </template>
          </div>
          <p
            v-if="barcodeNote"
            class="text-small"
            :class="barcodeNote.tone === 'warn' ? 'text-warn' : 'text-muted'"
            data-barcode-note
          >
            {{ barcodeNote.text }}
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
            <!-- Optional (item 71): blank means "no figure", and the day's sodium then reads as a floor. -->
            <UFormField
              label="Sodium (mg)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="draft.sodium_mg"
                type="number"
                inputmode="numeric"
                min="0"
                step="10"
                placeholder="optional"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Fibre (g)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="draft.fiber_g"
                type="number"
                inputmode="decimal"
                min="0"
                placeholder="optional"
                class="w-full"
              />
            </UFormField>
          </div>
          <p class="text-micro text-faint">
            Label figures from the package or the chain's nutrition page are best. What you enter
            is kept under this meal's name — spellings that normalize to it, and the ones the log
            pairs with it ("did you mean") — and is never re-estimated. A regular worth keeping in
            code with its source goes in shared/utils/mealLibrary.ts.
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
import { fmtKcal, fmtMacros, isLabelFigure, knownMeals, mealParts, suggestMeal } from '#shared/utils/nutrition'
import type { OffFigures } from '#shared/utils/openFoodFacts'

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
// A plus-joined text whose parts don't all have figures: shown part by part (shared/utils/
// nutrition.ts mealParts). Null for a single meal, and once every part is known the composed
// `estimate` takes over above.
const parts = computed(() => (estimate.value ? null : mealParts(index.value, props.text)))
const unknownParts = computed(() => parts.value?.filter(p => !p.estimate).map(p => p.text) ?? [])
const pending = computed(() => isPending(props.text) || unknownParts.value.some(p => isPending(p)))

const known = computed(() => knownMeals(entries.value ?? [], index.value))
const suggestion = computed(() => (estimate.value ? null : suggestMeal(props.text, known.value)))

const chipText = computed(() => {
  const e = estimate.value
  if (!e) return ''
  return `${isLabelFigure(e) ? '' : '≈ '}${fmtKcal(e.kcal)} kcal · ${fmtMacros(e)}${e.sodium_mg != null ? ` · ${fmtKcal(e.sodium_mg)} mg Na` : ''}`
})
const sourceMark = computed(() => {
  const e = estimate.value
  if (!e) return ''
  return e.source === 'library' ? '≡' : e.source === 'manual' ? '✎' : 'est.'
})
/** What the glyph means, for screen readers. */
const sourceLabel = computed(() => {
  const e = estimate.value
  if (!e) return ''
  return e.source === 'library' ? 'meal library figures' : e.source === 'manual' ? 'entered by hand' : 'model estimate'
})
// A low-confidence model guess reads fainter; label figures read as the muted default.
const chipClass = computed(() => (estimate.value?.source === 'ai' && estimate.value.confidence === 'low' ? 'text-faint' : 'text-muted'))
const chipTitle = computed(() => {
  const e = estimate.value
  if (!e) return undefined
  if (e.parts) return `summed from ${e.assumptions}`
  if (e.source === 'library') return `meal library${e.assumptions ? ` — ${e.assumptions}` : ''}`
  if (e.source === 'manual') return `entered by hand${e.assumptions && e.assumptions !== 'corrected by hand' ? ` — ${e.assumptions}` : ''}`
  return [e.assumptions ? `model assumed: ${e.assumptions}` : null, `${e.confidence} confidence`].filter(Boolean).join(' · ')
})

async function ask() {
  if (!props.text) return
  // For a combo, only the parts nothing knows — a priced part is never sent again.
  const texts = unknownParts.value.length ? unknownParts.value : [props.text]
  try {
    const unmatched = await requestEstimate(texts)
    if (unmatched.length) {
      toast.add({ title: `No figures came back for ${unmatched.length === 1 && texts.length === 1 ? 'that meal' : unmatched.join(', ')}`, description: 'The answer could not be pinned to it, so nothing was saved — try again or enter the figures.', color: 'warning' })
    }
  }
  catch (err) {
    toast.add({ title: 'Could not estimate that meal', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
}

// --- the figures form (enter or correct) ---
const formOpen = ref(false)
/** What the form is for: the meal itself, or one unknown part of a combo. */
const formText = ref('')
/** A figure label never wraps onto a second line — the four inputs must share one baseline. */
const FIELD_UI = { label: 'whitespace-nowrap' }
const saving = ref(false)
const draft = reactive<{ kcal: number | '', protein_g: number | '', carbs_g: number | '', fat_g: number | '', sodium_mg: number | '', fiber_g: number | '' }>({ kcal: '', protein_g: '', carbs_g: '', fat_g: '', sodium_mg: '', fiber_g: '' })

// --- barcode lookup (item 81) ---
// The digits (typed, pasted, or read off a photo where the browser has BarcodeDetector) go to
// /api/journal/meals/barcode, which asks Open Food Facts; the answer fills the fields and says
// where it came from and what serving it describes. The owner still presses Save.
// The lookup and the photo scan are useBarcodeLookup's (a drink's label form shares them).
const scanInput = useTemplateRef<HTMLInputElement>('scanInput')
const { barcode, lookingUp, barcodeNote, barcodeValid, canScan, lookUp, onScanFile, resetBarcode } = useBarcodeLookup((f: OffFigures) => {
  draft.kcal = f.kcal
  draft.protein_g = f.protein_g
  draft.carbs_g = f.carbs_g
  draft.fat_g = f.fat_g
  draft.sodium_mg = f.sodium_mg ?? ''
  draft.fiber_g = f.fiber_g ?? ''
  return f.basis === 'serving'
    ? { text: `Filled from Open Food Facts: ${f.name}, per ${f.per}. Check it against the package and adjust for what was eaten, then Save.`, tone: 'ok' }
    : { text: `Filled from Open Food Facts: ${f.name} — per 100 g, since the product lists no serving. Scale it to what was eaten before saving.`, tone: 'warn' }
})

function openForm(text: string | null = null) {
  resetBarcode()
  formText.value = text ?? props.text ?? ''
  const e = text ? lookup(text) : estimate.value
  draft.kcal = e?.kcal ?? ''
  draft.protein_g = e?.protein_g ?? ''
  draft.carbs_g = e?.carbs_g ?? ''
  draft.fat_g = e?.fat_g ?? ''
  draft.sodium_mg = e?.sodium_mg ?? ''
  draft.fiber_g = e?.fiber_g ?? ''
  formOpen.value = true
}

const draftValid = computed(() =>
  [draft.kcal, draft.protein_g, draft.carbs_g, draft.fat_g].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
  // The two optional figures: blank, or a non-negative number.
  && [draft.sodium_mg, draft.fiber_g].every(v => v === '' || (typeof v === 'number' && Number.isFinite(v) && v >= 0))
)

async function saveFigures() {
  if (!formText.value || !draftValid.value) return
  saving.value = true
  try {
    await correct({
      text: formText.value,
      kcal: Math.round(draft.kcal as number),
      protein_g: draft.protein_g as number,
      carbs_g: draft.carbs_g as number,
      fat_g: draft.fat_g as number,
      sodium_mg: draft.sodium_mg === '' ? null : draft.sodium_mg,
      fiber_g: draft.fiber_g === '' ? null : draft.fiber_g
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
