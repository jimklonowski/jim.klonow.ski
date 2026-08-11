<template>
  <div v-if="visible">
    <!-- Floating action button -->
    <UButton
      icon="i-lucide-newspaper"
      size="xl"
      color="primary"
      class="fixed bottom-6 right-6 z-50 w-14 h-14 p-0 flex items-center justify-center rounded-full shadow-lg shadow-primary/30"
      :aria-label="'Open health digests'"
      @click="openPanel"
    />

    <USlideover
      v-model:open="open"
      title="Health Digests"
      description="AI recaps of your vitals, sleep, doses and training"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <!-- Generate + filter controls -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex gap-1">
              <UButton
                v-for="opt in FILTERS"
                :key="opt.value"
                size="xs"
                :variant="filter === opt.value ? 'solid' : 'ghost'"
                @click="filter = opt.value"
              >
                {{ opt.label }}
              </UButton>
            </div>
            <UDropdownMenu :items="generateItems" :content="{ align: 'end' }">
              <UButton size="xs" variant="outline" icon="i-lucide-sparkles" :loading="generating" trailing-icon="i-lucide-chevron-down">
                Generate
              </UButton>
            </UDropdownMenu>
          </div>

          <div v-if="status === 'pending'" class="py-10 text-center text-sm text-muted">Loading…</div>

          <div v-else-if="!filtered.length" class="py-10 text-center text-sm text-muted">
            No {{ filter === 'all' ? '' : filter + ' ' }}digests yet.
            <br>Use <span class="font-medium">Generate</span> to create one now, or wait for the scheduled run.
          </div>

          <div v-else class="space-y-3">
            <UCard v-for="d in filtered" :key="d.id">
              <template #header>
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <UBadge :color="d.type === 'weekly' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                      {{ d.type === 'weekly' ? 'Weekly' : 'Daily' }}
                    </UBadge>
                    <span class="text-sm font-medium">{{ periodLabel(d) }}</span>
                  </div>
                  <span class="text-xs text-muted">{{ relativeTime(d.created_at) }}</span>
                </div>
              </template>

              <div class="text-sm leading-relaxed [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_li+li]:mt-1 [&_strong]:font-semibold">
                <Comark :markdown="d.summary" />
              </div>

              <div v-if="chips(d).length" class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-default">
                <span
                  v-for="chip in chips(d)"
                  :key="chip"
                  class="text-xs font-mono px-2 py-0.5 rounded-md bg-elevated text-muted"
                >
                  {{ chip }}
                </span>
              </div>
            </UCard>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { Digest } from '~/composables/useDigests'

const route = useRoute()
const toast = useToast()

// Only show inside the authed app areas (never on the login/landing pages).
const visible = computed(() => /^\/(journal|labs)/.test(route.path) && route.path !== '/labs/login')

const open = ref(false)
const { data, status, execute, refresh } = useDigests()

let loadedOnce = false
function openPanel() {
  open.value = true
  if (!loadedOnce) {
    loadedOnce = true
    execute()
  }
}

const FILTERS = [
  { label: 'All', value: 'all' as const },
  { label: 'Daily', value: 'daily' as const },
  { label: 'Weekly', value: 'weekly' as const }
]
const filter = ref<'all' | 'daily' | 'weekly'>('all')

const digests = computed(() => data.value ?? [])
const filtered = computed(() =>
  filter.value === 'all' ? digests.value : digests.value.filter(d => d.type === filter.value)
)

// --- generation ---
const generating = ref(false)
// Local (not UTC) YYYY-MM-DD, so an evening "today" doesn't roll over to tomorrow.
function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}

const generateItems = [
  [
    { label: "Today's recap", icon: 'i-lucide-calendar-days', onSelect: () => generate('daily', localToday()) },
    { label: 'This past week', icon: 'i-lucide-calendar-range', onSelect: () => generate('weekly') }
  ]
]

async function generate(kind: 'daily' | 'weekly', endDate?: string) {
  generating.value = true
  try {
    const res = await $fetch<{ skipped?: boolean }>('/api/journal/digest/generate', { method: 'POST', body: { kind, endDate } })
    if (res.skipped) {
      toast.add({ title: 'Nothing to summarize', description: `No data logged for that ${kind === 'weekly' ? 'week' : 'day'}.`, color: 'warning', icon: 'i-lucide-info' })
    }
    else {
      await refresh()
      toast.add({ title: 'Digest ready', description: `${kind === 'weekly' ? 'Weekly' : 'Daily'} digest generated.`, color: 'success', icon: 'i-lucide-check' })
    }
  }
  catch (err) {
    toast.add({ title: 'Generation failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    generating.value = false
  }
}

// --- display helpers ---
function fmt(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function periodLabel(d: Digest) {
  return d.type === 'weekly' ? `${fmt(d.period_start)} – ${fmt(d.period_end)}` : fmt(d.period_end)
}
function relativeTime(iso: string | null) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
function fmtSleep(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
function chips(d: Digest): string[] {
  const s = d.stats ?? {}
  const out: string[] = []
  const push = (v: number | null | undefined, fn: (n: number) => string) => { if (v != null) out.push(fn(v)) }
  if (d.type === 'daily') {
    push(s.recovery, v => `Recovery ${v}%`)
    push(s.sleep_min, v => `Sleep ${fmtSleep(v)}`)
    push(s.strain, v => `Strain ${v}`)
    push(s.weight_lbs, v => `${v} lbs`)
    push(s.doses, v => `${v} dose${v === 1 ? '' : 's'}`)
    push(s.workouts, v => v ? `${v} workout${v === 1 ? '' : 's'}` : '')
    push(s.sodas, v => v ? `${v} soda${v === 1 ? '' : 's'}` : '')
  }
  else {
    push(s.avg_recovery, v => `Avg rec ${v}%`)
    push(s.avg_sleep_min, v => `Avg sleep ${fmtSleep(v)}`)
    if (s.avg_bp_systolic != null && s.avg_bp_diastolic != null) out.push(`BP ${s.avg_bp_systolic}/${s.avg_bp_diastolic}`)
    push(s.weight_change, v => `${v >= 0 ? '+' : ''}${v} lbs`)
    push(s.compounds, v => `${v} compound${v === 1 ? '' : 's'}`)
    push(s.workouts, v => `${v} workout${v === 1 ? '' : 's'}`)
    push(s.sodas, v => `${v} soda${v === 1 ? '' : 's'}`)
  }
  return out.filter(Boolean)
}
</script>
