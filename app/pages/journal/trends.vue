<template>
  <div>
    <JournalHeader
      section="TRENDS"
      :meta="`${metricCount} metrics`"
    >
      <template #actions>
        <JournalRangePicker :show-notes="annotationsAvailable" />
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="fetchError"
      :pending="loading"
      @retry="retryAll"
    />

    <div class="px-4 sm:px-6 py-3.5 space-y-3.5">
      <!-- The key to the lines and bands on every tile below; hovering a tile names the ones
           under the cursor. Only what falls inside the selected range. -->
      <p
        v-if="annotationKey.length"
        class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-label leading-[1.6]"
        aria-label="Protocol notes on these charts"
      >
        <span class="text-faint uppercase tracking-widest">notes</span>
        <span
          v-for="a in annotationKey"
          :key="`${a.kind}-${a.from}-${a.text}`"
          class="whitespace-nowrap"
          :style="{ color: a.color }"
        >{{ a.glyph }} {{ a.text }} <span class="text-muted">{{ a.when }}</span></span>
      </p>

      <!-- Vitals: manual entry + Withings scale -->
      <section>
        <TuiHeader
          label="VITALS ── manual + withings"
          :dashes="0"
        >
          <span
            v-if="drawLabel"
            class="text-micro text-muted normal-case"
          >▲ lab draws: {{ drawLabel }}</span>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mt-2.5">
          <JournalMetricTile
            v-for="tile in vitalTiles"
            :key="tile.label"
            :label="tile.label"
            :unit="tile.unit"
            :value="tile.value"
            :series="tile.series"
            :rows="vitalRows"
            :raw-rows="vitalRaw"
            :mark-lines="tile.markLines"
            :annotations="annotations"
            :connect="tile.connect"
            :show-notes="annotationsAvailable"
            :y-bands="tile.yBands"
            :y-rules="tile.yRules"
            :band-note="tile.bandNote"
            expandable
          />
        </div>
        <!-- Blood pressure as a clinician reads it (audit #43 item 83): the week's average, its
             AHA category, and whether it sits under the goal. One cuff reading is noise. -->
        <p
          v-if="bpWeek"
          class="mt-2 text-small text-muted"
          data-bp-week
        >
          <span class="text-dim">BP, 7-day average:</span> <span class="text-hi">{{ bpWeek.systolic }}/{{ bpWeek.diastolic }}</span>
          over {{ bpWeek.n }} reading{{ bpWeek.n === 1 ? '' : 's' }} ·
          <span :class="BP_TONE[bpWeek.category.tone]">{{ bpWeek.category.label }}</span> (AHA) ·
          goal under {{ bpWeek.goal.systolic }}/{{ bpWeek.goal.diastolic }}:
          <span :class="bpWeek.met ? 'text-accent' : 'text-warn'">{{ bpWeek.met ? 'met' : 'not met' }}</span><span
            v-if="bpWeek.n < BP_MIN_READINGS"
            class="text-faint"
          > · {{ BP_MIN_READINGS }} readings make a steadier week</span>
        </p>
      </section>

      <!-- Food: estimates from the meal log (shared/utils/nutrition.ts), sodas included. -->
      <section v-if="foodTiles.length">
        <TuiHeader
          label="FOOD ── meal log, estimated"
          :dashes="0"
        >
          <span class="text-micro text-muted normal-case">≈ model estimates per meal · days with every meal estimated</span>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mt-2.5">
          <JournalMetricTile
            v-for="tile in foodTiles"
            :key="tile.key"
            :label="tile.label"
            :unit="tile.unit"
            :value="tile.value"
            :series="tile.series"
            :rows="foodRows"
            :raw-rows="foodRaw"
            :annotations="annotations"
            :show-notes="annotationsAvailable"
            expandable
          />
        </div>
        <!-- The maintenance tile's working (audit #43 item 62): what went in, how the pound was
             priced, the watch's figure beside it, and the scan period it was priced from. -->
        <div
          v-if="energyLines.length"
          class="mt-2 space-y-0.5 text-small text-muted"
        >
          <p
            v-for="line in energyLines"
            :key="line"
          >
            {{ line }}
          </p>
        </div>
      </section>

      <!-- Drivers: a cause beside its effect — sodium and the next morning's systolic, caffeine
           after 14:00 and that night's sleep (shared/utils/drivers.ts). Each effect is charted
           on its cause's day, so a pair of tiles lines up; the lines beneath compare the two
           groups of days once each holds enough of them. -->
      <section
        v-if="driverTiles.length || driverLines.length"
        data-drivers
      >
        <TuiHeader
          label="DRIVERS ── a cause beside its effect"
          :dashes="0"
        >
          <span class="text-micro text-muted normal-case">associations over the days in range, not causes</span>
        </TuiHeader>

        <div
          v-if="driverTiles.length"
          class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mt-2.5"
        >
          <JournalMetricTile
            v-for="tile in driverTiles"
            :key="tile.key"
            :label="tile.label"
            :unit="tile.unit"
            :value="tile.value"
            :series="tile.series"
            :rows="driverRows"
            :raw-rows="driverRaw"
            :annotations="annotations"
            :show-notes="annotationsAvailable"
            :connect="tile.connect"
            :format="tile.format"
            expandable
          />
        </div>
        <div class="mt-2 space-y-0.5 text-small text-muted">
          <p
            v-for="line in driverLines"
            :key="line.key"
            :data-driver="line.key"
          >
            <span class="text-dim">{{ line.head }}</span> {{ line.text }}
          </p>
        </div>
      </section>

      <!-- Health: Whoop + Apple Watch -->
      <section>
        <TuiHeader
          label="HEALTH ── whoop + apple watch"
          :dashes="0"
        >
          <UDropdownMenu
            :items="metricMenuItems"
            :content="{ align: 'end' }"
          >
            <button
              type="button"
              class="text-micro text-accent hover:text-accent-hover cursor-pointer normal-case"
            >
              configure metrics ▾
            </button>
          </UDropdownMenu>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-2.5">
          <JournalMetricTile
            v-for="tile in healthTiles"
            :key="tile.key"
            :label="tile.label"
            :unit="tile.unit"
            :value="tile.value"
            :accent="tile.accent"
            :series="tile.series"
            :rows="healthRows"
            :raw-rows="healthRaw"
            :annotations="annotations"
            :show-notes="annotationsAvailable"
            :format="tile.format"
            expandable
          />
        </div>
        <p
          v-if="!healthTiles.length"
          class="mt-2.5 text-small text-muted"
        >
          No health metrics selected — use configure metrics to add some.
        </p>
      </section>

      <!-- Sleep stages -->
      <section
        v-if="sleepRows.length"
        class="bg-raised border border-line-soft px-3 py-2.5"
      >
        <div class="flex items-baseline gap-3 text-micro text-muted">
          <span class="uppercase tracking-widest">Sleep stages</span>
          <span class="text-faint">· min/night</span>
          <span class="ml-auto flex gap-2.5">
            <span
              v-for="stage in SLEEP_STAGES"
              :key="stage.key"
              :style="{ color: stage.color }"
            >▪ {{ stage.name }}</span>
          </span>
        </div>
        <div class="mt-2">
          <ClientOnly>
            <BarChart
              :data="sleepRows"
              :categories="sleepCategories"
              :y-axis-keys="SLEEP_STAGE_KEYS"
              x-axis-key="date"
              stacked
              hide-y-axis
              hide-x-axis
              :height="120"
            >
              <template #tooltip="{ params }">
                <div class="px-2.5 py-2 text-meta min-w-44 bg-raised border border-line-accent shadow-(--panel-shadow)">
                  <p class="text-muted mb-1.5">
                    {{ params[0]?.axisValue }}
                  </p>
                  <div
                    v-for="p in params"
                    :key="p.seriesName"
                    class="flex items-center justify-between gap-4"
                  >
                    <span class="flex items-center gap-1.5 text-dim">
                      <span
                        class="w-2 h-2 rounded-full shrink-0"
                        :style="{ background: p.color }"
                      />
                      {{ p.seriesName }}
                    </span>
                    <span class="text-hi">{{ formatDuration(Number(p.value ?? 0)) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4 pt-1.5 mt-1.5 border-t border-line">
                    <span class="text-muted">Asleep</span>
                    <span class="text-hi">{{ formatDuration(asleepMinutes(params)) }}</span>
                  </div>
                </div>
              </template>
            </BarChart>
            <template #fallback>
              <div class="h-30" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cycleAnnotations, eventAnnotations, placeAnnotations, ruleAnnotations } from '#shared/utils/chartAnnotations'
import { BP_DIASTOLIC_STAGE1, BP_SYSTOLIC_BANDS, bpGoal, bpWeekAverage } from '#shared/utils/bloodPressure'
import { cycleEnd, isTentative } from '#shared/utils/cycles'
import { LATE_CAFFEINE_HOUR, lateCaffeineMg } from '#shared/utils/drinks'
import { MIN_GROUP, caffeinePoints, median, sleepByNight, sodiumPoints, splitAt, wholeDaySodium } from '#shared/utils/drivers'
import {
  ENERGY_WINDOW_DAYS, KCAL_PER_LB_DEFAULT, MIN_COVERAGE, appleExpenditure, dexaCalibration, energyBalance, fmtStored,
  scanPeriodBalance, type DayIntake
} from '#shared/utils/energyBalance'
import { dayNutrition, fmtKcal, hasFullFigures, isDayDone, isWholeDay, nutritionIsEstimated, nutritionWindow } from '#shared/utils/nutrition'
import { RECOVERY_GREEN_MIN } from '#shared/utils/recovery'
import { fmtRate, weightTrend } from '#shared/utils/weightTrend'
import { HEALTH_METRICS_META, formatDuration } from '~/data/health-metrics'
import { ANNOTATION_STYLE, CHART_ACCENT, CHART_CYAN, CHART_DANGER, CHART_EMBER, CHART_INDIGO, CHART_WARN } from '~/utils/chartTheme'

useSeoMeta({ title: 'Journal · Trends' })

const { data: journalData, refresh, error, status } = await useJournalEntries()
const { data: healthData, refresh: refreshHealth, error: healthError, status: healthStatus } = await useHealthMetricsEntries()

const fetchError = computed(() => error.value ?? healthError.value ?? null)
// Both lists are client-only: on a hard load they are still arriving when the page first renders.
const settled = (s: string) => s === 'success' || s === 'error'
const loading = computed(() => !settled(status.value) || !settled(healthStatus.value))
function retryAll() {
  refresh()
  refreshHealth()
}
const { data: labsData } = await useLabsEntries()
const { data: cyclesData } = await useCycles()
const { rules: protocolRules } = await useProtocol()
const { data: labNotes } = await useLabNotes()
const { index: estimateIndex } = await useMealEstimates()
const { data: dexaData } = await useDexaEntries()
const { role } = await useAuth()

const { inRange, smoothRows, notes, cutoff } = useTrendRange()
const today = useToday()

const entries = computed(() => journalData.value ?? [])
const healthEntries = computed(() => healthData.value ?? [])

// --- protocol notes (dose changes, dated events, cycles) ---
// The schedule comes from useProtocol, so the demo sandbox draws its own dose changes (P9). The
// dated events arrive as bare bands from /api/labs/notes — the owner's notes stay on the server,
// and a demo session is sent no bands at all.
const annotationsAvailable = computed(() => role.value != null)
const annotations = computed(() => {
  if (!notes.value || !annotationsAvailable.value) return []
  const day = today.value
  const cycles = (cyclesData.value ?? [])
    .filter(c => !isTentative(c) && c.start_date <= day)
    .map(c => ({ name: c.name, from: c.start_date, to: cycleEnd(c) < day ? cycleEnd(c) : day }))
  const events = eventAnnotations(labNotes.value?.events ?? [])
  return [...ruleAnnotations(protocolRules.value), ...events, ...cycleAnnotations(cycles)]
})

/** The key strip: every annotation that lands on the visible range, placed on all its days. */
const annotationKey = computed(() => {
  if (!annotations.value.length) return []
  const days = [...new Set([...inRange(entries.value), ...inRange(healthEntries.value)].map(e => e.date))].sort()
  const md = (d: string) => formatDate(d, 'monthDay').toLowerCase()
  return placeAnnotations(annotations.value, days).map(a => ({
    ...a,
    glyph: a.kind === 'dose' ? '│' : '▒',
    color: ANNOTATION_STYLE[a.kind].color,
    when: a.to && a.to !== a.from
      ? `${md(a.from)}–${a.from.slice(0, 7) === a.to.slice(0, 7) ? a.to.slice(8).replace(/^0/, '') : md(a.to)}`
      : md(a.from)
  }))
})

// --- lab draw markers ---
// The picker's own window, not the journal rows' span: a draw in a week with no journal row
// (vitals synced late, a travel week) used to lose its marker.
const drawsInRange = computed(() =>
  (labsData.value ?? []).filter(l => (!cutoff.value || l.date >= cutoff.value) && l.date <= today.value)
)

const drawLabel = computed(() =>
  drawsInRange.value.map(d => formatDate(d.date, 'monthDay').toLowerCase()).join(' · ')
)
// ISO days: the tiles chart on `day` values now, so a guide names one exact date — a formatted
// label used to land on the same month-day of whichever year echarts matched last.
const drawMarkLines = computed(() =>
  drawsInRange.value.map(d => d.date)
)

// --- vitals group ---
const VITAL_FIELDS = ['weight_lbs', 'bp_systolic', 'bp_diastolic', 'rhr', 'hrv']

// The trend weight (shared/utils/weightTrend.ts) over the WHOLE history, so the line entering the
// visible range already carries what came before; the tile's figure is the trend as of today.
const weightTrendAll = computed(() => weightTrend(entries.value.flatMap(e => (e.weight_lbs != null ? [{ date: e.date, value: e.weight_lbs }] : [])), today.value))
const trendByDay = computed(() => new Map(weightTrendAll.value.points.map(p => [p.date, p.trend])))

// Each group keeps its raw rows beside the (maybe) smoothed ones: the tiles chart the smoothed
// line, their expanded view takes the stats from what was actually measured.
const vitalRaw = computed(() =>
  inRange(entries.value).map(e => ({
    date: formatDate(e.date, 'monthDay'),
    day: e.date,
    weight_lbs: e.weight_lbs ?? null,
    weight_trend: trendByDay.value.get(e.date) ?? null,
    bp_systolic: e.bp_systolic ?? null,
    bp_diastolic: e.bp_diastolic ?? null,
    rhr: e.rhr ?? null,
    hrv: e.hrv ?? null
  }))
)
const vitalRows = computed(() => smoothRows(vitalRaw.value, VITAL_FIELDS))

/** Latest non-null value of a field across the visible range. */
function latest(rows: Array<Record<string, unknown>>, field: string): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i]?.[field]
    if (typeof v === 'number') return v
  }
  return null
}

