<template>
  <header class="border-b border-line bg-bg">
    <!-- Wraps below md: the nav drops to its own full-width row so the header can never
         push the document wider than the viewport (which used to scroll the whole page
         sideways on a phone and clip the status/footer bars with it). -->
    <div class="flex flex-wrap md:flex-nowrap items-center gap-x-3 sm:gap-x-5 gap-y-1.5 px-3 sm:px-4 py-2 md:py-0 md:h-13">
      <!-- Logo -->
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 shrink-0 group"
      >
        <span class="w-6 h-6 flex items-center justify-center bg-raised border border-accent text-accent text-[10px] leading-none">▲</span>
        <span class="num-display text-[15px] tracking-tight group-hover:text-accent transition-colors">jim.klonow.ski</span>
      </NuxtLink>

      <!-- Command bar -->
      <button
        type="button"
        class="hidden md:flex flex-1 items-center gap-2 h-8 px-3 bg-raised border border-line-input text-left cursor-text min-w-0 hover:border-line-accent transition-colors"
        aria-label="Open command palette"
        @click="paletteOpen = true"
      >
        <span class="text-accent text-[12px]">❯</span>
        <span class="text-muted text-[12px] truncate">jump to a marker, day, or compound…</span>
        <span class="w-[7px] h-3.5 bg-accent shrink-0 animate-[tui-blink_1.1s_step-end_infinite]" />
        <span class="ml-auto shrink-0 text-[10px] text-faint border border-line-input px-1.5 py-px">⌘K</span>
      </button>

      <!-- Mobile palette trigger -->
      <button
        type="button"
        class="md:hidden ml-auto text-[10px] text-faint border border-line-input px-2 py-1.5"
        aria-label="Open command palette"
        @click="paletteOpen = true"
      >
        ⌘K
      </button>

      <!-- Nav: own row under the logo on mobile (`order-last` keeps the session dot up on
           the logo row), inline in the bar from md up. -->
      <nav class="max-md:order-last w-full md:w-auto md:shrink-0 flex items-center gap-1 overflow-x-auto">
        <NuxtLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="shrink-0 px-2.5 py-1.5 text-[11px] font-medium tracking-[0.08em] uppercase whitespace-nowrap border transition-colors"
          :class="isActive(item) ? 'bg-nav-active text-accent border-line-accent' : 'text-[#6b8578] border-transparent hover:text-accent'"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Session dot -->
      <span
        class="w-[7px] h-[7px] rounded-full shrink-0"
        :class="role ? 'bg-accent glow-dot' : 'bg-line-accent'"
        :title="role ? `${role} session` : 'no session'"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
const route = useRoute()
const { role, isOwner } = await useAuth()
const paletteOpen = useState('command-palette-open', () => false)

const items = computed(() => [
  { label: 'Home', to: '/' },
  { label: 'Labs', to: '/labs' },
  { label: 'DEXA', to: '/labs/dexa' },
  { label: 'Journal', to: '/journal' },
  // TOOLS points straight at the calculator — /tools has no hub page, the naked URL redirects
  // there (see nuxt.config routeRules) — but stays lit on every /tools/* page via `match`.
  { label: 'Tools', to: '/tools/calculator', match: '/tools' },
  // The AI chat spends tokens, so the page is owner-only (see shared/utils/access.ts) —
  // don't show guests a tab that bounces them to /labs.
  ...(isOwner.value ? [{ label: 'Ask', to: '/ask' }] : [])
])

// Longest-match wins so /labs/dexa lights DEXA (not LABS). An item's `match` prefix stands in
// for its `to` so TOOLS lights on sibling pages of the calculator it links to.
function isActive(item: { to: string }) {
  const path = route.path.replace(/\/+$/, '') || '/'
  const base = (i: { to: string, match?: string }) => i.match ?? i.to
  const matches = items.value.filter(i => path === base(i) || (base(i) !== '/' && path.startsWith(base(i) + '/')))
  const best = matches.sort((a, b) => base(b).length - base(a).length)[0]
  return best?.to === item.to
}
</script>
