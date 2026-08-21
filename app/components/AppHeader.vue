<template>
  <UHeader title="jim.klonow.ski">
    <template #left>
      <NuxtLink
        to="/"
        class="flex items-center gap-2"
      >
        <NuxtImg
          src="/icon-maskable.svg"
          width="32"
          height="32"
        />
        <span class="font-black font-mono">jim.klonow.ski</span>
      </NuxtLink>
    </template>
    <UNavigationMenu
      :items="items"
      variant="link"
    />

    <template #right>
      <UBadge
        v-if="role && role !== 'owner'"
        variant="subtle"
        color="neutral"
        size="sm"
        class="capitalize"
      >
        {{ role }} view
      </UBadge>
      <UColorModeButton />
      <UTooltip
        v-if="role"
        text="Sign out"
      >
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-log-out"
          aria-label="Sign out"
          @click="logout"
        />
      </UTooltip>
    </template>

    <template #body>
      <UNavigationMenu
        :items="items"
        orientation="vertical"
        class="-mx-2.5"
      />
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

const { role } = await useAuth()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  // Hard navigation so SSR re-renders everything unauthenticated
  window.location.href = '/'
}
</script>
