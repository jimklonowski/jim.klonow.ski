<template>
  <UModal
    v-model:open="open"
    :title="form.id ? 'Edit Cycle' : 'Plan Cycle'"
    :ui="{ content: 'bg-raised border border-line-accent ring-0 max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
          <UFormField
            label="Name"
            required
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model="form.name"
              placeholder="Primo Run 1"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Start"
            required
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model="form.start_date"
              type="date"
            />
          </UFormField>
          <UFormField
            label="Weeks"
            required
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model.number="form.planned_weeks"
              type="number"
              min="1"
              max="52"
              class="w-20"
            />
          </UFormField>
        </div>

        <UFormField
          label="Goal"
          :ui="{ label: 'tui-label' }"
        >
          <UInput
            v-model="form.goal"
            placeholder="lean mass — arms & chest"
            class="w-full"
          />
        </UFormField>

        <!-- One row per planned compound. Week ranges are relative to the start date on
             purpose: shifting the start moves every phase with it. -->
        <UFormField
          label="Compounds"
          required
          :ui="{ label: 'tui-label' }"
        >
          <div class="space-y-3">
            <div
              v-for="(item, i) in form.compounds"
              :key="i"
              class="border border-line-soft px-3 py-2.5 space-y-2.5"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :style="{ background: getCompoundColor(item.compound) }"
                />
                <USelectMenu
                  v-model="item.compound"
                  :items="KNOWN_COMPOUNDS"
                  placeholder="Compound"
                  class="w-56"
                />
                <UInput
                  v-model.number="item.dose"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="dose"
                  class="w-22"
                />
                <USelect
                  v-model="item.unit"
                  :items="DOSE_UNITS"
                  value-key="value"
                  label-key="label"
                  class="w-20"
                />
                <button
                  type="button"
                  class="ml-auto text-[11px] text-faint hover:text-danger cursor-pointer"
                  :aria-label="`Remove ${item.compound || 'compound'}`"
                  @click="form.compounds.splice(i, 1)"
                >
                  ✕
                </button>
              </div>

              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span class="flex items-center gap-1">
                  <button
                    v-for="d in WEEKDAY_ORDER"
                    :key="d"
                    type="button"
                    class="w-6 h-6 text-[10px] border cursor-pointer transition-colors"
                    :class="item.weekdays.includes(d)
                      ? 'border-line-accent text-accent bg-inset'
                      : 'border-line-soft text-faint hover:text-accent'"
                    :aria-pressed="item.weekdays.includes(d)"
                    @click="toggleDay(item, d)"
                  >{{ DAY_LETTERS[d] }}</button>
                </span>

                <span class="flex items-center gap-1.5 text-[11px] text-muted">
                  wks
                  <UInput
                    v-model.number="item.fromWeek"
                    type="number"
                    min="1"
                    :max="form.planned_weeks"
                    class="w-14"
                    size="sm"
                  />
                  –
                  <UInput
                    v-model="item.toWeek"
                    type="number"
                    min="1"
                    :max="form.planned_weeks"
                    placeholder="end"
                    class="w-14"
                    size="sm"
                  />
                </span>

                <span class="text-[10.5px] text-ghost">{{ itemHint(item) }}</span>
              </div>
            </div>

            <button
              type="button"
              class="tui-btn"
              @click="addItem"
            >
              + COMPOUND
            </button>
          </div>
        </UFormField>

        <UFormField
          v-if="form.id"
          label="Ended off-plan"
          help="Set only when the cycle was cut short or extended — blank means it ran (or runs) as planned"
          :ui="{ label: 'tui-label' }"
        >
          <UInput
            v-model="form.actual_end"
            type="date"
          />
        </UFormField>

        <UFormField
          label="Notes"
          help="Included in AI context — support-stack plan, what would make you stop early"
          :ui="{ label: 'tui-label' }"
        >
          <UTextarea
            v-model="form.notes"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="tui-btn"
            @click="open = false"
          >
            CANCEL
          </button>
          <UButton
            :loading="saving"
            :disabled="!canSave"
            @click="save"
          >
            Save
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { DOSE_UNITS, KNOWN_COMPOUNDS, getCompoundColor } from '~/data/journal'
import type { Cycle, CyclePlanItem } from '#shared/utils/cycles'

