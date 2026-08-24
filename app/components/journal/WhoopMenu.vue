<template>
  <NuxtLink
    v-if="!connected"
    :to="AUTHORIZE_URL"
    external
    class="tui-btn"
  >
    CONNECT WHOOP
  </NuxtLink>
  <UDropdownMenu
    v-else
    :items="menuItems"
    :content="{ align: 'start' }"
    :ui="{ content: 'bg-raised border border-line-accent ring-0', item: 'text-[12px]' }"
  >
    <button
      type="button"
      class="tui-btn"
    >
      WHOOP <span class="text-accent">✓</span>
    </button>
  </UDropdownMenu>
</template>

<script setup lang="ts">
// Whoop connection control for the journal header: a connect link when unlinked, otherwise a
// Sync Now / Reconnect menu. Syncing refreshes the shared journal/health/workout stores, so the
// page sections update without the parent knowing anything happened.
// Nitro server routes (they 302 out to Whoop's OAuth consent screen), not page routes.
const AUTHORIZE_URL = '/api/whoop/authorize'
const RECONNECT_URL = `${AUTHORIZE_URL}?reconnect=true`

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
    to: RECONNECT_URL,
    external: true
  }
])
</script>
