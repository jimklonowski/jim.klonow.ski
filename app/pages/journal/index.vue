<template>
  <div>
    <JournalHeader :meta="`${loggedEntries.length.toLocaleString('en-US')} logged`">
      <template #meta>
        <template v-if="streak">
          · <span class="text-accent font-medium">streak {{ streak }}d</span>
        </template>
      </template>
      <template #actions>
        <JournalWhoopMenu v-if="isOwner" />
        <NuxtLink
          v-if="isOwner"
          to="/tools/import"
          class="tui-btn"
        >
          IMPORT
        </NuxtLink>
        <!-- canEdit, not isFullAccess: the read-only friend was offered a "+ NEW" button. -->
        <NuxtLink
          v-if="canEdit"
          :to="`/journal/${today}`"
          class="tui-btn tui-btn-accent"
        >
          + NEW ENTRY
        </NuxtLink>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="fetchError"
      @retry="retryAll"
    />

    <div class="px-4 sm:px-6 py-4 space-y-3">
      <!-- Vital tiles with sparklines -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <NuxtLink
          v-for="tile in vitalTiles"
          :key="tile.label"
          to="/journal/trends"
          class="bg-raised border border-line-soft px-4 py-3.5 hover:bg-row-hover transition-colors"
        >
          <p class="text-micro text-muted uppercase tracking-widest">
            {{ tile.label }}
          </p>
          <p class="num-display text-big leading-none mt-1.5">
            {{ tile.value }}
          </p>
          <TuiSparkline
            :values="tile.values"
            :color="tile.color"
            :height="34"
            :stroke-width="1.4"
            class="mt-2.5"
          />
          <p
            class="text-label mt-1"
            :class="tile.deltaClass"
          >
            {{ tile.delta }}
          </p>
        </NuxtLink>
      </div>

      <!-- Today + soda/whoop. grid-cols-1 matters: an implicit track is minmax(auto, 1fr) and
           sizes to its content's min-content, so the soda row's unbreakable quick-add label used
           to widen the whole column past a phone's edge at the larger SIZE steps. -->
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div class="flex flex-col gap-3">
          <section class="bg-raised border border-line-soft px-4 py-3.5">
            <div class="flex items-baseline gap-3 text-meta">
              <span class="tui-label">Today · doses + workout</span>
              <!-- The AI recaps live in a slideover (DigestPanel) that only ⌘K and the home page
                   used to open; the journal hub is where someone looks for them. -->
              <button
                v-if="isFullAccess"
                type="button"
                class="ml-auto text-accent hover:text-accent-hover cursor-pointer"
                @click="digestOpen = true"
              >
                digests →
              </button>
              <NuxtLink
                v-if="isFullAccess"
                :to="`/journal/${today}`"
                class="text-accent hover:text-accent-hover"
              >entry →</NuxtLink>
            </div>

            <p
              v-if="doseLines.length"
              class="mt-3 text-row leading-loose text-dim"
            >
              <!-- Before the first dose of the day the lines are the last dosed day's, and say so. -->
              <span
                v-if="doseDay"
                class="block text-muted"
              >No doses yet today · last logged {{ doseDay }}:</span>
              <span
                v-for="(line, i) in doseLines"
                :key="i"
                class="block"
              >{{ line }}</span>
            </p>
            <p
              v-else
              class="mt-3 text-row text-muted"
            >
              No doses logged today.
            </p>

            <p
              v-if="latestWorkout"
              class="mt-2 pt-2.5 border-t border-line-soft text-row flex flex-wrap items-baseline gap-x-2"
            >
              <span
                v-if="workoutDay"
                class="text-muted"
              >{{ workoutDay }} ·</span>
              <span class="text-hi">{{ latestWorkout.workout_type ?? 'Workout' }}</span>
              <span
                v-for="(part, i) in workoutParts"
                :key="part"
                class="text-muted whitespace-nowrap"
              >{{ i ? `· ${part}` : part }}</span>
            </p>
          </section>

          <!-- Today's meals with their estimates and the one-line quick log — the daily loop. -->
          <JournalFoodToday
            v-if="isFullAccess"
            :readonly="!canEdit"
          />
        </div>

        <div class="flex flex-col gap-3">
          <JournalSodaTracker
            v-if="isFullAccess"
            compact
            :readonly="!canEdit"
          />
          <JournalWaterTracker
            v-if="isFullAccess"
            :readonly="!canEdit"
          />

          <section class="flex-1 bg-raised border border-line-soft px-4 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-row text-dim">
            <span v-if="whoop.recovery != null">Whoop <span class="num-display text-accent text-head">{{ whoop.recovery }}%</span> recov</span>
            <span v-if="whoop.sleep">Sleep <span class="num-display text-hi text-head">{{ whoop.sleep }}</span></span>
            <span v-if="whoop.strain != null">Strain <span class="num-display text-hi text-head">{{ whoop.strain }}</span></span>
            <span
              v-if="whoop.recovery == null && !whoop.sleep && whoop.strain == null"
              class="text-muted"
            >No Whoop data synced yet.</span>
            <NuxtLink
              to="/journal/trends"
              class="ml-auto text-meta text-accent hover:text-accent-hover"
            >health trends →</NuxtLink>
          </section>
        </div>
      </div>

      <!-- Spoke shortcuts -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <NuxtLink
          v-for="card in spokeCards"
          :key="card.to"
          :to="card.to"
          class="bg-inset border border-line-input px-4 py-3 hover:border-line-accent hover:bg-row-hover transition-colors"
        >
          <p class="text-small text-accent tracking-[0.08em]">
            {{ card.label }} →
          </p>
          <p class="text-small text-muted mt-1">
            {{ card.meta }}
          </p>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDuration, HEALTH_METRICS_META } from '~/data/health-metrics'
