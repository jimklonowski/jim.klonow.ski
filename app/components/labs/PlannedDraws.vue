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
        class="text-[10.5px]"
        :class="next.status === 'overdue' ? 'text-warn' : 'text-muted'"
      >{{ countdownLabel(next.inDays) }}</span>
      <button
        v-if="isOwner"
        type="button"
        class="text-[10.5px] text-accent hover:text-accent-hover cursor-pointer ml-3"
        @click="modal?.open()"
      >
        + plan a draw
      </button>
    </TuiHeader>

    <!-- The next open plan: the countdown, what and where, what it answers, and the prep. -->
    <div
      v-if="next"
      class="mt-2.5 border border-line-soft bg-raised px-3.5 py-3 grid grid-cols-1 sm:grid-cols-[minmax(150px,auto)_minmax(0,1fr)] gap-x-6 gap-y-3"
    >
      <div class="min-w-0">
        <div class="flex items-baseline gap-2">
          <span
            class="num-display text-[28px] leading-none"
            :class="bigClass"
          >{{ big.value }}</span>
          <span
            v-if="big.unit"
            class="text-[10.5px] text-muted"
          >{{ big.unit }}</span>
        </div>
        <p class="text-[12.5px] text-hi mt-1.5">
          {{ formatDate(next.plan.date, 'long') }}
        </p>
        <p class="text-[11px] text-muted">
          {{ drawLabel(next.plan) }}
        </p>
        <p
          v-if="footLine"
          class="text-[11px] text-faint mt-1.5"
        >
          {{ footLine }}
        </p>
      </div>

      <div class="min-w-0 text-[12px] space-y-2.5">
        <div v-if="questions.length">
          <p class="tui-label text-[10px]">
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

        <div v-if="next.status !== 'overdue'">
          <p class="tui-label text-[10px]">
            prep
          </p>
          <div class="flex flex-col gap-0.5 mt-1">
            <div
              v-for="(r, i) in prep"
              :key="r.key"
              class="flex gap-2.5 min-w-0"
            >
              <span class="text-ghost shrink-0">{{ i === prep.length - 1 ? '└' : '├' }}</span>
              <span
                class="shrink-0 w-14 text-[11px]"
                :class="r.state === 'ahead' ? 'text-faint' : 'text-accent'"
              >{{ prepWhen(r) }}</span>
              <span :class="r.state === 'ahead' ? 'text-muted' : 'text-body'">{{ r.text }}</span>
            </div>
          </div>
        </div>
        <p
          v-else
          class="text-warn"
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
        v-if="isOwner"
        class="sm:col-span-2 flex justify-end gap-3 text-[11px] -mt-1"
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
      </div>
    </div>
    <p
      v-else
      class="mt-2.5 text-[12px] text-muted"
    >
      No draw planned{{ isOwner ? ' — "+ plan a draw" books the next one: the date, the lab, the panel, and what it should answer.' : '.' }}
    </p>

    <!-- Everything else: later bookings, fulfilled plans, missed ones. Newest first. -->
    <div
      v-if="others.length"
      class="mt-3"
    >
      <button
        type="button"
        class="text-[10.5px] text-faint hover:text-accent cursor-pointer"
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
          class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-1.5 border-b border-line-row last:border-0 text-[12px] group"
        >
          <span class="text-muted tabular-nums w-[92px] shrink-0">{{ formatDate(s.plan.date) }}</span>
          <span class="text-hi">{{ s.plan.lab || 'draw' }}</span>
          <span
            v-if="s.plan.panel"
            class="text-[11.5px] text-muted truncate min-w-0"
          >{{ s.plan.panel }}</span>
          <span class="ml-auto flex items-baseline gap-2 shrink-0">
            <span
              class="text-[11px]"
              :class="statusChip(s).class"
            >{{ statusChip(s).text }}</span>
            <template v-if="isOwner">
              <button
                type="button"
                class="text-[11px] text-faint hover:text-accent cursor-pointer tui-row-action"
                :aria-label="`Edit the draw planned for ${s.plan.date}`"
                @click="modal?.open(s.plan)"
              >edit</button>
              <button
                type="button"
                class="text-[11px] text-faint hover:text-danger cursor-pointer tui-row-action"
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
      @saved="emit('refresh')"
    />
  </section>
</template>

<script setup lang="ts">
import type { PlannedDraw, PlannedDrawState, PrepReminder } from '#shared/utils/plannedDraws'
import { countdownLabel, drawLabel, isOpen, plannedDrawStates, prepReminders, purposeLines } from '#shared/utils/plannedDraws'
import { cycleCheckpoints } from '#shared/utils/cycles'
import { diffDays } from '#shared/utils/dates'

// The /labs planned-draws section: the next open plan in full (countdown, what it answers, the
// dated prep), the rest folded under a count. The page owns the list and the draw dates; this
// component owns the cycles it needs for the modal's checkpoint picker.
const props = defineProps<{
  plans: PlannedDraw[]
  /** Every draw on file, any order. */
  drawDates: string[]
  isOwner: boolean
}>()
const emit = defineEmits<{ refresh: [] }>()

// No await: useAsyncData registers the fetch for SSR itself, and the list is shared with the
// home page and the calendar under one key.
const { data: cyclesData } = useCycles()
const cycles = computed(() => cyclesData.value ?? [])
const modal = useTemplateRef('modal')

// Reactive: the overnight PWA used to keep yesterday as today until a reload.
const today = useToday()

const states = computed(() => plannedDrawStates(props.plans, props.drawDates, today.value))
const next = computed(() => states.value.find(isOpen) ?? null)
const others = computed(() => states.value.filter(s => s !== next.value).reverse())
const historyOpen = ref(false)

const headerLabel = computed(() =>
  next.value ? `NEXT DRAW · ${formatDate(next.value.plan.date, 'monthDay').toUpperCase()}` : 'NEXT DRAW'
)
const questions = computed(() => next.value ? purposeLines(next.value.plan) : [])
const prep = computed(() => next.value ? prepReminders(next.value.plan, today.value) : [])

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