function fmt(v: number | null, decimals = 0) {
  if (v == null) return '—'
  return decimals ? v.toFixed(decimals) : Math.round(v).toString()
}

// --- blood pressure: the week's average, the AHA bands, the goal (audit #43 item 83) ---
const { data: profileData } = await useProfile()
const bpWeek = computed(() => bpWeekAverage(entries.value, today.value, bpGoal(profileData.value?.bp_goal)))
/** Fewer readings than this in the week and the average is flagged as thin. */
const BP_MIN_READINGS = 3
const BP_TONE = { ok: 'text-accent', warn: 'text-warn', danger: 'text-danger' } as const
const BP_BAND_COLORS: Record<string, string> = { elevated: CHART_WARN, stage1: CHART_EMBER, stage2: CHART_DANGER }
const BP_Y_BANDS = BP_SYSTOLIC_BANDS.map(b => ({ from: b.from, to: b.to, color: BP_BAND_COLORS[b.key] ?? CHART_WARN, opacity: 0.1 }))
const BP_Y_RULES = [{ at: BP_DIASTOLIC_STAGE1, color: CHART_INDIGO }]
const BP_BAND_NOTE = 'Tinted bands, on systolic: elevated 120–129, stage 1 130–139, stage 2 from 140 (AHA). Dashed line: diastolic 80, where stage 1 starts.'
type YBand = { from: number, to: number, color: string, opacity?: number }
const NO_BANDS: { yBands: YBand[], yRules: Array<{ at: number, color: string }>, bandNote: string | undefined } = { yBands: [], yRules: [], bandNote: undefined }

