<template>
  <UModal
    v-model:open="modalOpen"
    :title="form.id ? 'Edit planned draw' : 'Plan a draw'"
    description="The date it's booked for, where, what's drawn, and what the result should answer"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-3">
          <UFormField
            label="Date"
            required
          >
            <UInput
              v-model="form.date"
              type="date"
            />
          </UFormField>
          <UFormField
            label="Lab"
            help="Pick one or type your own"
          >
            <UInputMenu
              v-model="form.lab"
              mode="autocomplete"
              :items="KNOWN_LABS"
              open-on-click
              placeholder="Quest"
              class="w-full"
              :ui="SELECT_UI"
            />
          </UFormField>
        </div>

        <UFormField
          label="Panel"
          help="What's being drawn, in words"
        >
          <UInput
            v-model="form.panel"
            placeholder="LC/MS testosterone + CBC + CMP + lipids + iron"
            class="w-full"
          />
        </UFormField>

        <UCheckbox
          v-model="form.fasting"
          label="Fasting draw"
          description="Adds the overnight fast to the prep reminders"
        />

        <UFormField
          label="What it should answer"
          help="One question per line. The AI summary for this draw opens by answering them, in order."
        >
          <UTextarea
            v-model="form.purpose"
            :rows="3"
            class="w-full"
            placeholder="Total T on 150 mg/wk, by LC/MS&#10;Hematocrit after the dose cut"
          />
        </UFormField>

        <!-- Only when a planned cycle has a window left to book; a tentative cycle offers none. -->
        <UFormField
          v-if="checkpointOptions.length > 1"
          label="Cycle checkpoint"
          help="Books this draw as a planned cycle's baseline, mid, end or recovery check"
        >
          <USelect
            v-model="form.checkpoint"
            :items="checkpointOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>

        <!-- The link to the draw on file. The upload save sets it when a draw lands inside the
             match window; this is where a wrong link is corrected or cleared. Only offered when
             there is a draw near the date, or a link to show. -->
        <UFormField
          v-if="fulfilledOptions.length > 1"
          label="Fulfilled by"
          help="Set by the upload when a draw lands within 3 days of the date. Change it if it picked the wrong draw, or clear it to wait for the right one."
        >
          <USelect
            v-model="fulfilled"
            :items="fulfilledOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="tui-btn"
            @click="modalOpen = false"
          >
            CANCEL
          </button>
          <UButton
            :loading="saving"
            :disabled="!form.date"
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
import type { CheckpointKey, Cycle } from '#shared/utils/cycles'
import { cycleCheckpoints } from '#shared/utils/cycles'
import type { PlannedDraw } from '#shared/utils/plannedDraws'
import { KNOWN_LABS } from '#shared/utils/plannedDraws'
import { diffDays } from '#shared/utils/dates'

// The add/edit form for a planned draw (see shared/utils/plannedDraws.ts). Mounted by the /labs
// planned-draws section; the cycle dossier may open it straight into a checkpoint window.
const props = withDefaults(defineProps<{
  cycles: Cycle[]
  /** Every draw on file, for the "fulfilled by" picker. */
  drawDates?: string[]
}>(), { drawDates: () => [] })
const emit = defineEmits<{ saved: [] }>()

const SELECT_UI = { item: 'text-[12px]' }
const NO_CHECKPOINT = 'none'
const NO_DRAW = 'none'
/** Draws this far either side of the plan's date are offered as its fulfilment — wider than the automatic window, since this is the manual override. */
const LINK_PICK_WINDOW_DAYS = 14

// UInput v-models want strings where the API uses null; the save endpoint's zod schema turns
// '' back into null. The checkpoint is one select carrying both halves ("<cycleId>:<key>").
interface PlannedDrawForm {
  id?: number
  date: string
  lab: string
  panel: string
  fasting: boolean
  purpose: string
  checkpoint: string
  labs_date: string | null
}

function emptyForm(): PlannedDrawForm {
  return { id: undefined, date: localToday(), lab: '', panel: '', fasting: true, purpose: '', checkpoint: NO_CHECKPOINT, labs_date: null }
}

const open = ref(false)
const form = reactive<PlannedDrawForm>(emptyForm())
// Closing over unsaved edits (Escape, backdrop, Cancel) asks first.
const formGuard = useDirtyGuard(() => form)
const modalOpen = formGuard.guardOpen(open)

