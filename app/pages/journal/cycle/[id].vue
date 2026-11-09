<template>
  <div>
    <JournalHeader
      section="CYCLE"
      :meta="cycle?.name ?? '…'"
    >
      <template #actions>
        <span
          v-if="cycle"
          class="text-meta tracking-[0.08em] uppercase border px-2 py-1"
          :class="STATUS_CHIP[chipKey]"
        >{{ statusLabel }}</span>
        <!-- An isotretinoin course has its own page: cumulative dose, the lipid/liver panel,
             the photo strip. The dossier here stays the generic cycle view. -->
        <NuxtLink
          v-if="cycle && cycle.compounds.some(i => i.compound === ISOTRETINOIN)"
          :to="{ path: '/journal/accutane', query: { cycle: cycle.id } }"
          class="tui-btn"
        >
          COURSE PAGE →
        </NuxtLink>
        <template v-if="isOwner && cycle">
          <!-- Committing a date is what brings a tentative plan to life, so it gets the accent
               button; the form opens straight in exact-date mode. -->
          <button
            v-if="tentativeStart"
            type="button"
            class="tui-btn tui-btn-accent"
            @click="cycleForm?.open(cycle, { precision: 'day' })"
          >
            SET START DATE
          </button>
          <button
            type="button"
            class="tui-btn"
            @click="cycleForm?.open(cycle)"
          >
            EDIT
          </button>
          <button
            v-if="status === 'active'"
            type="button"
            class="tui-btn"
            @click="endToday"
          >
            END TODAY
          </button>
          <button
            v-else-if="cycle.actual_end"
            type="button"
            class="tui-btn"
            title="Clear the off-plan end date and let the cycle run as planned"
            @click="clearEnd"
          >
            RESUME PLAN
          </button>
        </template>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <!-- Only once the list loaded: a failed fetch is the error state above, not a missing cycle. -->
    <p
      v-if="!error && !cycle"
      class="px-4 sm:px-6 py-5 text-small text-muted"
    >
      No cycle with this id. <NuxtLink
        to="/journal/cycles"
        class="text-accent hover:text-accent-hover"
      >all cycles →</NuxtLink>
    </p>

    <template v-else-if="cycle">
      <!-- Stat cells -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border-b border-line">
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-label text-muted uppercase tracking-[0.12em]">
            {{ tentativeStart ? 'Planned' : status === 'upcoming' ? 'Starts' : status === 'active' ? 'Progress' : 'Ran' }}
          </p>
          <p class="num-display text-display leading-none mt-1.5">
            {{ progressStat }}
          </p>
          <p class="text-meta text-muted mt-1">
            <template v-if="tentativeStart">
              sometime in {{ tentativeStart }}
            </template>
            <template v-else>
              {{ formatDate(cycle.start_date, 'monthDay') }} → {{ formatDate(endDate, 'monthDay') }}{{ cycle.actual_end ? ' · off-plan end' : '' }}
            </template>
          </p>
        </div>
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-label text-muted uppercase tracking-[0.12em]">
            Adherence
          </p>
          <p
            class="num-display text-display leading-none mt-1.5"
            :class="adherencePctClass(adherence.pct)"
          >
            {{ adherence.pct != null ? `${adherence.pct}%` : '—' }}
          </p>
        </div>
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-label text-muted uppercase tracking-[0.12em]">
            Next draw
          </p>
          <p class="text-prose text-body mt-2.5">
            {{ nextCheckpointLabel }}
          </p>
        </div>
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-label text-muted uppercase tracking-[0.12em]">
            Weight
          </p>
          <p class="num-display text-display leading-none mt-1.5">
            {{ weightStat.value }}
          </p>
          <p
            v-if="weightStat.sub"
            class="text-meta text-muted mt-1"
          >
            {{ weightStat.sub }}
          </p>
        </div>
      </div>

      <div class="px-4 sm:px-6 py-3.5 space-y-4">
        <p
          v-if="cycle.goal"
          class="text-small text-muted"
        >
          goal: {{ cycle.goal }}
        </p>

        <!-- Marker goals (audit #43 item 60): the dated targets this cycle waits on, each with its
             verdict from the draws on file, rolled up to GO / NO-GO / UNDECIDED. -->
        <section v-if="goalVerdicts.length || isOwner">
          <TuiHeader
            label="GOALS ── gating markers"
            :dashes="0"
          >
            <span
              v-if="goalVerdicts.length"
              class="text-micro tracking-[0.08em] normal-case"
              :class="VERDICT_CLASS[goalSummary.verdict]"
            >{{ VERDICT_WORD[goalSummary.verdict] }} · {{ goalSummary.met }} met · {{ goalSummary.notMet }} not met<template v-if="goalSummary.open"> · {{ goalSummary.open }} undecided</template></span>
          </TuiHeader>
          <div
            v-if="goalVerdicts.length"
            class="mt-2"
          >
            <div
              v-for="v in goalVerdicts"
              :key="v.goal.id"
              class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-1.5 border-b border-line-row last:border-0 group"
              :title="v.reason"
            >
              <span
                class="text-label tracking-[0.08em] w-24 shrink-0"
                :class="STATUS_CLASS[v.status]"
              >{{ STATUS_WORD[v.status] }}</span>
              <span class="text-small text-hi">{{ goalLabel(v.goal, BIOMARKERS[v.goal.marker]) }}</span>
              <span
                v-if="v.goal.cycle_id == null"
                class="text-meta text-faint"
              >standing</span>
              <span class="text-meta text-muted min-w-0">{{ v.reason }}</span>
              <span
                v-if="isOwner"
                class="ml-auto flex items-baseline gap-2 shrink-0"
              >
                <button
                  type="button"
                  class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
                  :aria-label="`Edit the goal ${goalLabel(v.goal, BIOMARKERS[v.goal.marker])}`"
                  @click="openGoal(v.goal)"
                >edit</button>
                <button
                  type="button"
                  class="text-meta text-faint hover:text-danger cursor-pointer tui-row-action"
                  :aria-label="`Delete the goal ${goalLabel(v.goal, BIOMARKERS[v.goal.marker])}`"
                  @click="confirmDeleteGoal(v.goal)"
                >✕</button>
              </span>
            </div>
          </div>
          <p
            v-else
            class="mt-2 text-small text-muted"
          >
            No marker goal gates this cycle yet — add one ("hematocrit seen falling", "estradiol under 100 pg/mL by a date") and each draw gets a verdict against it here and on the home strip.
          </p>
          <button
            v-if="isOwner"
            type="button"
            class="tui-btn mt-2.5"
            @click="openGoal(null)"
          >
            + GOAL
          </button>
        </section>

        <!-- Planned timeline: one bar per compound across the cycle's weeks -->
        <section>
          <TuiHeader
            label="PLAN ── by week"
            :dashes="0"
          >
            <span class="text-micro text-muted normal-case">{{ totalWeeks }} wks</span>
          </TuiHeader>
          <div class="flex flex-col gap-1 mt-2.5">
            <JournalGanttRow
              v-for="(bar, i) in planBars"
              :key="i"
              :name="bar.compound"
              :runs="[bar]"
              :trailing="bar.label"
              trailing-class="w-24 sm:w-34 truncate"
              :now-left="nowLeft"
            />
          </div>
        </section>

        <!-- Planned vs logged exposure, Bateman-modeled -->
        <section v-if="overlayChart.data.length">
          <TuiHeader
            label="ESTIMATED LEVELS ── planned vs logged"
            :dashes="0"
          >
            <span class="text-micro text-muted normal-case">% of each compound's planned peak</span>
          </TuiHeader>
          <div class="mt-2.5">
            <ClientOnly>
              <AreaChart
                :data="overlayChart.data"
                :categories="overlayChart.categories"
                :height="190"
                show-legend
                :mark-lines="overlayMarks"
              />
              <template #fallback>
                <div class="h-48" />
              </template>
            </ClientOnly>
          </div>
          <p class="mt-1.5 text-meta text-faint leading-[1.6]">
            Faint line = the plan, solid = modeled from logged doses; divergence is deviation. Dashed guides mark the start and lab draws.{{ unmodeledNote }}
          </p>
        </section>

        <!-- Passive vitals watch — the symptom tracker that needs no pressing. Each metric's
             last-2-weeks average vs its 4-weeks-pre-start baseline, same noise thresholds as
             the digest trend engine. -->
        <section v-if="signalRows.length">
          <TuiHeader
            label="SIGNALS ── vitals vs pre-cycle baseline"
            :dashes="0"
          >
            <!-- "pre-target" rather than "pre-start" for a tentative cycle: the window is
                 measured against an anchor month, not a date that's been committed to. -->
            <span class="text-micro text-muted normal-case">{{ tentativeStart ? 'baseline forming · 4 wks pre-target' : status === 'upcoming' ? 'baseline forming · 4 wks pre-start' : 'last 2 wks vs 4 wks pre-start' }}</span>
          </TuiHeader>
          <div class="flex flex-col gap-1.5 mt-2.5">
            <div
              v-for="s in signalRows"
              :key="s.key"
              class="grid grid-cols-[1fr_auto] lg:grid-cols-[180px_170px_minmax(0,1fr)_130px_100px] gap-x-3 gap-y-1.5 items-center px-3 py-2 bg-raised text-small"
            >
              <span class="text-hi">{{ s.label }}</span>
              <span class="text-dim text-right lg:text-left text-meta">{{ s.reading }}</span>

              <span class="col-span-2 lg:col-span-1 min-w-0">
                <TuiSparkline
                  v-if="s.spark.length > 1"
                  :values="s.spark"
                  :mark-index="s.sparkStartIdx"
                  :color="s.sparkColor"
                  :height="22"
                  class="text-faint"
                />
              </span>

              <span
                class="text-right text-meta"
                :class="s.deltaClass"
              >{{ s.deltaText }}</span>
              <span
                class="text-right text-label tracking-[0.06em]"
                :class="s.chipClass"
              >{{ s.chip }}</span>
            </div>
          </div>
          <p class="mt-1.5 text-meta text-faint leading-[1.6]">
            Derived from logged vitals and Whoop — nothing to enter. Noise thresholds match the digest trend engine; weight also watches rate of change, since fast gain reads as water retention long before the total looks alarming. The dashed guide marks the cycle start.
          </p>
        </section>

        <!-- Planned vs logged, scored per week -->
        <section v-if="status !== 'upcoming' && adherence.rows.length">
          <TuiHeader
            label="ADHERENCE ── planned vs logged"
            :dashes="0"
          >
            <span class="text-micro text-muted normal-case">cycle weeks only</span>
          </TuiHeader>
          <JournalAdherenceTable
            :rows="adherenceRows"
            :show-status="status === 'active'"
          />
        </section>

        <!-- Lab checkpoints, derived from the cycle dates. A tentative start has none to
             derive: every window is start-relative, and inventing them off a placeholder
             month would put fake deadlines on the page. -->
        <section>
          <TuiHeader
            label="LAB CHECKPOINTS ── gating markers vs baseline"
            :dashes="0"
          />
          <div
            v-if="tentativeStart"
            class="mt-2.5 px-3 py-2.5 bg-inset border border-dashed border-line-input text-small space-y-1"
          >
            <p :class="baselineAdvice.class">
              {{ baselineAdvice.text }}
            </p>
            <p class="text-faint leading-[1.6]">
              Dated windows — mid-cycle, end-of-cycle, recovery — appear once a start date is set.
              Same for calendar rings, adherence scoring, and the planned-exposure overlay: they'd
              all be derived from a guessed day until then.
            </p>
          </div>
          <div
            v-else
            class="flex flex-col gap-1.5 mt-2.5"
          >
            <div
              v-for="cp in checkpoints"
              :key="cp.key"
              class="px-3 py-2.5 bg-raised text-small"
            >
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-hi uppercase tracking-[0.06em] text-meta">{{ cp.label }}</span>
                <span class="text-faint text-meta">{{ formatDate(cp.windowFrom, 'monthDay') }} – {{ formatDate(cp.windowTo, 'monthDay') }}</span>
                <span
                  class="ml-auto text-label tracking-[0.06em] uppercase"
                  :class="CP_CLASSES[cp.state]"
                >
                  <template v-if="cp.state === 'done'">
                    <NuxtLink
                      to="/labs"
                      class="hover:underline"
                    >✓ {{ formatDate(cp.drawDate!, 'monthDay').toUpperCase() }}</NuxtLink>
                  </template>
                  <template v-else>{{ cp.state === 'due' ? 'DUE NOW' : cp.state === 'missed' ? 'NO DRAW' : 'UPCOMING' }}</template>
                </span>
              </div>
              <div
                v-if="cp.chips.length"
                class="flex flex-wrap gap-x-3.5 gap-y-1 mt-1.5 text-small"
              >
                <NuxtLink
                  v-for="chip in cp.chips"
                  :key="chip.key"
                  :to="{ path: '/labs', query: { marker: chip.key } }"
                  class="hover:opacity-80 transition-opacity"
                  :class="chip.class"
                >{{ chip.text }}</NuxtLink>
              </div>
            </div>
          </div>
          <p
            v-if="!tentativeStart"
            class="mt-1.5 text-meta text-faint leading-[1.6]"
          >
            Windows are derived from the cycle dates — nothing to schedule. Chips diff HDL/LDL, ALT/AST, hematocrit, ferritin, and estradiol against the baseline draw.
          </p>
        </section>

        <section v-if="cycle.notes">
          <TuiHeader
            label="NOTES"
            :dashes="0"
          />
          <p class="mt-2 text-small text-body whitespace-pre-line leading-[1.7]">
            {{ cycle.notes }}
          </p>
        </section>
      </div>
    </template>

    <JournalCycleForm
      ref="cycleForm"
      @saved="refresh"
    />

    <!-- Add / edit a marker goal -->
    <UModal
      v-model:open="goalModalOpen"
      :title="goalForm.id ? 'Edit Goal' : 'Add Goal'"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UFormField
              label="Marker"
              required
            >
              <USelectMenu
                v-model="goalForm.marker"
                :items="MARKER_ITEMS"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Should be"
              required
            >
              <USelect
                v-model="goalForm.comparator"
                :items="COMPARATOR_ITEMS"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Target"
              :required="!goalIsTrend"
              :help="goalIsTrend ? 'A trend goal has no number: the latest reading against the one before it, once a draw lands after the goal was set' : `In the marker's unit${BIOMARKERS[goalForm.marker]?.unit ? ` (${BIOMARKERS[goalForm.marker]!.unit})` : ''}`"
            >
              <UInput
                v-model.number="goalForm.target"
                type="number"
                inputmode="decimal"
                step="any"
                :disabled="goalIsTrend"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="By"
              help="Optional deadline; a miss past it says so"
            >
              <UInput
                v-model="goalForm.by_date"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Gates"
            >
              <USelect
                v-model="goalForm.scope"
                :items="SCOPE_ITEMS"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Set on"
              required
              help="A trend counts only draws after this day"
            >
              <UInput
                v-model="goalForm.stated"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Why"
            help="One line; goes to the AI with the verdict"
          >
            <UInput
              v-model="goalForm.note"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="tui-btn"
              @click="goalModalOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="savingGoal"
              :disabled="!goalValid"
              @click="saveGoal"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ISOTRETINOIN } from '#shared/utils/accutane'
