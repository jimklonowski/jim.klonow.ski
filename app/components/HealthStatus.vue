<template>
  <!-- The owner's view of /api/health: one glyph in the footer, every check in the popover. The
       uptime monitor watches the same endpoint for alerts; this answers "which one, and why". -->
  <UPopover
    v-model:open="open"
    :content="{ side: 'top', align: 'start' }"
  >
    <button
      type="button"
      class="shrink-0 cursor-pointer hover:text-dim"
      :aria-label="ariaLabel"
    >
      health <span :class="summary.class">{{ summary.glyph }}</span><template v-if="problems.length">
        {{ problems.length }}
      </template>
    </button>

    <template #content>
      <div class="w-80 max-w-[calc(100vw-2rem)] px-3 py-2.5 text-[11.5px]">
        <div class="flex items-baseline justify-between gap-3">
          <span class="tui-label">SITE HEALTH</span>
          <button
            type="button"
            class="text-[10.5px] text-accent hover:text-accent-hover cursor-pointer disabled:opacity-50"
            :disabled="loading"
            @click="load"
          >
            {{ loading ? 'checking…' : `checked ${checkedLabel} ⟳` }}
          </button>
        </div>

        <p
          v-if="unreachable"
          class="mt-2 text-danger"
        >
          ✕ /api/health didn't answer. The site may be down, or this device is offline.
        </p>
        <ul
          v-else
          class="mt-2 flex flex-col gap-1.5"
        >
          <li
            v-for="check in checks"
            :key="check.name"
            class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5"
          >
            <span :class="STATUS[check.status].class">{{ STATUS[check.status].glyph }}</span>
            <span class="min-w-0">
              <span class="text-faint">{{ kindOf(check.name) }}</span>
              <span class="text-hi">{{ nameOf(check.name) }}</span>
              <span class="block text-muted break-words">{{ check.detail }}</span>
            </span>
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { HealthReport } from '#shared/types/health'
import type { CheckStatus, HealthCheck } from '#shared/utils/health'

// Pending is "not run yet since the log began", not a problem, so it reads as neutral.
const STATUS: Record<CheckStatus, { glyph: string, class: string }> = {
  ok: { glyph: '✓', class: 'text-accent' },
  pending: { glyph: '·', class: 'text-faint' },
  stale: { glyph: '⚠', class: 'text-warn' },
  failing: { glyph: '✕', class: 'text-danger' }
}

const open = ref(false)
const loading = ref(false)
const unreachable = ref(false)
const report = ref<HealthReport | null>(null)

// Client-only and never blocking: the footer renders "health ·" until the check lands, on the
// server and the client alike, so hydration matches.
async function load() {
  loading.value = true
  try {
    // An unhealthy site answers 503 WITH the report; ignoreResponseError keeps that body.
    report.value = await $fetch<HealthReport>('/api/health', { ignoreResponseError: true })
    unreachable.value = !report.value || typeof report.value.ok !== 'boolean'
  }
  catch {
    unreachable.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)
// Re-check on every open, so the popover never shows a stale answer from page load.
watch(open, (isOpen) => {
  if (isOpen && !loading.value) load()
})

const checks = computed<HealthCheck[]>(() => report.value?.checks ?? [])
const problems = computed(() => checks.value.filter(c => c.status === 'stale' || c.status === 'failing'))

const summary = computed(() => {
  if (unreachable.value) return STATUS.failing
  if (!report.value) return STATUS.pending
  if (checks.value.some(c => c.status === 'failing')) return STATUS.failing
  return problems.value.length ? STATUS.stale : STATUS.ok
})

const ariaLabel = computed(() => {
  if (unreachable.value) return 'Site health: unreachable'
  if (!report.value) return 'Site health: checking'
  return problems.value.length
    ? `Site health: ${problems.value.length} check${problems.value.length === 1 ? '' : 's'} need attention`
    : 'Site health: all checks passing'
})

const checkedLabel = computed(() => {
  const at = report.value?.checkedAt
  if (!at) return '—'
  const mins = Math.floor((Date.now() - Date.parse(at)) / 60000)
  return mins < 1 ? 'just now' : `${mins}m ago`
})

/** "task:whoop:sync" → "task " + "whoop:sync"; "feed:apple:sleep" → "feed " + "apple:sleep". */
function kindOf(name: string) {
  const i = name.indexOf(':')
  return i === -1 ? '' : `${name.slice(0, i)} `
}
function nameOf(name: string) {
  const i = name.indexOf(':')
  return i === -1 ? name : name.slice(i + 1)
}
</script>
