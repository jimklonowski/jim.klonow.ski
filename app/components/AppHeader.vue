<template>
  <UHeader title="jim.klonow.ski">
    <UNavigationMenu :items="items" variant="link" />

    <template #body>
      <UNavigationMenu :items="items" orientation="vertical" class="-mx-2.5" />
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const items = [
  { label: 'Labs', to: '/labs', icon: 'i-lucide-activity' },
  { label: 'Journal', to: '/journal', icon: 'i-lucide-book-open' }
]
</script>