import { CHART_ACCENT, CHART_DANGER, CHART_WARN } from '~/utils/chartTheme'
import { getCompoundColor } from '~/data/journal'
import { BIOMARKERS, getStatus, isEchoOnly } from '~/data/biomarkers'
import { PK_MODELS, exposureSeries, pkDosesFor } from '#shared/utils/pk'
import type { Cycle } from '#shared/utils/cycles'
import {
  BASELINE_LOOKBACK_DAYS, GATING_MARKERS, checkpointStates, cycleEnd, cycleProgress,
  cycleSpanDays, cycleStatusOn, doseLabelOf, durationLabel, plannedDoses, tentativeStartLabel
} from '#shared/utils/cycles'
import { diffDays, shiftDays } from '#shared/utils/dates'
import { checkpointPlan, planInWindow } from '#shared/utils/plannedDraws'
import type { CycleSignal } from '#shared/utils/cycleSignals'
import { computeCycleSignals } from '#shared/utils/cycleSignals'
import { caveatCompoundOn } from '#shared/utils/labNotes'
import type { GoalComparator, GoalStatus, MarkerGoal } from '#shared/utils/markerGoals'
import {
  GOAL_COMPARATORS, STATUS_WORD, VERDICT_WORD, cycleGoalSummary, goalLabel, goalVerdict, goalsForCycle, isTrendGoal
} from '#shared/utils/markerGoals'
import { adherencePctClass } from '~/utils/adherence'

