<template>
  <div class="bg-raised border border-line-soft px-3.5 py-2.5">
    <!-- The hub's one-row widget, laid out like the soda one beside it: today against the goal,
         a 30-day strip, and the one-tap quick-add. -->
    <div class="flex items-center gap-4">
      <div class="shrink-0">
        <p class="tui-label">
          Water
        </p>
        <p class="leading-none mt-0.5">
          <span
            class="num-display text-head"
            :class="metGoal ? 'text-accent' : 'text-hi'"
          >{{ fmtOz(todayOz) }}</span><span class="text-micro text-muted"> / {{ fmtOz(goalOz) }} oz</span>
        </p>
      </div>

      <!-- Same floor + truncating label as the soda strip: the quick-add label is the one thing
           in this row that can't wrap, and the grid this sits in sizes to min-content. -->
      <div class="flex-1 min-w-16 flex items-end gap-0.5 h-6.5">
        <div
          v-for="day in days"
          :key="day.date"
          class="flex-1 bg-water"
          :class="day.oz ? '' : 'opacity-40'"
          :style="{ height: `${day.height}%` }"
          :title="day.title"
        />
      </div>

      <button
        v-if="!readonly"
        type="button"
        class="tui-btn tui-btn-accent min-w-0"
        :disabled="adding"
        :title="`+ ${quickAddLabel}`"
        @click="quickAdd(cupOz)"
      >
        <span class="truncate min-w-0">{{ adding ? 'LOGGING…' : `+ ${quickAddLabel}` }}</span>
      </button>
      <button
        v-if="!readonly"
        type="button"
        class="shrink-0 text-micro text-faint hover:text-accent cursor-pointer"
        :aria-label="panelOpen ? 'Hide water options' : 'Log a different amount, undo a pour, or change the cup and goal'"
        :aria-expanded="panelOpen"
        @click="panelOpen = !panelOpen"
      >
        {{ panelOpen ? '▴' : '▾' }}
      </button>
    </div>

    <!-- Goal progress: the number above says how much, this says how far. -->
    <div
      class="mt-2 h-0.5 bg-inset"
      role="progressbar"
      :aria-valuenow="Math.round(todayOz)"
      aria-valuemin="0"
      :aria-valuemax="goalOz"
      aria-label="Water today against the daily goal"
    >
      <div
        class="h-full bg-water transition-[width] duration-300"
        :style="{ width: `${Math.round(progress * 100)}%` }"
      />
    </div>
    <p
      v-if="todayWater.length"
      class="mt-1 text-micro text-muted"
    >
      {{ todayWater.length }} pour{{ todayWater.length === 1 ? '' : 's' }} · last {{ lastPour?.time || '—' }}
      <template v-if="metGoal">
        · <span class="text-accent">goal met</span>
      </template>
    </p>

    <div
      v-if="panelOpen && !readonly"
      class="mt-3 pt-3 border-t border-line-soft space-y-3"
    >
      <!-- A different amount: the bottle at the gym, the glass with dinner. -->
      <div class="flex items-end gap-2.5">
        <UFormField
          label="OUNCES"
          class="flex-1"
        >
          <UInput
            v-model.number="customOz"
            type="number"
            inputmode="decimal"
            min="1"
            :max="WATER_MAX_OZ_PER_ENTRY"
            step="1"
            class="w-full"
          />
        </UFormField>
        <button
          type="button"
          class="tui-btn tui-btn-accent"
          :disabled="adding || !isValidOz(customOz)"
          @click="quickAdd(customOz, true)"
        >
          {{ adding ? 'LOGGING…' : '+ LOG THIS' }}
        </button>
      </div>

      <!-- Cup + goal live in the profile (owner-only writes, like blood type); the demo sandbox
           runs on the defaults, so the settings are hidden rather than failing on save. -->
      <div
        v-if="isOwner"
        class="grid grid-cols-2 gap-2.5 items-end"
      >
        <UFormField
          label="CUP (oz)"
          help="what one + CUP tap logs — less than the cup's size once it's full of ice"
          :ui="{ help: 'text-micro text-faint' }"
        >
          <UInput
            v-model.number="cupDraft"
            type="number"
            inputmode="decimal"
            min="1"
            max="128"
            step="0.5"
            class="w-full"
          />
        </UFormField>
        <UFormField label="GOAL (oz / day)">
          <UInput
            v-model.number="goalDraft"
            type="number"
            inputmode="numeric"
            min="8"
            max="400"
            step="1"
            class="w-full"
          />
        </UFormField>
        <div class="col-span-2 flex justify-end">
          <button
            type="button"
            class="tui-btn"
            :disabled="savingSettings || !settingsDirty || !settingsValid"
            @click="saveSettings"
          >
            {{ savingSettings ? 'SAVING…' : 'SAVE CUP + GOAL' }}
          </button>
        </div>
      </div>

      <!-- Today's pours, each with its undo. In the panel rather than the row: eight taps a day
           would otherwise push the Whoop strip below the fold. -->
      <div
        v-if="todayWater.length"
        class="pt-2.5 border-t border-line-soft"
      >
        <div
          v-for="(w, i) in todayWater"
          :key="i"
          class="flex items-baseline gap-3 px-1.5 py-1 text-small"
          :class="i % 2 ? 'bg-inset' : ''"
        >
          <span class="text-faint shrink-0">{{ w.time }}</span>
          <span class="text-hi">{{ fmtOz(w.oz) }} oz</span>
          <button
            type="button"
            class="ml-auto shrink-0 text-meta text-faint hover:text-danger cursor-pointer disabled:opacity-50"
            :disabled="removingIndex !== null"
            :aria-label="`Remove the ${w.time} pour`"
            @click="remove(i)"
          >
            {{ removingIndex === i ? '⋯' : '✕' }}
          </button>
        </div>
      </div>
      <p
        v-else
        class="text-small text-muted"
      >
        Nothing logged today.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Water tracker: the sibling of the soda widget, for the cup Jim refills all day at work and
