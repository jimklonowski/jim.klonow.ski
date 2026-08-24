<template>
  <footer class="bg-status border-t border-line">
    <!-- Same wrap-below-sm treatment as StatusLine: sign in / sign out sat off the right
         edge of a phone screen behind a horizontal scroll nobody would find. -->
    <div class="flex flex-wrap sm:flex-nowrap items-center gap-x-4 sm:gap-x-5 gap-y-0.5 px-3 sm:px-4 py-1 sm:py-0 min-h-7.5 sm:h-7.5 text-[10.5px] text-ghost whitespace-nowrap overflow-x-auto">
      <span class="shrink-0">jim.klonow.ski v2</span>

      <template v-if="hasSession">
        <span class="shrink-0 hidden sm:inline">D1 <span class="text-accent">✓</span> R2 <span class="text-accent">✓</span> KV <span class="text-accent">✓</span></span>
        <span
          v-if="pdfCount"
          class="shrink-0"
        >{{ pdfCount }} PDFs parsed</span>
        <span
          v-if="latestDexa"
          class="shrink-0"
        >
          DEXA {{ formatDate(latestDexa.date, 'monthDay').toLowerCase() }} · BF {{ latestDexa.total.body_fat_pct.toFixed(1) }}%
        </span>
      </template>

      <span class="sm:ml-auto shrink-0 flex items-center gap-1.5">
        <span class="hidden sm:inline">⌘K command</span>
        <template v-if="role">
          <span class="hidden sm:inline">·</span>
          <span>{{ role }} session</span>
          <span>·</span>
          <button
            type="button"
            class="text-accent hover:text-accent-hover cursor-pointer"
            @click="logout"
          >sign out</button>
        </template>
        <template v-else>
          <span class="hidden sm:inline">·</span>
          <NuxtLink
            to="/labs/login"
            class="text-accent hover:text-accent-hover"
          >sign in</NuxtLink>
        </template>
      </span>
    </div>
  </footer>
</template>

<script setup lang="ts">
const { role } = await useAuth()
const { hasSession, pdfCount, latestDexa } = useOverview(role)

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  // Hard navigation so SSR re-renders everything unauthenticated
  window.location.href = '/'
}
</script>
