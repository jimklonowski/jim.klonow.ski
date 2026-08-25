<template>
  <div
    v-if="!hasSession"
    class="px-6 py-20 text-center"
  >
    <p class="num-display text-hi text-[22px]">
      jim.klonow.ski
    </p>
    <p class="mt-2 text-[12.5px] text-muted">
      personal health terminal · bloodwork, body composition, protocol log
    </p>
    <NuxtLink
      to="/labs/login"
      class="tui-btn tui-btn-accent mt-6"
    >
      ❯ sign in
    </NuxtLink>
  </div>

  <TuiDataState
    v-else-if="overviewError"
    :error="overviewError"
    @retry="refreshOverview"
  />

  <div
    v-else
    class="grid gap-px bg-line border-b border-line"
    :class="isFullAccess
      ? 'lg:grid-cols-[390px_minmax(480px,1fr)_400px]'
      : 'lg:grid-cols-[390px_minmax(480px,1fr)]'"
  >
    <!-- Panel dividers are the grid's own background showing through 1px gaps. -->
    <section class="bg-bg px-6 pt-4 pb-5">
      <HomeVitals
        :entries="entries"
        :metrics="healthMetrics"
      />

      <TuiHeader
        label="PROTOCOL · LOGGED TODAY"
        :dashes="4"
        class="mt-4.5"
      />
      <div
        v-if="dosesToday.length"
        class="flex flex-col gap-1.5 mt-2.5 text-[12px]"
      >
        <div
          v-for="(dose, i) in dosesToday"
          :key="`${dose.time}-${dose.compound}-${i}`"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">{{ dose.time }}</span>
          <NuxtLink
            :to="`/journal/compound/${encodeURIComponent(dose.compound)}`"
            class="text-body hover:text-accent truncate"
          >{{ dose.compound }}</NuxtLink>
          <span class="ml-auto shrink-0 text-muted">{{ doseLabel(dose) }}</span>
        </div>
      </div>
      <p
        v-else
        class="mt-2.5 text-[12px] text-muted"
      >
        No doses logged today.
      </p>

      <!-- Mirrors the dose rows above: label left, value right-aligned, stats on their own
           line so nothing has to wrap mid-metric in this 390px column. Lists every session
           from the most recent workout day — a three-workout day used to show only its last. -->
      <div
        v-if="latestWorkouts.length"
        class="mt-3.5 text-[12px] text-muted space-y-2"
      >
        <div
          v-for="(w, i) in latestWorkouts"
          :key="`${w.date}-${w.start_time ?? i}`"
        >
          <div class="flex items-baseline gap-2">
            <span
              v-if="i === 0"
              class="shrink-0"
            >└ workout{{ latestWorkouts.length > 1 ? 's' : '' }}:</span>
            <span class="ml-auto text-body text-right">{{ w.workout_type ?? 'Session' }}</span>
          </div>
          <div class="flex flex-wrap justify-end gap-x-1.5 mt-0.5">
            <span
              v-for="(part, j) in workoutParts(w)"
              :key="part"
              class="whitespace-nowrap"
            >{{ j ? `· ${part}` : part }}</span>
          </div>
        </div>
      </div>

      <div class="flex gap-2 mt-4.5">
        <NuxtLink
          v-if="isFullAccess"
          :to="`/journal/${today}`"
          class="tui-btn tui-btn-accent flex-1 justify-center"
        >
          {{ isOwner ? '+ LOG TODAY' : 'TODAY' }}
        </NuxtLink>
        <NuxtLink
          to="/journal/calendar"
          class="tui-btn flex-1 justify-center"
        >
          CALENDAR
        </NuxtLink>
        <NuxtLink
          v-if="isFullAccess"
          to="/journal/photos"
          class="tui-btn flex-1 justify-center"
        >
          PHOTOS
        </NuxtLink>
        <NuxtLink
          v-else
          to="/journal/supplements"
          class="tui-btn flex-1 justify-center"
        >
          STACK
        </NuxtLink>
      </div>
    </section>

    <section class="bg-bg px-6 pt-4 pb-5 min-w-0">
      <HomeFlaggedMarkers
        :flagged="flagged"
        :flag-counts="flagCounts"
        :draw-date="latestDraw?.date ?? null"
      />

      <div
        v-if="contextNote"
        class="mt-3.5 px-3 py-2.5 bg-inset border border-dashed border-line-input text-[11.5px] text-muted"
      >
        ℹ {{ contextNote }}
      </div>

      <div class="flex flex-wrap items-baseline gap-3.5 mt-3.5 text-[11.5px]">
        <span class="text-faint">quick:</span>
        <NuxtLink
          to="/labs"
          class="text-accent hover:text-accent-hover"
        >full panel →</NuxtLink>
        <NuxtLink
          to="/journal/trends"
          class="text-accent hover:text-accent-hover"
        >trends →</NuxtLink>
        <NuxtLink
          v-if="isOwner"
          to="/labs/upload"
          class="text-accent hover:text-accent-hover"
        >upload results →</NuxtLink>
        <NuxtLink
          to="/labs/dexa"
          class="text-accent hover:text-accent-hover"
        >dexa{{ latestDexa ? ` (${formatDate(latestDexa.date, 'monthDay').toLowerCase()})` : '' }} →</NuxtLink>
        <NuxtLink
          v-if="isOwner"
          to="/labs/sharing"
          class="text-accent hover:text-accent-hover"
        >sharing →</NuxtLink>
      </div>

      <TuiHeader
        label="90-DAY TRENDS"
        class="mt-5"
      />
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
        <div
          v-for="t in trends"
          :key="t.label"
          class="bg-raised border border-line-soft px-3 py-2.5"
        >
          <div class="flex justify-between text-[10.5px] text-muted">
            <span>{{ t.label }}</span>
            <span class="text-body">{{ t.latest }}</span>
          </div>
          <TuiSparkline
            :values="t.values"
            class="mt-1.5"
          />
        </div>
      </div>
    </section>

    <!--
      The digest is the one panel with no length ceiling — a wordy weekly recap used to set the
      row height and leave the other two columns sitting above a screen of dead space. Capped to
      the viewport (chrome is 7.1875rem: 53px header + 31px status + 31px footer) as a flex
      column: HomeDigest scrolls its prose region internally and keeps its action bar in flow
      at the bottom. Stays stretched rather than self-start so the grid's gap background
      doesn't show through below it.
    -->
    <section
      v-if="isFullAccess"
      class="bg-bg px-6 pt-4 pb-5 lg:max-h-[calc(100dvh-7.25rem)] lg:flex lg:flex-col lg:min-h-0"
    >
      <HomeDigest
        :digests="digests"
        :is-owner="isOwner"
        @refresh="refreshDigests"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import type { PeptideEntry } from '~/data/journal'