// never had a count for. One tap logs a cup; the ▾ panel takes an odd amount, undoes a pour, and
// (owner) sets the cup size and the daily goal, which live in the profile table. Writes go
// through /api/journal/water and are reflected into the shared journal store, so the entry form,
// the ledger and the status line all move with each tap.
import { WATER_DEFAULT_CUP_OZ, WATER_DEFAULT_GOAL_OZ, WATER_MAX_OZ_PER_ENTRY, fmtOzValue, waterProgress, waterSetting, waterTotals } from '#shared/utils/water'
import type { WaterEntry } from '~/data/journal'

withDefaults(defineProps<{
  readonly?: boolean
}>(), { readonly: false })

const toast = useToast()
const { isOwner } = await useAuth()
const { data } = await useJournalEntries()
const { data: profileData, refresh: refreshProfile } = await useProfile()
const entries = computed(() => data.value ?? [])
const profile = computed(() => profileData.value ?? {})

// Settings with defaults: the sandbox and a fresh profile both get a working tracker.
const goalOz = computed(() => waterSetting(profile.value, 'water_goal_oz', WATER_DEFAULT_GOAL_OZ))
const cupOz = computed(() => waterSetting(profile.value, 'cup_oz', WATER_DEFAULT_CUP_OZ))

// Home-timezone, REACTIVE today (see SodaTracker.vue for the 7am stale-list bug this avoids).
const today = useToday()

const todayWater = computed<WaterEntry[]>(() =>
  entries.value.find(e => e.date === today.value)?.water ?? []
)
const todayOz = computed(() => waterTotals(todayWater.value).oz)
const progress = computed(() => waterProgress(todayOz.value, goalOz.value))
const metGoal = computed(() => todayOz.value >= goalOz.value)
const lastPour = computed(() => [...todayWater.value].sort((a, b) => a.time.localeCompare(b.time)).at(-1) ?? null)

/** "CUP 12oz" — what the one-tap button will log. */
const quickAddLabel = computed(() => `CUP ${fmtOz(cupOz.value)}oz`)

/** 12 → "12", 8.5 → "8.5" — the unit is written by the caller. */
// The bare figure; shared/utils/water.ts fmtWaterOz adds the unit for the prompt builders.
const fmtOz = fmtOzValue

function isValidOz(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= WATER_MAX_OZ_PER_ENTRY
}

const panelOpen = ref(false)
const customOz = ref<number | ''>(16)
const adding = ref(false)