const route = useRoute()
const { isOwner } = await useAuth()

const { data, refresh, error } = await useCycles()
const { data: journalData } = await useJournalEntries()
const { data: labsData } = await useLabsEntries()
const { data: healthData } = await useHealthMetricsEntries()
const { data: plannedData } = await usePlannedDraws()
// The marker goals and what a verdict needs beside the draws: the caveats (which medication
// skews which marker) and the protocol's spans (when it ran) — a reading drawn on one is
// confounded and decides nothing (audit #43 item 60).
const { data: goalsData, refresh: refreshGoals } = await useMarkerGoals()
const { rules: protocolRules, standing: protocolStanding } = await useProtocol()
const { data: labNotes } = await useLabNotes()

const cycleForm = useTemplateRef('cycleForm')

// Reactive: a dossier left open overnight used to keep yesterday as today — END TODAY wrote
// yesterday's date, and the day count and checkpoints sat a day behind until a reload.
const today = useToday()
const cycle = computed(() => (data.value ?? []).find(c => c.id === Number(route.params.id)) ?? null)
const entries = computed(() => journalData.value ?? [])
// Blood draws only: an echo-only row is a scan, never a lab checkpoint (isEchoOnly).
const draws = computed(() => [...(labsData.value ?? [])].filter(e => !isEchoOnly(e)).sort((a, b) => a.date.localeCompare(b.date)))

