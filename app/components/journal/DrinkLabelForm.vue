<template>
  <UModal
    v-model:open="open"
    title="Label figures"
    :description="drink"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div
        class="space-y-3"
        data-drink-label-form
      >
        <!-- Where the figures in use come from, so the form says what it is replacing. -->
        <p
          class="text-small"
          :class="source === 'label' ? 'text-muted' : 'text-warn'"
          data-drink-source
        >
          {{ sourceText }}
        </p>
        <!-- Barcode → Open Food Facts: prefills the fields; nothing is saved until the figures
             have been checked against the can and Save is pressed. Owner-only, like the meal
             form's — the lookup makes an outbound request. -->
        <div
          v-if="isOwner"
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
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <UFormField
            label="Container (fl oz)"
            :ui="FIELD_UI"
          >
            <UInput
              v-model.number="draft.serving_oz"
              type="number"
              inputmode="decimal"
              min="1"
              step="0.1"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="kcal"
            :ui="FIELD_UI"
          >
            <UInput
              v-model.number="draft.kcal"
              type="number"
              inputmode="numeric"
              min="0"
              :placeholder="String(builtIn.kcal)"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Sugar (g)"
            :ui="FIELD_UI"
          >
            <UInput
              v-model.number="draft.sugar_g"
              type="number"
              inputmode="decimal"
              min="0"
              :placeholder="String(builtIn.sugar_g)"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Sodium (mg)"
            :ui="FIELD_UI"
          >
            <UInput
              v-model.number="draft.sodium_mg"
              type="number"
              inputmode="numeric"
              min="0"
              :placeholder="String(builtIn.sodium_mg)"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Caffeine (mg)"
            :ui="FIELD_UI"
          >
            <UInput
              v-model.number="draft.caffeine_mg"
              type="number"
              inputmode="numeric"
              min="0"
              :placeholder="String(builtIn.caffeine_mg)"
              class="w-full"
            />
          </UFormField>
        </div>
        <p class="text-micro text-faint">
          Type what the can or bottle prints for the whole container, and the container's size.
          The faint numbers are what the built-in table gives for that size. A caffeine-free drink
          is a 0. Saved under this drink's name: every log of it, past and future, at any size, is
          then worked out from your label. Whether it counts as a soda still comes from its name.
        </p>
        <div class="flex flex-wrap justify-end gap-2 pt-1">
          <button
            v-if="existing"
            type="button"
            class="tui-btn mr-auto"
            :disabled="saving"
            data-drink-label-remove
            @click="removeLabel"
          >
            REMOVE MY LABEL
          </button>
          <button
            type="button"
            class="tui-btn"
            @click="open = false"
          >
            CANCEL
          </button>
          <UButton
            :loading="saving"
            :disabled="!draftValid"
            @click="saveLabel"
          >
            Save
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// A drink's own label figures (drink_labels): the built-in drink table was written from memory,
// so this is where a can's real numbers go — typed from the label, or looked up by barcode
// (typed or scanned) and checked against it. Opened from a row of the drink list.
import { DRINK_KIND_LABELS, drinkInfo, drinkKey, drinkSource, indexDrinkLabels, type DrinkLabel } from '#shared/utils/drinks'
import { sodaOunces } from '#shared/utils/soda'
import type { OffFigures } from '#shared/utils/openFoodFacts'

const props = defineProps<{
  drink: string
  /** The logged entry's size ("12oz can"): the container the form starts from. */
  size?: string | null
}>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { isOwner } = await useAuth()
const { data: labelRows } = useDrinkLabels()
const labels = computed(() => indexDrinkLabels(labelRows.value))
const existing = computed(() => labels.value.get(drinkKey(props.drink)) ?? null)
const source = computed(() => drinkSource(props.drink, labels.value))

const FIELD_UI = { label: 'whitespace-nowrap' }
type Field = number | ''
const draft = reactive<{ serving_oz: Field, kcal: Field, sugar_g: Field, sodium_mg: Field, caffeine_mg: Field }>({ serving_oz: '', kcal: '', sugar_g: '', sodium_mg: '', caffeine_mg: '' })

/** The built-in table's figures at the container in the form — the placeholders, never saved. */
const builtIn = computed(() => {
  const oz = typeof draft.serving_oz === 'number' && draft.serving_oz > 0 ? draft.serving_oz : 12
  const info = drinkInfo(props.drink)
  const k = oz / 12
  return { kcal: Math.round(info.kcal * k), sugar_g: Math.round(info.sugar_g * k), sodium_mg: Math.round(info.sodium_mg * k), caffeine_mg: Math.round(info.caffeine_mg * k) }
})