// Reassigns `data.value` rather than mutating in place, so useAsyncData's reactivity sees it.
function applyWaterLocally(date: string, water: WaterEntry[]) {
  patchJournalDay(data, date, { water })
}

async function quickAdd(oz: number | '', fromPanel = false) {
  if (!isValidOz(oz)) return
  adding.value = true
  const date = today.value
  try {
    const { water } = await $fetch<{ water: WaterEntry[] }>('/api/journal/water', {
      method: 'POST',
      body: { date, time: localTimeNow(), oz }
    })
    applyWaterLocally(date, water)
    // The status line's "water N oz" reads the scalar shell summary, not this list.
    await refreshNuxtData('overview')
    if (fromPanel) panelOpen.value = false
  }
  catch (err) {
    toast.add({ title: 'Failed to log water', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  finally {
    adding.value = false
  }
}

const removingIndex = ref<number | null>(null)

async function remove(index: number) {
  if (removingIndex.value !== null) return
  removingIndex.value = index
  const date = today.value
  try {
    const { water } = await $fetch<{ water: WaterEntry[] }>('/api/journal/water', {
      method: 'DELETE',
      query: { date, index }
    })
    applyWaterLocally(date, water)
    await refreshNuxtData('overview')
  }
  catch (err) {
    toast.add({ title: 'Failed to remove', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  finally {
    removingIndex.value = null
  }
}

// --- cup + goal (owner) ---
// Drafts follow the saved values until edited, so a refresh elsewhere doesn't wipe typing.
const cupDraft = ref<number | ''>(cupOz.value)
const goalDraft = ref<number | ''>(goalOz.value)
watch(cupOz, (v) => {
  if (!settingsDirty.value) cupDraft.value = v
})
watch(goalOz, (v) => {
  if (!settingsDirty.value) goalDraft.value = v
})

const settingsDirty = computed(() => cupDraft.value !== cupOz.value || goalDraft.value !== goalOz.value)
const settingsValid = computed(() =>
  typeof cupDraft.value === 'number' && cupDraft.value >= 1 && cupDraft.value <= 128
  && typeof goalDraft.value === 'number' && goalDraft.value >= 8 && goalDraft.value <= 400
)
const savingSettings = ref(false)

async function saveSettings() {
  if (!settingsDirty.value || !settingsValid.value) return
  savingSettings.value = true
  try {
    const writes: Promise<unknown>[] = []
    if (cupDraft.value !== cupOz.value) {
      writes.push($fetch('/api/journal/profile', { method: 'POST', body: { key: 'cup_oz', value: String(cupDraft.value) } }))
    }
    if (goalDraft.value !== goalOz.value) {
      writes.push($fetch('/api/journal/profile', { method: 'POST', body: { key: 'water_goal_oz', value: String(goalDraft.value) } }))
    }
    await Promise.all(writes)
    await refreshProfile()
    toast.add({ title: 'Water settings saved', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Could not save water settings', description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
  }
  finally {
    savingSettings.value = false
  }
}

// --- 30-day strip ---
const WINDOW_DAYS = 30
/** Zero days keep a visible stub so the timeline reads evenly (same as the soda strip). */
const BAR_MIN_PCT = 6

/** Per-day ounces across the trailing window, scaled so a goal day fills the strip. */
const days = computed(() => {
  const byDate = new Map<string, { oz: number, count: number }>()
  for (const e of entries.value) {
    const t = waterTotals(e.water)
    if (t.count) byDate.set(e.date, t)
  }
  const series = trailingDays(today.value, WINDOW_DAYS).map((date) => {
    const t = byDate.get(date)
    return { date, oz: t?.oz ?? 0, count: t?.count ?? 0 }
  })
  // The goal is the full-height reference; a bigger day still fits.
  const max = Math.max(goalOz.value, ...series.map(d => d.oz))
  return series.map(d => ({
    ...d,
    height: d.oz ? Math.max(BAR_MIN_PCT, Math.round((d.oz / max) * 100)) : BAR_MIN_PCT,
    title: `${formatDate(d.date, 'monthDay')} · ${d.oz ? `${fmtOz(d.oz)} oz, ${d.count} pour${d.count === 1 ? '' : 's'}` : 'none logged'}`
  }))
})
</script>