const vitalTiles = computed(() => {
  const rows = vitalRows.value
  const sys = latest(rows, 'bp_systolic')
  const dia = latest(rows, 'bp_diastolic')
  return [
    {
      // The figure is the trend weight and the unit carries its rate; the chart draws the scale
      // readings with the trend line through them (audit #43 item 55).
      label: 'Weight',
      unit: weightTrendAll.value.ratePerWeek != null ? `lbs trend · ${fmtRate(weightTrendAll.value.ratePerWeek)}` : 'lbs trend',
      value: weightTrendAll.value.trend != null ? weightTrendAll.value.trend.toFixed(1) : fmt(latest(rows, 'weight_lbs'), 1),
      series: [
        { key: 'weight_lbs', name: 'Scale', color: CHART_ACCENT },
        { key: 'weight_trend', name: 'Trend', color: CHART_INDIGO }
      ],
      // Only the weight chart carries the lab-draw verticals, per the mock.
      markLines: drawMarkLines.value,
      ...NO_BANDS
    },
    {
      label: 'BP',
      // The latest reading is the figure; the week's average rides beside it, since that is
      // the number the categories are defined on.
      unit: bpWeek.value ? `mmHg · 7d ${bpWeek.value.systolic}/${bpWeek.value.diastolic}` : 'mmHg',
      value: sys != null && dia != null ? `${Math.round(sys)}/${Math.round(dia)}` : '—',
      series: [
        { key: 'bp_systolic', name: 'sys', color: CHART_DANGER },
        { key: 'bp_diastolic', name: 'dia', color: CHART_INDIGO }
      ],
      markLines: [],
      // Cuff readings are taken days apart; the days between are not gaps in a stream.
      connect: true,
      // The expanded chart tints the AHA systolic bands and marks the diastolic stage 1 line.
      yBands: BP_Y_BANDS,
      yRules: BP_Y_RULES,
      bandNote: BP_BAND_NOTE
    },
    {
      label: 'RHR',
      unit: 'bpm',
      value: fmt(latest(rows, 'rhr')),
      series: [{ key: 'rhr', name: 'RHR', color: CHART_WARN }],
      markLines: [],
      ...NO_BANDS
    },
    {
      label: 'HRV',
      unit: 'ms',
      value: fmt(latest(rows, 'hrv')),
      series: [{ key: 'hrv', name: 'HRV', color: CHART_INDIGO }],
      markLines: [],
      ...NO_BANDS
    }
  ]
})

