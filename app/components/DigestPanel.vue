<template>
  <div v-if="visible">
    <USlideover
      v-model:open="open"
      title="AI DIGESTS"
      description="Recaps of your vitals, sleep, doses and training"
      :ui="{
        content: 'max-w-2xl bg-bg border-l border-line ring-0',
        header: 'border-b border-line',
        title: 'num-display text-hi text-[18px]',
        description: 'text-[11px] text-muted'
      }"
    >
      <template #body>
        <div class="space-y-3">
          <!-- Generate + filter controls -->
          <div class="flex items-center justify-between gap-2">
            <span class="flex gap-2.5 text-[11px]">
              <button
                v-for="opt in FILTERS"
                :key="opt.value"
                type="button"
                class="cursor-pointer uppercase tracking-[0.12em]"
                :class="filter === opt.value ? 'text-accent' : 'text-faint hover:text-accent'"
                @click="filter = opt.value"
              >{{ filter === opt.value ? `[${opt.label}]` : opt.label }}</button>
            </span>
            <UDropdownMenu
              v-if="isOwner"
              :items="generateItems"
              :content="{ align: 'end' }"
              :ui="{ content: 'bg-raised border border-line-accent ring-0', item: 'text-[12px]' }"
            >
              <button
                type="button"
                class="tui-btn"
                :disabled="generating"
              >
                {{ generating ? 'GENERATING…' : '✦ GENERATE ▾' }}
              </button>
            </UDropdownMenu>
          </div>

          <p
            v-if="status === 'pending'"
            class="py-8 text-center text-[12px] text-muted"
          >
            Loading…
          </p>

          <p
            v-else-if="!filtered.length"
            class="py-8 text-center text-[12px] text-muted"
          >
            No {{ filter === 'all' ? '' : filter + ' ' }}digests yet.
            <br>Use <span class="text-accent">GENERATE</span> to create one now, or wait for the scheduled run.
          </p>

          <div
            v-else
            class="space-y-2.5"
          >
            <article
              v-for="d in filtered"
              :key="d.id"
              class="bg-raised border border-line-soft px-3.5 py-3"
            >
              <TuiHeader
                :label="`${d.type === 'weekly' ? 'WEEKLY' : 'DAILY'} · ${periodLabel(d)}`"
                :dashes="6"
              >
                <span class="text-[10.5px] text-muted">{{ relativeTime(d.created_at) }}</span>
              </TuiHeader>

              <div class="mt-2.5 text-[12.5px] leading-[1.7] text-dim digest-prose">
                <Markdown :value="d.summary" />
              </div>

              <div
                v-if="chips(d).length"
                class="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-line-soft"
              >
                <span
                  v-for="chip in chips(d)"
                  :key="chip"
                  class="text-[10.5px] px-1.5 py-0.5 border border-line-soft text-muted"
                >
                  {{ chip }}
                </span>
              </div>
            </article>
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
const { role, isOwner } = await useAuth()

// Available everywhere the shell renders (opened via ⌘K or the home digest links), except
// the login page. Digests recap notes/sodas too, so the panel is owner+friend — the doctor
// role doesn't get it.
const visible = computed(() =>
  route.path !== '/labs/login'
  && (role.value === 'owner' || role.value === 'friend')
)

// Shared state so the footer status bar / command palette can open the panel too.
const open = useState('digest-panel-open', () => false)
const { data, status, execute, refresh } = useDigests()

let loadedOnce = false
watch(open, (v) => {
  if (v && !loadedOnce) {
    loadedOnce = true
    execute()
  }
}, { immediate: true })

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

const generateItems = [
  [
    { label: 'Today\'s recap', icon: 'i-lucide-calendar-days', onSelect: () => generate('daily', localToday()) },
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
  const push = (v: number | null | undefined, fn: (n: number) => string) => {
    if (v != null) out.push(fn(v))
  }
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