import { CHART_ACCENT, CHART_DANGER, CHART_INDIGO, CHART_WARN } from '~/utils/chartTheme'
import { KNOWN_COMPOUNDS } from '~/data/journal'

useSeoMeta({ title: 'Journal · Overview' })

const { data, refresh, error } = await useJournalEntries()
const { data: healthData, refresh: refreshHealth, error: healthError } = await useHealthMetricsEntries()
const { data: workoutsData, refresh: refreshWorkouts, error: workoutsError } = await useWorkoutsEntries()

const fetchError = computed(() => error.value ?? healthError.value ?? workoutsError.value ?? null)
function retryAll() {
  refresh()
  refreshHealth()
  refreshWorkouts()
}
const { role, isOwner, canEdit } = await useAuth()

const today = useToday()
const isFullAccess = computed(() => role.value !== 'doctor')
// The digest slideover's shared open flag (DigestPanel.vue mounts in the layout).
const digestOpen = useState('digest-panel-open', () => false)

const entries = computed(() => data.value ?? [])
const healthEntries = computed(() => healthData.value ?? [])

// Logged days only — journal_entries also holds passively-imported vitals rows, which used to
// make this count Apple Watch coverage. See shared/utils/journalLog.ts.
const loggedEntries = computed(() => entries.value.filter(isLoggedDay))
const streak = computed(() => loggedStreak(entries.value, today.value))

// --- vital tiles ---
/** Trailing 30 days of a journal field, oldest first, nulls dropped. */
function series(pick: (e: typeof entries.value[number]) => number | null | undefined) {
  return entries.value.slice(-30).map(pick).filter((v): v is number => v != null)
}

/** Latest and previous readings of a field, for the delta caption. */
function pair(pick: (e: typeof entries.value[number]) => number | null | undefined) {
  const vals = entries.value.map(pick).filter((v): v is number => v != null)
  return { current: vals.at(-1) ?? null, prev: vals.length >= 2 ? vals.at(-2)! : null }
}

