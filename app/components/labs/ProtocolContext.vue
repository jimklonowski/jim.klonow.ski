<template>
  <section>
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">Protocol Context</h2>
        <p class="text-xs text-muted mt-0.5">Compounds logged in the {{ windowDays }} days before this draw</p>
      </div>
      <div class="flex items-center gap-2">
        <USelect
          v-model="selectedDate"
          :items="drawItems"
          value-key="value"
          label-key="label"
          size="xs"
          class="min-w-40"
        />
        <div class="flex gap-1">
          <UButton
            v-for="w in WINDOW_OPTIONS"
            :key="w"
            size="xs"
            :variant="windowDays === w ? 'solid' : 'ghost'"
            @click="windowDays = w"
          >
            {{ w }}d
          </UButton>
        </div>
      </div>
    </div>

    <UCard>
      <div v-if="!contexts.length" class="text-sm text-muted py-2">
        No peptide or hormone doses logged in the {{ windowDays }} days before {{ formatDate(selectedDate) }}.
      </div>
      <div v-else class="space-y-2">
        <NuxtLink
          v-for="c in contexts"
          :key="c.compound"
          :to="`/journal/compound/${encodeURIComponent(c.compound)}`"
          class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-default hover:ring-1 hover:ring-primary transition-all no-underline"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: getCompoundColor(c.compound) }" />
            <span class="text-sm font-medium truncate">{{ c.compound }}</span>
          </div>
          <div class="flex items-center gap-4 text-xs font-mono text-muted shrink-0">
            <span :title="`${c.doseDays} dosing days in window`">{{ c.doseDays }}d used</span>
            <span :title="'Average per dosing day'">{{ roundDose(c.avgDose) }} {{ c.unit }}</span>
            <span class="min-w-20 text-right" :class="c.daysBeforeDraw === 0 ? 'text-primary' : ''">
              {{ lastDoseLabel(c.daysBeforeDraw) }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </UCard>
  </section>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'
import type { JournalEntry } from '~/data/journal'
import type { LabsEntry } from '~/composables/useLabsEntries'
import { activeCompoundsAt, roundDose } from '~/utils/protocolContext'

const props = defineProps<{
  labsEntries: LabsEntry[]
  journalEntries: JournalEntry[]
}>()

const WINDOW_OPTIONS = [14, 21, 30]
const windowDays = ref(21)

// Draw dates, newest first.
const drawDates = computed(() =>
  [...props.labsEntries].map(e => e.date).sort((a, b) => b.localeCompare(a))
)
const drawItems = computed(() => drawDates.value.map(d => ({ label: formatDate(d), value: d })))

const selectedDate = ref(drawDates.value[0] ?? '')
watch(drawDates, (dates) => {
  if (!dates.includes(selectedDate.value)) selectedDate.value = dates[0] ?? ''
})

const contexts = computed(() =>
  selectedDate.value ? activeCompoundsAt(props.journalEntries, selectedDate.value, windowDays.value) : []
)

function lastDoseLabel(days: number) {
  if (days === 0) return 'on draw day'
  return `${days}d before`
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
