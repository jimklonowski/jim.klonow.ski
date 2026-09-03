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
          <!-- The precision hint lives under the grid, not in this field's help slot: these
               are max-content `auto` columns, so a sentence in here widens the whole column
               and squeezes Name down to a few characters. -->
          <UFormField
            label="Start"
            required
            :ui="{ label: 'tui-label' }"
          >
            <div class="flex gap-2">
              <USelect
                v-model="form.start_precision"
                :items="PRECISION_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-30"
              />
              <!-- Coarse precisions pick from period anchors rather than a date input: a day
                   picker would demand a day-of-month that means nothing, and native
                   type="month" isn't supported everywhere. -->
              <UInput
                v-if="form.start_precision === 'day'"
                v-model="form.start_date"
                type="date"
              />
              <USelect
                v-else
                v-model="form.start_date"
                :items="periodOptions"
                value-key="value"
                label-key="label"
                class="w-32"
              />
            </div>
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
        <p
          class="text-[10.5px] -mt-2.5"
          :class="form.start_precision === 'day' ? 'text-faint' : 'text-warn'"
        >
          {{ startHelp }}
        </p>

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

        <!-- A cycle with no committed start hasn't begun, so it can't have ended off-plan —
             the field would be inert (the API rejects it too). -->
        <UFormField
          v-if="form.id && form.start_precision === 'day'"
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
import type { Cycle, CyclePlanItem, StartPrecision } from '#shared/utils/cycles'
import { periodLabel, startAnchor, startPrecisionOf } from '#shared/utils/cycles'

const emit = defineEmits<{ saved: [] }>()

const toast = useToast()

// Monday-first, the way a dosing week reads (MON+THU); indices stay the stored 0=Sun form.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const PRECISION_OPTIONS: Array<{ value: StartPrecision, label: string }> = [
  { value: 'day', label: 'exact date' },
  { value: 'month', label: 'month' },
  { value: 'quarter', label: 'quarter' }
]

const PRECISION_HELP: Record<StartPrecision, string> = {
  day: 'A committed start — rings, adherence, and lab checkpoints all run off it',
  month: 'Not scheduled yet: the plan is on file, but nothing dated derives from it',
  quarter: 'Not scheduled yet: the plan is on file, but nothing dated derives from it'
}

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
  start_precision: StartPrecision
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
    start_precision: 'day',
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
function openForm(cycle?: Cycle, { duplicate = false, precision }: { duplicate?: boolean, precision?: StartPrecision } = {}) {
  Object.assign(form, emptyForm())
  if (cycle) {
    Object.assign(form, {
      id: duplicate ? undefined : cycle.id,
      name: duplicate ? `${cycle.name} (next)` : cycle.name,
      goal: cycle.goal ?? '',
      start_date: duplicate ? localToday() : cycle.start_date,
      // A duplicate is a fresh plan, so it starts uncommitted rather than inheriting a date;
      // `precision` lets a caller open straight into a mode (the dossier's SET START DATE).
      start_precision: precision ?? (duplicate ? 'month' : startPrecisionOf(cycle)),
      planned_weeks: cycle.planned_weeks,
      actual_end: duplicate ? '' : (cycle.actual_end ?? ''),
      compounds: cycle.compounds.map(c => ({ ...c, toWeek: c.toWeek ?? undefined })),
      notes: cycle.notes ?? ''
    })
    // Duplicating into a tentative start needs an anchor the period list actually contains.
    if (duplicate) form.start_date = startAnchor(localToday(), form.start_precision)
  }
  open.value = true
}

defineExpose({ open: openForm })

const startHelp = computed(() => PRECISION_HELP[form.start_precision])

/**
 * Selectable anchors for a coarse start: the next two years of months, or eight quarters.
 * Anchored on an existing tentative start too, so editing a plan already pencilled in for a
 * month outside the forward window doesn't silently reset it.
 */
const periodOptions = computed(() => {
  const precision = form.start_precision
  if (precision === 'day') return []
  const step = precision === 'quarter' ? 3 : 1
  const first = startAnchor(
    form.start_date && form.start_date < localToday() ? form.start_date : localToday(),
    precision
  )
  const [year, month] = first.split('-').map(Number) as [number, number]
  return Array.from({ length: precision === 'quarter' ? 8 : 24 }, (_, i) => {
    const offset = month - 1 + i * step
    const value = `${year + Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, '0')}-01`
    return { value, label: periodLabel(value, precision) }
  })
})

// Switching precision re-anchors the date so start_date is always canonical for the mode:
// picking "month" off a 14th-of-the-month date lands on the 1st, and coming back to an exact
// date starts from that anchor rather than from whatever was typed two modes ago.
watch(() => form.start_precision, (precision) => {
  form.start_date = startAnchor(form.start_date || localToday(), precision)
  // An off-plan end is meaningless without a committed start (and the API rejects the pair).
  if (precision !== 'day') form.actual_end = ''
})

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
        start_precision: form.start_precision,
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
