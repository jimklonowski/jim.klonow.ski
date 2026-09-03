<template>
  <!-- On lg the home column caps this box's height (flex column, see index.vue): the prose
       wrapper below is the only thing that scrolls, so the action bar keeps its place in
       normal flow at the very bottom — nothing can render behind or past it. On mobile the
       page scrolls as usual and min-h-full just keeps the bar at the panel's foot. -->
  <div class="flex flex-col min-h-full lg:min-h-0 lg:flex-1">
    <!-- pr keeps the thin scrollbar from hugging the bubble's border. mb-2 is dead
         space for the speech tail below: it pokes ~7px above the divider, and margin
         (unlike padding) ends the scrollport early so text clips before sliding under it. -->
    <div class="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1 mb-2">
      <!-- Daily leads: it's the fresher read and short enough to stay above the fold, so the
           long weekly recap (and its recommendations) never pushes today's note out of view. -->
      <TickerDigestPanel
        ref="dailyPanel"
        label="AI DIGEST · DAILY"
        :meta="daily ? formatDate(daily.period_end, 'monthDay').toUpperCase() : '—'"
      >
        <Markdown
          v-if="daily"
          :value="dailyParts.prose"
        />
        <p
          v-else
          class="text-muted"
        >
          No daily digest yet.
        </p>
      </TickerDigestPanel>

      <TickerDigestPanel
        ref="weeklyPanel"
        label="AI DIGEST · WEEKLY"
        :meta="weekly ? weeklyPeriod : '—'"
        class="mt-4.5"
      >
        <Markdown
          v-if="weekly"
          :value="weeklyParts.prose"
        />
        <p
          v-else
          class="text-muted"
        >
          No weekly digest yet.
        </p>
      </TickerDigestPanel>

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
    </div>

    <!-- TICKER lives down here (Jim's call — no cutout in the bubbles), with the
         actions and freshness stats to its right. The chevron on the divider above
         the heart keeps the speech-bubble look without scrolling away. -->
    <div class="ticker-footer relative mt-auto pt-3 border-t border-line-soft flex items-center gap-4">
      <TickerCompanion
        ref="companion"
        :rhr="rhr"
        :sluggish="sluggish"
        @open="digestOpen = true"
      />
      <div class="flex-1 min-w-0 flex flex-col gap-1.5 text-[11.5px]">
        <div class="flex flex-wrap items-baseline gap-3.5">
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
        </div>
        <span class="text-muted">
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
  </div>
</template>

<script setup lang="ts">
import type { Digest } from '~/composables/useDigests'

const props = withDefaults(defineProps<{
  digests: Digest[]
  isOwner: boolean
  /** Latest resting HR — TICKER beats at this rate. */
  rhr?: number | null
  /** Short-sleep state (last night <6h, no ≥7h night since). */
  sluggish?: boolean
  /** Latest Whoop recovery %, for the >80 celebration. */
  recovery?: number | null
  /** Live count of sodas logged today, for the #3 flatline gag. */
  sodasToday?: number
  /** Latest lab draw with out-of-range markers, for the thump. */
  latestDrawDate?: string | null
  flagCount?: number
}>(), {
  rhr: null,
  sluggish: false,
  recovery: null,
  sodasToday: 0,
  latestDrawDate: null,
  flagCount: 0
})

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

// --- TICKER event wiring (design_handoff_ticker screen 04) ------------------
// One-shots are triggered here where the data lives; the companion itself
// guarantees they return to idle ≤2s and never queue.

const weeklyPanel = useTemplateRef('weeklyPanel')
const dailyPanel = useTemplateRef('dailyPanel')
const companion = useTemplateRef('companion')

// DIGEST ARRIVES — a summary changed after load: type the bubble on, double-beat.
watch(() => weekly.value?.summary, (val, old) => {
  if (val && val !== old) {
    weeklyPanel.value?.wipe()
    companion.value?.trigger('digest')
  }
})
watch(() => daily.value?.summary, (val, old) => {
  if (val && val !== old) {
    dailyPanel.value?.wipe()
    companion.value?.trigger('digest')
  }
})

// SODA #3 IN A DAY — the flatline gag, on the live shared soda count.
watch(() => props.sodasToday, (n, o) => {
  if (n >= 3 && (o ?? 0) < 3) companion.value?.trigger('flatline')
})

// Mount-time reactions, staggered so TICKER visibly "notices" after settling in.
// A new lab flag outranks the recovery celebration; the one-shot lock drops
// whichever comes second anyway.
onMounted(() => {
  setTimeout(() => {
    if (props.flagCount > 0 && props.latestDrawDate && isRecent(props.latestDrawDate)
      && localStorage.getItem('ticker:thumped') !== props.latestDrawDate) {
      localStorage.setItem('ticker:thumped', props.latestDrawDate)
      companion.value?.trigger('thump')
      return
    }
    const today = localToday()
    if (props.recovery != null && props.recovery > 80
      && localStorage.getItem('ticker:celebrated') !== today) {
      localStorage.setItem('ticker:celebrated', today)
      companion.value?.trigger('celebrate')
    }
  }, 800)
})

function isRecent(date: string) {
  return (Date.parse(localToday()) - Date.parse(date)) / 86400000 <= 7
}
</script>

<style scoped>
/* Notch in the divider, pointing down at TICKER's heart (the tail points at the speaker):
   a 10×10 square rotated 45° so its right+bottom borders form the downward wedge, with the
   other two edges left undrawn.

   The fill is the page color, not the bubble color, and that is load-bearing twice over. The
   diamond straddles the divider (top:-5px puts the two arm tips level with the line), so a
   page-colored fill masks the divider across the notch's mouth — the line reads as dipping
   down into the wedge and back up. A raised/bubble-colored fill instead left the diamond's
   upper half visible as a lighter square floating above a line that ran straight through it.
   Matching --color-line-soft to the divider (not the brighter --color-line-input) is the
   other half: the wedge has to look like the same stroke, not a foreign object on top of it.
   Both values are tied to what this sits on — bg-bg in index.vue — so re-home the footer and
   these have to follow. */
.ticker-footer::before {
  content: '';
  position: absolute;
  top: -5px;
  left: 27px;
  width: 10px;
  height: 10px;
  background: var(--color-bg);
  border-right: 1px solid var(--color-line-soft);
  border-bottom: 1px solid var(--color-line-soft);
  transform: rotate(45deg);
}
</style>
