<template>
  <div class="bg-status border-b border-line">
    <!-- Wraps below sm rather than scrolling sideways: on a phone the tail of the bar
         (last draw, soda) was simply unreachable. -->
    <div class="flex flex-wrap sm:flex-nowrap items-center gap-x-4 sm:gap-x-5 gap-y-0.5 px-3 sm:px-4 py-1 sm:py-0 min-h-7.5 sm:h-7.5 text-[10.5px] tracking-[0.06em] uppercase whitespace-nowrap overflow-x-auto">
      <span class="text-muted shrink-0">
        {{ todayLabel }}
        <template v-if="latestEntry?.day != null"> · day <span class="text-body font-medium">{{ latestEntry.day }}</span></template>
      </span>

      <template v-if="hasSession">
        <span
          v-if="streak"
          class="text-muted shrink-0"
        >streak <span class="text-accent font-medium">{{ streak }}d</span></span>

        <span
          v-if="entries.length"
          class="text-muted shrink-0"
        >entries <span class="text-body font-medium">{{ entries.length.toLocaleString('en-US') }}</span></span>

        <span
          v-if="latestDraw"
          class="text-muted shrink-0"
        >
          last draw <span class="text-body font-medium">{{ formatDate(latestDraw.date, 'monthDay') }}</span>
          <template v-if="flagCounts.high || flagCounts.low">
            · <span class="text-danger font-medium">{{ flagCounts.high }} high</span>
            / <span class="text-warn font-medium">{{ flagCounts.low }} low</span>
          </template>
        </span>

        <span
          v-if="latestEntry"
          class="text-muted shrink-0"
        >
          soda <span
            class="font-medium"
            :class="sodasToday === 0 ? 'text-accent' : 'text-warn'"
          >{{ sodasToday }}</span> today
        </span>
      </template>

      <span class="sm:ml-auto shrink-0 text-ghost normal-case tracking-normal hidden sm:inline">
        <template v-if="hasSession && latestMetrics">whoop ✓ apple-health ✓ · synced {{ formatDate(latestMetrics.date, 'monthDay').toLowerCase() }}</template>
        <template v-else-if="!hasSession">guest session · <NuxtLink
          to="/labs/login"
          class="text-faint hover:text-accent"
        >sign in</NuxtLink></template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
const { role } = await useAuth()
const {
  hasSession, entries, latestEntry, latestDraw, latestMetrics, streak, sodasToday, flagCounts
} = useOverview(role)

const todayStr = localToday()
const todayLabel = `${new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })} ${todayStr}`
</script>
