<template>
  <div>
    <JournalHeader
      section="SUPPLEMENTS"
      :meta="`${activeCount} active`"
    >
      <template #actions>
        <span class="text-[11px] text-muted hidden sm:inline">feeds AI digests as protocol context</span>
        <button
          v-if="isOwner"
          type="button"
          class="tui-btn tui-btn-accent"
          @click="openAddModal"
        >
          + ADD
        </button>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <p
      v-if="!supplements.length"
      class="px-4 sm:px-6 py-5 text-[12px] text-muted"
    >
      Nothing tracked yet.{{ isOwner ? ' Use + ADD to record your daily stack.' : '' }}
    </p>

    <div class="px-4 sm:px-6 py-4 space-y-5">
      <section
        v-for="group in groups"
        :key="group.key"
      >
        <TuiHeader
          :label="`${group.title} · ${group.items.length}`"
          :dashes="group.dashes"
        >
          <span class="text-[10.5px] text-muted normal-case">{{ group.hint }}</span>
        </TuiHeader>

        <!-- Collapsed groups keep their rows behind a link, per the mockup's ON HAND section -->
        <button
          v-if="group.collapsible && !expanded[group.key]"
          type="button"
          class="mt-1.5 text-[11px] text-accent hover:text-accent-hover cursor-pointer"
          @click="expanded[group.key] = true"
        >
          view →
        </button>

        <div
          v-else
          class="mt-1.5"
        >
          <div
            v-for="s in group.items"
            :key="s.id"
            class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-2 border-b border-[#10160f] last:border-0 group"
          >
            <span
              class="text-[13px]"
              :class="s.status === 'stopped' ? 'line-through text-muted' : 'text-hi'"
            >{{ s.name }}</span>

            <span
              v-if="annotation(s)"
              class="text-[11.5px]"
              :class="annotation(s)!.class"
            >{{ annotation(s)!.text }}</span>

            <span
              v-if="cadence(s)"
              class="text-[11px] text-accent border border-line-accent px-1.5 py-0.5"
            >{{ cadence(s) }}</span>

            <span class="ml-auto flex items-baseline gap-2 shrink-0">
              <span
                v-if="s.dose"
                class="text-[12.5px] text-muted"
              >{{ s.dose }}</span>
              <template v-if="isOwner">
                <button
                  type="button"
                  class="text-[11px] text-faint hover:text-accent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  :aria-label="`Edit ${s.name}`"
                  @click="openEditModal(s)"
                >edit</button>
                <button
                  type="button"
                  class="text-[11px] text-faint hover:text-danger cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  :aria-label="`Delete ${s.name}`"
                  @click="confirmDelete(s)"
                >✕</button>
              </template>
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- Add / Edit modal -->
    <UModal
      v-model:open="formModalOpen"
      :title="form.id ? 'Edit Supplement' : 'Add Supplement'"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model="form.name"
              placeholder="Magnesium glycinate"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Dose"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model="form.dose"
                placeholder="160 mg"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Schedule"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model="form.schedule"
                placeholder="daily"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Category"
              :ui="{ label: 'tui-label' }"
            >
              <USelect
                v-model="form.category"
                :items="CATEGORY_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Status"
              :ui="{ label: 'tui-label' }"
            >
              <USelect
                v-model="form.status"
                :items="STATUS_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Started"
              help="Blank = long-standing"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model="form.started"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-if="form.status === 'stopped'"
              label="Stopped"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model="form.stopped"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            label="Notes"
            help="Included in AI context — dose-change history goes here"
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
              @click="formModalOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="saving"
              :disabled="!form.name?.trim()"
              @click="saveSupplement"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Supplement, SupplementCategory, SupplementStatus } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const toast = useToast()
const { isOwner } = await useAuth()

const { data, refresh, error } = await useSupplements()
onMounted(() => refresh())

const supplements = computed(() => data.value ?? [])
const activeCount = computed(() => supplements.value.filter(s => s.status === 'active').length)

