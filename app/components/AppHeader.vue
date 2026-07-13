<template>
  <UHeader title="jim.klonow.ski">
    <UNavigationMenu :items="items" variant="link" />

    <template #right>
      <UColorModeButton />
    </template>

    <template #body>
      <UNavigationMenu :items="items" orientation="vertical" class="-mx-2.5" />
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const items = [
  { label: 'Labs', to: '/labs', icon: 'i-lucide-activity' },
  { label: 'DEXA', to: '/labs/dexa', icon: 'i-lucide-scan' },
  { label: 'Journal', to: '/journal', icon: 'i-lucide-book-open' },
  { label: 'Calculator', to: '/journal/calculator', icon: 'i-lucide-calculator' }
]
</script>
