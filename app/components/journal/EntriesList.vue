<template>
  <section>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Entries
      </h2>
      <span class="text-xs text-muted">{{ entries.length }} total</span>
    </div>
    <div class="space-y-2">
      <UCard
        v-for="entry in pageEntries"
        :key="entry.date"
        class="cursor-pointer hover:ring-1 hover:ring-primary transition-all"
        @click="navigateTo(`/journal/${entry.date}`)"
      >
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <div class="text-xs text-muted font-mono min-w-24">
              {{ formatDate(entry.date) }}
            </div>
            <div
              v-if="entry.day"
              class="text-xs text-muted"
            >
              Day {{ entry.day }}
            </div>
          </div>
          <div class="flex items-center gap-4 text-xs font-mono text-muted">
            <span v-if="entry.weight_lbs">{{ entry.weight_lbs }}lb</span>
            <span v-if="entry.bp_systolic">{{ entry.bp_systolic }}/{{ entry.bp_diastolic }}</span>
            <span v-if="entry.rhr">♥ {{ entry.rhr }}</span>
            <span v-if="entry.hrv">HRV {{ entry.hrv }}</span>
          </div>
          <div class="flex gap-1">
            <span
              v-for="compound in uniqueCompounds(entry)"
              :key="compound"
              class="w-2 h-2 rounded-full"
              :style="{ background: getCompoundColor(compound) }"
              :title="compound"
            />
          </div>
        </div>
      </UCard>
      <p
        v-if="!entries.length"
        class="text-muted text-sm"
      >
        No entries yet.
        <NuxtLink
          v-if="isOwner"
          :to="`/journal/${todayDate}`"
          class="text-primary underline"
        >Add today's entry.</NuxtLink>
      </p>
    </div>
    <div
      v-if="totalPages > 1"
      class="flex items-center justify-between mt-4"
    >
      <UButton
        size="xs"
        variant="ghost"
        icon="i-lucide-chevron-left"
        :disabled="page === 1"
        @click="page--"
      >
        Prev
      </UButton>
      <span class="text-xs text-muted">Page {{ page }} of {{ totalPages }}</span>
      <UButton
        size="xs"
        variant="ghost"
        trailing-icon="i-lucide-chevron-right"
        :disabled="page === totalPages"
        @click="page++"
      >
        Next
      </UButton>
    </div>
  </section>
</template>

<script setup lang="ts">
// Paginated daily-entry list with per-day compound dots.
import { getCompoundColor } from '~/data/journal'

const { data } = await useJournalEntries()
const { isOwner } = await useAuth()
const entries = computed(() => data.value ?? [])
const todayDate = new Date().toISOString().slice(0, 10)

const PAGE_SIZE = 20
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(entries.value.length / PAGE_SIZE)))
const pageEntries = computed(() => {
  const reversed = [...entries.value].reverse()
  const start = (page.value - 1) * PAGE_SIZE
  return reversed.slice(start, start + PAGE_SIZE)
})

function uniqueCompounds(entry: (typeof entries.value)[number]) {
  if (!entry?.peptides) return []
  return [...new Set(entry.peptides.map((p: { compound: string }) => p.compound))]
}
</script>