// --- food group ---
// One point per day whose logged meals are ALL estimated (a day with one unestimated meal would
// read low), kcal with sodas folded in; today only once its dinner is logged, so a half day is
// neither the "latest" figure nor a dip at the end of the line. Empty until estimates exist, so
// the doctor view (no food) and a fresh sandbox simply don't get the section.
const FOOD_FIELDS = ['kcal', 'protein_g']

// "est." on the tiles only when a charted day leans on a model figure — label figures aren't estimates.
const foodEstimated = computed(() => inRange(entries.value).some(e => nutritionIsEstimated(dayNutrition(e, estimateIndex.value))))

/** A day logged through to dinner (isWholeDay), with figures on every meal — isDayDone keeps
 * today out until its dinner is in, which for a past day isWholeDay already covers. */
function wholeDayNutrition(e: typeof entries.value[number]) {
  const n = dayNutrition(e, estimateIndex.value)
  return hasFullFigures(n) && isWholeDay(e) && isDayDone(e, today.value) ? n : null
}

// --- energy balance (audit #43 item 62) ---
// Every whole day across the history (the windows reach back before the visible range), the
// latest DEXA pair that prices a pound, and the balance over the 28 days ending today once its
// dinner is in, else yesterday (nutritionWindow).
const intakeDays = computed<DayIntake[]>(() =>
  entries.value.flatMap((e) => {
    const n = wholeDayNutrition(e)
    return n ? [{ date: e.date, kcal: n.kcal }] : []
  })
)
const calibration = computed(() => dexaCalibration((dexaData.value ?? []).map(s => ({
  date: s.date, fat_lbs: s.total?.fat_mass_lbs, lean_lbs: s.total?.lean_mass_lbs
}))))
const energyTo = computed(() => nutritionWindow(entries.value, today.value, ENERGY_WINDOW_DAYS).to)
const balance = computed(() => energyBalance(intakeDays.value, weightTrendAll.value.points, calibration.value, energyTo.value))
const appleNow = computed(() => appleExpenditure(healthEntries.value, balance.value.from, balance.value.to))
const scanPeriod = computed(() => calibration.value ? scanPeriodBalance(intakeDays.value, calibration.value) : null)

