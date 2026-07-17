<template>
  <UContainer>
    <div class="py-8 max-w-5xl mx-auto space-y-10">

      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
          <div>
            <h1 class="text-2xl font-bold">Vial Inventory</h1>
            <p class="text-sm text-muted">Fridge stock &amp; active vial depletion</p>
          </div>
        </div>
        <UButton size="sm" icon="i-lucide-plus" @click="openAddModal">Add Stock</UButton>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <UCard>
          <p class="text-xs text-muted uppercase tracking-wider mb-1">Active</p>
          <p class="text-2xl font-bold font-mono">{{ activeVials.length }}</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted uppercase tracking-wider mb-1">Sealed</p>
          <p class="text-2xl font-bold font-mono">{{ sealedCount }}</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted uppercase tracking-wider mb-1">Next to run out</p>
          <p class="text-lg font-bold font-mono">{{ nextToRunOut ? `${Math.round(nextToRunOut.proj.daysLeft!)}d` : '—' }}</p>
          <p v-if="nextToRunOut" class="text-xs text-muted mt-0.5 truncate">{{ nextToRunOut.vial.compound }}</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted uppercase tracking-wider mb-1">Expiring soon</p>
          <p class="text-2xl font-bold font-mono" :class="expiringCount ? 'text-warning' : ''">{{ expiringCount }}</p>
        </UCard>
      </div>

      <div v-if="!vials.length" class="text-sm text-muted">
        No vials tracked yet. Click <span class="font-medium">Add Stock</span> to log what's in your fridge.
      </div>

      <!-- Active vials -->
      <section v-if="activeVials.length">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Active Vials</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UCard v-for="{ vial, proj } in activeProjections" :key="vial.id">
            <div class="space-y-4">
              <!-- top row -->
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="w-3 h-3 rounded-full shrink-0" :style="{ background: getCompoundColor(vial.compound) }" />
                  <div class="min-w-0">
                    <p class="font-semibold truncate">{{ vial.compound }}</p>
                    <p class="text-xs text-muted truncate">
                      {{ vial.vial_amount }}{{ vial.vial_unit }}<template v-if="vial.bac_water_ml"> + {{ vial.bac_water_ml }}mL</template>
                      <template v-if="vial.supplier"> · {{ vial.supplier }}</template>
                    </p>
                  </div>
                </div>
                <UDropdownMenu :items="activeMenu(vial)" :content="{ align: 'end' }">
                  <UButton variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical" />
                </UDropdownMenu>
              </div>

              <!-- depletion bar -->
              <div>
                <div class="flex items-baseline justify-between mb-1">
                  <span class="text-sm font-mono font-medium">{{ roundAmount(proj.remaining) }}<span class="text-muted"> / {{ vial.vial_amount }} {{ vial.vial_unit }}</span></span>
                  <span class="text-xs text-muted">{{ Math.round(proj.pct * 100) }}%</span>
                </div>
                <div class="h-2 rounded-full bg-elevated overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :style="{ width: `${Math.max(2, proj.pct * 100)}%`, background: barColor(proj) }"
                  />
                </div>
              </div>

              <!-- projection -->
              <div class="flex items-center justify-between text-xs">
                <div>
                  <template v-if="proj.daysLeft != null">
                    <span class="font-semibold" :class="daysLeftClass(proj)">~{{ Math.round(proj.daysLeft) }} days left</span>
                    <span class="text-muted"> · out ~{{ formatDate(proj.runOutDate!) }}</span>
                  </template>
                  <span v-else class="text-muted">Not enough data to project</span>
                </div>
                <span v-if="proj.dailyAmount" class="text-muted font-mono" :title="rateTitle(proj)">
                  {{ roundAmount(proj.dailyAmount) }} {{ vial.vial_unit }}/d{{ proj.basis === 'typical' ? '*' : '' }}
                </span>
              </div>

              <p v-if="opened(vial)" class="text-xs text-muted border-t border-default pt-2">
                Opened {{ formatDate(vial.opened_date!) }} · {{ daysSinceOpened(vial) }}d ago
                <template v-if="proj.basis === 'typical'"> · <span class="italic">*rate estimated from typical dosing</span></template>
              </p>
            </div>
          </UCard>
        </div>
      </section>

      <!-- Sealed stock -->
      <section v-if="sealedGroups.length">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Sealed Stock (Fridge)</h2>
        <div class="space-y-6">
          <div v-for="group in sealedGroups" :key="group.compound">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: getCompoundColor(group.compound) }" />
              <span class="text-sm font-medium">{{ group.compound }}</span>
              <span class="text-xs text-muted">{{ group.totalVials }} vial{{ group.totalVials === 1 ? '' : 's' }}</span>
            </div>
            <div class="rounded-lg border border-default divide-y divide-default">
              <div
                v-for="vial in group.batches"
                :key="vial.id"
                class="flex items-center justify-between gap-3 px-3 py-2.5 flex-wrap"
              >
                <div class="flex items-center gap-3 text-sm min-w-0">
                  <span class="font-mono font-medium">{{ vial.quantity }}×</span>
                  <span class="font-mono">{{ vial.vial_amount }}{{ vial.vial_unit }}</span>
                  <span v-if="vial.supplier" class="text-muted truncate">{{ vial.supplier }}</span>
                  <UBadge v-if="isExpired(vial.expiry, today)" color="error" variant="subtle" size="sm">Expired</UBadge>
                  <UBadge v-else-if="isExpiringSoon(vial.expiry, today)" color="warning" variant="subtle" size="sm">
                    Exp {{ formatDate(vial.expiry!) }}
                  </UBadge>
                  <span v-else-if="vial.expiry" class="text-xs text-muted">exp {{ formatDate(vial.expiry) }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <UButton size="xs" variant="outline" icon="i-lucide-flask-conical" @click="openReconstituteModal(vial)">Open</UButton>
                  <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEditModal(vial)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="confirmDelete(vial)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Finished -->
      <section v-if="finishedVials.length">
        <button class="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-wider mb-4" @click="showFinished = !showFinished">
          <UIcon :name="showFinished ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4" />
          Finished ({{ finishedVials.length }})
        </button>
        <div v-if="showFinished" class="rounded-lg border border-default divide-y divide-default">
          <div
            v-for="vial in finishedVials"
            :key="vial.id"
            class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: getCompoundColor(vial.compound) }" />
              <span class="truncate">{{ vial.compound }}</span>
              <span class="text-xs text-muted font-mono">{{ vial.vial_amount }}{{ vial.vial_unit }}</span>
              <span v-if="vial.opened_date" class="text-xs text-muted">opened {{ formatDate(vial.opened_date) }}</span>
            </div>
            <div class="flex items-center gap-1">
              <UButton size="xs" variant="ghost" icon="i-lucide-rotate-ccw" title="Reactivate" @click="reactivate(vial)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="confirmDelete(vial)" />
            </div>
          </div>
        </div>
      </section>

      <p class="text-xs text-muted italic">{{ GENERAL_DISCLAIMER }}</p>
    </div>

    <!-- Add / Edit modal -->
    <UModal v-model:open="formModalOpen" :title="form.id ? 'Edit Vial' : 'Add Stock'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Compound" required>
            <UInput v-model="form.compound" list="inv-compounds" placeholder="BPC-157" class="w-full font-mono" />
            <datalist id="inv-compounds">
              <option v-for="c in KNOWN_COMPOUNDS" :key="c" :value="c" />
            </datalist>
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Vial size" required>
              <UInput v-model.number="form.vial_amount" type="number" min="0" step="0.1" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Unit">
              <USelect v-model="form.vial_unit" :items="DOSE_UNITS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField :label="form.status === 'sealed' ? 'Quantity' : 'Qty'">
              <UInput v-model.number="form.quantity" type="number" min="1" step="1" class="w-full font-mono" />
            </UFormField>
          </div>

          <UFormField label="Supplier">
            <UInput v-model="form.supplier" placeholder="e.g. Supplier X" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Lot #">
              <UInput v-model="form.lot" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Expiry">
              <UInput v-model="form.expiry" type="date" class="w-full font-mono" />
            </UFormField>
          </div>

          <!-- active-only fields -->
          <div v-if="form.status === 'active'" class="grid grid-cols-2 gap-3">
            <UFormField label="Opened">
              <UInput v-model="form.opened_date" type="date" class="w-full font-mono" />
            </UFormField>
            <UFormField label="BAC water (mL)">
              <UInput v-model.number="form.bac_water_ml" type="number" min="0" step="0.5" class="w-full font-mono" />
            </UFormField>
          </div>

          <UFormField label="Notes">
            <UTextarea v-model="form.notes" :rows="2" class="w-full" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="formModalOpen = false">Cancel</UButton>
            <UButton :loading="saving" :disabled="!form.compound || !form.vial_amount" @click="saveVial">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Open / reconstitute modal -->
    <UModal v-model:open="openModalOpen" title="Open Vial">
      <template #body>
        <div v-if="openTarget" class="space-y-4">
          <p class="text-sm">
            Reconstitute one <span class="font-medium">{{ openTarget.vial_amount }}{{ openTarget.vial_unit }} {{ openTarget.compound }}</span>
            vial<template v-if="openTarget.supplier"> from {{ openTarget.supplier }}</template>.
          </p>
          <p v-if="reconstituteHint" class="text-xs text-muted">{{ reconstituteHint }}</p>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Opened date">
              <UInput v-model="openForm.opened_date" type="date" class="w-full font-mono" />
            </UFormField>
            <UFormField label="BAC water (mL)">
              <UInput v-model.number="openForm.bac_water_ml" type="number" min="0" step="0.5" class="w-full font-mono" />
            </UFormField>
          </div>
          <p class="text-xs text-muted">
            Marks it active. Remaining amount then tracks automatically from doses of {{ openTarget.compound }} you log on/after this date.
            {{ openTarget.quantity > 1 ? `${openTarget.quantity - 1} will remain sealed.` : 'This was your last sealed one.' }}
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" @click="openModalOpen = false">Cancel</UButton>
            <UButton :loading="opening" icon="i-lucide-flask-conical" @click="doOpen">Open Vial</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

