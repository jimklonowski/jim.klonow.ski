<template>
  <div
    v-if="rows.length"
    class="mt-2.5 border border-line-soft bg-inset px-3 py-2.5"
    data-scorecard
  >
    <p class="tui-label text-micro">
      scorecard · computed from the record
    </p>
    <div class="mt-1.5 grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-0.5 text-small">
      <template
        v-for="r in rows"
        :key="r.key"
      >
        <span class="text-muted">{{ r.label }}</span>
        <span
          class="tabular-nums whitespace-nowrap"
          :class="r.tone === 'ok' ? 'text-accent' : r.tone === 'warn' ? 'text-warn' : 'text-hi'"
        >{{ r.value }}</span>
        <span class="text-faint min-w-0">{{ r.detail }}</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { indexEstimates, type MealEstimate } from '#shared/utils/nutrition'
import { proteinTargetFor } from '#shared/utils/proteinTarget'
import { WATER_DEFAULT_GOAL_OZ, waterSetting } from '#shared/utils/water'
import { weeklyScorecard } from '#shared/utils/weeklyScorecard'

// The weekly scorecard (audit #43 item 79), above a weekly digest's prose: the same table every
// week, computed for that digest's own period from the lists the pages already hold — so an old
// week reads as it was, and none of it is the model's. The lists are client-only and unawaited;
// the block fills in once they arrive.
const props = defineProps<{ start: string, end: string }>()

const { data: journalData } = useJournalEntries()
const { data: healthData } = useHealthMetricsEntries()
const { data: workoutData } = useWorkoutsEntries()
const { data: dexaData } = useDexaEntries()
const { data: profileData } = useProfile()
// The same store useMealEstimates reads (one key), without its awaited wrapper.
const { data: estimateData } = useListResource<MealEstimate[]>('/journal/meal-estimates', '/api/journal/meals/estimates', { label: 'meal estimates' })

const rows = computed(() => {
  const journal = journalData.value
  if (!journal) return []
  const scans = (dexaData.value ?? []).map(s => ({ date: s.date, fat_lbs: s.total?.fat_mass_lbs, lean_lbs: s.total?.lean_mass_lbs }))
  return weeklyScorecard({
    start: props.start,
    end: props.end,
    journal,
    health: healthData.value ?? [],
    workouts: workoutData.value ?? [],
    estimates: indexEstimates(estimateData.value ?? []),
    scans,
    proteinTarget: proteinTargetFor(profileData.value, dexaData.value ?? [], props.end)?.grams ?? null,
    waterGoalOz: waterSetting(profileData.value, 'water_goal_oz', WATER_DEFAULT_GOAL_OZ)
  })
})
</script>
