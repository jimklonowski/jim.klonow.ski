<template>
  <section
    v-if="states.length || isOwner"
    id="planned"
  >
    <TuiHeader
      :label="headerLabel"
      :dashes="6"
    >
      <span
        v-if="next"
        class="text-label"
        :class="next.status === 'overdue' ? 'text-warn' : 'text-muted'"
      >{{ countdownLabel(next.inDays) }}</span>
      <button
        v-if="isOwner"
        type="button"
        class="text-label text-accent hover:text-accent-hover cursor-pointer ml-3"
        @click="modal?.open()"
      >
        + plan a draw
      </button>
    </TuiHeader>

    <!-- The next open plan: the countdown and what and where, always; what it answers and the
         prep behind a toggle, closed until asked for — open, the two lists ran the panel past a
         screen's height above the marker cards (Jim, 2026-11-19). The toggle still says how much
         is folded away, and when a prep step applies today. Open, the two lists sit UNDER the
         main text, side by side: beside it, as a narrow right-hand column, they left the rest of
         the panel blank down their whole length. -->
    <div
      v-if="next"
      class="mt-2.5 border border-line-soft bg-raised px-3.5 py-3"
      data-next-draw
    >
      <div class="min-w-0">
        <div class="flex items-baseline gap-2">
          <span
            class="num-display text-display leading-none"
            :class="bigClass"
          >{{ big.value }}</span>
          <span
            v-if="big.unit"
            class="text-label text-muted"
          >{{ big.unit }}</span>
        </div>
        <p class="text-row text-hi mt-1.5">
          {{ formatDate(next.plan.date, 'long') }}
        </p>
        <p class="text-meta text-muted">
          {{ drawLabel(next.plan) }}
        </p>
        <p
          v-if="footLine"
          class="text-meta text-faint mt-1.5"
        >
          {{ footLine }}
        </p>
        <!-- Never folded: the one line here that asks for something to be done. -->
        <p
          v-if="next.status === 'overdue'"
          class="text-small text-warn mt-1.5"
        >
          No results on file for this draw yet.
          <NuxtLink
            v-if="isOwner"
            to="/labs/upload"
            class="text-accent hover:text-accent-hover"
          >upload results →</NuxtLink>
        </p>
      </div>

      <div
        v-if="hasDetails || isOwner"
        class="flex items-baseline gap-3 flex-wrap mt-2"
      >
        <button
          v-if="hasDetails"
          type="button"
          class="text-label text-faint hover:text-accent cursor-pointer text-left"
          :aria-expanded="detailsOpen"
          aria-controls="planned-details"
          data-next-draw-toggle
          @click="detailsOpen = !detailsOpen"
        >
          {{ detailsOpen ? '▾' : '▸' }} {{ detailsLabel }}<span
            v-if="prepNow && !detailsOpen"
            class="text-accent"
          > · {{ prepNow }} to do now</span>
        </button>
        <span
          v-if="isOwner"
          class="ml-auto flex gap-3 text-meta"
        >
          <button
            type="button"
            class="text-faint hover:text-accent cursor-pointer"
            @click="modal?.open(next.plan)"
          >
            edit
          </button>
          <button
            type="button"
            class="text-faint hover:text-danger cursor-pointer"
            @click="confirmDelete(next.plan)"
          >
            ✕ delete
          </button>
        </span>
      </div>

      <!-- Two columns from tablet width when there are both lists; one list takes the row. -->
      <div
        v-if="detailsOpen && hasDetails"
        id="planned-details"
        class="mt-3 pt-3 border-t border-line-soft grid grid-cols-1 gap-x-8 gap-y-3 text-small"
        :class="questions.length && shownPrep.length ? 'md:grid-cols-2' : ''"
        data-next-draw-details
      >
        <div
          v-if="questions.length"
          class="min-w-0"
        >
          <p class="tui-label text-micro">
            answers
          </p>
          <div class="flex flex-col gap-0.5 mt-1">
            <div
              v-for="(q, i) in questions"
              :key="q"
              class="flex gap-2.5 min-w-0"
            >
              <span class="text-ghost shrink-0">{{ i === questions.length - 1 ? '└' : '├' }}</span>
              <span class="text-body">{{ q }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="shownPrep.length"
          class="min-w-0"
        >
          <p class="tui-label text-micro">
            prep
          </p>
          <div class="flex flex-col gap-0.5 mt-1">
            <div
              v-for="(r, i) in shownPrep"
              :key="r.key"
              class="flex gap-2.5 min-w-0"
            >
              <span class="text-ghost shrink-0">{{ i === shownPrep.length - 1 ? '└' : '├' }}</span>
              <span
                class="shrink-0 w-14 text-meta"
                :class="r.state === 'ahead' ? 'text-faint' : 'text-accent'"
              >{{ prepWhen(r) }}</span>
              <span :class="r.state === 'ahead' ? 'text-muted' : 'text-body'">{{ r.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p
      v-else
      class="mt-2.5 text-small text-muted"
    >
      No draw planned{{ isOwner ? ' — "+ plan a draw" books the next one: the date, the lab, the panel, and what it should answer.' : '.' }}
    </p>

    <!-- Markers past (or within a month of) their retest cadence (item 66): each with the
         reading its clock started at, and whether a booked draw covers it. -->
    <div
      v-if="due.length"
      class="mt-3"
      data-due
    >
      <p class="tui-label text-micro">
        markers due
      </p>
      <div class="flex flex-col gap-0.5 mt-1 text-small">
        <div
          v-for="(d, i) in due"
          :key="d.key"
          class="flex gap-2.5 min-w-0 flex-wrap"
          :title="d.text"
        >
          <span class="text-ghost shrink-0">{{ i === due.length - 1 ? '└' : '├' }}</span>
          <span class="text-hi">{{ d.label }}</span>
          <span class="text-muted">last {{ formatDate(d.last.date, 'monthDay') }} ({{ d.lastText }})</span>
          <span
            class="ml-auto shrink-0"
            :class="d.chip.class"
          >{{ d.chip.text }}</span>
        </div>
      </div>
      <button
        v-if="isOwner && unbooked.length"
        type="button"
        class="mt-1.5 text-label text-accent hover:text-accent-hover cursor-pointer"
        @click="bookDue"
      >
        + book {{ unbooked.length === due.length ? 'these' : `the ${unbooked.length} unbooked` }} →
      </button>
    </div>

    <!-- Everything else: later bookings, fulfilled plans, missed ones. Newest first. -->
    <div
      v-if="others.length"
      class="mt-3"
    >
      <button
        type="button"
        class="text-label text-faint hover:text-accent cursor-pointer"
        :aria-expanded="historyOpen"
        @click="historyOpen = !historyOpen"
      >
        {{ historyOpen ? '▾' : '▸' }} {{ others.length }} more {{ others.length === 1 ? 'plan' : 'plans' }}
      </button>
      <div
        v-if="historyOpen"
        class="mt-1.5"
      >
        <div
          v-for="s in others"
          :key="s.plan.id"
          class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-1.5 border-b border-line-row last:border-0 text-small group"
        >
          <span class="text-muted tabular-nums w-23 shrink-0">{{ formatDate(s.plan.date) }}</span>
          <span class="text-hi">{{ s.plan.lab || 'draw' }}</span>
          <span
            v-if="s.plan.panel"
            class="text-small text-muted truncate min-w-0"
          >{{ s.plan.panel }}</span>
          <span class="ml-auto flex items-baseline gap-2 shrink-0">
            <span
              class="text-meta"
              :class="statusChip(s).class"
            >{{ statusChip(s).text }}</span>
            <template v-if="isOwner">
              <button
                type="button"
                class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
                :aria-label="`Edit the draw planned for ${s.plan.date}`"
                @click="modal?.open(s.plan)"
              >edit</button>
              <button
                type="button"
                class="text-meta text-faint hover:text-danger cursor-pointer tui-row-action"
                :aria-label="`Delete the draw planned for ${s.plan.date}`"
                @click="confirmDelete(s.plan)"
              >✕</button>
            </template>
          </span>
        </div>
      </div>
    </div>

    <LabsPlannedDrawModal
      ref="modal"
      :cycles="cycles"
      :draw-dates="drawDates"
      @saved="emit('refresh')"
    />
  </section>
</template>

<script setup lang="ts">
import type { PlannedDraw, PlannedDrawState, PrepReminder } from '#shared/utils/plannedDraws'
import { countdownLabel, drawLabel, nextOpen, plannedDrawStates, prepReminders, purposeLines } from '#shared/utils/plannedDraws'
import { cycleCheckpoints } from '#shared/utils/cycles'
import { diffDays } from '#shared/utils/dates'
import { fmtMarkerValue } from '#shared/utils/markerValue'
import { RETEST_RULES, cadenceText, markersDue, suggestedDrawDate, type RetestDraw } from '#shared/utils/retest'
import { BIOMARKERS, CATEGORY_LABELS } from '~/data/biomarkers'

// The /labs planned-draws section: the next open plan (the countdown always; what it answers and
// the dated prep behind a toggle), the rest folded under a count. The page owns the list and the draw dates; this
// component owns the cycles it needs for the modal's checkpoint picker.
const props = withDefaults(defineProps<{
  plans: PlannedDraw[]
  /** Every draw on file, any order. */
  drawDates: string[]
  isOwner: boolean
  /** The blood draws with their markers, for the retest clocks (item 66); none → no due list. */
  draws?: RetestDraw[]
}>(), { draws: () => [] })
const emit = defineEmits<{ refresh: [] }>()

// No await: useAsyncData registers the fetch for SSR itself, and the list is shared with the
// home page and the calendar under one key.
const { data: cyclesData } = useCycles()
const cycles = computed(() => cyclesData.value ?? [])
const modal = useTemplateRef('modal')

// Reactive: the overnight PWA used to keep yesterday as today until a reload.
const today = useToday()

const states = computed(() => plannedDrawStates(props.plans, props.drawDates, today.value))
// The same pick as the home strip and the labs header (nextOpen), so the three can't disagree.
const next = computed(() => nextOpen(states.value))
const others = computed(() => states.value.filter(s => s !== next.value).reverse())
const historyOpen = ref(false)

const headerLabel = computed(() =>
  next.value ? `NEXT DRAW · ${formatDate(next.value.plan.date, 'monthDay').toUpperCase()}` : 'NEXT DRAW'
)
const questions = computed(() => next.value ? purposeLines(next.value.plan) : [])
const prep = computed(() => next.value ? prepReminders(next.value.plan, today.value) : [])

// The fold: what the draw answers and its prep sit behind a toggle, closed on every load. An
// overdue plan has no prep left to show (its "no results yet" line is never folded).
const detailsOpen = ref(false)
// Arriving by the home strip's "prep →" / "details →" link (/labs#planned) is asking for exactly
// what the fold holds, so it opens. After mount: the hash never reaches the server render.
const route = useRoute()
const openForHash = () => {
  if (route.hash === '#planned') detailsOpen.value = true
}
onMounted(openForHash)
watch(() => route.hash, openForHash)
const shownPrep = computed(() => (next.value && next.value.status !== 'overdue' ? prep.value : []))
const hasDetails = computed(() => questions.value.length > 0 || shownPrep.value.length > 0)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** "5 questions it answers · 5 prep steps" — what is folded away, the same text open or shut. */
const detailsLabel = computed(() => [
  questions.value.length ? plural(questions.value.length, 'question it answers', 'questions it answers') : '',
  shownPrep.value.length ? plural(shownPrep.value.length, 'prep step', 'prep steps') : ''
].filter(Boolean).join(' · '))
/** Prep steps that apply today, said on the closed toggle so a fold never hides a thing to do. */
const prepNow = computed(() => shownPrep.value.filter(r => r.state !== 'ahead').length)

/** The big figure: days to go, "today", or days overdue. */
const big = computed(() => {
  const s = next.value
  if (!s) return { value: '—', unit: '' }
  if (s.status === 'today') return { value: 'today', unit: '' }
  if (s.status === 'overdue') return { value: `${-s.inDays}`, unit: `day${s.inDays === -1 ? '' : 's'} ago` }
  return { value: `${s.inDays}`, unit: s.inDays === 1 ? 'day' : 'days' }
})
const bigClass = computed(() =>
  next.value?.status === 'overdue' ? 'text-warn' : next.value?.status === 'today' ? 'text-accent' : 'text-hi'
)

function prepWhen(r: PrepReminder) {
  return r.state === 'today' ? 'today' : r.state === 'active' ? 'now' : formatDate(r.from, 'monthDay')
}

/** "38 days after the Sep 9 draw · Primo Run 1 mid-cycle draw" */
const footLine = computed(() => {
  const s = next.value
  if (!s) return ''
  const parts: string[] = []
  const last = [...props.drawDates].sort().filter(d => d < s.plan.date).at(-1)
  if (last) parts.push(`${diffDays(last, s.plan.date)} days after the ${formatDate(last, 'monthDay')} draw`)
  if (s.plan.cycle_id != null && s.plan.checkpoint_key) {
    const cycle = cycles.value.find(c => c.id === s.plan.cycle_id)
    const cp = cycle ? cycleCheckpoints(cycle).find(c => c.key === s.plan.checkpoint_key) : null
    if (cycle && cp) parts.push(`${cycle.name} · ${cp.label}`)
  }
  return parts.join(' · ')
})

// --- markers due (item 66) ---
// Each ruled marker whose clock has run down (or will within the month), with the reading it
// started at; the chip says overdue / due in N / booked. The owner's "book these" opens the modal
// with the date, a panel from the markers' categories and one purpose line per marker.
const dueRaw = computed(() => markersDue(props.draws, props.plans, today.value))
const due = computed(() => dueRaw.value.map((d) => {
  const meta = BIOMARKERS[d.key]
  const label = meta?.label ?? d.key
  const chip = d.planned
    ? { text: `booked ${formatDate(d.planned.date, 'monthDay')}`, class: 'text-accent' }
    : d.inDays < 0
      ? { text: `${-d.inDays} day${d.inDays === -1 ? '' : 's'} overdue`, class: 'text-warn' }
      : { text: d.inDays === 0 ? 'due today' : `due in ${d.inDays} day${d.inDays === 1 ? '' : 's'}`, class: 'text-muted' }
  return {
    key: d.key,
    label,
    last: d.last,
    lastText: `${fmtMarkerValue(d.last.value)}${meta?.unit ? ` ${meta.unit}` : ''}`,
    chip,
    text: `${label}: ${cadenceText(RETEST_RULES[d.key]!, d.flagged)} from the ${d.last.date} reading → due ${d.due}`,
    planned: d.planned
  }
}))
const unbooked = computed(() => due.value.filter(d => !d.planned))

function bookDue() {
  const rows = unbooked.value
  const categories = [...new Set(rows.map(d => BIOMARKERS[d.key]?.category).filter(Boolean))] as Array<keyof typeof CATEGORY_LABELS>
  modal.value?.open(undefined, {
    date: suggestedDrawDate(dueRaw.value, today.value) ?? undefined,
    panel: categories.map(c => CATEGORY_LABELS[c]).join(' + '),
    purpose: rows.map(d => `${d.label}: last ${d.lastText} on ${formatDate(d.last.date, 'monthDay')}`).join('\n')
  })
}

function statusChip(s: PlannedDrawState): { text: string, class: string } {
  if (s.status === 'done') return { text: `done ✓ ${s.drawDate ? formatDate(s.drawDate, 'monthDay') : ''}`.trim(), class: 'text-accent' }
  if (s.status === 'missed') return { text: 'missed', class: 'text-danger' }
  if (s.status === 'overdue') return { text: 'no results', class: 'text-warn' }
  return { text: countdownLabel(s.inDays), class: 'text-muted' }
}

const { run: deletePlan } = useSaveAction(async (plan: PlannedDraw) => {
  await $fetch('/api/labs/planned/delete', { method: 'POST', body: { id: plan.id } })
  emit('refresh')
}, { success: 'Plan deleted', error: 'Delete failed' })

async function confirmDelete(plan: PlannedDraw) {
  if (!confirm(`Delete the draw planned for ${formatDate(plan.date)}?`)) return
  await deletePlan(plan)
}
</script>
