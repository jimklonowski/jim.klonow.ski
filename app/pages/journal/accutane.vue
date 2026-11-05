<template>
  <div>
    <JournalHeader
      section="ACCUTANE"
      :meta="headerMeta"
    >
      <template #actions>
        <NuxtLink
          v-if="course"
          :to="`/journal/cycle/${course.id}`"
          class="tui-btn"
        >
          CYCLE →
        </NuxtLink>
        <NuxtLink
          :to="{ path: '/labs', query: { marker: 'triglycerides' } }"
          class="tui-btn"
        >
          BLOODWORK →
        </NuxtLink>
        <NuxtLink
          v-if="showPhotos"
          to="/journal/photos"
          class="tui-btn tui-btn-accent"
        >
          + PHOTOS
        </NuxtLink>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      :empty="!error && !course"
      empty-title="No isotretinoin course on file"
      empty-description="Plan one on the Cycles page with Isotretinoin as its compound and this page fills itself from the dose log, the labs and the photos."
      @retry="refresh"
    />

    <template v-if="course && stats">
      <!-- Stat cells: where the course is, what has been taken, when it lands, how steady -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border-y border-line">
        <div
          v-for="cell in statCells"
          :key="cell.label"
          class="bg-bg px-4 sm:px-6 py-3.5"
        >
          <p class="text-label text-muted uppercase tracking-[0.12em]">
            {{ cell.label }}
          </p>
          <p
            class="num-display text-display leading-none mt-1.5 whitespace-nowrap"
            :class="cell.class"
          >
            {{ cell.value }}<span
              v-if="cell.unit"
              class="text-meta text-muted"
            > {{ cell.unit }}</span>
          </p>
          <p
            v-if="cell.note"
            class="text-meta text-muted mt-1"
          >
            {{ cell.note }}
          </p>
        </div>
      </div>

      <!-- The cumulative bar: the running total against the two targets, the prescriber's
           own picture drawn from the log instead of their counter. -->
      <div class="px-4 sm:px-6 py-3.5 border-b border-line">
        <div class="flex items-baseline justify-between gap-3 text-meta text-muted">
          <span><span class="text-hi num-display">{{ stats.cumulativeMg.toLocaleString() }}</span> mg logged<template v-if="stats.mgPerKg != null"> · <span class="text-hi num-display">{{ stats.mgPerKg }}</span> mg/kg at {{ stats.kg }} kg</template></span>
          <span
            v-if="stats.upperMg"
            class="hidden sm:inline"
          >{{ COURSE_TARGET_MG_PER_KG.lower }} mg/kg · {{ stats.lowerMg!.toLocaleString() }} mg &nbsp;│&nbsp; {{ COURSE_TARGET_MG_PER_KG.upper }} mg/kg · {{ stats.upperMg.toLocaleString() }} mg</span>
        </div>
        <div
          class="relative mt-2 h-2.5 bg-inset border border-line-soft"
          role="progressbar"
          :aria-valuenow="Math.round(barPct)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${stats.cumulativeMg} mg of ${stats.upperMg ?? '?'} mg, the upper target`"
        >
          <div
            class="absolute inset-y-0 left-0 bg-accent"
            :style="{ width: `${barPct}%` }"
          />
          <!-- The lower target's tick: the course can stop here. -->
          <div
            v-if="lowerPct != null"
            class="absolute -inset-y-0.75 w-px bg-warn"
            :style="{ left: `${lowerPct}%` }"
            :title="`${COURSE_TARGET_MG_PER_KG.lower} mg/kg`"
          />
        </div>
        <p class="mt-1.5 text-meta text-faint leading-[1.6]">
          Research supports {{ RESEARCH_TARGET_MG_PER_KG.lower }}–{{ RESEARCH_TARGET_MG_PER_KG.upper }} mg/kg; the prescriber plans to {{ COURSE_TARGET_MG_PER_KG.lower }}–{{ COURSE_TARGET_MG_PER_KG.upper }}, the upper end to cut relapses. The total is the sum of the dose log, so a missed day lengthens the course and a titration shortens it — nothing here needs a plan edit.
        </p>
      </div>

      <!-- Main split, the hematocrit panel's: the ladder and dossier in a 380px track, the data
           on the right. Both need min-w-0 so a wide row can't hold the grid open. -->
      <div class="grid gap-px bg-line lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section class="bg-bg px-4 sm:px-6 py-4 space-y-4 min-w-0">
          <!-- The ladder, course tier: this course's own dates -->
          <div>
            <TuiHeader
              label="COURSE"
              :dashes="12"
            >
              <span class="text-label text-muted normal-case">this course's own dates</span>
            </TuiHeader>
            <div class="mt-2">
              <div
                v-for="rung in courseRungs"
                :key="rung.key"
                class="flex items-baseline gap-2.5 py-2 border-b border-line-row last:border-0"
                :class="rung.state === 'upcoming' ? 'opacity-60' : ''"
              >
                <span
                  class="num-display text-small w-14 shrink-0 tabular-nums"
                  :class="rung.state === 'done' ? 'text-accent' : rung.state === 'here' ? 'text-warn' : 'text-muted'"
                >{{ rung.date ? formatDate(rung.date, 'monthDay') : '—' }}</span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-small uppercase tracking-[0.08em]"
                    :class="rung.state === 'done' ? 'text-accent' : rung.state === 'here' ? 'text-warn' : 'text-dim'"
                  >{{ rung.state === 'done' ? '✓ ' : rung.state === 'here' ? '◀ ' : '' }}{{ rung.label }}</span>
                  <span class="block text-meta text-muted leading-[1.6]">{{ rung.detail }}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- The ladder, typical tier: what courses usually do, pinned to the calendar -->
          <div>
            <TuiHeader
              label="TYPICAL"
              :dashes="11"
            >
              <span class="text-label text-muted normal-case">population, not a prediction</span>
            </TuiHeader>
            <div class="mt-2">
              <div
                v-for="rung in typicalRungs"
                :key="rung.key"
                class="flex items-baseline gap-2.5 py-2 border-b border-line-row last:border-0"
                :class="rung.state === 'upcoming' ? 'opacity-60' : ''"
              >
                <span
                  class="num-display text-small w-14 shrink-0 tabular-nums"
                  :class="rung.state === 'here' ? 'text-warn' : 'text-muted'"
                >{{ formatDate(rung.date!, 'monthDay') }}</span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-small uppercase tracking-[0.08em]"
                    :class="rung.state === 'here' ? 'text-warn' : rung.state === 'done' ? 'text-muted' : 'text-dim'"
                  >{{ rung.state === 'here' ? '◀ ' : '' }}{{ rung.label }}</span>
                  <span class="block text-meta text-muted leading-[1.6]">{{ rung.detail }}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Dossier: the compound page's block for the drug -->
          <div v-if="info">
            <TuiHeader
              label="DOSSIER"
              :dashes="20"
            />
            <p class="mt-2.5 text-row leading-[1.7] text-dim">
              {{ info.summary }}
            </p>
            <dl class="mt-3 space-y-2 text-small">
              <div>
                <dt class="text-label text-muted uppercase tracking-[0.12em]">
                  Course length
                </dt>
                <dd class="text-dim">
                  {{ info.dosing.notes }}
                </dd>
              </div>
              <div v-if="info.dosing.timing">
                <dt class="text-label text-muted uppercase tracking-[0.12em]">
                  Taking it
                </dt>
                <dd class="text-dim">
                  {{ info.dosing.timing }}
                </dd>
              </div>
              <div v-if="info.cycling">
                <dt class="text-label text-muted uppercase tracking-[0.12em]">
                  After the course
                </dt>
                <dd class="text-dim">
                  {{ info.cycling }}
                </dd>
              </div>
            </dl>
            <p
              v-if="info.caution"
              class="mt-3 text-small text-warn leading-[1.6]"
            >
              ⚠ {{ info.caution }}
            </p>
          </div>
        </section>

        <section class="bg-bg px-4 sm:px-6 py-4 space-y-4 min-w-0">
          <!-- Labs: the markers the drug moves, each against the pre-course draw -->
          <div>
            <TuiHeader
              label="LIPIDS · LIVER"
              :dashes="8"
            >
              <span class="text-label text-muted normal-case">{{ labsMeta }}</span>
            </TuiHeader>
            <div class="mt-1.5">
              <div
                v-for="row in labRows"
                :key="row.key"
                class="grid grid-cols-[minmax(0,7rem)_1fr_auto] sm:grid-cols-[minmax(0,9rem)_1fr_1fr_auto] items-baseline gap-x-3 py-2 border-b border-line-row last:border-0"
              >
                <NuxtLink
                  :to="{ path: '/labs', query: { marker: row.key } }"
                  class="text-small text-hi hover:text-accent truncate"
                >{{ row.label }}</NuxtLink>
                <span class="text-small text-muted tabular-nums whitespace-nowrap">
                  <template v-if="row.baseline">{{ fmt(row.baseline.value) }}<span class="text-faint"> · {{ formatDate(row.baseline.date, 'monthDay') }}</span></template>
                  <span
                    v-else
                    class="text-faint"
                  >no baseline</span>
                </span>
                <span class="hidden sm:inline text-small tabular-nums whitespace-nowrap text-hi">
                  <template v-if="row.latest">{{ fmt(row.latest.value) }}<span class="text-faint"> · {{ formatDate(row.latest.date, 'monthDay') }}</span></template>
                  <span
                    v-else
                    class="text-faint"
                  >no draw yet</span>
                </span>
                <span
                  class="num-display text-small tabular-nums whitespace-nowrap text-right"
                  :class="deltaClass(row)"
                >{{ deltaText(row) }}<span class="text-faint text-meta"> {{ row.unit }}</span></span>
              </div>
            </div>
            <p class="mt-2 text-meta text-faint leading-[1.6]">
              Expected on the drug: triglycerides and LDL up, HDL down, ALT and AST mildly up, mostly inside weeks 4–8 and reversible after. CK follows training first. A move past about three times the range is the clinic's call, not this page's.
            </p>
          </div>

          <!-- Photos: the acne set, newest shot per region -->
          <div v-if="showPhotos">
            <TuiHeader
              label="PHOTOS"
              :dashes="15"
            >
              <span
                class="text-label normal-case"
                :class="strip.stale ? 'text-warn' : 'text-muted'"
              >{{ photosMeta }}</span>
            </TuiHeader>
            <div class="mt-2.5 grid grid-cols-4 sm:grid-cols-8 gap-2">
              <figure
                v-for="r in strip.regions"
                :key="r.category"
                class="min-w-0"
              >
                <NuxtLink
                  v-if="r.latest"
                  :to="`/journal/${r.latest.date}`"
                  class="block aspect-square overflow-hidden border border-line-soft hover:border-line-accent transition-colors"
                  :aria-label="`${photoCategoryLabel(r.category)} photo from ${formatDate(r.latest.date)}`"
                >
                  <img
                    :src="r.latest.thumbUrl ?? r.latest.url"
                    alt=""
                    loading="lazy"
                    class="w-full h-full object-cover"
                    :class="{ '-scale-x-100': r.latest.frameFlip }"
                  >
                </NuxtLink>
                <div
                  v-else
                  class="aspect-square border border-dashed border-line-input flex items-center justify-center text-meta text-faint"
                >
                  none
                </div>
                <figcaption class="mt-1 text-label uppercase tracking-[0.08em] truncate text-muted">
                  {{ photoCategoryLabel(r.category) }}
                </figcaption>
                <p
                  class="text-meta tabular-nums"
                  :class="r.stale ? 'text-warn' : 'text-faint'"
                >
                  {{ r.daysAgo == null ? 'not shot' : r.daysAgo === 0 ? 'today' : `${r.daysAgo} d ago` }}
                </p>
              </figure>
            </div>
          </div>

          <!-- Signals: the streams that collect themselves, each against the eight weeks before -->
          <div>
            <TuiHeader
              label="CONTEXT"
              :dashes="14"
            >
              <span class="text-label text-muted normal-case">weekly · the 8 weeks before the start are the band</span>
            </TuiHeader>
            <div class="mt-2.5 grid grid-cols-2 xl:grid-cols-4 gap-px bg-line border border-line">
              <div
                v-for="s in signals"
                :key="s.label"
                class="bg-bg px-3.5 py-3 min-w-0"
              >
                <p class="text-micro text-muted uppercase tracking-widest">
                  {{ s.label }}
                </p>
                <p class="num-display text-tile leading-none mt-1.5 whitespace-nowrap">
                  <span :class="s.summary.current != null ? 'text-hi' : 'text-muted'">{{ s.summary.current ?? '—' }}</span><span class="text-label text-muted"> {{ s.unit }}</span>
                </p>
                <p class="text-label mt-1 tabular-nums">
                  <span
                    v-if="s.summary.delta != null"
                    class="text-dim"
                  >{{ s.summary.delta > 0 ? '+' : '' }}{{ s.summary.delta }} vs {{ s.summary.baseline }} before</span>
                  <span
                    v-else-if="s.summary.baseline != null"
                    class="text-faint"
                  >{{ s.summary.baseline }} before · nothing on-course yet</span>
                  <span
                    v-else
                    class="text-faint"
                  >no data</span>
                </p>
                <TuiSparkline
                  v-if="s.summary.values.length >= 2"
                  class="mt-2 text-muted"
                  :values="s.summary.values"
                  :mark-index="s.summary.markIndex"
                  :height="30"
                />
              </div>
            </div>
            <p class="mt-2 text-meta text-faint leading-[1.6]">
              Context, not measurements: dryness shows up as thirst, aches as fewer sessions, a rough patch in sleep and recovery. The labs above are the measurements. Anything felt goes in the day's notes, which the digests read.
            </p>
          </div>
        </section>
      </div>

      <p class="px-4 sm:px-6 py-3 text-meta text-ghost border-t border-line">
        {{ GENERAL_DISCLAIMER }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  COURSE_TARGET_MG_PER_KG, ISOTRETINOIN, PHOTO_BASELINE_LOOKBACK_DAYS, RESEARCH_TARGET_MG_PER_KG,
  baselineDrawDate, courseDoses, courseLabs, courseLadder, courseStats, isotretinoinCycle, photoStrip, plannedMgPerDay,
  recheckDraw, signalSummary, weeklySeries, type CourseMarkerRow
} from '#shared/utils/accutane'
import { shiftDays } from '#shared/utils/dates'
import { fmtMarkerValue } from '#shared/utils/markerValue'
import { photoCategoryLabel } from '#shared/utils/photoCategories'
import { photoSet } from '#shared/utils/photoSets'
import { BIOMARKERS } from '~/data/biomarkers'
import { COMPOUND_INFO, GENERAL_DISCLAIMER } from '~/data/compoundInfo'

