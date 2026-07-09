<template>
  <UContainer>
    <div class="py-8 max-w-5xl mx-auto space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
          <UButton
            v-if="prevEntry"
            :to="`/journal/${prevEntry.date}`"
            variant="ghost"
            size="xs"
            icon="i-lucide-chevron-left"
          />
          <div>
            <h1 class="text-2xl font-bold">{{ isNew ? 'New Entry' : formatDate(form.date) }}</h1>
            <p v-if="form.day" class="text-muted text-sm">Day {{ form.day }}</p>
          </div>
          <UButton
            v-if="nextEntry"
            :to="`/journal/${nextEntry.date}`"
            variant="ghost"
            size="xs"
            icon="i-lucide-chevron-right"
          />
        </div>
        <div class="flex gap-2">
          <UButton
            v-if="!isNew"
            :to="`/journal/calendar`"
            variant="ghost"
            size="xs"
            icon="i-lucide-calendar"
          />
          <UButton
            size="sm"
            icon="i-lucide-save"
            :loading="saving"
            @click="save"
          >
            Save
          </UButton>
        </div>
      </div>

      <!-- Date & Day -->
      <UCard>
        <template #header><p class="text-sm font-semibold">Date</p></template>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Date">
            <UInput v-model="form.date" type="date" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Day #">
            <UInput v-model.number="form.day" type="number" placeholder="e.g. 35" class="w-full font-mono" />
          </UFormField>
        </div>
      </UCard>

      <!-- Vitals -->
      <UCard>
        <template #header><p class="text-sm font-semibold">Vitals</p></template>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <UFormField label="Weight (lbs)">
            <UInput v-model.number="form.weight_lbs" type="number" step="0.1" placeholder="155.0" class="w-full font-mono" />
          </UFormField>
          <UFormField label="BP Systolic">
            <UInput v-model.number="form.bp_systolic" type="number" placeholder="120" class="w-full font-mono" />
          </UFormField>
          <UFormField label="BP Diastolic">
            <UInput v-model.number="form.bp_diastolic" type="number" placeholder="80" class="w-full font-mono" />
          </UFormField>
          <UFormField label="RHR (bpm)">
            <UInput v-model.number="form.rhr" type="number" placeholder="50" class="w-full font-mono" />
          </UFormField>
          <UFormField label="HRV (ms)">
            <UInput v-model.number="form.hrv" type="number" placeholder="44" class="w-full font-mono" />
          </UFormField>
        </div>
      </UCard>

      <!-- Peptides -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold">Peptides</p>
            <div class="flex gap-2">
              <UButton v-if="prevEntry?.peptides?.length" size="xs" variant="ghost" icon="i-lucide-copy" @click="copyFromPrevious">Copy prev</UButton>
              <UButton size="xs" variant="outline" icon="i-lucide-plus" @click="addPeptide">Add</UButton>
            </div>
          </div>
        </template>

        <div v-if="form.peptides.length" class="space-y-3">
          <div
            v-for="(peptide, i) in form.peptides"
            :key="i"
            class="grid grid-cols-12 gap-2 items-end"
          >
            <UFormField label="Time" class="col-span-2">
              <UInput v-model="peptide.time" type="time" class="w-full font-mono text-sm" />
            </UFormField>
            <UFormField label="Compound" class="col-span-4">
              <UInput
                v-model="peptide.compound"
                :list="`compounds-${i}`"
                placeholder="MOTS-C"
                class="w-full font-mono text-sm"
              />
              <datalist :id="`compounds-${i}`">
                <option v-for="c in KNOWN_COMPOUNDS" :key="c" :value="c" />
              </datalist>
            </UFormField>
            <UFormField label="Dose" class="col-span-2">
              <UInput v-model.number="peptide.dose" type="number" step="0.1" placeholder="2.5" class="w-full font-mono text-sm" />
            </UFormField>
            <UFormField label="Unit" class="col-span-1">
              <USelect v-model="peptide.unit" :items="DOSE_UNITS" value-key="value" label-key="label" class="w-full text-sm" />
            </UFormField>
            <UFormField label="Site" class="col-span-2">
              <USelect v-model="peptide.site" :items="INJECTION_SITES" value-key="value" label-key="label" class="w-full text-sm" />
            </UFormField>
            <div class="col-span-1 flex items-end pb-0.5">
              <UButton variant="ghost" color="error" size="xs" icon="i-lucide-x" @click="removePeptide(i)" />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted">No peptides logged. Click Add to record injections.</p>
      </UCard>

      <!-- Reconstitutions -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold">Vial Reconstitutions</p>
              <p class="text-xs text-muted">Log new vials mixed today</p>
            </div>
            <UButton size="xs" variant="outline" icon="i-lucide-flask-conical" @click="addReconstitution">Add</UButton>
          </div>
        </template>

        <div v-if="form.reconstitutions.length" class="space-y-3">
          <div
            v-for="(r, i) in form.reconstitutions"
            :key="i"
            class="grid grid-cols-12 gap-2 items-end"
          >
            <UFormField label="Compound" class="col-span-3">
              <UInput
                v-model="r.compound"
                :list="`recon-compounds-${i}`"
                placeholder="GHK-Cu"
                class="w-full font-mono text-sm"
              />
              <datalist :id="`recon-compounds-${i}`">
                <option v-for="c in KNOWN_COMPOUNDS" :key="c" :value="c" />
              </datalist>
            </UFormField>
            <UFormField label="Vial size" class="col-span-2">
              <UInput v-model.number="r.vial_amount" type="number" placeholder="50" class="w-full font-mono text-sm" />
            </UFormField>
            <UFormField label="Unit" class="col-span-1">
              <USelect v-model="r.vial_unit" :items="DOSE_UNITS" value-key="value" label-key="label" class="w-full text-sm" />
            </UFormField>
            <UFormField label="Supplier" class="col-span-3">
              <UInput v-model="r.supplier" placeholder="EZ Peptides" class="w-full text-sm" />
            </UFormField>
            <UFormField label="BAC water (mL)" class="col-span-2">
              <UInput v-model.number="r.bac_water_ml" type="number" step="0.5" placeholder="2" class="w-full font-mono text-sm" />
            </UFormField>
            <div class="col-span-1 flex items-end pb-0.5">
              <UButton variant="ghost" color="error" size="xs" icon="i-lucide-x" @click="removeReconstitution(i)" />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted">No reconstitutions today.</p>
      </UCard>

      <!-- Food -->
      <UCard>
        <template #header><p class="text-sm font-semibold">Food</p></template>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Breakfast">
            <UInput v-model="form.food.breakfast" placeholder="Protein shake + creatine" class="w-full" />
          </UFormField>
          <UFormField label="Snack">
            <UInput v-model="form.food.snack" placeholder="Sourdough" class="w-full" />
          </UFormField>
          <UFormField label="Lunch">
            <UInput v-model="form.food.lunch" placeholder="Chipotle bowl" class="w-full" />
          </UFormField>
          <UFormField label="Dinner">
            <UInput v-model="form.food.dinner" placeholder="Steak + veggies" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <!-- Workout & Notes -->
      <UCard>
        <template #header><p class="text-sm font-semibold">Workout & Notes</p></template>
        <div class="space-y-4">
          <UFormField label="Workout">
            <UInput v-model="form.workout" placeholder="Dumbbells – Chest, Biceps, Triceps" class="w-full" />
          </UFormField>
          <UFormField label="Notes">
            <UTextarea v-model="form.notes" placeholder="Any observations, how you felt, etc." :rows="3" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <!-- Save -->
      <div class="flex justify-end gap-3">
        <UButton to="/journal" variant="ghost">Cancel</UButton>
        <UButton :loading="saving" icon="i-lucide-save" @click="save">Save Entry</UButton>
      </div>

    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { KNOWN_COMPOUNDS, DOSE_UNITS, INJECTION_SITES, blankEntry } from '~/data/journal'
