<template>
  <!-- Hidden outright when nothing is planned and the viewer can't plan one. -->
  <div v-if="next || isOwner">
    <TuiHeader
      label="NEXT DRAW"
      :dashes="4"
      class="mt-4.5"
    >
      <span
        v-if="next"
        class="text-[10.5px] text-hi"
      >{{ formatDate(next.plan.date, 'monthDay').toUpperCase() }}</span>
    </TuiHeader>

    <template v-if="next">
      <div class="flex items-baseline gap-2 mt-2.5 min-w-0">
        <span
          class="num-display text-[21px] leading-none"
          :class="bigClass"
        >{{ big.value }}</span>
        <span
          v-if="big.unit"
          class="text-[10.5px] text-muted"
        >{{ big.unit }}</span>
        <span class="ml-auto text-[11px] text-muted truncate">{{ drawLabel(next.plan) }}</span>
      </div>

      <div class="flex flex-col gap-1 mt-2 text-[12px]">
        <div
          v-for="q in questions"
          :key="q"
          class="flex gap-2.5 min-w-0"
        >
          <span class="text-ghost shrink-0">├</span>
          <span class="text-body truncate">{{ q }}</span>
        </div>
        <div
          v-if="prepLine"
          class="flex gap-2.5 min-w-0"
        >
          <span class="text-ghost shrink-0">├</span>
          <span class="text-accent truncate">{{ prepLine }}</span>
        </div>
        <div class="flex gap-2.5 min-w-0">
          <span class="text-ghost shrink-0">└</span>
          <span
            class="truncate"
            :class="foot.class"
          >{{ foot.text }} <NuxtLink
            :to="foot.to"
            class="text-accent hover:text-accent-hover"
          >{{ foot.link }}</NuxtLink></span>
        </div>
      </div>
    </template>

    <p
      v-else
      class="mt-2.5 text-[12px] text-muted"
    >
      No draw planned ·
      <NuxtLink
        to="/labs#planned"
        class="text-accent hover:text-accent-hover"
      >plan one →</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { PlannedDraw } from '#shared/utils/plannedDraws'
import { activePrep, drawLabel, nextPlannedDraw, purposeLines } from '#shared/utils/plannedDraws'
import { diffDays } from '#shared/utils/dates'

// The home strip's NEXT DRAW block: the soonest open plan as a countdown, the questions it is
// meant to answer, the prep in force today, and one line of context. Three states — booked
// ahead, draw day, past its date with no results — and an owner-only "plan one" when empty.
const props = defineProps<{
  plans: PlannedDraw[]
  /** Every draw on file, oldest first. */
  drawDates: string[]
  isOwner: boolean
}>()

const today = useToday()

const next = computed(() => nextPlannedDraw(props.plans, props.drawDates, today.value))
const questions = computed(() => next.value ? purposeLines(next.value.plan).slice(0, 3) : [])

const big = computed(() => {
  const s = next.value
  if (!s) return { value: '—', unit: '' }
  if (s.status === 'today') return { value: 'today', unit: '' }
  if (s.status === 'overdue') return { value: `${-s.inDays}d`, unit: 'ago' }
  return { value: `${s.inDays}`, unit: s.inDays === 1 ? 'day' : 'days' }
})
const bigClass = computed(() =>
  next.value?.status === 'overdue' ? 'text-warn' : next.value?.status === 'today' ? 'text-accent' : 'text-hi'
)

/** "prep now: hold biotin · fast from 20:00" — only once something is in force. */
const prepLine = computed(() => {
  const s = next.value
  if (!s || s.status === 'overdue') return null
  const active = activePrep(s.plan, today.value)
  return active.length ? `prep now: ${active.map(r => r.short).join(' · ')}` : null
})

const foot = computed(() => {
  const s = next.value
  if (!s) return { text: '', link: '', to: '/labs#planned', class: 'text-muted' }
  if (s.status === 'overdue') {
    return props.isOwner
      ? { text: 'no results on file yet ·', link: 'upload →', to: '/labs/upload', class: 'text-warn' }
      : { text: 'no results on file yet ·', link: 'details →', to: '/labs#planned', class: 'text-warn' }
  }
  if (s.status === 'today') return { text: 'draw day ·', link: 'prep →', to: '/labs#planned', class: 'text-muted' }
  const last = props.drawDates.filter(d => d < s.plan.date).at(-1)
  const text = last ? `${diffDays(last, s.plan.date)} days after the ${formatDate(last, 'monthDay')} draw ·` : 'first draw on file ·'
  return { text, link: 'prep →', to: '/labs#planned', class: 'text-muted' }
})
</script>