useSeoMeta({ title: 'Journal · Accutane' })

// The isotretinoin course page (the accutane plan, Phase C): a view over the stores that already
// exist — the cycle row is the projection, the dose log the ledger, the labs the measurements,
// the acne photo set the record, and the self-collecting streams the context. Nothing is stored
// here; shared/utils/accutane.ts holds the arithmetic.

const { role } = await useAuth()
const today = useToday()
// The photos list refuses the doctor role (the photos are that role's blind spot by design), so
// the strip is simply not asked for.
const showPhotos = role.value !== 'doctor'

const [{ data: cyclesData, error, refresh }, { data: journalData }, { data: labsData }, { data: plannedData }, { data: hmData }, { data: workoutsData }] = await Promise.all([
  useCycles(),
  useJournalEntries(),
  useLabsEntries(),
  usePlannedDraws(),
  useHealthMetricsEntries(),
  useWorkoutsEntries()
])
const photosRes = showPhotos ? await usePhotoEntries() : null

const course = computed(() => isotretinoinCycle(cyclesData.value ?? [], today.value))
const entries = computed(() => journalData.value ?? [])
const doses = computed(() => courseDoses(entries.value))
const latestWeight = computed(() => [...entries.value].filter(e => e.weight_lbs != null).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weight_lbs ?? null)
const stats = computed(() => course.value ? courseStats(course.value, doses.value, latestWeight.value, today.value, plannedMgPerDay(course.value)) : null)
const info = COMPOUND_INFO[ISOTRETINOIN]
const fmt = fmtMarkerValue

