<template>
  <div>
    <UCard>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs text-muted uppercase tracking-wider mb-1">
            Soda
          </p>
          <p class="text-lg font-bold font-mono">
            {{ todaySodas.length }}
            <span class="text-xs font-normal text-muted">today{{ todaySodas.length ? ` · last ${todaySodas.at(-1)?.time}` : '' }}</span>
          </p>
        </div>
        <div
          v-if="!readonly"
          class="flex items-center gap-1"
        >
          <UButton
            size="sm"
            icon="i-lucide-plus"
            :loading="adding"
            @click="quickAdd()"
          >
            {{ lastDrink || 'Soda' }}<span v-if="lastSize"> · {{ lastSize }}</span>
          </UButton>
          <UButton
            size="sm"
            variant="ghost"
            icon="i-lucide-sliders-horizontal"
            @click="customOpen = !customOpen"
          />
        </div>
      </div>

      <div
        v-if="customOpen && !readonly"
        class="mt-4 pt-4 border-t border-default grid grid-cols-2 gap-3"
      >
        <UFormField label="Drink">
          <UInput
            v-model="customDrink"
            list="soda-drinks"
            placeholder="Dr Pepper"
            class="w-full"
          />
          <datalist id="soda-drinks">
            <option
              v-for="d in SODA_DRINKS"
              :key="d"
              :value="d"
            />
          </datalist>
        </UFormField>
        <UFormField label="Size">
          <UInput
            v-model="customSize"
            list="soda-sizes"
            placeholder="12oz can"
            class="w-full"
          />
          <datalist id="soda-sizes">
            <option
              v-for="s in SODA_SIZES"
              :key="s"
              :value="s"
            />
          </datalist>
        </UFormField>
        <div class="col-span-2">
          <UButton
            size="sm"
            icon="i-lucide-plus"
            :loading="adding"
            @click="quickAdd(true)"
          >
            Log this
          </UButton>
        </div>
      </div>

      <div
        v-if="todaySodas.length"
        class="mt-4 pt-4 border-t border-default space-y-1.5"
      >
        <div
          v-for="(s, i) in todaySodas"
          :key="i"
          class="flex items-center justify-between text-sm"
        >
          <span class="font-mono text-muted">{{ s.time }}</span>
          <span>{{ s.drink || 'Soda' }}<span
            v-if="s.size"
            class="text-muted"
          > · {{ s.size }}</span></span>
          <UButton
            v-if="!readonly"
            variant="ghost"
            color="error"
            size="xs"
            icon="i-lucide-x"
            :loading="removingIndex === i"
            :disabled="removingIndex !== null"
            @click="remove(i)"
          />
        </div>
      </div>
    </UCard>

    <UCard
      v-if="trend.length >= 2"
      class="mt-4"
    >
      <template #header>
        <p class="text-sm font-medium">
          Daily Sodas
        </p>
        <p class="text-xs text-muted">
          last 30 days
        </p>
      </template>
      <ClientOnly>
        <BarChart
          :data="trend"
          :categories="{ count: { name: 'Sodas', color: '#f43f5e' } }"
          :y-axis-keys="['count']"
          x-axis-key="date"
          :height="128"
        />
      </ClientOnly>
    </UCard>
  </div>
</template>

<script setup lang="ts">
// Soda tracker (a habit nudge, not a vital): quick-add of the last-logged drink, a custom form,
// today's list, and a 30-day bar. Extracted from the journal page, which carried all of this
// inline. Writes go through /api/journal/soda and are reflected into the shared journal store.
import { SODA_DRINKS, SODA_SIZES } from '~/data/journal'
import type { SodaEntry } from '~/data/journal'

withDefaults(defineProps<{ readonly?: boolean }>(), { readonly: false })

const toast = useToast()
const { data } = await useJournalEntries()
const entries = computed(() => data.value ?? [])

// Local date/time (not toISOString, which shifts to UTC) so a late-night tap logs against the
// correct calendar day and displays the actual clock time it happened.
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localTimeStr(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const todaySodas = computed<SodaEntry[]>(() => {
  const today = localDateStr()
  return entries.value.find(e => e.date === today)?.sodas ?? []
})

const lastSoda = computed<SodaEntry | null>(() => {
  const all = entries.value.flatMap(e => (e.sodas ?? []).map(s => ({ ...s, date: e.date })))
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return all.at(-1) ?? null
})
const lastDrink = computed(() => lastSoda.value?.drink ?? '')
const lastSize = computed(() => lastSoda.value?.size ?? '')

const customOpen = ref(false)
const customDrink = ref('')
const customSize = ref('')
const adding = ref(false)

// Reassigns `data.value` (rather than mutating an entry in place) so the update is guaranteed to
// be picked up by `useAsyncData`'s reactivity regardless of its `deep` option.
function applySodasLocally(date: string, sodas: SodaEntry[]) {
  if (!data.value) return
  const idx = data.value.findIndex(e => e.date === date)
  if (idx >= 0) {
    data.value = data.value.map((e, i) => i === idx ? { ...e, sodas } : e)
  }
  else {
    data.value = [...data.value, { date, sodas }].sort((a, b) => a.date.localeCompare(b.date))
  }
}

async function quickAdd(useCustom = false) {
  adding.value = true
  const date = localDateStr()
  const drink = (useCustom ? customDrink.value : lastDrink.value) || undefined
  const size = (useCustom ? customSize.value : lastSize.value) || undefined
  try {
    const { sodas } = await $fetch<{ sodas: SodaEntry[] }>('/api/journal/soda', {
      method: 'POST',
      body: { date, time: localTimeStr(), drink, size }
    })
    applySodasLocally(date, sodas)
    if (useCustom) {
      customDrink.value = ''
      customSize.value = ''
      customOpen.value = false
    }
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    toast.add({ title: 'Failed to log soda', description: msg, color: 'error' })
  }
  finally {
    adding.value = false
  }
}

const removingIndex = ref<number | null>(null)

async function remove(index: number) {
  if (removingIndex.value !== null) return
  removingIndex.value = index
  const date = localDateStr()
  try {
    const { sodas } = await $fetch<{ sodas: SodaEntry[] }>('/api/journal/soda', {
      method: 'DELETE',
      query: { date, index }
    })
    applySodasLocally(date, sodas)
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    toast.add({ title: 'Failed to remove', description: msg, color: 'error' })
  }
  finally {
    removingIndex.value = null
  }
}

const trend = computed(() => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = localDateStr(cutoff)
  return entries.value
    .filter(e => e.date >= cutoffStr && (e.sodas ?? []).length)
    .map(e => ({ date: formatDate(e.date), count: (e.sodas ?? []).length }))
})
</script>
