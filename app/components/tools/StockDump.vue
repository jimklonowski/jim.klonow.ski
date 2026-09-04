<template>
  <UModal
    v-model:open="open"
    title="Stock Dump"
    :ui="{ content: 'bg-raised border border-line-accent ring-0 max-w-2xl' }"
  >
    <template #body>
      <!-- Step 1: brain dump -->
      <div
        v-if="!rows.length"
        class="space-y-4"
      >
        <p class="text-[12.5px] leading-[1.7] text-dim">
          Describe everything in the fridge in one go — vials, pens, pill bottles, powders.
          No format needed; it gets parsed into rows you can correct before saving.
        </p>
        <UTextarea
          v-model="text"
          :rows="5"
          :maxlength="4000"
          placeholder="e.g. 6 vials primo 200mg/ml, 20 unopened test cyp 250, ~100 anavar 10mg tabs, a reta pen (60mg total), 10x BPC-157 5mg powder"
          class="w-full"
          autofocus
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="tui-btn"
            @click="open = false"
          >
            CANCEL
          </button>
          <UButton
            :loading="parsing"
            :disabled="!text.trim()"
            icon="i-lucide-sparkles"
            @click="parse"
          >
            Parse it
          </UButton>
        </div>
      </div>

      <!-- Step 2: confirm table -->
      <div
        v-else
        class="space-y-4"
      >
        <p class="text-[12.5px] leading-[1.7] text-dim">
          {{ rows.length }} product{{ rows.length === 1 ? '' : 's' }} found — fix anything that's off, then save.
          Everything lands as sealed stock.
        </p>

        <div class="space-y-3">
          <div
            v-for="(row, i) in rows"
            :key="i"
            class="border border-line-soft px-3 py-2.5 space-y-2"
            :class="row.amount > 0 ? '' : 'border-warn'"
          >
            <div class="grid grid-cols-12 gap-2 items-end">
              <UFormField
                label="Compound"
                class="col-span-12 sm:col-span-4"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model="row.compound"
                  list="dump-compounds"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Form"
                class="col-span-4 sm:col-span-2"
                :ui="FIELD_UI"
              >
                <USelect
                  v-model="row.form"
                  :items="VIAL_FORMS"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="amountLabel(row)"
                class="col-span-4 sm:col-span-2"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model.number="row.amount"
                  type="number"
                  min="0"
                  step="0.1"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Unit"
                class="col-span-4 sm:col-span-2"
                :ui="FIELD_UI"
              >
                <USelect
                  v-model="row.vial_unit"
                  :items="DOSE_UNITS"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Qty"
                class="col-span-3 sm:col-span-1"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model.number="row.quantity"
                  type="number"
                  min="1"
                  step="1"
                  class="w-full"
                />
              </UFormField>
              <button
                type="button"
                class="col-span-1 pb-2 text-[13px] text-faint hover:text-danger cursor-pointer justify-self-end"
                :aria-label="`Remove ${row.compound || 'row'}`"
                @click="rows.splice(i, 1)"
              >
                ✕
              </button>
            </div>
            <!-- Pill bottles get their count beside the notes, and the total the DB will store is
                 spelled out so "25 mg" reads unmistakably as per tab, not per bottle. -->
            <div class="flex items-end gap-2">
              <UFormField
                v-if="isPillForm(row.form)"
                :label="`${cap(pillNoun(row.form, 2))} / bottle`"
                class="w-28 shrink-0"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model.number="row.unit_count"
                  type="number"
                  min="1"
                  step="1"
                  size="sm"
                  class="w-full"
                />
              </UFormField>
              <UInput
                v-model="row.notes"
                placeholder="notes"
                size="sm"
                class="flex-1 min-w-0"
              />
            </div>
            <p
              v-if="isPillForm(row.form) && rowValid(row)"
              class="text-[11px] text-muted"
            >
              = {{ pillTotal(row.amount, row.unit_count) }} {{ row.vial_unit }} per bottle
            </p>
            <p
              v-if="row.assumption"
              class="text-[11px] text-warn leading-[1.6]"
            >
              ⚠ assumed: {{ row.assumption }}
            </p>
          </div>
        </div>
        <datalist id="dump-compounds">
          <option
            v-for="c in KNOWN_COMPOUNDS"
            :key="c"
            :value="c"
          />
        </datalist>

        <div class="flex items-center justify-between gap-2">
          <button
            type="button"
            class="text-[11px] text-accent hover:text-accent-hover cursor-pointer"
            @click="backToText"
          >
            ‹ re-parse
          </button>
          <div class="flex gap-2">
            <button
              type="button"
              class="tui-btn"
              @click="open = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="saving"
              :disabled="!allValid"
              icon="i-lucide-check"
              @click="saveAll"
            >
              Save {{ rows.length }} to fridge
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { KNOWN_COMPOUNDS, DOSE_UNITS } from '~/data/journal'
import { VIAL_FORMS, isPillForm, pillNoun, pillStrength, pillTotal, type VialForm } from '#shared/utils/vialForm'

