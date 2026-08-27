<template>
  <div
    v-if="isDemo"
    class="bg-raised border-b border-line px-3 sm:px-4 py-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] tracking-[0.06em] uppercase"
  >
    <span class="text-accent font-medium">▚ demo</span>
    <span class="text-muted">fictional persona · synthetic data · sandbox resets daily</span>
    <span class="ml-auto flex items-center gap-3.5 shrink-0">
      <button
        type="button"
        class="text-faint hover:text-accent uppercase tracking-[0.06em]"
        @click="launchTour"
      >tour</button>
      <button
        type="button"
        class="text-faint hover:text-accent uppercase tracking-[0.06em]"
        @click="exitDemo"
      >exit demo ✕</button>
    </span>
  </div>
</template>

<script setup lang="ts">
const { role } = await useAuth()
const isDemo = computed(() => role.value === 'demo')

// DemoTour watches this counter; incrementing it (re)starts the tour from step 0.
const tourLaunch = useState('demo-tour-launch', () => 0)
function launchTour() {
  tourLaunch.value++
}

// Same exit path as FooterStatus's sign out: clear cookies, then hard-navigate so the
// role only ever changes across a full page load (SSR payload/composable invariant).
async function exitDemo() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/'
}
</script>