<script setup lang="ts">
import { getCompoundColor, KNOWN_COMPOUNDS, DOSE_UNITS, blankVial } from '~/data/journal'
import type { Vial } from '~/data/journal'
import { getCompoundInfo, GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import {
  projectVial, roundAmount, isExpiringSoon, isExpired, type VialProjection
} from '~/utils/vialInventory'

definePageMeta({ middleware: 'journal-auth' })

const toast = useToast()
const today: string = new Date().toISOString().slice(0, 10)

const { data: vialsData, refresh } = await useVials()
const { data: journalData, refresh: refreshJournal } = await useJournalEntries()
onMounted(() => { refresh(); refreshJournal() })

const vials = computed(() => vialsData.value ?? [])
const entries = computed(() => journalData.value ?? [])

const activeVials = computed(() => vials.value.filter(v => v.status === 'active'))
const sealedVials = computed(() => vials.value.filter(v => v.status === 'sealed'))
const finishedVials = computed(() => vials.value.filter(v => v.status === 'finished'))

const sealedCount = computed(() => sealedVials.value.reduce((s, v) => s + (v.quantity ?? 1), 0))

const activeProjections = computed(() =>
  activeVials.value
    .map(vial => ({ vial, proj: projectVial(vial, entries.value, today) }))
    .sort((a, b) => (a.proj.daysLeft ?? Infinity) - (b.proj.daysLeft ?? Infinity))
)

const nextToRunOut = computed(() =>
  activeProjections.value.find(p => p.proj.daysLeft != null) ?? null
)

const expiringCount = computed(() =>
  vials.value.filter(v => v.status !== 'finished' && (isExpired(v.expiry, today) || isExpiringSoon(v.expiry, today))).length
)

const sealedGroups = computed(() => {
  const map = new Map<string, Vial[]>()
  for (const v of sealedVials.value) {
    const list = map.get(v.compound) ?? []
    list.push(v)
    map.set(v.compound, list)
  }
  return [...map.entries()]
    .map(([compound, batches]) => ({
      compound,
      batches,
      totalVials: batches.reduce((s, b) => s + (b.quantity ?? 1), 0)
    }))
    .sort((a, b) => a.compound.localeCompare(b.compound))
})

// --- display helpers ---
function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function opened(v: Vial) {
  return !!v.opened_date
}
function daysSinceOpened(v: Vial) {
  if (!v.opened_date) return 0
  return Math.floor((new Date(today + 'T12:00:00').getTime() - new Date(v.opened_date + 'T12:00:00').getTime()) / 86400000)
}
function barColor(proj: VialProjection) {
  if (proj.daysLeft != null && proj.daysLeft < 7) return '#ef4444'
  if (proj.daysLeft != null && proj.daysLeft < 14) return '#f59e0b'
  return '#14b8a6'
}
function daysLeftClass(proj: VialProjection) {
  if (proj.daysLeft == null) return 'text-muted'
  if (proj.daysLeft < 7) return 'text-error'
  if (proj.daysLeft < 14) return 'text-warning'
  return 'text-success'
}
function rateTitle(proj: VialProjection) {
  return proj.basis === 'typical'
    ? 'Estimated from typical dosing (not enough logged history yet)'
    : 'Based on your logged doses over the last 4 weeks'
}

// --- add / edit ---
const formModalOpen = ref(false)
const saving = ref(false)
const form = reactive<Vial>(blankVial())

function openAddModal() {
  Object.assign(form, blankVial())
  delete form.id
  formModalOpen.value = true
}
function openEditModal(v: Vial) {
  Object.assign(form, { ...blankVial(), ...v })
  formModalOpen.value = true
}

async function saveVial() {
  saving.value = true
  try {
    await $fetch('/api/journal/vials/save', { method: 'POST', body: { ...form } })
    await refresh()
    formModalOpen.value = false
    toast.add({ title: form.id ? 'Vial updated' : 'Stock added', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// --- open / reconstitute ---
const openModalOpen = ref(false)
const opening = ref(false)
const openTarget = ref<Vial | null>(null)
const openForm = reactive<{ opened_date: string, bac_water_ml: number | null }>({ opened_date: today, bac_water_ml: 2 })

const reconstituteHint = computed(() =>
  openTarget.value ? getCompoundInfo(openTarget.value.compound)?.reconstitution?.instructions ?? '' : ''
)

function openReconstituteModal(v: Vial) {
  openTarget.value = v
  openForm.opened_date = today
  openForm.bac_water_ml = 2
  openModalOpen.value = true
}

async function doOpen() {
  if (!openTarget.value) return
  opening.value = true
  try {
    await $fetch('/api/journal/vials/open', {
      method: 'POST',
      body: { id: openTarget.value.id, opened_date: openForm.opened_date, bac_water_ml: openForm.bac_water_ml }
    })
    await refresh()
    openModalOpen.value = false
    toast.add({ title: 'Vial opened', description: `${openTarget.value.compound} is now active`, color: 'success', icon: 'i-lucide-flask-conical' })
  }
  catch (err) {
    toast.add({ title: 'Open failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    opening.value = false
  }
}

// --- status actions ---
const activeMenu = (v: Vial) => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEditModal(v) },
    { label: 'Open in calculator', icon: 'i-lucide-calculator', to: calculatorLink(v) },
  ],
  [
    { label: 'Mark finished', icon: 'i-lucide-check-check', onSelect: () => setStatus(v, 'finished') },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => confirmDelete(v) },
  ]
]

function calculatorLink(v: Vial) {
  return {
    path: '/journal/calculator',
    query: { vialAmount: v.vial_amount, vialUnit: v.vial_unit, bacWaterMl: v.bac_water_ml ?? 2 }
  }
}

async function setStatus(v: Vial, status: Vial['status']) {
  try {
    await $fetch('/api/journal/vials/save', { method: 'POST', body: { ...v, status } })
    await refresh()
    toast.add({ title: status === 'finished' ? 'Marked finished' : 'Updated', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
}

function reactivate(v: Vial) {
  setStatus(v, 'active')
}

async function confirmDelete(v: Vial) {
  if (!confirm(`Delete this ${v.compound} vial? This can't be undone.`)) return
  try {
    await $fetch('/api/journal/vials/delete', { method: 'POST', body: { id: v.id } })
    await refresh()
    toast.add({ title: 'Deleted', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
}
</script>
