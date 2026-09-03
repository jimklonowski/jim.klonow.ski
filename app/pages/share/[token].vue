<template>
  <div class="min-h-[60vh] flex items-center justify-center px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="bg-raised border border-line-accent px-3.5 py-3">
        <TuiHeader
          label="SHARE LINK"
          :dashes="8"
        >
          <span class="text-[10.5px] text-faint tracking-[0.12em] uppercase">{{ view.status }}</span>
        </TuiHeader>

        <div class="flex items-start gap-2.5 mt-3">
          <span
            class="mt-1.5 w-1.75 h-1.75 rounded-full shrink-0"
            :class="view.dotClass"
          />
          <div class="min-w-0">
            <p class="num-display text-hi text-[17px] leading-none">
              {{ view.title }}
            </p>
            <p class="mt-2 text-[12px] leading-[1.7] text-dim">
              {{ view.body }}
            </p>
          </div>
        </div>

        <p
          v-if="state === 'working'"
          class="flex items-center gap-2 mt-3 text-[11px] text-faint tracking-widest uppercase"
        >
          <span class="w-1.75 h-3.5 bg-accent shrink-0 animate-[tui-blink_1.1s_step-end_infinite]" />
          exchanging token
        </p>
        <p
          v-else-if="state === 'error'"
          class="mt-3 text-[11px] text-faint tracking-widest uppercase"
        >
          <NuxtLink
            to="/"
            class="text-accent hover:text-accent-hover"
          >back to home →</NuxtLink>
        </p>
      </div>

      <p class="mt-2.5 text-[10.5px] text-ghost tracking-widest uppercase">
        read-only share link · single redemption per session
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({ title: 'Shared View' })

// Public landing for owner-minted share links: exchanges the URL token for a role session
// cookie, then hard-navigates so SSR renders the role's view from the first request.
const route = useRoute()
const state = ref<'working' | 'ok' | 'error'>('working')
const errorMessage = ref('')

// One computed per-state view object rather than three template branches, so the copy stays
// in script where multi-part strings keep their spacing.
const view = computed(() => {
  if (state.value === 'working') {
    return {
      status: 'redeeming',
      title: 'OPENING YOUR VIEW',
      body: 'Trading this link for a read-only session.',
      dotClass: 'bg-warn'
    }
  }
  if (state.value === 'ok') {
    return {
      status: 'redeemed',
      title: 'YOU\'RE IN',
      body: 'Taking you to the dashboard.',
      dotClass: 'bg-accent glow-dot'
    }
  }
  return {
    status: 'rejected',
    title: 'LINK NO LONGER WORKS',
    body: errorMessage.value || 'Ask for a fresh link.',
    dotClass: 'bg-danger'
  }
})

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
