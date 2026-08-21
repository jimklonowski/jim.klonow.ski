<template>
  <div class="min-h-[60vh] flex items-center justify-center px-4">
    <UCard class="w-full max-w-md">
      <div class="flex flex-col items-center py-10 space-y-4 text-center">
        <template v-if="state === 'working'">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-muted animate-spin"
          />
          <p class="font-medium">
            Opening your view...
          </p>
        </template>
        <template v-else-if="state === 'ok'">
          <UIcon
            name="i-lucide-check-circle-2"
            class="w-8 h-8 text-success"
          />
          <p class="font-medium">
            You're in
          </p>
          <p class="text-sm text-muted">
            Taking you to the dashboard.
          </p>
        </template>
        <template v-else>
          <UIcon
            name="i-lucide-link-2-off"
            class="w-8 h-8 text-muted"
          />
          <p class="font-medium">
            This link doesn't work anymore
          </p>
          <p class="text-sm text-muted">
            {{ errorMessage }}
          </p>
        </template>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
// Public landing for owner-minted share links: exchanges the URL token for a role session
// cookie, then hard-navigates so SSR renders the role's view from the first request.
const route = useRoute()
const state = ref<'working' | 'ok' | 'error'>('working')
const errorMessage = ref('')

onMounted(async () => {
  try {
    await $fetch('/api/auth/redeem', {
      method: 'POST',
      body: { token: route.params.token }
    })
    state.value = 'ok'
    window.location.href = '/labs'
  }
  catch (err) {
    const e = err as { data?: { message?: string } }
    state.value = 'error'
    errorMessage.value = e.data?.message ?? 'Ask for a fresh link.'
  }
})
</script>