const md = (d: string) => formatDate(d, 'monthDay')
const signedLbs = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} lb`

/** Why a span's days were left out — the fix differs: estimate the meals, or log through dinner. */
function leftOut(from: string, to: string, days: number, counted: number): string {
  let unfigured = 0
  for (const e of entries.value) {
    if (e.date < from || e.date > to || !isWholeDay(e)) continue
    if (!hasFullFigures(dayNutrition(e, estimateIndex.value))) unfigured++
  }
  const short = Math.max(0, days - counted - unfigured)
  const parts = [
    unfigured ? `${unfigured} with a meal without figures` : '',
    short ? `${short} not logged through dinner` : ''
  ].filter(Boolean)
  return parts.length ? ` (left out: ${parts.join(', ')})` : ''
}

/** The caption under the food tiles: the figure's working, the watch's figure, the scan period. */
const energyLines = computed(() => {
  const b = balance.value
  if (!b.loggedDays) return []
  const span = `${md(b.from)} – ${md(b.to)}`
  const lines: string[] = []
  if (b.status === 'few-days') {
    lines.push(`Maintenance needs ${Math.round(MIN_COVERAGE * 100)} % of days logged through dinner with every meal figured: ${b.loggedDays} of ${b.windowDays} in ${span}${leftOut(b.from, b.to, b.windowDays, b.loggedDays)}.`)
  }
  else if (b.status === 'no-weight') {
    lines.push(`Maintenance needs a weigh-in within a week before ${md(shiftDays(b.from, -1))} and before ${md(b.to)}.`)
  }
  else {
    const c = calibration.value
    const price = b.source === 'dexa'
      ? `priced by DEXA ${md(c!.from)} → ${md(c!.to)}`
      : b.directionMismatch
        ? `the ${fmtKcal(KCAL_PER_LB_DEFAULT)} default — the scans moved the other way`
        : `the ${fmtKcal(KCAL_PER_LB_DEFAULT)} default — no DEXA pair to price it`
    lines.push(`Maintenance ≈ ${fmtKcal(b.maintenanceKcal!)} kcal/day, ${span}: intake ${fmtKcal(b.intakeKcal!)} on ${b.loggedDays} of ${b.windowDays} days, trend ${signedLbs(b.weightDelta!)} × ${fmtKcal(b.kcalPerLb)} kcal/lb (${price}) = ${fmtStored(b.storedKcalPerDay!)}.`)
  }
  if (appleNow.value) lines.push(`Apple active + resting energy, same days: ${fmtKcal(appleNow.value.kcal)} kcal/day (${appleNow.value.days} days with both).`)
  const p = scanPeriod.value
  if (p) {
    const c = p.calibration
    const head = `Between scans ${md(c.from)} → ${md(c.to)}: fat ${signedLbs(c.fatDelta)}, lean ${signedLbs(c.leanDelta)} = ${fmtStored(p.storedKcalPerDay)}`
    lines.push(p.maintenanceKcal != null
      ? `${head}; maintenance ≈ ${fmtKcal(p.maintenanceKcal)} (intake ${fmtKcal(p.intakeKcal!)} on ${p.loggedDays} of ${c.days} days).`
      : `${head}; intake counted on ${p.loggedDays} of ${c.days} days${leftOut(shiftDays(c.from, 1), c.to, c.days, p.loggedDays)} — too few to read a maintenance.`)
  }
  return lines
})

// The tile's three lines, per day: the balance over the 28 days ending that day, the logged
// intake over the same days, and the watch's figure — each only where it can be read.
function energyOn(day: string) {
  const b = energyBalance(intakeDays.value, weightTrendAll.value.points, calibration.value, day)
  const apple = appleExpenditure(healthEntries.value, b.from, b.to)
  return {
    maintenance: b.maintenanceKcal,
    intake_avg: b.status === 'few-days' ? null : b.intakeKcal,
    apple_tdee: apple?.kcal ?? null
  }
}

const foodRaw = computed(() =>
  inRange(entries.value).map((e) => {
    const n = wholeDayNutrition(e)
    // Today's energy point waits for its dinner like its calories do.
    const energy = isDayDone(e, today.value) ? energyOn(e.date) : { maintenance: null, intake_avg: null, apple_tdee: null }
    return {
      date: formatDate(e.date, 'monthDay'),
      day: e.date,
      kcal: n ? Math.round(n.kcal) : null,
      protein_g: n ? Math.round(n.protein_g) : null,
      ...energy
    }
  })
)
const foodRows = computed(() => smoothRows(foodRaw.value, FOOD_FIELDS))

const foodTiles = computed(() => {
  const rows = foodRows.value
  if (!rows.some(r => r.kcal != null)) return []
  return [
    {
      key: 'kcal',
      label: 'Calories',
      unit: foodEstimated.value ? 'kcal est.' : 'kcal',
      value: fmt(latest(rows, 'kcal')),
      series: [{ key: 'kcal', name: 'kcal', color: CHART_WARN }]
    },
    {
      key: 'protein_g',
      label: 'Protein',
      unit: foodEstimated.value ? 'g est.' : 'g',
      value: fmt(latest(rows, 'protein_g')),
      series: [{ key: 'protein_g', name: 'protein', color: CHART_ACCENT }]
    },
    {
      // The figure is the balance as of today (or yesterday until dinner); the line is the same
      // rolling 28-day balance per day, with the logged intake and the watch's figure beside it.
      key: 'maintenance',
      label: 'Maintenance',
      unit: balance.value.status === 'ok'
        ? `kcal/day · ${ENERGY_WINDOW_DAYS} d${foodEstimated.value ? ' est.' : ''}`
        : `kcal/day · ${balance.value.loggedDays}/${ENERGY_WINDOW_DAYS} d logged`,
      value: balance.value.maintenanceKcal != null ? fmtKcal(balance.value.maintenanceKcal) : '—',
      series: [
        { key: 'maintenance', name: 'Maintenance', color: CHART_ACCENT },
        { key: 'intake_avg', name: 'Intake 28 d', color: CHART_WARN },
        { key: 'apple_tdee', name: 'Apple', color: CHART_INDIGO }
      ]
    }
  ]
})

// --- drivers group ---
// One row per journal day in range. The effect sits on its CAUSE's day: `sys_next` is the next
// day's systolic, `sleep_night` the sleep of the night that followed — so the tiles of a pair
// share an x axis. Sodium is charted only for a whole-figure day (wholeDaySodium); a floor is
// not a figure.
const DRIVER_FIELDS = ['sodium_mg', 'sys_next', 'late_caffeine_mg', 'sleep_night']
const nightSleep = computed(() => sleepByNight(healthEntries.value))
const systolicByDay = computed(() => new Map(entries.value.flatMap(e => (e.bp_systolic != null ? [[e.date, e.bp_systolic] as const] : []))))

const driverRaw = computed(() =>
  inRange(entries.value).map(e => ({
    date: formatDate(e.date, 'monthDay'),
    day: e.date,
    sodium_mg: wholeDaySodium(e, estimateIndex.value),
    sys_next: systolicByDay.value.get(shiftDays(e.date, 1)) ?? null,
    // A day still under way has not had its late caffeine yet.
    late_caffeine_mg: e.date < today.value ? lateCaffeineMg(e.sodas, estimateIndex.value.drinks) : null,
    sleep_night: nightSleep.value.get(e.date) ?? null
  }))
)
const driverRows = computed(() => smoothRows(driverRaw.value, DRIVER_FIELDS))

const driverTiles = computed(() => {
  const rows = driverRows.value
  const has = (field: string) => rows.filter(r => (r as Record<string, unknown>)[field] != null).length >= 2
  const tiles: Array<{ key: string, label: string, unit: string, value: string, series: Array<{ key: string, name: string, color: string }>, connect?: boolean, format?: (v: number) => string }> = []
  // A pair is shown whole or not at all: the cause without its effect is just another tile.
  if (has('sodium_mg') && has('sys_next')) {
    tiles.push(
      { key: 'sodium_mg', label: 'Sodium', unit: 'mg/day · whole days', value: fmtKcal(latest(rows, 'sodium_mg') ?? 0), series: [{ key: 'sodium_mg', name: 'sodium', color: CHART_WARN }], connect: true },
      { key: 'sys_next', label: 'Systolic', unit: 'mmHg · next morning', value: fmt(latest(rows, 'sys_next')), series: [{ key: 'sys_next', name: 'sys, next day', color: CHART_DANGER }], connect: true }
    )
  }
  if (has('late_caffeine_mg') && has('sleep_night') && rows.some(r => (r.late_caffeine_mg ?? 0) > 0)) {
    const sleep = latest(rows, 'sleep_night')
    tiles.push(
      { key: 'late_caffeine_mg', label: 'Late caffeine', unit: `mg after ${LATE_CAFFEINE_HOUR}:00`, value: fmt(latest(rows, 'late_caffeine_mg')), series: [{ key: 'late_caffeine_mg', name: 'late caffeine', color: CHART_EMBER }] },
      { key: 'sleep_night', label: 'Sleep', unit: 'that night', value: sleep == null ? '—' : formatDuration(sleep), series: [{ key: 'sleep_night', name: 'sleep', color: CHART_INDIGO }], format: formatDuration }
    )
  }
  return tiles
})

// The comparisons, over the days in range. Sodium splits at the range's own median (most days
// sit above any fixed limit, which would leave one side empty); caffeine splits at "any".
const driverLines = computed(() => {
  const lines: Array<{ key: string, head: string, text: string }> = []
  const days = inRange(entries.value)
  const n = (count: number) => `${count} day${count === 1 ? '' : 's'}`

  const sodium = sodiumPoints(days, estimateIndex.value)
  if (sodium.length) {
    const s = splitAt(sodium, median(sodium.map(p => p.x)) ?? 0)
    const text = s.enough
      ? `${Math.round(s.above.mean!)} mmHg after days above ${fmtKcal(s.threshold)} mg (${n(s.above.n)}), ${Math.round(s.below.mean!)} after days at or below (${n(s.below.n)}) · ${signed(s.diff!, 0)} mmHg.`
      : `${n(sodium.length)} pair a whole sodium figure with a reading the next morning — ${MIN_GROUP} on each side of the median are needed to compare. Sodium counts only on days where every meal carries a figure.`
    lines.push({ key: 'sodium', head: 'Sodium → next-morning systolic:', text })
  }

  const caffeine = caffeinePoints(days.filter(e => e.date < today.value), healthEntries.value, estimateIndex.value)
  if (caffeine.some(p => p.x > 0)) {
    const s = splitAt(caffeine, 0)
    const text = s.enough
      ? `${formatDuration(Math.round(s.above.mean!))} on nights after any (${n(s.above.n)}), ${formatDuration(Math.round(s.below.mean!))} after none (${n(s.below.n)}) · ${s.diff! >= 0 ? '+' : '−'}${formatDuration(Math.round(Math.abs(s.diff!)))}.`
      : `${n(s.above.n)} with any and ${n(s.below.n)} without have a night on file — ${MIN_GROUP} of each are needed to compare.`
    lines.push({ key: 'caffeine', head: `Caffeine after ${LATE_CAFFEINE_HOUR}:00 → that night's sleep:`, text })
  }
  return lines
})