const status = computed(() => cycle.value ? cycleStatusOn(cycle.value, today.value) : 'upcoming')
const endDate = computed(() => cycle.value ? cycleEnd(cycle.value) : today.value)
const progress = computed(() => cycle.value ? cycleProgress(cycle.value, today.value) : null)
const totalWeeks = computed(() => progress.value?.totalWeeks ?? 0)

const STATUS_CHIP: Record<string, string> = {
  active: 'text-accent border-line-accent',
  upcoming: 'text-hi border-line-soft',
  tentative: 'text-dim border-line-soft',
  done: 'text-muted border-line-soft'
}

/** "Oct 2026"/"Q4 2026" while the start is only pencilled in, else null. */
const tentativeStart = computed(() => cycle.value ? tentativeStartLabel(cycle.value) : null)

const chipKey = computed(() => tentativeStart.value ? 'tentative' : status.value)

const statusLabel = computed(() => {
  if (!cycle.value) return ''
  if (tentativeStart.value) return `${tentativeStart.value.toUpperCase()} · NO DATE SET`
  if (status.value === 'active') return `DAY ${progress.value!.day}/${progress.value!.totalDays} · WK ${progress.value!.week} OF ${totalWeeks.value}`
  if (status.value === 'upcoming') return `STARTS IN ${diffDays(today.value, cycle.value.start_date)}D`
  return `DONE · ${progress.value!.totalDays}D`
})