/** Open blank, prefilled from a plan, or blank with a date / checkpoint preset (the dossier's "book it"). */
function openForm(plan?: PlannedDraw, preset?: { date?: string, cycle_id?: number, checkpoint_key?: CheckpointKey }) {
  Object.assign(form, emptyForm())
  if (plan) {
    Object.assign(form, {
      id: plan.id,
      date: plan.date,
      lab: plan.lab ?? '',
      panel: plan.panel ?? '',
      fasting: plan.fasting,
      purpose: plan.purpose ?? '',
      checkpoint: plan.cycle_id != null && plan.checkpoint_key ? `${plan.cycle_id}:${plan.checkpoint_key}` : NO_CHECKPOINT,
      labs_date: plan.labs_date
    })
  }
  if (preset?.date) form.date = preset.date
  if (preset?.cycle_id != null && preset.checkpoint_key) form.checkpoint = `${preset.cycle_id}:${preset.checkpoint_key}`
  formGuard.markClean()
  open.value = true
}

defineExpose({ open: openForm })

const today = localToday()

function checkpointFor(value: string) {
  if (value === NO_CHECKPOINT) return null
  const [idStr, key] = value.split(':')
  const cycle = props.cycles.find(c => c.id === Number(idStr))
  return cycle ? cycleCheckpoints(cycle).find(cp => cp.key === key) ?? null : null
}

// The windows a draw can still be booked for: every dated checkpoint whose window hasn't closed
// (a tentative cycle has none), plus whichever one this plan is already booked to, so editing
// an old plan doesn't silently drop its link.
const checkpointOptions = computed(() => {
  const options = [{ value: NO_CHECKPOINT, label: 'Not a cycle checkpoint' }]
  for (const cycle of props.cycles) {
    for (const cp of cycleCheckpoints(cycle)) {
      const value = `${cycle.id}:${cp.key}`
      if (cp.windowTo < today && form.checkpoint !== value) continue
      options.push({
        value,
        label: `${cycle.name} · ${cp.label} (${formatDate(cp.windowFrom, 'monthDay')}–${formatDate(cp.windowTo, 'monthDay')})`
      })
    }
  }
  return options
})

// The select wants a string where the row holds null; `labs_date` itself stays the saved shape.
const fulfilled = computed({
  get: () => form.labs_date ?? NO_DRAW,
  set: (v: string) => {
    form.labs_date = v === NO_DRAW ? null : v
  }
})
const fulfilledOptions = computed(() => {
  const near = form.date ? props.drawDates.filter(d => Math.abs(diffDays(form.date, d)) <= LINK_PICK_WINDOW_DAYS) : []
  const dates = [...new Set([...near, ...(form.labs_date ? [form.labs_date] : [])])].sort()
  return [
    { value: NO_DRAW, label: 'No draw yet' },
    ...dates.map(d => ({ value: d, label: `the ${formatDate(d, 'long')} draw` }))
  ]
})

// Picking a checkpoint moves a date that sits outside its window into it (the window's start,
// or today if it's already open). Sync flush so this runs during openForm's assignment, while
// `open` is still false, and a loaded plan's own date is left alone.
watch(() => form.checkpoint, (value) => {
  if (!open.value) return
  const cp = checkpointFor(value)
  if (!cp) return
  if (form.date < cp.windowFrom || form.date > cp.windowTo) {
    form.date = cp.windowFrom > today ? cp.windowFrom : today
  }
}, { flush: 'sync' })

const { run: save, pending: saving } = useSaveAction(async () => {
  const cp = form.checkpoint === NO_CHECKPOINT ? null : form.checkpoint.split(':')
  await $fetch('/api/labs/planned/save', {
    method: 'POST',
    body: {
      id: form.id,
      date: form.date,
      lab: form.lab,
      panel: form.panel,
      fasting: form.fasting,
      purpose: form.purpose,
      cycle_id: cp ? Number(cp[0]) : null,
      checkpoint_key: cp ? cp[1] : null,
      labs_date: form.labs_date
    }
  })
  formGuard.markClean()
  open.value = false
  emit('saved')
}, { success: () => form.id ? 'Planned draw updated' : 'Draw planned' })
</script>