import type { PeptideEntry, ReconstitutionEntry } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const nuxtApp = useNuxtApp()
const route = useRoute()
const toast = useToast()

const dateParam = computed(() => route.params.date as string)

const { data: allEntries, refresh } = await useJournalEntries()

onMounted(refresh)

const existingEntry = computed(() =>
  allEntries.value?.find(e => e.date === dateParam.value) ?? null
)

const isNew = computed(() => !existingEntry.value)

const prevEntry = computed(() => {
  if (!allEntries.value?.length) return null
  const earlier = allEntries.value.filter(e => e.date < dateParam.value)
  return earlier.at(-1) ?? null
})

const nextEntry = computed(() => {
  if (!allEntries.value?.length) return null
  const later = allEntries.value.filter(e => e.date > dateParam.value)
  return later[0] ?? null
})

function copyFromPrevious() {
  if (!prevEntry.value?.peptides?.length) return
  form.peptides = prevEntry.value.peptides.map((p: PeptideEntry) => ({ ...p }))
}

const form = reactive<{
  date: string
  day: number | null
  weight_lbs: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  rhr: number | null
  hrv: number | null
  peptides: PeptideEntry[]
  reconstitutions: ReconstitutionEntry[]
  food: { breakfast: string, snack: string, lunch: string, dinner: string }
  workout: string
  notes: string
}>(buildForm())