// What /api/journal/vials/parse returns — DB terms, vial_amount is the whole-container total.
interface ParsedRow {
  compound: string
  form: VialForm
  vial_amount: number
  vial_unit: 'mg' | 'mcg' | 'iu'
  unit_count: number | null
  quantity: number
  notes: string
  assumption: string
}

// What the confirm table edits — label terms: `amount` is per vial, or per tab/cap for a pill
// bottle, and the bottle total is recomputed on save.
interface DumpRow {
  compound: string
  form: VialForm
  amount: number
  vial_unit: 'mg' | 'mcg' | 'iu'
  unit_count: number
  quantity: number
  notes: string
  assumption: string
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const FIELD_UI = { label: 'tui-label' }

const toast = useToast()
const text = ref('')
const parsing = ref(false)
const saving = ref(false)
const rows = ref<DumpRow[]>([])

function toDumpRow(v: ParsedRow): DumpRow {
  return {
    compound: v.compound,
    form: v.form,
    amount: pillStrength(v) ?? v.vial_amount,
    vial_unit: v.vial_unit,
    unit_count: v.unit_count ?? 100,
    quantity: v.quantity,
    notes: v.notes,
    assumption: v.assumption
  }
}

function rowValid(r: DumpRow): boolean {
  return !!r.compound.trim() && r.amount > 0 && r.quantity >= 1 && (!isPillForm(r.form) || r.unit_count >= 1)
}

const allValid = computed(() => rows.value.length > 0 && rows.value.every(rowValid))

function amountLabel(r: DumpRow): string {
  return isPillForm(r.form) ? `Per ${pillNoun(r.form)}` : 'Per vial'
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function backToText() {
  rows.value = []
}

async function parse() {
  parsing.value = true
  try {
    const result = await $fetch<{ vials: ParsedRow[] }>('/api/journal/vials/parse', {
      method: 'POST',
      body: { text: text.value }
    })
    rows.value = result.vials.map(toDumpRow)
    if (!rows.value.length) {
      toast.add({ title: 'Nothing recognized', description: 'Try naming compounds and sizes', color: 'warning' })
    }
  }
  catch (err) {
    toast.add({ title: 'Parse failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    parsing.value = false
  }
}

async function saveAll() {
  saving.value = true
  try {
    for (const row of rows.value) {
      const pill = isPillForm(row.form)
      await $fetch('/api/journal/vials/save', {
        method: 'POST',
        body: {
          compound: row.compound.trim(),
          form: row.form,
          vial_amount: pill ? pillTotal(row.amount, row.unit_count) : row.amount,
          unit_count: pill ? row.unit_count : null,
          vial_unit: row.vial_unit,
          quantity: row.quantity,
          status: 'sealed',
          // An uncorrected guess stays visible on the DB row, not just in this modal.
          notes: [row.notes, row.assumption && `assumed: ${row.assumption}`].filter(Boolean).join(' · ') || null
        }
      })
    }
    toast.add({ title: 'Stockpile logged', description: `${rows.value.length} products added`, color: 'success', icon: 'i-lucide-check' })
    rows.value = []
    text.value = ''
    open.value = false
    emit('saved')
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>