const headerMeta = computed(() => {
  const s = stats.value
  if (!s) return ''
  if (s.status === 'upcoming') return `starts ${formatDate(s.start, 'monthDay')}`
  const week = Math.ceil(s.daysElapsed / 7)
  const parts = [`day ${s.daysElapsed}`, `wk ${week}`]
  if (s.currentMgPerDay != null) parts.push(`${s.currentMgPerDay} mg/day`)
  if (s.status === 'done') parts.push('ended')
  return parts.join(' · ')
})

// --- stat cells ---
const statCells = computed(() => {
  const s = stats.value!
  const totalWeeks = Math.ceil((Date.parse(s.end) - Date.parse(s.start)) / 86_400_000 / 7)
  return [
    {
      label: s.status === 'upcoming' ? 'Starts' : 'Day',
      value: s.status === 'upcoming' ? formatDate(s.start, 'monthDay') : String(s.daysElapsed),
      unit: s.status === 'upcoming' ? '' : `· wk ${Math.ceil(s.daysElapsed / 7)} of ~${totalWeeks}`,
      class: 'text-hi',
      note: s.status === 'upcoming' ? `${totalWeeks} weeks planned` : `since ${formatDate(s.start, 'monthDay')}${s.status === 'done' ? ` · ended ${formatDate(s.end, 'monthDay')}` : ''}`
    },
    {
      label: 'Cumulative',
      value: s.cumulativeMg.toLocaleString(),
      unit: 'mg',
      class: s.cumulativeMg ? 'text-hi' : 'text-muted',
      note: s.mgPerKg != null ? `${s.mgPerKg} mg/kg · ${s.pctOfLower} % of the lower target` : 'log a weight for the mg/kg side'
    },
    {
      label: `${COURSE_TARGET_MG_PER_KG.lower} mg/kg by`,
      value: s.reachLower ? formatDate(s.reachLower, 'monthDay') : '—',
      unit: '',
      class: s.lowerMg != null && s.cumulativeMg >= s.lowerMg ? 'text-accent' : 'text-hi',
      note: s.reachUpper ? `${COURSE_TARGET_MG_PER_KG.upper} by ${formatDate(s.reachUpper, 'short')} at ${s.paceMgPerDay} mg/day` : 'no weight on the log'
    },
    {
      label: 'Dosed',
      value: s.daysElapsed ? `${s.dosedDays}/${s.daysElapsed}` : '0',
      unit: 'days',
      class: s.daysElapsed && s.dosedDays < s.daysElapsed ? 'text-warn' : 'text-hi',
      note: s.lastDoseDate ? `last ${s.currentMgPerDay} mg · ${formatDate(s.lastDoseDate, 'monthDay')}` : 'nothing logged yet'
    }
  ]
})