watch(existingEntry, () => {
  Object.assign(form, buildForm())
}, { immediate: false })

function buildForm() {
  const entry = existingEntry.value
  if (!entry) {
    const blank = blankEntry(dateParam.value)
    return {
      date: blank.date,
      day: blank.day ?? null,
      weight_lbs: blank.weight_lbs ?? null,
      bp_systolic: blank.bp_systolic ?? null,
      bp_diastolic: blank.bp_diastolic ?? null,
      rhr: blank.rhr ?? null,
      hrv: blank.hrv ?? null,
      peptides: [] as PeptideEntry[],
      reconstitutions: [] as ReconstitutionEntry[],
      food: { breakfast: '', snack: '', lunch: '', dinner: '' },
      workout: '',
      notes: ''
    }
  }
  return {
    date: entry.date,
    day: entry.day ?? null,
    weight_lbs: entry.weight_lbs ?? null,
    bp_systolic: entry.bp_systolic ?? null,
    bp_diastolic: entry.bp_diastolic ?? null,
    rhr: entry.rhr ?? null,
    hrv: entry.hrv ?? null,
    peptides: (entry.peptides ?? []).map((p: PeptideEntry) => ({ ...p })),
    reconstitutions: (entry.reconstitutions ?? []).map((r: ReconstitutionEntry) => ({ ...r })),
    food: {
      breakfast: entry.food?.breakfast ?? '',
      snack: entry.food?.snack ?? '',
      lunch: entry.food?.lunch ?? '',
      dinner: entry.food?.dinner ?? ''
    },
    workout: entry.workout ?? '',
    notes: entry.notes ?? ''
  }
}

function addPeptide() {
  form.peptides.push({ time: '', compound: '', dose: 0, unit: 'mg', site: 'left_glute' })
}

function removePeptide(i: number) {
  form.peptides.splice(i, 1)
}

function addReconstitution() {
  form.reconstitutions.push({ compound: '', vial_amount: 0, vial_unit: 'mg', supplier: '', bac_water_ml: 0 })
}

function removeReconstitution(i: number) {
  form.reconstitutions.splice(i, 1)
}

const saving = ref(false)

async function save() {
  saving.value = true
  try {
    const payload = {
      ...form,
      food: Object.fromEntries(
        Object.entries(form.food).filter(([, v]) => v !== '')
      )
    }
    await $fetch('/api/journal/save', { method: 'POST', body: payload })

    // Update shared cache immediately so index/calendar reflect the new entry
    // without waiting for Nuxt Content's WASM SQLite to re-index the file
    const cached = nuxtApp.payload.data['/journal']
    if (Array.isArray(cached)) {
      const idx = cached.findIndex((e: { date: string }) => e.date === payload.date)
      if (idx >= 0) {
        cached[idx] = payload
      }
      else {
        cached.push(payload)
        cached.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))
      }
    }

    toast.add({ title: 'Entry saved', color: 'success', icon: 'i-lucide-check' })
    await refresh()
  }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    toast.add({ title: 'Save failed', description: msg, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}
</script>
