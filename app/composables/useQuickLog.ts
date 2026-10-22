import type { SodaEntry, WaterEntry } from '#shared/types/journal'
import { WATER_DEFAULT_CUP_OZ, waterSetting, waterTotals } from '#shared/utils/water'

// One-tap soda and water logging for places that aren't the journal hub (the home page's LOG
// TODAY row). Same endpoints, same "last drink" and "cup size" defaults as the two tracker
// widgets, and the same local-store update, so the hub, the status line and the home page all
// move together after a tap. Awaited like the other list composables.
//
// Everything that needs the Nuxt instance is taken before the FIRST await — both list resources
// are created synchronously and awaited together (a plain async function has no <script setup>
// context restore; a composable called after an await is NUXT_E1001, a 500 on SSR).
export async function useQuickLog() {
  const toast = useToast()
  const today = useToday()
  const journalRes = useJournalEntries()
  const profileRes = useProfile()
  const [{ data }, { data: profileData }] = await Promise.all([journalRes, profileRes])

  const entries = computed(() => data.value ?? [])
  const todayEntry = computed(() => entries.value.find(e => e.date === today.value) ?? null)

  // --- soda: the most recently logged drink + size is what the button logs ---
  const lastSoda = computed<SodaEntry | null>(() => {
    const all = entries.value.flatMap(e => (e.sodas ?? []).map(s => ({ ...s, date: e.date })))
    all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    return all.at(-1) ?? null
  })
  /** "DR PEPPER 12oz can" — what + SODA will log. */
  const sodaLabel = computed(() => {
    const drink = (lastSoda.value?.drink || 'Soda').toUpperCase()
    return lastSoda.value?.size ? `${drink} ${lastSoda.value.size}` : drink
  })
  const sodasToday = computed(() => (todayEntry.value?.sodas ?? []).length)

  // --- water: the profile's cup size ---
  const cupOz = computed(() => waterSetting(profileData.value, 'cup_oz', WATER_DEFAULT_CUP_OZ))
  const waterOzToday = computed(() => waterTotals(todayEntry.value?.water).oz)

  // Reassigns `data.value` so useAsyncData's reactivity sees the change (same rule as the widgets).
  function patchToday(patch: Partial<{ sodas: SodaEntry[], water: WaterEntry[] }>) {
    if (!data.value) return
    const date = today.value
    const idx = data.value.findIndex(e => e.date === date)
    data.value = idx >= 0
      ? data.value.map((e, i) => (i === idx ? { ...e, ...patch } : e))
      : [...data.value, { date, ...patch }].sort((a, b) => a.date.localeCompare(b.date))
  }

  const addingSoda = ref(false)
  const addingWater = ref(false)

  async function addSoda() {
    if (addingSoda.value) return
    addingSoda.value = true
    try {
      const { sodas } = await $fetch<{ sodas: SodaEntry[] }>('/api/journal/soda', {
        method: 'POST',
        body: { date: today.value, time: localTimeNow(), drink: lastSoda.value?.drink || undefined, size: lastSoda.value?.size || undefined }
      })
      patchToday({ sodas })
      // The status line moves too, but a tap deserves a word of its own (audit #42 item 38).
      toast.add({ title: `Logged ${sodaLabel.value}`, description: `${sodas.length} soda${sodas.length === 1 ? '' : 's'} today`, color: 'success', icon: 'i-lucide-check' })
      await refreshNuxtData('overview')
    }
    catch (err) {
      toast.add({ title: 'Failed to log soda', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
    }
    finally {
      addingSoda.value = false
    }
  }

  async function addWater() {
    if (addingWater.value) return
    addingWater.value = true
    try {
      const { water } = await $fetch<{ water: WaterEntry[] }>('/api/journal/water', {
        method: 'POST',
        body: { date: today.value, time: localTimeNow(), oz: cupOz.value }
      })
      patchToday({ water })
      toast.add({ title: `Logged ${cupOz.value} oz of water`, description: `${waterTotals(water).oz} oz today`, color: 'success', icon: 'i-lucide-check' })
      await refreshNuxtData('overview')
    }
    catch (err) {
      toast.add({ title: 'Failed to log water', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
    }
    finally {
      addingWater.value = false
    }
  }

  return { sodaLabel, sodasToday, cupOz, waterOzToday, addingSoda, addingWater, addSoda, addWater }
}
