<template>
  <div class="bg-status border-b border-line">
    <!-- Wraps below sm rather than scrolling sideways: on a phone the tail of the bar
         (last draw, soda) was simply unreachable. -->
    <div class="flex flex-wrap sm:flex-nowrap items-center gap-x-4 sm:gap-x-5 gap-y-0.5 px-3 sm:px-4 py-1 sm:py-0 min-h-7.5 sm:h-7.5 text-[10.5px] tracking-[0.06em] uppercase whitespace-nowrap overflow-x-auto">
      <span class="text-muted shrink-0">
        {{ todayLabel }}
      </span>

      <template v-if="hasSession && summary">
        <span
          v-if="summary.streak"
          class="text-muted shrink-0"
        >streak <span class="text-accent font-medium">{{ summary.streak }}d</span></span>

        <span
          v-if="summary.loggedDays"
          class="text-muted shrink-0"
        >logged <span class="text-body font-medium">{{ summary.loggedDays.toLocaleString('en-US') }}</span></span>

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

        <!-- sodasToday is null for the doctor role (the soda log isn't in that view), so the
             cell disappears instead of reading a misleading "soda 0 today". -->
        <span
          v-if="summary.latestEntryDate && summary.sodasToday != null"
          class="text-muted shrink-0"
        >
          soda <span
            class="font-medium"
            :class="summary.sodasToday === 0 ? 'text-accent' : 'text-warn'"
          >{{ summary.sodasToday }}</span> today
        </span>
      </template>

      <span class="sm:ml-auto shrink-0 text-ghost normal-case tracking-normal hidden sm:inline">
        <template v-if="role === 'demo'">demo data · fictional persona</template>
        <template v-else-if="hasSession && summary?.latestMetricsDate">whoop ✓ apple-health ✓ · synced {{ formatDate(summary.latestMetricsDate, 'monthDay').toLowerCase() }}</template>
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
const { hasSession, data: summary, latestDraw, flagCounts } = useOverviewSummary(role)

const todayStr = localToday()
const todayLabel = `${new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })} ${todayStr}`
</script>