/**
 * Delta caption. `goodWhenFalling` marks metrics where a drop is the win (weight, RHR);
 * a rise there reads warn rather than danger — it's a drift, not a failure.
 */
function delta(current: number | null, prev: number | null, goodWhenFalling: boolean, decimals = 0) {
  if (current == null || prev == null) return { text: '● no prior reading', class: 'text-muted' }
  const diff = current - prev
  if (Math.abs(diff) < 10 ** -decimals / 2) return { text: '● even', class: 'text-muted' }
  const magnitude = decimals ? Math.abs(diff).toFixed(decimals) : Math.round(Math.abs(diff)).toString()
  const text = `${diff > 0 ? '▲ +' : '▼ -'}${magnitude}`
  const good = goodWhenFalling ? diff < 0 : diff > 0
  return { text, class: good ? 'text-accent' : 'text-warn' }
}

/** Tag a delta with which of two numbers it followed, e.g. "▲ +2 sys". */
function labelDelta(d: { text: string, class: string }, suffix: string) {
  return d.text.startsWith('●') ? d : { ...d, text: `${d.text} ${suffix}` }
}

const vitalTiles = computed(() => {
  const weight = pair(e => e.weight_lbs)
  const rhr = pair(e => e.rhr)
  const hrv = pair(e => e.hrv)
  const sys = pair(e => e.bp_systolic)
  const dia = pair(e => e.bp_diastolic)

  return [
    {
      label: 'Weight',
      value: weight.current != null ? weight.current.toFixed(1) : '—',
      values: series(e => e.weight_lbs),
      color: CHART_ACCENT,
      ...delta(weight.current, weight.prev, true, 1)
    },
    {
      label: 'BP',
      value: sys.current != null && dia.current != null ? `${sys.current}/${dia.current}` : '—',
      values: series(e => e.bp_systolic),
      color: CHART_DANGER,
      // One caption can only track one number, so it follows systolic (the clinical headline)
      // and says so — the mock labels its delta the same way.
      ...labelDelta(delta(sys.current, sys.prev, true), 'sys')
    },
    {
      label: 'RHR',
      value: rhr.current != null ? Math.round(rhr.current).toString() : '—',
      values: series(e => e.rhr),
      color: CHART_WARN,
      ...delta(rhr.current, rhr.prev, true)
    },
    {
      label: 'HRV',
      value: hrv.current != null ? Math.round(hrv.current).toString() : '—',
      values: series(e => e.hrv),
      color: CHART_INDIGO,
      ...delta(hrv.current, hrv.prev, false)
    }
  ].map(t => ({ ...t, delta: t.text, deltaClass: t.class }))
})

// --- today panel ---
const todayEntry = computed(() => entries.value.find(e => e.date === today.value) ?? null)

/**
 * The day whose doses the card shows: today's once a dose is in, else the most recent day that
 * has any — and then the card SAYS so (`doseDay`), where it used to list yesterday's injections
 * under "Today" until the first pin of the morning (audit #42 item 11). The fallback no longer
 * depends on whether a soda tap happens to have created today's row.
 */
const dosesEntry = computed(() => {
  if (todayEntry.value?.peptides?.length) return todayEntry.value
  return [...entries.value].reverse().find(e => e.peptides?.length) ?? null
})

/** '' for today, else how the card names the day it fell back to: "yesterday", or the date. */
function dayWord(date: string | null | undefined): string {
  if (!date || date === today.value) return ''
  return date === shiftDays(today.value, -1) ? 'yesterday' : formatDate(date, 'monthDay')
}
const doseDay = computed(() => dayWord(dosesEntry.value?.date))
const workoutDay = computed(() => dayWord(latestWorkout.value?.date))

/**
 * Dose lines, grouped by clock time so simultaneous injections read as one line
 * ("03:58 GHK-Cu 2mg + HGH 2iu"), matching the mock.
 */
