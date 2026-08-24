<template>
  <UContainer>
    <div class="py-8 max-w-4xl mx-auto space-y-10">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <UButton
            to="/journal"
            variant="ghost"
            size="xs"
            icon="i-lucide-arrow-left"
          />
          <div>
            <h1 class="text-2xl font-bold">
              Supplements
            </h1>
            <p class="text-sm text-muted">
              Standing vitamins, meds &amp; skin routine — feeds the AI digests as protocol context
            </p>
          </div>
        </div>
        <UButton
          v-if="isOwner"
          size="sm"
          icon="i-lucide-plus"
          @click="openAddModal"
        >
          Add
        </UButton>
      </div>

      <div
        v-if="!supplements.length"
        class="text-sm text-muted"
      >
        Nothing tracked yet.<template v-if="isOwner">
          Click <span class="font-medium">Add</span> to record your daily stack.
        </template>
      </div>

      <section
        v-for="group in groups"
        :key="group.title"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-1">
          {{ group.title }}
        </h2>
        <p class="text-xs text-muted mb-4">
          {{ group.hint }}
        </p>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div
            v-for="s in group.items"
            :key="s.id"
            class="flex items-center justify-between gap-3 px-3 py-2.5 flex-wrap"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="text-sm font-medium"
                  :class="s.status === 'stopped' ? 'line-through text-muted' : ''"
                >{{ s.name }}</span>
                <span
                  v-if="s.dose"
                  class="text-xs text-muted font-mono"
                >{{ s.dose }}</span>
                <UBadge
                  v-if="s.schedule && s.schedule !== 'daily'"
                  variant="subtle"
                  size="sm"
                >
                  {{ s.schedule }}
                </UBadge>
                <span
                  v-if="s.status === 'stopped' && s.stopped"
                  class="text-xs text-muted"
                >stopped {{ formatDate(s.stopped) }}</span>
                <span
                  v-else-if="s.started"
                  class="text-xs text-muted"
                >since {{ formatDate(s.started) }}</span>
              </div>
              <p
                v-if="s.notes"
                class="text-xs text-muted italic mt-0.5"
              >
                {{ s.notes }}
              </p>
            </div>
            <div
              v-if="isOwner"
              class="flex items-center gap-1 shrink-0"
            >
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-pencil"
                @click="openEditModal(s)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="confirmDelete(s)"
              />
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Add / Edit modal -->
    <UModal
      v-model:open="formModalOpen"
      :title="form.id ? 'Edit Supplement' : 'Add Supplement'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="form.name"
              placeholder="Magnesium glycinate"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Dose">
              <UInput
                v-model="form.dose"
                placeholder="160 mg"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField label="Schedule">
              <UInput
                v-model="form.schedule"
                placeholder="daily"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Category">
              <USelect
                v-model="form.category"
                :items="CATEGORY_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Status">
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
            >
              <UInput
                v-model="form.started"
                type="date"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField
              v-if="form.status === 'stopped'"
              label="Stopped"
            >
              <UInput
                v-model="form.stopped"
                type="date"
                class="w-full font-mono"
              />
            </UFormField>
          </div>

          <UFormField
            label="Notes"
            help="Included in AI context — dose-change history goes here"
          >
            <UTextarea
              v-model="form.notes"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              @click="formModalOpen = false"
            >
              Cancel
            </UButton>
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
  </UContainer>
</template>

<script setup lang="ts">
import type { Supplement, SupplementCategory, SupplementStatus } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const toast = useToast()
const { isOwner } = await useAuth()

const { data, refresh } = await useSupplements()
onMounted(() => refresh())

const supplements = computed(() => data.value ?? [])

const groups = computed(() => [
  {
    title: 'Daily stack',
    hint: 'Taken consistently — not dose-logged in the journal.',
    items: supplements.value.filter(s => s.category !== 'skin' && s.status === 'active')
  },
  {
    title: 'Skin & hair',
    hint: 'Topicals and routine.',
    items: supplements.value.filter(s => s.category === 'skin' && s.status === 'active')
  },
  {
    title: 'On hand',
    hint: 'Owned but not currently taking — context for pending decisions.',
    items: supplements.value.filter(s => s.status === 'on_hand')
  },
  {
    title: 'Discontinued',
    hint: 'Kept as history — recent stops stay relevant to lab trends.',
    items: supplements.value.filter(s => s.status === 'stopped')
  }
].filter(g => g.items.length))

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

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
</script>
