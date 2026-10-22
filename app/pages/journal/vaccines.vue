<template>
  <div>
    <JournalHeader
      section="VACCINES"
      :meta="meta"
    >
      <template #actions>
        <span class="text-meta text-muted hidden sm:inline">immunization record · recent shots feed AI context</span>
        <button
          v-if="isOwner"
          type="button"
          class="tui-btn tui-btn-accent"
          @click="openAddModal"
        >
          + LOG SHOT
        </button>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <div class="px-4 sm:px-6 py-4 space-y-5">
      <!-- Wallet-card facts: looked up, never trended. Blood type lives here because it came
           back on a lab panel and had been forgotten — the same reason the vaccine log exists. -->
      <section>
        <TuiHeader
          label="CARD"
          :dashes="16"
        >
          <span class="text-label text-muted normal-case">standing facts</span>
        </TuiHeader>
        <div class="mt-1.5">
          <div
            v-for="f in profileFields"
            :key="f.key"
            class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-2 border-b border-line-row last:border-0"
          >
            <span class="text-prose text-hi">{{ f.label }}</span>
            <span
              v-if="f.hint"
              class="text-meta text-faint hidden sm:inline"
            >{{ f.hint }}</span>

            <span class="ml-auto flex items-baseline gap-2.5 shrink-0">
              <span
                v-if="profile[f.key]"
                class="num-display text-title text-accent"
              >{{ profile[f.key] }}<span
                v-if="f.unit"
                class="text-meta text-muted"
              > {{ f.unit }}</span></span>
              <span
                v-else
                class="text-small text-faint"
              >not recorded</span>
              <button
                v-if="isOwner"
                type="button"
                class="text-meta text-faint hover:text-accent cursor-pointer"
                :aria-label="`${profile[f.key] ? 'Edit' : 'Set'} ${f.label}`"
                @click="openProfileModal(f)"
              >{{ profile[f.key] ? 'edit' : 'set' }}</button>
            </span>
          </div>
        </div>
      </section>

      <p
        v-if="!vaccinations.length"
        class="text-small text-muted"
      >
        No shots logged yet.{{ isOwner ? ' Use + LOG SHOT to record a vaccine — the coverage table then answers "when was my last tetanus shot?" for you.' : '' }}
      </p>

      <section v-if="vaccinations.length">
        <TuiHeader
          label="COVERAGE"
          :dashes="12"
        >
          <span class="text-label text-muted normal-case">latest dose per vaccine · next booster</span>
        </TuiHeader>
        <div class="mt-1.5">
          <div
            v-for="c in coverage"
            :key="c.family"
            class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-2 border-b border-line-row last:border-0"
          >
            <span class="text-prose text-hi">{{ c.label }}</span>
            <span
              v-if="c.doses > 1"
              class="text-meta text-faint"
            >×{{ c.doses }}</span>
            <span
              v-if="c.hint"
              class="text-meta text-faint hidden sm:inline"
            >{{ c.hint }}</span>

            <span class="ml-auto flex items-baseline gap-2 shrink-0">
              <span class="text-row text-muted">last {{ formatDate(c.lastDate) }}</span>
              <span
                v-if="dueChip(c)"
                class="text-meta border px-1.5 py-0.5"
                :class="dueChip(c)!.class"
              >{{ dueChip(c)!.text }}</span>
            </span>
          </div>
        </div>
      </section>

      <section v-if="vaccinations.length">
        <TuiHeader
          label="LOG"
          :dashes="17"
        >
          <span class="text-label text-muted normal-case">every dose, newest first</span>
        </TuiHeader>
        <div class="mt-1.5">
          <div
            v-for="v in vaccinations"
            :key="v.id"
            class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-2 border-b border-line-row last:border-0 group"
          >
            <span class="text-small text-muted tabular-nums w-23 shrink-0">{{ formatDate(v.date) }}</span>
            <span class="text-prose text-hi">{{ v.vaccine }}</span>
            <span
              v-if="v.product"
              class="text-small text-muted"
            >{{ v.product }}</span>
            <span
              v-if="v.notes"
              class="text-small text-faint"
            >{{ v.notes }}</span>

            <span
              v-if="isOwner"
              class="ml-auto flex items-baseline gap-2 shrink-0"
            >
              <button
                type="button"
                class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
                :aria-label="`Edit ${v.vaccine} on ${v.date}`"
                @click="openEditModal(v)"
              >edit</button>
              <button
                type="button"
                class="text-meta text-faint hover:text-danger cursor-pointer tui-row-action"
                :aria-label="`Delete ${v.vaccine} on ${v.date}`"
                @click="confirmDelete(v)"
              >✕</button>
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- Card fact modal (one field at a time) -->
    <UModal
      v-model:open="profileModalOpen"
      :title="profileField?.label ?? ''"
    >
      <template #body>
        <div
          v-if="profileField"
          class="space-y-4"
        >
          <UFormField
            :label="profileField.label"
            :help="profileField.hint"
          >
            <USelect
              v-if="profileField.kind === 'select'"
              v-model="profileValue"
              :items="profileField.options"
              placeholder="Pick one"
              class="w-full"
            />
            <!-- UInput type="number" emits a NUMBER into profileValue; saveProfile sends it as the
                 string the API stores (the table's one value column is TEXT) — posting the raw
                 number was a 400 "expected string, received number" (2026-10-22). The server
                 checks the bounds and stores the canonical figure. -->
            <UInput
              v-else-if="profileField.kind === 'number'"
              v-model="profileValue"
              type="number"
              inputmode="decimal"
              :min="profileField.min"
              :max="profileField.max"
              :placeholder="profileField.placeholder"
              class="w-full"
            >
              <template
                v-if="profileField.unit"
                #trailing
              >
                <span class="text-meta text-muted">{{ profileField.unit }}</span>
              </template>
            </UInput>
            <UInput
              v-else
              v-model="profileValue"
              :placeholder="profileField.placeholder"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <button
              v-if="profile[profileField.key]"
              type="button"
              class="tui-btn mr-auto"
              @click="saveProfile('')"
            >
              CLEAR
            </button>
            <button
              type="button"
              class="tui-btn"
              @click="profileModalOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="profileSaving"
              :disabled="!profileValue"
              @click="saveProfile(profileValue)"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Add / Edit modal -->
    <UModal
      v-model:open="formModalOpen"
      :title="form.id ? 'Edit Shot' : 'Log Shot'"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Date"
              required
            >
              <UInput
                v-model="form.date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Vaccine"
              required
              help="Pick from the list or type your own"
            >
              <UInputMenu
                v-model="form.vaccine"
                mode="autocomplete"
                :items="VACCINE_NAMES"
                open-on-click
                placeholder="Tetanus (Td/Tdap)"
                class="w-full"
                :ui="SELECT_UI"
              />
            </UFormField>
          </div>

          <UFormField
            label="Product / brand"
            help="Optional — Boostrix, Spikevax 2026-27, Fluzone High-Dose…"
          >
            <UInput
              v-model="form.product"
              placeholder="Boostrix"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Notes"
            help="Included in AI context — timing vs a blood draw, arm, reactions"
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
              :disabled="!form.date || !form.vaccine?.trim()"
              @click="saveVaccination"
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
import type { ProfileField } from '#shared/utils/profile'
import { profileFieldsFor } from '#shared/utils/profile'
import type { Vaccination, VaccineCoverage } from '#shared/utils/vaccines'
import { VACCINE_NAMES, vaccineCoverage } from '#shared/utils/vaccines'

useSeoMeta({ title: 'Journal · Vaccines' })

// Owner-only edits (not canEdit): the demo sandbox has neither table to write into.
const { role, isOwner } = await useAuth()
// The card lists what the API returns for this role: the doctor's view has no water or food
// tracking, so their cup size and protein target are neither sent nor shown as "not recorded".
const profileFields = computed(() => profileFieldsFor(role.value))

const [{ data, refresh, error }, { data: profileData, refresh: refreshProfile }] = await Promise.all([
  useVaccinations(),
  useProfile()
])

// Reactive (useToday): the overnight PWA used to keep yesterday as today until a reload.
const today = useToday()
const vaccinations = computed(() => data.value ?? [])
const coverage = computed(() => vaccineCoverage(vaccinations.value, today.value))
const profile = computed(() => profileData.value ?? {})

// "3 DOSES · NEXT DUE SEP 2027 · BLOOD TYPE O+" — the soonest booster and the card fact most
// often asked for, readable without scrolling.
const meta = computed(() => {
  const parts: string[] = []
  const n = vaccinations.value.length
  if (n) parts.push(`${n} dose${n === 1 ? '' : 's'}`)
  const next = coverage.value.find(c => c.status === 'overdue' || c.status === 'due')
    ?? coverage.value.find(c => c.status === 'current')
  if (next?.nextDue) parts.push(`${next.status === 'overdue' ? 'overdue' : 'next due'} ${formatDate(next.nextDue, 'monthYear')}`)
  if (profile.value.blood_type) parts.push(`blood type ${profile.value.blood_type}`)
  return parts.length ? parts.join(' · ') : undefined
})

// --- card facts ---

const profileModalOpen = ref(false)
const profileField = ref<ProfileField | null>(null)
// Typed as the inputs' v-model is (string), but at runtime the number input hands back a NUMBER
// (Nuxt UI casts it) — saveProfile stringifies whatever arrives.
const profileValue = ref('')

function openProfileModal(f: ProfileField) {
  profileField.value = f
  profileValue.value = profile.value[f.key] ?? ''
  profileModalOpen.value = true
}

/** '' clears the fact (the API deletes the row) — the CLEAR button passes that explicitly. */
const { run: runSaveProfile, pending: profileSaving } = useSaveAction(async (field: ProfileField, value: string) => {
  await $fetch('/api/journal/profile', { method: 'POST', body: { key: field.key, value } })
  await refreshProfile()
  profileModalOpen.value = false
}, { success: (_, field, value) => value ? `${field.label} saved` : `${field.label} cleared` })

/** Whatever the input emitted goes over the wire as the string the profile table stores. */
async function saveProfile(value: string | number) {
  if (profileField.value) await runSaveProfile(profileField.value, value === '' ? '' : String(value))
}

// --- shots ---

/** The booster chip: overdue reads as danger, due-soon as warn, a distant date as plain accent. */
function dueChip(c: VaccineCoverage): { text: string, class: string } | null {
  if (!c.nextDue) return null
  const when = formatDate(c.nextDue, 'monthYear')
  if (c.status === 'overdue') return { text: `overdue since ${when}`, class: 'text-danger border-danger' }
  if (c.status === 'due') return { text: `due ${when}`, class: 'text-warn border-warn' }
  return { text: `next ${when}`, class: 'text-accent border-line-accent' }
}

const SELECT_UI = { item: 'text-small' }

const formModalRaw = ref(false)

// UInput v-models want strings, so the form uses '' where the API uses null — the save
// endpoint normalizes '' back to null.
interface VaccinationForm {
  id?: number
  date: string
  vaccine: string
  product: string
  notes: string
}

function emptyForm(): VaccinationForm {
  return { id: undefined, date: today.value, vaccine: '', product: '', notes: '' }
}

const form = reactive<VaccinationForm>(emptyForm())
// Closing the modal (Escape, backdrop, Cancel) asks first when the form has unsaved edits.
const formGuard = useDirtyGuard(() => form)
const formModalOpen = formGuard.guardOpen(formModalRaw)

function openAddModal() {
  Object.assign(form, emptyForm())
  formGuard.markClean()
  formModalOpen.value = true
}

function openEditModal(v: Vaccination) {
  Object.assign(form, emptyForm(), {
    id: v.id,
    date: v.date,
    vaccine: v.vaccine,
    product: v.product ?? '',
    notes: v.notes ?? ''
  })
  formGuard.markClean()
  formModalOpen.value = true
}

const { run: saveVaccination, pending: saving } = useSaveAction(async () => {
  await $fetch('/api/journal/vaccines/save', { method: 'POST', body: { ...form } })
  await refresh()
  formGuard.markClean()
  formModalOpen.value = false
}, { success: () => form.id ? 'Shot updated' : 'Shot logged' })

const { run: deleteVaccination } = useSaveAction(async (v: Vaccination) => {
  await $fetch('/api/journal/vaccines/delete', { method: 'POST', body: { id: v.id } })
  await refresh()
}, { success: 'Deleted', error: 'Delete failed' })

async function confirmDelete(v: Vaccination) {
  if (!confirm(`Delete ${v.vaccine} on ${formatDate(v.date)}?`)) return
  await deleteVaccination(v)
}
</script>