const groups = computed(() => [
  {
    key: 'daily',
    title: 'DAILY STACK',
    dashes: 11,
    hint: 'taken consistently, not dose-logged',
    items: supplements.value.filter(s => s.category !== 'skin' && s.status === 'active')
  },
  {
    key: 'skin',
    title: 'SKIN & HAIR',
    dashes: 12,
    hint: 'topicals and routine',
    items: supplements.value.filter(s => s.category === 'skin' && s.status === 'active')
  },
  {
    key: 'onhand',
    title: 'ON HAND · NOT TAKING',
    dashes: 7,
    hint: '',
    collapsible: true,
    items: supplements.value.filter(s => s.status === 'on_hand')
  },
  {
    key: 'stopped',
    title: 'DISCONTINUED',
    dashes: 9,
    hint: 'recent stops stay relevant to lab trends',
    collapsible: true,
    items: supplements.value.filter(s => s.status === 'stopped')
  }
].filter(g => g.items.length))

const expanded = reactive<Record<string, boolean>>({})

// The schedule field is freeform text. "daily" is the assumed default so it stays off the row;
// anything else is a real cadence worth calling out in a chip.
function cadence(s: Supplement): string | null {
  const schedule = s.schedule?.trim()
  if (!schedule || schedule.toLowerCase() === 'daily') return null
  return schedule
}

/** The inline note after the name — a dose change reads as a warn, provenance as faint. */
function annotation(s: Supplement): { text: string, class: string } | null {
  if (s.status === 'stopped' && s.stopped) {
    return { text: `stopped ${formatDate(s.stopped, 'monthDay')}`, class: 'text-faint' }
  }
  const note = s.notes?.trim()
  if (!note) return null
  // A note describing a change (an arrow, "raised"/"lowered") is the actionable kind.
  const isChange = /[→>]|\braised\b|\blowered\b|\bincreased\b|\bdecreased\b/i.test(note)
  return { text: isChange ? `▲ ${note}` : note, class: isChange ? 'text-warn' : 'text-faint' }
}

const CATEGORY_OPTIONS = [
  { label: 'Supplement / med', value: 'supplement' },
  { label: 'Skin & hair', value: 'skin' }
]
const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'On hand', value: 'on_hand' },
  { label: 'Discontinued', value: 'stopped' }
]

const formModalOpen = ref(false)
const saving = ref(false)

// UInput v-models want strings, so the form uses '' where the API uses null — the save
// endpoint normalizes '' back to null.
interface SupplementForm {
  id?: number
  name: string
  dose: string
  category: SupplementCategory
  status: SupplementStatus
  schedule: string
  started: string
  stopped: string
  notes: string
  sort?: number
}

function emptyForm(): SupplementForm {
  // id/sort explicitly undefined so values from a previously edited row don't leak in
  return { id: undefined, name: '', dose: '', category: 'supplement', status: 'active', schedule: 'daily', started: '', stopped: '', notes: '', sort: undefined }
}

const form = reactive<SupplementForm>(emptyForm())

function openAddModal() {
  Object.assign(form, emptyForm())
  formModalOpen.value = true
}

function openEditModal(s: Supplement) {
  Object.assign(form, emptyForm(), {
    id: s.id,
    name: s.name,
    dose: s.dose ?? '',
    category: s.category,
    status: s.status,
    schedule: s.schedule,
    started: s.started ?? '',
    stopped: s.stopped ?? '',
    notes: s.notes ?? '',
    sort: s.sort
  })
  formModalOpen.value = true
}

async function saveSupplement() {
  saving.value = true
  try {
    await $fetch('/api/journal/supplements/save', { method: 'POST', body: { ...form } })
    await refresh()
    formModalOpen.value = false
    toast.add({ title: form.id ? 'Supplement updated' : 'Supplement added', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function confirmDelete(s: Supplement) {
  if (!confirm(`Delete ${s.name}? If you stopped taking it, set status to Discontinued instead so it stays visible to the AI as history.`)) return
  try {
    await $fetch('/api/journal/supplements/delete', { method: 'POST', body: { id: s.id } })
    await refresh()
    toast.add({ title: 'Deleted', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
}
</script>
