<template>
  <section v-if="workoutEntries.length">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">
        Workouts
      </h2>
      <span class="text-xs text-muted">{{ workoutEntries.length }} total</span>
    </div>
    <div class="space-y-2">
      <UCard
        v-for="w in pageWorkouts"
        :key="w.id"
        class="cursor-pointer hover:ring-1 hover:ring-primary transition-all"
        @click="navigateTo(`/journal/${w.date}`)"
      >
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <UIcon
              :name="workoutIcon(w.workout_type)"
              class="w-4 h-4 shrink-0 text-muted"
            />
            <div class="text-xs text-muted font-mono min-w-24">
              {{ formatDate(w.date) }}
            </div>
            <div class="text-sm font-medium">
              {{ w.workout_type ?? 'Workout' }}
            </div>
            <span
              v-if="w.sources.length > 1"
              class="text-xs text-muted"
            >{{ w.sources.join(' + ') }}</span>
          </div>
          <div class="flex items-center gap-4 text-xs font-mono text-muted">
            <span v-if="w.duration_min != null">{{ w.duration_min }} min</span>
            <span v-if="w.calories != null">{{ w.calories }} kcal</span>
            <span v-if="w.avg_hr != null">♥ {{ w.avg_hr }}</span>
            <span v-if="w.distance_mi != null">{{ w.distance_mi }} mi</span>
          </div>
        </div>
      </UCard>
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
// Paginated synced-workout list (Apple Health / Whoop / Peloton, merged at read time).
import { workoutIcon } from '~/data/workouts'

const { data: workoutsData } = await useWorkoutsEntries()
const workoutEntries = computed(() => workoutsData.value ?? [])
const sortedWorkouts = computed(() => [...workoutEntries.value].sort((a, b) => b.date.localeCompare(a.date)))

const PAGE_SIZE = 15
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(sortedWorkouts.value.length / PAGE_SIZE)))
const pageWorkouts = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return sortedWorkouts.value.slice(start, start + PAGE_SIZE)
})
</script>