// The headline stat cell. A tentative cycle has no countdown to show, so the length of the
// plan is the one number that's actually settled.
const progressStat = computed(() => {
  if (!cycle.value) return ''
  if (tentativeStart.value) return durationLabel(cycle.value).toUpperCase()
  if (status.value === 'upcoming') return `${diffDays(today.value, cycle.value.start_date)}D`
  if (status.value === 'active') return `${progress.value!.pct}%`
  // A day-exact plan reports days: "2 WKS" would overstate a run that ends on day 10.
  return cycle.value.planned_days != null ? `${cycle.value.planned_days} DAYS` : `${totalWeeks.value} WKS`
})

// --- adherence (cycle rules only, finished runs included) ---

const adherence = computed(() =>
  cycle.value ? cycleAdherence(entries.value, cycle.value, today.value) : { rows: [], pct: null }
)

// The scorer runs start-week → current week; for a finished cycle that tail is all dead
// cells, so the display clips to the weeks the cycle actually spans.
const adherenceRows = computed(() => {
  if (!cycle.value) return []
  const firstWeek = shiftDays(cycle.value.start_date, -6)
  return adherence.value.rows.map(row => ({
    ...row,
    weeks: row.weeks.filter(w => w.weekStart >= firstWeek && w.weekStart <= endDate.value)
  }))
})

// --- plan timeline bars ---

const planBars = computed(() => {
  if (!cycle.value) return []
  const weeks = totalWeeks.value
  return cycle.value.compounds.map((item) => {
    const from = item.fromWeek
    const to = Math.min(item.toWeek ?? weeks, weeks)
    return {
      compound: item.compound,
      left: ((from - 1) / weeks) * 100,
      width: Math.max(((to - from + 1) / weeks) * 100, 2),
      label: `${doseLabelOf(item)} · wks ${from}–${to}`,
      title: `${item.compound} ${doseLabelOf(item)} · weeks ${from}–${to}`
    }
  })
})

const nowLeft = computed(() => {
  if (!cycle.value || !progress.value || status.value === 'upcoming') return null
  return status.value === 'done' ? null : (progress.value.day / progress.value.totalDays) * 100
})

// --- planned-vs-logged exposure overlay ---
// Same Bateman engine as the compounds page, run twice per modeled compound: once on the
// synthetic plan doses, once on the real dose log. Both normalize against the same peak so
// divergence reads as deviation, not scale mismatch. Orals (Anavar) have no PK model — the
// spike comb says nothing — so they appear in adherence and the plan bars only.

const RUN_IN_DAYS = 14

const overlayRows = computed(() => {
  if (!cycle.value) return []
  // The x-axis here is real calendar dates, so a tentative start would draw peaks on days
  // nobody committed to. plannedDoses itself stays honest for stock coverage (the totals are
  // week-relative); it's this dated view that has to sit out until a day is picked.
  if (tentativeStart.value) return []
  const from = shiftDays(cycle.value.start_date, -RUN_IN_DAYS)
  const to = endDate.value
  const actualCap = today.value < to ? today.value : to
  const rows: Array<{ compound: string, planned: Array<{ date: string, pct: number }>, actual: Array<{ date: string, pct: number }> }> = []

  for (const compound of new Set(cycle.value.compounds.map(c => c.compound))) {
    const model = PK_MODELS[compound]
    if (!model) continue

    // The model converts plan amounts into its own unit (a mcg row fed raw was 1000×).
    const plan = plannedDoses(cycle.value, compound, model)
    const plannedPoints = exposureSeries(plan, model, from, to)

    const logged = pkDosesFor(entries.value, compound, model)
    const actualPoints = logged.length ? exposureSeries(logged, model, from, actualCap) : []

    const peak = Math.max(...plannedPoints.map(p => p.level), ...actualPoints.map(p => p.level), 0)
    if (peak <= 0) continue
    const pct = (p: { date: string, level: number }) => ({ date: p.date, pct: Math.round((p.level / peak) * 1000) / 10 })
    rows.push({ compound, planned: plannedPoints.map(pct), actual: actualPoints.map(pct) })
  }
  return rows
})