function signed(v: number, digits = 1) {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`
}

// --- health group ---
// Per-metric line colors: green for the "more is better" fitness markers, indigo for sleep,
// warn for strain (a load number with no good direction).
const HEALTH_COLORS: Record<string, string> = {
  vo2_max: CHART_ACCENT,
  body_fat_pct: CHART_ACCENT,
  lean_body_mass_lbs: CHART_ACCENT,
  sleep_total_min: CHART_INDIGO,
  recovery_score: CHART_ACCENT,
  strain: CHART_WARN,
  sleep_performance_pct: CHART_INDIGO
}

const DEFAULT_HEALTH_KEYS = [
  'vo2_max', 'body_fat_pct', 'sleep_total_min', 'recovery_score', 'strain', 'sleep_performance_pct'
]

const selectedHealthKeys = useState<string[]>('journal-health-metrics', () => [...DEFAULT_HEALTH_KEYS])

const metricMenuItems = computed(() => [
  Object.entries(HEALTH_METRICS_META).map(([key, meta]) => ({
    label: meta.label,
    type: 'checkbox' as const,
    checked: selectedHealthKeys.value.includes(key),
    onUpdateChecked: (checked: boolean) => {
      selectedHealthKeys.value = checked
        ? [...selectedHealthKeys.value, key]
        : selectedHealthKeys.value.filter(k => k !== key)
    },
    onSelect: (e: Event) => e.preventDefault()
  }))
])

const healthKeys = computed(() =>
  Object.keys(HEALTH_METRICS_META).filter(k => selectedHealthKeys.value.includes(k))
)

const healthRaw = computed(() =>
  inRange(healthEntries.value).map(e => ({
    date: formatDate(e.date, 'monthDay'),
    day: e.date,
    ...Object.fromEntries(
      Object.keys(HEALTH_METRICS_META).map(k => [k, (e as unknown as Record<string, number | null>)[k] ?? null])
    )
  }))
)
const healthRows = computed(() => smoothRows(healthRaw.value, Object.keys(HEALTH_METRICS_META)))

const healthTiles = computed(() =>
  healthKeys.value.map((key) => {
    const meta = HEALTH_METRICS_META[key]!
    const v = latest(healthRows.value, key)
    return {
      key,
      label: meta.label,
      unit: key === 'sleep_total_min' ? '' : meta.unit,
      value: v == null ? '—' : key === 'sleep_total_min' ? formatDuration(v) : fmt(v, Number.isInteger(v) ? 0 : 1),
      // Recovery is the one metric the mock tints when it's in a good place.
      accent: key === 'recovery_score' && v != null && v >= RECOVERY_GREEN_MIN,
      series: [{ key, name: meta.label, color: HEALTH_COLORS[key] ?? CHART_ACCENT }],
      // Sleep prints as a duration in the expanded view's stats; the rest take the default.
      format: key === 'sleep_total_min' ? formatDuration : undefined
    }
  })
)

const metricCount = computed(() => vitalTiles.value.length + foodTiles.value.length + healthTiles.value.length + 1)

// --- sleep stages ---
// Legend + stack order from the mock: awake on top, then light (the `core` column), rem, deep.
const SLEEP_STAGES = [
  { key: 'sleep_awake_min', name: 'awake', color: CHART_EMBER },
  { key: 'sleep_core_min', name: 'light', color: CHART_ACCENT },
  { key: 'sleep_rem_min', name: 'rem', color: CHART_CYAN },
  { key: 'sleep_deep_min', name: 'deep', color: CHART_INDIGO }
] as const

// echarts stacks in series order, bottom-up — reverse so `deep` lands at the base.
const SLEEP_STAGE_KEYS = [...SLEEP_STAGES].reverse().map(s => s.key)

const sleepCategories = computed(() =>
  Object.fromEntries(SLEEP_STAGES.map(s => [s.key, { name: s.name, color: s.color }]))
)

const sleepRows = computed(() => {
  const nights = inRange(healthEntries.value)
    .filter(e => SLEEP_STAGES.some(s => (e as unknown as Record<string, number | null>)[s.key] != null))
  // A range that crosses a year carries the year in its labels: two "Mar 20" bars on one axis
  // made the stacked chart throw ("duplicate Mar 20 / deep") on the all-time range.
  const style = new Set(nights.map(e => e.date.slice(0, 4))).size > 1 ? 'short' : 'monthDay'
  return nights
    .map(e => ({
      date: formatDate(e.date, style),
      ...Object.fromEntries(
        SLEEP_STAGES.map(s => [s.key, (e as unknown as Record<string, number | null>)[s.key] ?? 0])
      )
    }))
})

function asleepMinutes(params: Array<{ seriesName?: string, value?: number | string }>) {
  return params
    .filter(p => p.seriesName !== 'awake')
    .reduce((sum, p) => sum + Number(p.value ?? 0), 0)
}
</script>