const barPct = computed(() => {
  const s = stats.value!
  return s.upperMg ? Math.min(100, (s.cumulativeMg / s.upperMg) * 100) : 0
})
const lowerPct = computed(() => {
  const s = stats.value!
  return s.upperMg && s.lowerMg ? (s.lowerMg / s.upperMg) * 100 : null
})

// --- ladder ---
const labs = computed(() => labsData.value ?? [])
const baselineDate = computed(() => course.value ? baselineDrawDate(labs.value, course.value.start_date) : null)
const recheck = computed(() => {
  const c = course.value
  if (!c) return null
  // The cycle's own planned draws first; any other planned draw in the window still counts.
  const planned = (plannedData.value ?? []).filter(p => p.cycle_id === c.id || p.cycle_id == null).map(p => p.date)
  return recheckDraw(labs.value.map(l => l.date), planned, c.start_date)
})
const rungs = computed(() => stats.value ? courseLadder(stats.value, today.value, baselineDate.value, recheck.value) : [])
const courseRungs = computed(() => rungs.value.filter(r => r.tier === 'course'))
const typicalRungs = computed(() => rungs.value.filter(r => r.tier === 'typical'))

// --- labs ---
const labRows = computed(() => (course.value ? courseLabs(labs.value, course.value.start_date) : []).map(r => ({
  ...r,
  label: BIOMARKERS[r.key]?.label ?? r.key,
  unit: BIOMARKERS[r.key]?.unit ?? ''
})))
const labsMeta = computed(() => {
  const drawn = new Set(labRows.value.flatMap(r => r.onCourse.map(d => d.date)))
  const base = baselineDate.value ? `baseline ${formatDate(baselineDate.value, 'monthDay')}` : 'no pre-course baseline'
  return `${base} · ${drawn.size} on-course draw${drawn.size === 1 ? '' : 's'}`
})
function deltaText(row: CourseMarkerRow) {
  if (row.delta == null) return row.latest ? fmt(row.latest.value) : '—'
  return `${row.delta > 0 ? '+' : ''}${row.delta}`
}
// The drug's known direction is the expected one, so it reads dim; a move the other way is
// worth a look (warn), and the latest value alone, with no baseline, is plain.
function deltaClass(row: CourseMarkerRow) {
  if (row.delta == null) return row.latest ? 'text-hi' : 'text-muted'
  return row.asExpected === false ? 'text-warn' : 'text-dim'
}