const sourceText = computed(() => {
  if (source.value === 'label') return `Using your label${existing.value?.updated_at ? `, saved ${formatDate(existing.value.updated_at.slice(0, 10), 'monthDay')}` : ''}.`
  if (source.value === 'table') return 'Using the built-in table, which was written from memory and not checked against a label.'
  return `Not in the built-in table: using typical figures for a ${DRINK_KIND_LABELS[drinkInfo(props.drink).kind].toLowerCase()}.`
})

const scanInput = useTemplateRef<HTMLInputElement>('scanInput')
const { barcode, lookingUp, barcodeNote, barcodeValid, canScan, lookUp, onScanFile, resetBarcode } = useBarcodeLookup((f: OffFigures) => {
  draft.kcal = f.kcal
  draft.sugar_g = f.sugar_g ?? f.carbs_g
  draft.sodium_mg = f.sodium_mg ?? ''
  if (f.caffeine_mg != null) draft.caffeine_mg = f.caffeine_mg
  const caffeine = [
    f.caffeine_mg == null ? ' Caffeine is not listed there — read it off the can (0 if caffeine free).' : '',
    f.sodium_mg == null ? ' It has no usable sodium figure — read that off the can.' : '',
    f.scaled ? ' This record was entered per 100 g and scaled, so the figures can be a few percent off — type the can\'s own numbers over them.' : ''
  ].join('')
  if (f.basis !== 'serving') {
    // Open Food Facts' per-100 figures are per 100 ml for a drink.
    draft.serving_oz = 3.4
    return { text: `Filled from Open Food Facts: ${f.name} — per 100 ml (3.4 fl oz), since the product lists no serving. The can's own figures are better if you have it.${caffeine}`, tone: 'warn' }
  }
  if (f.serving_oz != null) draft.serving_oz = f.serving_oz
  const size = f.serving_oz != null ? '' : ' The serving is not given as a volume — set the container size yourself.'
  return { text: `Filled from Open Food Facts: ${f.name}, per ${f.per}. Check it against the can, then Save.${size}${caffeine}`, tone: size || caffeine ? 'warn' : 'ok' }
})

// Each opening starts from the saved label, or blank fields at the logged size. Immediate: the
// form is mounted by its first opening, already open, so there is no false → true to watch.
watch(open, (isOpen) => {
  if (!isOpen) return
  resetBarcode()
  const l = existing.value
  draft.serving_oz = l?.serving_oz ?? sodaOunces(props.size) ?? 12
  draft.kcal = l?.kcal ?? ''
  draft.sugar_g = l?.sugar_g ?? ''
  draft.sodium_mg = l?.sodium_mg ?? ''
  draft.caffeine_mg = l?.caffeine_mg ?? ''
}, { immediate: true })

const draftValid = computed(() =>
  typeof draft.serving_oz === 'number' && draft.serving_oz >= 1
  && [draft.kcal, draft.sugar_g, draft.sodium_mg, draft.caffeine_mg].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
)

const saving = ref(false)

/** Reassigns the shared list so every total built from it recomputes. */
function setRows(rows: DrinkLabel[]) {
  labelRows.value = rows.sort((a, b) => a.name.localeCompare(b.name))
}

async function saveLabel() {
  if (!draftValid.value) return
  saving.value = true
  try {
    const { label } = await $fetch<{ label: DrinkLabel | null }>('/api/journal/drinks/label', {
      method: 'POST',
      body: { name: props.drink, serving_oz: draft.serving_oz, kcal: draft.kcal, sugar_g: draft.sugar_g, sodium_mg: draft.sodium_mg, caffeine_mg: draft.caffeine_mg, barcode: barcodeValid.value ? barcode.value.replace(/[\s-]/g, '') : null }
    })
    if (label) setRows([...(labelRows.value ?? []).filter(r => r.key !== label.key), label])
    open.value = false
    toast.add({ title: 'Label saved', description: `${props.drink} now reads from your label.`, color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Could not save the label', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function removeLabel() {
  const l = existing.value
  if (!l) return
  saving.value = true
  try {
    await $fetch('/api/journal/drinks/label-delete', { method: 'POST', body: { name: l.name } })
    setRows((labelRows.value ?? []).filter(r => r.key !== l.key))
    open.value = false
    toast.add({ title: 'Label removed', description: `${props.drink} is back on the built-in table.`, color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Could not remove the label', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>
