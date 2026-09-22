<template>
  <NuxtLink
    v-if="status && !status.connected"
    :to="AUTHORIZE_URL"
    external
    class="tui-btn"
  >
    CONNECT WHOOP
  </NuxtLink>
  <UDropdownMenu
    v-else-if="status"
    :items="menuItems"
    :content="{ align: 'start' }"
    :ui="{ content: 'bg-raised border border-line-accent ring-0', item: 'text-[12px]' }"
  >
    <button
      type="button"
      class="tui-btn"
      :title="healthLabel"
    >
      WHOOP <span :class="healthy ? 'text-accent' : 'text-warn'">{{ healthy ? '✓' : '⚠' }}</span>
    </button>
  </UDropdownMenu>
</template>

<script setup lang="ts">
// Whoop connection control for the journal header: a connect link when unlinked, otherwise a
// Sync Now / Reconnect menu. Syncing refreshes the shared journal/health/workout stores, so the
// page sections update without the parent knowing anything happened.
//
// The check mark used to be unconditional. A rejected refresh token (or a week of failed crons)
// looked identical to a healthy connection, so missing data was only ever noticed by its absence
// on a chart — the button now carries the last sync's outcome and the menu states it in words.
// Nitro server routes (they 302 out to Whoop's OAuth consent screen), not page routes.
const AUTHORIZE_URL = '/api/whoop/authorize'
const RECONNECT_URL = `${AUTHORIZE_URL}?reconnect=true`

interface WhoopStatus {
  connected: boolean
  lastSyncedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  needsReconnect: boolean
}

const toast = useToast()
const { refresh } = await useJournalEntries()
const { refresh: refreshHealth } = await useHealthMetricsEntries()
const { refresh: refreshWorkouts } = await useWorkoutsEntries()

// Client-only (the menu is owner-chrome, not page content), so a failed status call just leaves
// the control hidden rather than blocking the header.
const status = ref<WhoopStatus | null>(null)
async function loadStatus() {
  try {
    status.value = await $fetch<WhoopStatus>('/api/whoop/status')
  }
  catch {
    status.value = null
  }
}
onMounted(loadStatus)

/** Days since the last clean sync, or null when it has never synced. */
const daysSinceSync = computed(() => {
  const at = status.value?.lastSyncedAt
  if (!at) return null
  const then = Date.parse(at)
  return Number.isNaN(then) ? null : Math.floor((Date.now() - then) / 86400000)
})

// The nightly cron means a healthy connection is at most a day stale; two days without one is
// the signal that something has stopped working even if no single request reported an error.
const healthy = computed(() =>
  !!status.value?.connected && !status.value.lastError && (daysSinceSync.value ?? 99) <= 2
)

const syncLabel = computed(() => {
  const days = daysSinceSync.value
  if (days == null) return 'never synced'
  if (days <= 0) return 'synced today'
  return days === 1 ? 'synced yesterday' : `synced ${days}d ago`
})

const healthLabel = computed(() => {
  if (!status.value) return ''
  if (status.value.needsReconnect) return 'Whoop rejected the saved credentials — reconnect'
  return status.value.lastError ? `Last sync failed: ${status.value.lastError}` : syncLabel.value
})

const syncing = ref(false)
async function syncNow() {
  syncing.value = true
  try {
    const { result } = await $fetch<{ result: { touched: number, workouts: number, errors?: string[] } }>('/api/whoop/sync', { method: 'POST' })
    // 'overview' is the shell summary — its "synced <date>" tail reads the newest metrics row.
    await Promise.all([refresh(), refreshHealth(), refreshWorkouts(), refreshNuxtData('overview'), loadStatus()])
    if (result.errors?.length) {
      toast.add({ title: 'Whoop sync incomplete', description: result.errors.join(' · '), color: 'warning' })
      return
    }
    const parts = [`${result.touched} day${result.touched === 1 ? '' : 's'} updated`]
    if (result.workouts) parts.push(`${result.workouts} workout${result.workouts === 1 ? '' : 's'}`)
    toast.add({ title: 'Whoop synced', description: parts.join(' · '), color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await loadStatus()
    toast.add({ title: 'Sync failed', description: msg, color: 'error' })
  }
  finally {
    syncing.value = false
  }
}

const menuItems = computed(() => {
  const items = [{
    label: status.value?.needsReconnect ? 'Connection expired' : healthLabel.value || syncLabel.value,
    icon: healthy.value ? 'i-lucide-check' : 'i-lucide-triangle-alert',
    disabled: true
  }]
  if (!status.value?.needsReconnect) {
    items.push({
      label: 'Sync Now',
      icon: 'i-lucide-refresh-cw',
      loading: syncing.value,
      onSelect: (e: Event) => {
        e.preventDefault()
        syncNow()
      }
    } as unknown as typeof items[number])
  }
  items.push({
    label: 'Reconnect',
    icon: 'i-lucide-rotate-ccw',
    to: RECONNECT_URL,
    external: true
  } as unknown as typeof items[number])
  return items
})
</script>