// --- photos ---
const acne = photoSet('acne')
// The course's own record: from the baseline days before capsule one, never the physique
// session the week before.
const strip = computed(() => photoStrip(photosRes?.data.value ?? [], acne.categories, today.value, course.value ? shiftDays(course.value.start_date, -PHOTO_BASELINE_LOOKBACK_DAYS) : null))
const photosMeta = computed(() => {
  const s = strip.value
  if (!s.lastSession) return 'no acne set shot since the course began'
  return `last session ${formatDate(s.lastSession, 'monthDay')} · ${s.daysSince === 0 ? 'today' : `${s.daysSince} d ago`}${s.stale ? ' · due' : ''}`
})

// --- signals ---
const signals = computed(() => {
  const c = course.value
  if (!c) return []
  const start = c.start_date
  const t = today.value
  const js = entries.value
  const hm = hmData.value ?? []
  // A declaration, not a generic arrow: `<T>(…) =>` reads as JSX to the SFC parser.
  function pick<T>(rows: T[], date: (r: T) => string, value: (r: T) => number | null | undefined) {
    return rows.map(r => ({ date: date(r), value: value(r) }))
  }
  const sumOz = (e: typeof js[number]) => e.water?.length ? e.water.reduce((s, w) => s + (w.oz ?? 0), 0) : null
  const defs = [
    { label: 'Weight', unit: 'lb', weeks: weeklySeries(pick(js, e => e.date, e => e.weight_lbs), start, t) },
    { label: 'Systolic', unit: 'mmHg', weeks: weeklySeries(pick(js, e => e.date, e => e.bp_systolic), start, t) },
    { label: 'RHR', unit: 'bpm', weeks: weeklySeries(pick(js, e => e.date, e => e.rhr), start, t) },
    { label: 'HRV', unit: 'ms', weeks: weeklySeries(pick(js, e => e.date, e => e.hrv), start, t) },
    { label: 'Water', unit: 'oz/day', weeks: weeklySeries(pick(js, e => e.date, sumOz), start, t) },
    { label: 'Sleep perf', unit: '%', weeks: weeklySeries(pick(hm, h => h.date, h => h.sleep_performance_pct), start, t) },
    { label: 'Recovery', unit: '%', weeks: weeklySeries(pick(hm, h => h.date, h => h.recovery_score), start, t) },
    { label: 'Workouts', unit: '/wk', weeks: weeklySeries(pick(workoutsData.value ?? [], w => w.date, () => 1), start, t, 'sum') }
  ]
  return defs.map(d => ({ label: d.label, unit: d.unit, summary: signalSummary(d.weeks) }))
})
</script>