const { role, isOwner } = await useAuth()
const {
  hasSession, entries, healthMetrics, latestDraw, latestDexa,
  allWorkouts, dosesToday, flagged, flagCounts,
  error: overviewError, refresh: refreshOverview
} = useOverview(role)

const today = localToday()

// The doctor role gets a curated clinical view: no daily entries, photos, or AI digests
// (the digest endpoint is owner/friend-only and would 403), so those panels and links are
// hidden rather than rendered broken. See shared/utils/access.ts.
const isFullAccess = computed(() => role.value === 'owner' || role.value === 'friend')

// The digest composable is lazy (the slideover owns it); the home column needs it up front.
const { data: digestData, execute: loadDigests, refresh: refreshDigests } = useDigests()
if (isFullAccess.value) await loadDigests()
const digests = computed(() => digestData.value ?? [])

/** Every session from the most recent day with a workout, earliest first. */
const latestWorkouts = computed(() => {
  const last = allWorkouts.value.at(-1)
  if (!last) return []
  return allWorkouts.value
    .filter(w => w.date === last.date)
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
})

function doseLabel(dose: PeptideEntry) {
  const unit = dose.unit === 'iu' ? 'IU' : dose.unit
  return `${dose.dose} ${unit}${dose.site ? ` · ${shortSite(dose.site)}` : ''}`
}

// Kept as separate parts, not one joined string, so each metric renders non-breaking —
// otherwise this 390px column splits "18.9 min" across two lines.
function workoutParts(w: typeof allWorkouts.value[number]) {
  return [
    w.duration_min != null ? `${w.duration_min.toFixed(1)} min` : null,
    w.calories != null ? `${w.calories} kcal` : null,
    w.avg_hr != null ? `♥ ${w.avg_hr}` : null
  ].filter((v): v is string => v != null)
}

/** Flagged markers that are expected on-protocol get a plain-language note under the rows. */
const contextNote = computed(() => {
  const notes: string[] = []
  const keys = new Set(flagged.value.map(f => f.key))
  if (keys.has('ferritin')) notes.push('ferritin re-test suggested — iron stores below optimal')
  if (keys.has('fsh') || keys.has('lh')) notes.push('FSH/LH suppression expected on-protocol')
  if (keys.has('estradiol')) notes.push('estradiol tracks total testosterone; watch for water retention')
  return notes.join('; ') || null
})

// 90-day windows. Weight/HRV come off the journal, recovery off the Whoop metrics.
const cutoff = new Date(Date.now() - 90 * 86400000).toLocaleDateString('en-CA')

function series<T extends { date: string }>(list: T[], pick: (row: T) => number | null | undefined) {
  return list
    .filter(row => row.date >= cutoff)
    .map(pick)
    .filter((v): v is number => v != null)
}

const trends = computed(() => [
  { label: 'WEIGHT lbs', values: series(entries.value, e => e.weight_lbs), decimals: 1 },
  { label: 'HRV ms', values: series(entries.value, e => e.hrv), decimals: 0 },
  { label: 'RECOVERY %', values: series(healthMetrics.value, m => m.recovery_score), decimals: 0 }
].map(t => ({
  ...t,
  latest: t.values.length ? t.values.at(-1)!.toFixed(t.decimals) : '—'
})))

useSeoMeta({ title: 'jim.klonow.ski' })
</script>