const doseLines = computed(() => {
  const doses = [...(dosesEntry.value?.peptides ?? [])].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const byTime = new Map<string, string[]>()
  const sites = new Map<string, string>()
  for (const d of doses) {
    const unit = d.unit === 'iu' ? 'iu' : d.unit
    const equiv = d.unit === 'iu' ? iuEquivalentLabel(d.compound, d.dose) : null
    byTime.set(d.time, [...(byTime.get(d.time) ?? []), `${d.compound} ${d.dose}${unit}${equiv ? ` (${equiv})` : ''}`])
    if (d.site) sites.set(d.time, shortSite(d.site))
  }
  return [...byTime.entries()].map(([time, parts]) => {
    const site = sites.get(time)
    return `${time} ${parts.join(' + ')}${site ? ` · ${site}` : ''}`
  })
})

const latestWorkout = computed(() => {
  const all = [...(workoutsData.value ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  return all.at(-1) ?? null
})

// Kept as separate parts, not one joined string, so each metric can be rendered
// non-breaking — otherwise a narrow column splits "18.9 min" across two lines.
const workoutParts = computed(() => {
  const w = latestWorkout.value
  if (!w) return []
  return [
    w.duration_min != null ? `${w.duration_min} min` : null,
    w.calories != null ? `${w.calories} kcal` : null,
    w.avg_hr != null ? `♥ ${w.avg_hr}` : null
  ].filter((v): v is string => v != null)
})

// --- whoop strip ---
/** Latest non-null reading of a health field, whatever day it landed on. */
function latestHealth(field: string): number | null {
  for (let i = healthEntries.value.length - 1; i >= 0; i--) {
    const v = (healthEntries.value[i] as unknown as Record<string, number | null>)[field]
    if (v != null) return v
  }
  return null
}

const whoop = computed(() => {
  const sleep = latestHealth('sleep_total_min')
  const recovery = latestHealth('recovery_score')
  const strain = latestHealth('strain')
  // Whoop reports strain to six decimals; the useful precision is one.
  return {
    recovery: recovery != null ? Math.round(recovery) : null,
    sleep: sleep != null ? formatDuration(sleep) : '',
    strain: strain != null ? strain.toFixed(1) : null
  }
})

// --- spoke shortcut cards ---
const activeCompounds = computed(() => {
  const from = shiftDays(today.value, -21)
  const set = new Set<string>()
  for (const e of entries.value) {
    if (e.date < from) continue
    for (const p of e.peptides ?? []) if (p.compound) set.add(p.compound)
  }
  return set.size
})

const trackedCompounds = computed(() => {
  const set = new Set<string>(KNOWN_COMPOUNDS)
  for (const e of entries.value) {
    for (const p of e.peptides ?? []) if (p.compound) set.add(p.compound)
  }
  return set.size
})

const workoutsThisWeek = computed(() => {
  const from = shiftDays(today.value, -7)
  return (workoutsData.value ?? []).filter(w => w.date >= from).length
})

const metricCount = computed(() => {
  const withData = Object.keys(HEALTH_METRICS_META)
    .filter(k => healthEntries.value.some(e => (e as unknown as Record<string, number | null>)[k] != null))
  // 4 vitals tiles + whichever health metrics actually have readings.
  return withData.length + 4
})

const spokeCards = computed(() => {
  const cards = [
    { label: 'TRENDS', to: '/journal/trends', meta: `${metricCount.value} metrics · 90d` },
    { label: 'COMPOUNDS', to: '/journal/compounds', meta: `${activeCompounds.value} active · ${trackedCompounds.value} all` },
    { label: 'WORKOUTS', to: '/journal/workouts', meta: `${(workoutsData.value ?? []).length.toLocaleString('en-US')} · ${workoutsThisWeek.value} this wk` }
  ]
  if (isFullAccess.value) {
    cards.push({
      label: 'ENTRIES',
      to: '/journal/entries',
      meta: `${loggedEntries.value.length.toLocaleString('en-US')} logged · streak ${streak.value}d`
    })
  }
  return cards
})
</script>