const overlayChart = computed(() => {
  const rows = overlayRows.value
  if (!cycle.value || !rows.length) return { data: [], categories: {} as Record<string, { name: string, color: string }> }

  const categories: Record<string, { name: string, color: string }> = {}
  rows.forEach((row, i) => {
    // Plan first so the logged line draws over it. '59' ≈ 35% alpha of the compound color.
    categories[`p${i}`] = { name: `${row.compound} · plan`, color: `${getCompoundColor(row.compound)}59` }
    if (row.actual.length) categories[`a${i}`] = { name: row.compound, color: getCompoundColor(row.compound) }
  })

  const from = shiftDays(cycle.value.start_date, -RUN_IN_DAYS)
  const days = diffDays(from, endDate.value) + 1
  const data = Array.from({ length: days }, (_, idx) => {
    const date = shiftDays(from, idx)
    // ISO day: AreaChart formats the axis (and adds ’yy across a year boundary).
    const point: Record<string, unknown> = { date }
    rows.forEach((row, i) => {
      point[`p${i}`] = row.planned[idx]?.pct
      if (row.actual.length) point[`a${i}`] = row.actual[idx]?.pct
    })
    return point
  })
  return { data, categories }
})

const overlayMarks = computed(() => {
  if (!cycle.value) return []
  const from = shiftDays(cycle.value.start_date, -RUN_IN_DAYS)
  const drawMarks = draws.value
    .filter(d => d.date >= from && d.date <= endDate.value)
    .map(d => d.date)
  return [cycle.value.start_date, ...drawMarks]
})

const unmodeledNote = computed(() => {
  if (!cycle.value) return ''
  const skipped = [...new Set(cycle.value.compounds.map(c => c.compound))].filter(c => !PK_MODELS[c])
  return skipped.length
    ? ` ${skipped.join(', ')}: no exposure model (cleared in hours — the dose log is the whole story).`
    : ''
})

// --- lab checkpoints + gating-marker diffs ---

interface GatingChip {
  key: string
  text: string
  class: string
}

const CP_CLASSES: Record<string, string> = {
  done: 'text-accent',
  due: 'text-hi',
  missed: 'text-warn',
  upcoming: 'text-muted'
}

const checkpoints = computed(() => {
  if (!cycle.value) return []
  const states = checkpointStates(cycle.value, draws.value.map(d => d.date), today.value)
  const baselineDate = states.find(s => s.key === 'baseline')?.drawDate ?? null
  return states.map(cp => ({
    ...cp,
    chips: cp.drawDate ? gatingChips(cp.drawDate, cp.key === 'baseline' ? null : baselineDate) : []
  }))
})

function statusClassOf(key: string, value: number): string {
  const meta = BIOMARKERS[key]
  const s = meta ? getStatus(value, meta) : 'normal'
  if (s === 'high') return 'text-danger'
  if (s === 'low') return 'text-warn'
  return s === 'optimal' ? 'text-accent' : 'text-dim'
}

function fmtVal(v: number): string {
  return Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 1 : 0)
}

/** "HDL 42→38" per gating marker, colored by where the new value stands. */
function gatingChips(drawDate: string, baselineDate: string | null): GatingChip[] {
  const draw = draws.value.find(d => d.date === drawDate)
  if (!draw) return []
  const baseline = baselineDate ? draws.value.find(d => d.date === baselineDate) : null
  const chips: GatingChip[] = []
  for (const key of GATING_MARKERS) {
    const value = draw.markers[key]
    if (value == null) continue
    const label = BIOMARKERS[key]?.label ?? key
    const prior = baseline?.markers[key]
    chips.push({
      key,
      text: prior != null ? `${label} ${fmtVal(prior)}→${fmtVal(value)}` : `${label} ${fmtVal(value)}`,
      class: statusClassOf(key, value)
    })
  }
  return chips
}

// --- marker goals ---
const caveatSpans = computed(() => [...protocolRules.value, ...protocolStanding.value])
const goalVerdicts = computed(() => {
  if (!cycle.value) return []
  const caveats = labNotes.value?.caveats ?? {}
  return goalsForCycle(goalsData.value ?? [], cycle.value.id)
    .map(g => goalVerdict(g, draws.value, today.value, date => caveatCompoundOn(caveats, g.marker, date, caveatSpans.value)))
})
const goalSummary = computed(() => cycleGoalSummary(goalVerdicts.value))
const STATUS_CLASS: Record<GoalStatus, string> = { 'met': 'text-accent', 'not-met': 'text-danger', 'insufficient': 'text-muted', 'confounded': 'text-warn' }
const VERDICT_CLASS: Record<string, string> = { 'go': 'text-accent', 'no-go': 'text-danger', 'undecided': 'text-muted' }