const emit = defineEmits<{ saved: [] }>()

const toast = useToast()

// Monday-first, the way a dosing week reads (MON+THU); indices stay the stored 0=Sun form.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// UInput v-models want strings/undefined where the API uses null — normalized back on save.
interface ItemForm {
  compound: string
  dose: number | undefined
  unit: CyclePlanItem['unit']
  weekdays: number[]
  fromWeek: number
  toWeek: number | string | undefined
}

interface CycleFormState {
  id?: number
  name: string
  goal: string
  start_date: string
  planned_weeks: number
  actual_end: string
  compounds: ItemForm[]
  notes: string
}

function blankItem(): ItemForm {
  return { compound: '', dose: undefined, unit: 'mg', weekdays: [], fromWeek: 1, toWeek: undefined }
}

function emptyForm(): CycleFormState {
  return {
    id: undefined,
    name: '',
    goal: '',
    start_date: localToday(),
    planned_weeks: 16,
    actual_end: '',
    compounds: [blankItem()],
    notes: ''
  }
}

const open = ref(false)
const saving = ref(false)
const form = reactive<CycleFormState>(emptyForm())

/** Open blank, prefilled from an existing cycle, or as a duplicate (same plan, no id). */
function openForm(cycle?: Cycle, { duplicate = false } = {}) {
  Object.assign(form, emptyForm())
  if (cycle) {
    Object.assign(form, {
      id: duplicate ? undefined : cycle.id,
      name: duplicate ? `${cycle.name} (next)` : cycle.name,
      goal: cycle.goal ?? '',
      start_date: duplicate ? localToday() : cycle.start_date,
      planned_weeks: cycle.planned_weeks,
      actual_end: duplicate ? '' : (cycle.actual_end ?? ''),
      compounds: cycle.compounds.map(c => ({ ...c, toWeek: c.toWeek ?? undefined })),
      notes: cycle.notes ?? ''
    })
  }
  open.value = true
}

defineExpose({ open: openForm })

function toggleDay(item: ItemForm, day: number) {
  const at = item.weekdays.indexOf(day)
  if (at >= 0) item.weekdays.splice(at, 1)
  else item.weekdays.push(day)
}

/** "3×/wk · wks 12–16" under the row, so the plan reads back while being built. */
function itemHint(item: ItemForm): string {
  if (!item.weekdays.length) return 'pick days'
  const cadence = item.weekdays.length === 7 ? 'daily' : `${item.weekdays.length}×/wk`
  const to = item.toWeek || form.planned_weeks
  const span = item.fromWeek === 1 && Number(to) === form.planned_weeks
    ? 'full run'
    : `wks ${item.fromWeek}–${to}`
  return `${cadence} · ${span}`
}

const canSave = computed(() =>
  !!form.name.trim() && !!form.start_date && form.planned_weeks >= 1
  && form.compounds.length > 0
  && form.compounds.every(c => c.compound && (c.dose ?? 0) > 0 && c.weekdays.length > 0)
)

function addItem() {
  form.compounds.push(blankItem())
}

async function save() {
  saving.value = true
  try {
    await $fetch('/api/journal/cycles/save', {
      method: 'POST',
      body: {
        id: form.id,
        name: form.name,
        goal: form.goal,
        start_date: form.start_date,
        planned_weeks: form.planned_weeks,
        actual_end: form.actual_end || null,
        compounds: form.compounds.map(c => ({
          compound: c.compound,
          dose: c.dose,
          unit: c.unit,
          weekdays: c.weekdays,
          fromWeek: c.fromWeek,
          toWeek: c.toWeek === '' || c.toWeek == null ? null : Number(c.toWeek)
        })),
        notes: form.notes
      }
    })
    open.value = false
    toast.add({ title: form.id ? 'Cycle updated' : 'Cycle planned', color: 'success', icon: 'i-lucide-check' })
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
