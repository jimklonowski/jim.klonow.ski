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
            :class="row.vial_amount > 0 ? '' : 'border-warn'"
          >
            <div class="grid grid-cols-12 gap-2 items-end">
              <UFormField
                label="Compound"
                class="col-span-12 sm:col-span-5"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model="row.compound"
                  list="dump-compounds"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="row.vial_amount > 0 ? 'Per unit' : 'Per unit — needs a size'"
                class="col-span-4 sm:col-span-3"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model.number="row.vial_amount"
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
            <UInput
              v-model="row.notes"
              placeholder="notes"
              size="sm"
              class="w-full"
            />
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

interface DumpRow {
  compound: string
  vial_amount: number
  vial_unit: 'mg' | 'mcg' | 'iu'
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

const allValid = computed(() =>
  rows.value.length > 0 && rows.value.every(r => r.compound.trim() && r.vial_amount > 0 && r.quantity >= 1)
)

function backToText() {
  rows.value = []
}

async function parse() {
  parsing.value = true
  try {
    const result = await $fetch<{ vials: DumpRow[] }>('/api/journal/vials/parse', {
      method: 'POST',
      body: { text: text.value }
    })
    rows.value = result.vials
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
      await $fetch('/api/journal/vials/save', {
        method: 'POST',
        body: {
          compound: row.compound.trim(),
          vial_amount: row.vial_amount,
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