const MARKER_ITEMS = Object.entries(BIOMARKERS).map(([value, m]) => ({ label: m.label, value })).sort((a, b) => a.label.localeCompare(b.label))
const COMPARATOR_ITEMS = GOAL_COMPARATORS.map(c => ({ label: c.label, value: c.value }))
const SCOPE_ITEMS = [
  { label: 'This cycle', value: 'cycle' },
  { label: 'Standing — gates every cycle', value: 'standing' }
]

interface GoalForm {
  id?: number
  marker: string
  comparator: GoalComparator
  target: number | ''
  by_date: string
  scope: 'cycle' | 'standing'
  stated: string
  note: string
}

function emptyGoal(): GoalForm {
  return { id: undefined, marker: 'hematocrit', comparator: 'falling', target: '', by_date: '', scope: 'cycle', stated: today.value, note: '' }
}

const goalModalRaw = ref(false)
const goalForm = reactive<GoalForm>(emptyGoal())
const goalGuard = useDirtyGuard(() => goalForm)
const goalModalOpen = goalGuard.guardOpen(goalModalRaw)
const goalIsTrend = computed(() => isTrendGoal(goalForm.comparator))
const goalValid = computed(() => !!goalForm.marker && !!goalForm.stated && (goalIsTrend.value || goalForm.target !== ''))

function openGoal(g: MarkerGoal | null) {
  Object.assign(goalForm, emptyGoal(), g
    ? { id: g.id, marker: g.marker, comparator: g.comparator, target: g.target ?? '', by_date: g.by_date ?? '', scope: g.cycle_id == null ? 'standing' : 'cycle', stated: g.stated, note: g.note ?? '' }
    : {})
  goalGuard.markClean()
  goalModalOpen.value = true
}

const { run: saveGoal, pending: savingGoal } = useSaveAction(async () => {
  await $fetch('/api/journal/goals/save', {
    method: 'POST',
    body: {
      id: goalForm.id,
      marker: goalForm.marker,
      comparator: goalForm.comparator,
      target: goalIsTrend.value ? null : goalForm.target,
      by_date: goalForm.by_date || null,
      cycle_id: goalForm.scope === 'cycle' ? cycle.value?.id ?? null : null,
      stated: goalForm.stated,
      note: goalForm.note || null
    }
  })
  await refreshGoals()
  goalGuard.markClean()
  goalModalOpen.value = false
}, { success: () => (goalForm.id ? 'Goal updated' : 'Goal added') })

// The confirm sits outside the save action (a Cancel inside it would still toast).
async function confirmDeleteGoal(g: MarkerGoal) {
  if (!confirm(`Delete the goal "${goalLabel(g, BIOMARKERS[g.marker])}"?`)) return
  await deleteGoal(g)
}
const { run: deleteGoal } = useSaveAction(async (g: MarkerGoal) => {
  await $fetch('/api/journal/goals/delete', { method: 'POST', body: { id: g.id } })
  await refreshGoals()
}, { success: () => 'Goal deleted' })

const nextCheckpointLabel = computed(() => {
  if (tentativeStart.value) return 'baseline draw · before you start'
  const next = checkpoints.value.find(cp => cp.state === 'due' || cp.state === 'upcoming')
  if (!next) return '—'
  // A draw already booked for the window — by its checkpoint link, or just dated inside it —
  // beats the window itself: "booked Nov 14 · Quest" answers the question the window only asks.
  const plans = plannedData.value ?? []
  const booked = (cycle.value?.id != null ? checkpointPlan(plans, cycle.value.id, next.key) : null)
    ?? planInWindow(plans, next.windowFrom, next.windowTo)
  if (booked) return `${next.label} · booked ${formatDate(booked.date, 'monthDay')}${booked.lab ? ` · ${booked.lab}` : ''}`
  return `${next.label} · ${formatDate(next.windowFrom, 'monthDay')}–${formatDate(next.windowTo, 'monthDay')}`
})

/**
 * With no committed start there is no dated checkpoint window, so the answerable question is
 * whether a fresh enough draw is in hand to serve as baseline whenever the run begins.
 * Mirrors the home strip's tentative draw line.
 */
const baselineAdvice = computed(() => {
  const last = draws.value.at(-1) ?? null
  if (!last) return { text: 'No draw on file — get a baseline before you start.', class: 'text-warn' }
  const age = diffDays(last.date, today.value)
  return age <= BASELINE_LOOKBACK_DAYS
    ? { text: `The ${formatDate(last.date, 'monthDay')} draw is ${age}d old — it still works as a baseline if you start within ${BASELINE_LOOKBACK_DAYS}d of it.`, class: 'text-muted' }
    : { text: `Last draw was ${age}d ago — get a fresh baseline before you start.`, class: 'text-warn' }
})

