<template>
  <!-- On lg the home column caps this box's height (flex column, see index.vue): the prose
       wrapper below is the only thing that scrolls, so the action bar keeps its place in
       normal flow at the very bottom — nothing can render behind or past it. On mobile the
       page scrolls as usual and min-h-full just keeps the bar at the panel's foot. -->
  <div class="flex flex-col min-h-full lg:min-h-0 lg:flex-1">
    <TuiHeader
      label="AI DIGEST · WEEKLY"
      :dashes="9"
    >
      <span class="text-[10.5px] text-muted">{{ weekly ? weeklyPeriod : '—' }}</span>
    </TuiHeader>

    <div class="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
      <div
        v-if="weekly"
        class="mt-3 text-[12.5px] leading-[1.75] text-dim digest-prose"
      >
        <Markdown :value="weeklyParts.prose" />
      </div>
      <p
        v-else
        class="mt-3 text-[12px] text-muted"
      >
        No weekly digest yet.
      </p>

      <div
        v-if="weeklyParts.recommendations.length"
        class="mt-3.5 px-3.5 py-3 bg-raised border border-line-input"
      >
        <div class="text-[10.5px] text-warn tracking-[0.12em] mb-2">
          ▲ {{ weeklyParts.recommendations.length }} RECOMMENDATIONS
        </div>
        <div class="text-[12px] leading-[1.7] text-dim">
          <div
            v-for="(rec, i) in weeklyParts.recommendations"
            :key="i"
          >
            <span class="text-faint">{{ String(i + 1).padStart(2, '0') }}</span> {{ rec }}
          </div>
        </div>
      </div>

      <TuiHeader
        label="DAILY · TODAY"
        class="mt-4.5"
      />
      <div
        v-if="daily"
        class="mt-2.5 text-[12px] leading-[1.7] text-dim digest-prose"
      >
        <Markdown :value="dailyParts.prose" />
      </div>
      <p
        v-else
        class="mt-2.5 text-[12px] text-muted"
      >
        No daily digest yet.
      </p>
    </div>

    <div class="mt-auto pt-3 border-t border-line-soft flex flex-wrap items-baseline gap-3.5 text-[11.5px]">
      <button
        type="button"
        class="text-accent hover:text-accent-hover cursor-pointer"
        @click="digestOpen = true"
      >
        all digests →
      </button>
      <button
        v-if="isOwner"
        type="button"
        class="text-accent hover:text-accent-hover cursor-pointer disabled:opacity-50"
        :disabled="generating"
        @click="regenerate"
      >
        {{ generating ? 'generating…' : 'regenerate ⟳' }}
      </button>
      <span class="ml-auto text-muted">
        daily: {{ daily ? relative(daily.period_end) : '—' }}
        <span
          v-if="daily"
          class="text-accent"
        >✓</span>
        · weekly: {{ weekly ? relative(weekly.period_end) : '—' }}
        <span
          v-if="weekly"
          class="text-accent"
        >✓</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Digest } from '~/composables/useDigests'

const props = defineProps<{
  digests: Digest[]
  isOwner: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

const digestOpen = useState('digest-panel-open', () => false)
const toast = useToast()
const generating = ref(false)

function newest(type: 'daily' | 'weekly') {
  return [...props.digests]
    .filter(d => d.type === type)
    .sort((a, b) => a.period_end.localeCompare(b.period_end))
    .at(-1) ?? null
}

const weekly = computed(() => newest('weekly'))
const daily = computed(() => newest('daily'))

const weeklyParts = computed(() => splitDigest(weekly.value?.summary))
const dailyParts = computed(() => splitDigest(daily.value?.summary))

const weeklyPeriod = computed(() => {
  const d = weekly.value
  if (!d) return ''
  const start = formatDate(d.period_start, 'monthDay').toUpperCase()
  // Same month on both ends reads better as "AUG 17–23" than "AUG 17–AUG 23".
  const endDay = new Date(d.period_end + 'T12:00:00').getDate()
  const sameMonth = d.period_start.slice(0, 7) === d.period_end.slice(0, 7)
  return sameMonth ? `${start}–${endDay}` : `${start}–${formatDate(d.period_end, 'monthDay').toUpperCase()}`
})

function relative(date: string) {
  const days = Math.round((Date.now() - new Date(date + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return formatDate(date, 'monthDay').toLowerCase()
}

async function regenerate() {
  generating.value = true
  try {
    const res = await $fetch<{ skipped?: boolean }>('/api/journal/digest/generate', {
      method: 'POST',
      body: { kind: 'daily', endDate: localToday() }
    })
    if (res.skipped) {
      toast.add({ title: 'Nothing to summarize', description: 'No data logged for today yet.', color: 'warning' })
    }
    else {
      emit('refresh')
      toast.add({ title: 'Digest ready', description: 'Today\'s recap regenerated.', color: 'success' })
    }
  }
  catch (err) {
    const e = err as { data?: { message?: string } }
    toast.add({ title: 'Generation failed', description: e.data?.message ?? 'Try again in a moment.', color: 'error' })
  }
  finally {
    generating.value = false
  }
}
</script>
