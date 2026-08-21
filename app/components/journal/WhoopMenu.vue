<template>
  <UButton
    v-if="!connected"
    variant="outline"
    size="xs"
    icon="i-lucide-link"
    to="/api/whoop/authorize"
    external
  >
    Connect Whoop
  </UButton>
  <UDropdownMenu
    v-else
    :items="menuItems"
    :content="{ align: 'start' }"
    size="xs"
  >
    <UButton
      variant="outline"
      size="xs"
      icon="i-lucide-check"
      trailing-icon="i-lucide-chevron-down"
    >
      Whoop
    </UButton>
  </UDropdownMenu>
</template>

<script setup lang="ts">
// Whoop connection control for the journal header: a connect link when unlinked, otherwise a
// Sync Now / Reconnect menu. Syncing refreshes the shared journal/health/workout stores, so the
// page sections update without the parent knowing anything happened.
const toast = useToast()
const { refresh } = await useJournalEntries()
const { refresh: refreshHealth } = await useHealthMetricsEntries()
const { refresh: refreshWorkouts } = await useWorkoutsEntries()

const connected = ref(false)
onMounted(async () => {
  try {
    const status = await $fetch<{ connected: boolean }>('/api/whoop/status')
    connected.value = status.connected
  }
  catch {
    connected.value = false
  }
})

const syncing = ref(false)
async function syncNow() {
  syncing.value = true
  try {
    const { result } = await $fetch<{ result: { touched: number, workouts: number } }>('/api/whoop/sync', { method: 'POST' })
    await Promise.all([refresh(), refreshHealth(), refreshWorkouts()])
    const parts = [`${result.touched} day${result.touched === 1 ? '' : 's'} updated`]
    if (result.workouts) parts.push(`${result.workouts} workout${result.workouts === 1 ? '' : 's'}`)
    toast.add({ title: 'Whoop synced', description: parts.join(' · '), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    toast.add({ title: 'Sync failed', description: msg, color: 'error' })
  }
  finally {
    syncing.value = false
  }
}

const menuItems = computed(() => [
  {
    label: 'Sync Now',
    icon: 'i-lucide-refresh-cw',
    loading: syncing.value,
    onSelect: (e: Event) => {
      e.preventDefault()
      syncNow()
    }
  },
  {
    label: 'Reconnect',
    icon: 'i-lucide-rotate-ccw',
    to: '/api/whoop/authorize?reconnect=true',
    external: true
  }
])
</script>