// --- passive vitals watch (shared/utils/cycleSignals) ---

const signals = computed(() =>
  cycle.value ? computeCycleSignals(cycle.value, today.value, entries.value, healthData.value ?? []) : []
)

/** "5h42m" for sleep, plain numbers elsewhere — minutes-as-a-number reads worse than it is. */
function fmtSignalValue(s: CycleSignal, v: number): string {
  if (s.key === 'sleep') {
    // Round the total BEFORE splitting: floor/round separately turned 419.7 into "6h60m".
    const total = Math.round(v)
    return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}m`
  }
  return v.toFixed(s.decimals)
}

const CHIP: Record<string, { text: string, cls: string }> = {
  'flagged': { text: '⚠ FLAG', cls: 'text-danger' },
  'watch-adverse': { text: 'WATCH', cls: 'text-warn' },
  'watch-good': { text: 'IMPROVED', cls: 'text-accent' },
  'steady': { text: 'STEADY', cls: 'text-muted' },
  'baseline': { text: 'BASELINE', cls: 'text-dim' },
  'no-data': { text: 'SPARSE', cls: 'text-ghost' }
}

const signalRows = computed(() => {
  const rows = signals.value.map((s) => {
    const chipKey = s.state === 'watch' ? (s.adverse ? 'watch-adverse' : 'watch-good') : s.state
    const chip = CHIP[chipKey]!
    const unit = s.key === 'sleep' ? '' : ` ${s.unit}`
    const reading = s.baseline != null && s.current != null
      ? `${fmtSignalValue(s, s.baseline)} → ${fmtSignalValue(s, s.current)}${unit}`
      : s.baseline != null
        ? `${fmtSignalValue(s, s.baseline)}${unit}`
        : '—'
    const rate = s.key === 'weight' && s.ratePerWeek != null && Math.abs(s.ratePerWeek) >= 1
      ? ` · ${s.ratePerWeek > 0 ? '+' : ''}${s.ratePerWeek}/wk`
      : ''
    const deltaText = s.delta != null
      ? `${s.delta > 0 ? '+' : ''}${s.key === 'sleep' ? `${s.delta}m` : `${s.delta}${unit}`}${rate}`
      : '—'
    return {
      key: s.key,
      label: s.label,
      spark: s.spark,
      sparkStartIdx: s.sparkStartIdx,
      sparkColor: s.state === 'flagged' ? CHART_DANGER : s.state === 'watch' && s.adverse ? CHART_WARN : CHART_ACCENT,
      reading,
      deltaText,
      deltaClass: chip.cls,
      chip: chip.text,
      chipClass: chip.cls
    }
  })
  // A page of SPARSE rows says nothing — hide the section until any metric has a window.
  return signals.value.some(s => s.state !== 'no-data') ? rows : []
})

const weightStat = computed(() => {
  const w = signals.value.find(s => s.key === 'weight')
  if (!w) return { value: '—', sub: null as string | null }
  if (status.value === 'upcoming') {
    return w.baseline != null
      ? { value: `${w.baseline} lbs`, sub: 'pre-start baseline (4 wks)' }
      : { value: '—', sub: null }
  }
  if (w.delta == null) return { value: '—', sub: null }
  const rate = w.ratePerWeek != null && Math.abs(w.ratePerWeek) >= 1 ? ` · ${w.ratePerWeek > 0 ? '+' : ''}${w.ratePerWeek} lbs/wk` : ''
  return {
    value: `${w.delta > 0 ? '+' : ''}${w.delta} lbs`,
    sub: `vs 4 wks pre-start${rate}`
  }
})

// --- owner actions ---

/** Ending early keeps every logged week as history; status flips to done by date math. */
async function endToday() {
  if (!cycle.value) return
  if (!confirm(`End ${cycle.value.name} today? The plan called for ${formatDate(plannedEndOf(cycle.value))}.`)) return
  await saveEnd(today.value)
}

async function clearEnd() {
  if (!cycle.value) return
  await saveEnd(null)
}

function plannedEndOf(c: Cycle): string {
  return shiftDays(c.start_date, cycleSpanDays(c) - 1)
}

const { run: saveEnd } = useSaveAction(async (actualEnd: string | null) => {
  await $fetch('/api/journal/cycles/save', {
    method: 'POST',
    body: { ...cycle.value!, actual_end: actualEnd }
  })
  await refresh()
}, { error: 'Update failed', success: (_, actualEnd) => actualEnd ? 'Cycle ended' : 'Back on plan' })

useSeoMeta({ title: () => `Cycle · ${cycle.value?.name ?? ''}` })
</script>
