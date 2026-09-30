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
            <TuiToggle
              v-model="filter"
              :options="FILTERS"
              class="gap-2.5 text-[11px]"
              button-class="uppercase tracking-[0.12em]"
            />
            <UDropdownMenu
              v-if="isOwner"
              :items="generateItems"
              :content="{ align: 'end' }"
            >
              <button
                type="button"
                class="tui-btn"
                :disabled="generating || filling"
              >
                {{ filling ? `FILLING ${fillDone}/${fillTotal}…` : generating ? 'GENERATING…' : '✦ GENERATE ▾' }}
              </button>
            </UDropdownMenu>
          </div>

          <!-- Missing digests: past days (and weeks) that have data but no recap, e.g. while the
               cron was failing. Filling them spends one model call each. -->
          <p
            v-if="isOwner && gapCount && !filling"
            class="text-[11px] text-muted"
          >
            {{ gapSummary }} in the last {{ gaps?.days }} days {{ gapCount === 1 ? 'has' : 'have' }} data but no digest ·
            <button
              type="button"
              class="text-accent hover:text-accent-hover cursor-pointer"
              @click="fillGaps"
            >
              fill gaps ⟳
            </button>
          </p>

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
import { isFullAccessRole } from '#shared/utils/access'
import type { Digest } from '~/composables/useDigests'

const route = useRoute()
const toast = useToast()
const { role, isOwner } = await useAuth()

// Available everywhere the shell renders (opened via ⌘K or the home digest links), except
// the login page. Digests recap notes/sodas too, so the panel is owner/friend/demo — the
// doctor role doesn't get it. Demo sees the pre-written sandbox digests (generate stays owner).
const visible = computed(() =>
  route.path !== '/labs/login'
  && isFullAccessRole(role.value)
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
  if (v && isOwner.value) loadGaps()
}, { immediate: true })

// --- missing digests (owner) ---

interface Gaps { days: number, daily: string[], weekly: string[] }
const gaps = ref<Gaps | null>(null)
const gapCount = computed(() => (gaps.value?.daily.length ?? 0) + (gaps.value?.weekly.length ?? 0))
const gapSummary = computed(() => {
  const g = gaps.value
  if (!g) return ''
  const parts = []
  if (g.daily.length) parts.push(`${g.daily.length} day${g.daily.length === 1 ? '' : 's'}`)
  if (g.weekly.length) parts.push(`${g.weekly.length} week${g.weekly.length === 1 ? '' : 's'}`)
  return parts.join(' and ')
})

async function loadGaps() {
  try {
    gaps.value = await $fetch<Gaps>('/api/journal/digest/gaps')
  }
  catch {
    gaps.value = null
  }
}

const filling = ref(false)
const fillDone = ref(0)
const fillTotal = ref(0)
const BATCH = 5

// Batches of five, oldest first, so progress shows between requests and a long backlog never
// becomes one multi-minute request. A failed day is counted and reported; the rest still run.
async function fillGaps() {
  const g = gaps.value
  if (!g || filling.value) return
  const jobs = [
    ...g.daily.map(date => ({ kind: 'daily' as const, date })),
    ...g.weekly.map(date => ({ kind: 'weekly' as const, date }))
  ]
  filling.value = true
  fillDone.value = 0
  fillTotal.value = jobs.length
  let failed = 0
  let skipped = 0
  try {
    for (const kind of ['daily', 'weekly'] as const) {
      const dates = jobs.filter(j => j.kind === kind).map(j => j.date)
      for (let i = 0; i < dates.length; i += BATCH) {
        const res = await $fetch<{ results: Array<{ ok: boolean, skipped?: boolean }> }>('/api/journal/digest/backfill', {
          method: 'POST',
          body: { kind, dates: dates.slice(i, i + BATCH) }
        })
        failed += res.results.filter(r => !r.ok).length
        // A skipped day had nothing worth summarizing — counting it as "written" made the same
        // gap reappear on every reload while the toast claimed success.
        skipped += res.results.filter(r => r.ok && r.skipped).length
        fillDone.value += res.results.length
        await refresh()
      }
    }
    const written = fillDone.value - failed - skipped
    const parts = [`${written} written`]
    if (skipped) parts.push(`${skipped} had nothing to summarize`)
    if (failed) parts.push(`${failed} failed — try again later`)
    toast.add(failed
      ? { title: 'Gaps partly filled', description: `${parts.join(', ')}.`, color: 'warning', icon: 'i-lucide-info' }
      : { title: 'Gaps filled', description: `${parts.join(', ')}.`, color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Backfill stopped', description: extractErrorMessage(err, 'Try again in a moment.'), color: 'error' })
  }
  finally {
    filling.value = false
    loadGaps()
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

const generateItems = computed(() => [
  [
    { label: 'Today\'s recap', icon: 'i-lucide-calendar-days', onSelect: () => generate('daily', localToday()) },
    { label: 'This past week', icon: 'i-lucide-calendar-range', onSelect: () => generate('weekly') }
  ],
  ...(gapCount.value
    ? [[{ label: `Fill gaps (${gapCount.value} missing)`, icon: 'i-lucide-history', onSelect: fillGaps }]]
    : [])
])

const { run: generate, pending: generating } = useSaveAction(async (kind: 'daily' | 'weekly', endDate?: string) => {
  const res = await $fetch<{ skipped?: boolean }>('/api/journal/digest/generate', { method: 'POST', body: { kind, endDate } })
  if (res.skipped) {
    toast.add({ title: 'Nothing to summarize', description: `No data logged for that ${kind === 'weekly' ? 'week' : 'day'}.`, color: 'warning', icon: 'i-lucide-info' })
    return false
  }
  await refresh()
  return true
}, {
  error: 'Generation failed',
  success: (generated, kind) => generated
    ? { title: 'Digest ready', description: `${kind === 'weekly' ? 'Weekly' : 'Daily'} digest generated.` }
    : null
})

// --- display helpers ---
function fmt(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function periodLabel(d: Digest) {
  return d.type === 'weekly' ? `${fmt(d.period_start)} – ${fmt(d.period_end)}` : fmt(d.period_end)
}
function relativeTime(iso: string | null) {
  if (!iso) return ''
  // Calendar days in HOME_TZ, not elapsed hours: 11:50pm yesterday is "yesterday" at 8am.
  const days = diffDays(localDayOf(iso), localToday())
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
function fmtSleep(min: number) {
  // Round the total before splitting, or 419.7 reads "6h 60m".
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
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
    // Ounces beside the count when the sizes carried them — two mini cans are less than one bottle.
    push(s.sodas, v => v ? `${v} soda${v === 1 ? '' : 's'}${s.soda_oz ? ` · ~${s.soda_oz} oz` : ''}` : '')
  }
  else {
    push(s.avg_recovery, v => `Avg rec ${v}%`)
    push(s.avg_sleep_min, v => `Avg sleep ${fmtSleep(v)}`)
    if (s.avg_bp_systolic != null && s.avg_bp_diastolic != null) out.push(`BP ${s.avg_bp_systolic}/${s.avg_bp_diastolic}`)
    push(s.weight_change, v => `${v >= 0 ? '+' : ''}${v} lbs`)
    push(s.compounds, v => `${v} compound${v === 1 ? '' : 's'}`)
    push(s.workouts, v => `${v} workout${v === 1 ? '' : 's'}`)
    push(s.sodas, v => `${v} soda${v === 1 ? '' : 's'}${s.soda_oz ? ` · ~${s.soda_oz} oz` : ''}`)
  }
  return out.filter(Boolean)
}
</script>
