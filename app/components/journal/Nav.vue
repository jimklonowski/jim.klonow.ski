<template>
  <nav class="flex gap-3.5 sm:gap-4 px-4 sm:px-6 border-b border-line overflow-x-auto">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="py-2 text-[11px] tracking-[0.08em] uppercase whitespace-nowrap border-b-2 transition-colors"
      :class="isActive(tab)
        ? 'text-accent border-accent'
        : 'text-[#6b8578] border-transparent hover:text-accent'"
    >
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
import { canAccessPage } from '#shared/utils/access'

// Sub-nav shared by every /journal/* page. Tabs the current role can't open are dropped
// rather than rendered dead — the doctor view has no entries or photos.
const ALL_TABS = [
  { label: 'Overview', to: '/journal' },
  { label: 'Trends', to: '/journal/trends' },
  { label: 'Compounds', to: '/journal/compounds' },
  { label: 'Cycles', to: '/journal/cycles' },
  { label: 'Workouts', to: '/journal/workouts' },
  { label: 'Entries', to: '/journal/entries' },
  { label: 'Calendar', to: '/journal/calendar' },
  { label: 'Photos', to: '/journal/photos' },
  { label: 'Supps', to: '/journal/supplements' }
]

const route = useRoute()
const { role } = await useAuth()

const tabs = computed(() =>
  ALL_TABS.filter(t => !role.value || canAccessPage(role.value, t.to))
)

// Longest match wins so /journal/compound/<name> keeps COMPOUNDS lit and the bare
// /journal overview doesn't claim every child route.
function isActive(tab: { to: string }) {
  const path = route.path.replace(/\/+$/, '') || '/'
  if (path === tab.to) return true
  if (tab.to === '/journal') {
    // The dossier pages live beneath /journal/compounds conceptually, not the hub.
    return false
  }
  if (tab.to === '/journal/compounds') return path.startsWith('/journal/compound/')
  // The dossier pages live at the singular /journal/cycle/<id>.
  if (tab.to === '/journal/cycles') return path.startsWith('/journal/cycle/')
  return path.startsWith(tab.to + '/')
}
</script>
