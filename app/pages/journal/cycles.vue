<template>
  <div>
    <JournalHeader
      section="CYCLES"
      :meta="meta"
    >
      <template #actions>
        <span class="text-[11px] text-muted hidden sm:inline">planned protocol phases · feeds adherence, calendar & AI</span>
        <button
          v-if="isOwner"
          type="button"
          class="tui-btn tui-btn-accent"
          @click="cycleForm?.open()"
        >
          + PLAN CYCLE
        </button>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <p
      v-if="!cycles.length"
      class="px-4 sm:px-6 py-5 text-[12px] text-muted"
    >
      No cycles planned yet.{{ isOwner ? ' Use + PLAN CYCLE to lay out a run — planned compounds get calendar rings, adherence scoring, lab checkpoints, and AI context automatically.' : '' }}
    </p>

    <div class="px-4 sm:px-6 py-4 space-y-5">
      <section
        v-for="group in groups"
        :key="group.key"
      >
        <TuiHeader :label="group.title" />
        <div class="flex flex-col gap-2 mt-2.5">
          <div
            v-for="c in group.items"
            :key="c.id"
            class="bg-raised px-3.5 py-3 group"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <NuxtLink
                :to="`/journal/cycle/${c.id}`"
                class="text-[13px] text-hi hover:text-accent"
              >{{ c.name }}</NuxtLink>
              <span
                class="text-[10.5px] tracking-[0.06em] uppercase"
                :class="STATUS_CLASSES[status(c)]"
              >{{ statusLabel(c) }}</span>
              <span
                v-if="c.goal"
                class="text-[11.5px] text-muted"
              >{{ c.goal }}</span>

              <span class="ml-auto flex items-baseline gap-3 shrink-0">
                <span
                  v-if="pctOf(c) != null"
                  class="text-[11.5px]"
                  :class="pctClass(pctOf(c))"
                >{{ pctOf(c) }}% adherence</span>
                <template v-if="isOwner">
                  <button
                    type="button"
                    class="text-[11px] text-faint hover:text-accent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    :aria-label="`Edit ${c.name}`"
                    @click="cycleForm?.open(c)"
                  >edit</button>
                  <button
                    type="button"
                    class="text-[11px] text-faint hover:text-accent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    :aria-label="`Duplicate ${c.name}`"
                    @click="cycleForm?.open(c, { duplicate: true })"
                  >duplicate</button>
                  <button
                    type="button"
                    class="text-[11px] text-faint hover:text-danger cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    :aria-label="`Delete ${c.name}`"
                    @click="confirmDelete(c)"
                  >✕</button>
                </template>
              </span>
            </div>

            <div class="mt-1.5 text-[11.5px] text-muted">
              {{ formatDate(c.start_date) }} → {{ formatDate(cycleEnd(c)) }}
              · {{ c.planned_weeks }} wks{{ c.actual_end ? ' planned, ended off-plan' : '' }}
            </div>

            <div class="mt-2 flex flex-col gap-1">
              <div
                v-for="(item, i) in c.compounds"
                :key="i"
                class="flex items-baseline gap-2 text-[11.5px]"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0 self-center"
                  :style="{ background: getCompoundColor(item.compound) }"
                />
                <span class="text-body">{{ item.compound }}</span>
                <span class="text-dim">{{ doseLabelOf(item) }} · {{ itemCadence(item) }}</span>
                <span class="text-faint">{{ itemSpan(c, item) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <JournalCycleForm
      ref="cycleForm"
      @saved="refresh"
    />
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'
import type { Cycle, CyclePlanItem } from '#shared/utils/cycles'
import { cycleEnd, cycleProgress, cycleStatusOn, diffDays, doseLabelOf } from '#shared/utils/cycles'

definePageMeta({ middleware: 'journal-auth' })
useSeoMeta({ title: 'Journal · Cycles' })

const toast = useToast()
const { isOwner } = await useAuth()

const { data, refresh, error } = await useCycles()
const { data: journalData } = await useJournalEntries()
onMounted(() => refresh())

const cycleForm = useTemplateRef('cycleForm')

const cycles = computed(() => data.value ?? [])
const entries = computed(() => journalData.value ?? [])
const today = localToday()

function status(c: Cycle) {
  return cycleStatusOn(c, today)
}

const groups = computed(() => [
  { key: 'active', title: 'ACTIVE', items: cycles.value.filter(c => status(c) === 'active') },
  { key: 'upcoming', title: 'UPCOMING', items: cycles.value.filter(c => status(c) === 'upcoming') },
  { key: 'done', title: 'HISTORY', items: cycles.value.filter(c => status(c) === 'done') }
].filter(g => g.items.length))

const meta = computed(() => {
  const active = cycles.value.filter(c => status(c) === 'active').length
  const upcoming = cycles.value.filter(c => status(c) === 'upcoming').length
  if (active) return `${active} active`
  if (upcoming) return `${upcoming} upcoming`
  return `${cycles.value.length} on file`
})

const STATUS_CLASSES: Record<string, string> = {
  active: 'text-accent',
  upcoming: 'text-hi',
  done: 'text-muted'
}

function statusLabel(c: Cycle): string {
  const s = status(c)
  if (s === 'active') {
    const p = cycleProgress(c, today)
    return `ACTIVE · DAY ${p.day}/${p.totalDays}`
  }
  if (s === 'upcoming') return `STARTS IN ${diffDays(today, c.start_date)}D`
  return `ENDED ${formatDate(cycleEnd(c), 'monthDay').toUpperCase()}`
}

/** Whole-cycle adherence — shown once a cycle has expected days behind it. */
function pctOf(c: Cycle): number | null {
  if (status(c) === 'upcoming') return null
  return cycleAdherence(entries.value, c, today).pct
}

function pctClass(pct: number | null): string {
  if (pct == null) return 'text-muted'
  if (pct >= 90) return 'text-accent'
  if (pct >= 70) return 'text-dim'
  return 'text-warn'
}

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function itemCadence(item: CyclePlanItem): string {
  if (item.weekdays.length === 7) return 'DAILY'
  return [...item.weekdays]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map(d => DAY_SHORT[d])
    .join('+')
}

function itemSpan(c: Cycle, item: CyclePlanItem): string {
  const to = item.toWeek ?? c.planned_weeks
  return item.fromWeek === 1 && to === c.planned_weeks ? 'full run' : `wks ${item.fromWeek}–${to}`
}

async function confirmDelete(c: Cycle) {
  if (!confirm(`Delete ${c.name}? A cycle that actually ran should keep its history — set an off-plan end date instead.`)) return
  try {
    await $fetch('/api/journal/cycles/delete', { method: 'POST', body: { id: c.id } })
    await refresh()
    toast.add({ title: 'Deleted', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
}
</script>
