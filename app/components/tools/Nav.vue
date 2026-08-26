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

// Sub-nav shared by every /tools/* page, mirroring journal/Nav.vue. Tabs the current role
// can't open are dropped rather than rendered dead — everything but the calculator is owner-only.
const ALL_TABS = [
  { label: 'Calculator', to: '/tools/calculator' },
  { label: 'Inventory', to: '/tools/inventory' },
  { label: 'Import', to: '/tools/import' },
  { label: 'Sharing', to: '/tools/sharing' }
]

const route = useRoute()
const { role } = await useAuth()

const tabs = computed(() =>
  ALL_TABS.filter(t => !role.value || canAccessPage(role.value, t.to))
)

function isActive(tab: { to: string }) {
  const path = route.path.replace(/\/+$/, '') || '/'
  return path === tab.to || path.startsWith(tab.to + '/')
}
</script>
