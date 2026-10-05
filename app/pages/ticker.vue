<template>
  <div class="px-4 sm:px-6 py-4 max-w-3xl mx-auto">
    <TuiHeader
      label="TICKER · RESIDENT COMPANION"
      :dashes="8"
    >
      <span class="text-[10.5px] text-muted normal-case">it lives off the data you already log — nothing here to maintain</span>
    </TuiHeader>

    <!-- Stage -->
    <div
      ref="stage"
      class="relative mt-3 h-60 bg-raised border border-line-soft overflow-hidden"
    >
      <div
        class="absolute bottom-9 left-1/2 transition-none"
        :style="{ transform: `translateX(calc(-50% + ${x}px)) scaleX(${facing})` }"
      >
        <TickerCompanion
          ref="pet"
          size="lg"
          full
          :rhr="rhr"
          :sluggish="sluggish && !poseOverride"
          :pose-override="poseOverride"
          aria-label="Pet TICKER"
          :caption="caption"
          @open="petIt"
        />
      </div>

      <!-- floating hearts from petting -->
      <span
        v-for="h in heartParticles"
        :key="h.id"
        class="pet-heart"
        :style="{ left: `calc(50% + ${h.x}px)` }"
        aria-hidden="true"
      >♥</span>

      <!-- the pet's last remark -->
      <p
        class="absolute left-3 bottom-2.5 text-[11.5px] text-muted truncate max-w-[calc(100%-1.5rem)]"
        aria-live="polite"
      >
        {{ line }}
      </p>
    </div>

    <!-- Actions -->
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="tui-btn tui-btn-accent disabled:opacity-50"
        :disabled="busy"
        @click="petIt"
      >
        ♥ PET
      </button>
      <button
        type="button"
        class="tui-btn disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="busy || !dosesToday.length"
        :title="dosesToday.length ? undefined : 'Nothing logged today yet — TICKER only eats what the journal says'"
        @click="feed"
      >
        ⊳ FEED{{ dosesToday.length ? ` · ${dosesToday.length}` : '' }}
      </button>
      <button
        type="button"
        class="tui-btn disabled:opacity-50"
        :disabled="busy"
        @click="walk"
      >
        ⊳ WALK{{ workoutMinutes ? ` · ${workoutMinutes}m` : '' }}
      </button>
      <span class="ml-auto text-[10.5px] text-faint">derived from today's journal — feeding and walking replay what's logged</span>
    </div>

    <!-- Stats -->
    <div class="mt-3 grid grid-cols-2 sm:grid-cols-5 border border-line-soft divide-x divide-line-soft bg-raised text-center">
      <div
        v-for="s in stats"
        :key="s.label"
        class="px-2 py-2.5"
      >
        <p class="tui-label">
          {{ s.label }}
        </p>
        <p class="mt-1 text-[13px] text-hi num-display">
          {{ s.value }}
        </p>
        <p
          v-if="s.hint"
          class="mt-0.5 text-[10px] text-faint"
        >
          {{ s.hint }}
        </p>
      </div>
    </div>

    <p class="mt-2.5 text-[11.5px] leading-[1.7] text-muted">
      TICKER's day, read from the data: {{ todaySummary }}
    </p>
  </div>
</template>

<script setup lang="ts">
// The resident companion as a pet. Everything it feels is DERIVED from streams that already
// exist — doses fed, workouts walked, sodas regretted, sleep slept — so there is nothing to
// forget to do. Petting is the one pure interaction; its only state is a local counter.
import { loggedStreak } from '#shared/utils/journalLog'
import { diffDays, shiftDays } from '#shared/utils/dates'
import type { TickerPose } from '#shared/utils/tickerSprite'

useSeoMeta({ title: 'Ticker' })

const { role } = await useAuth()
const { data: overview } = useOverviewSummary(role)
const { data: journalData } = await useJournalEntries()
const { data: healthData } = await useHealthMetricsEntries()
const { data: workoutsData } = await useWorkoutsEntries()
const today = useToday()

const entries = computed(() => journalData.value ?? [])
const rhr = computed(() => overview.value?.latestRhr ?? null)

// --- today, as the pet experiences it ---------------------------------------------------------

const todayEntry = computed(() => entries.value.find(e => e.date === today.value) ?? null)
const sodasToday = computed(() => (todayEntry.value?.sodas ?? []).length)

// Meals and walks fall back ONE day when today is still empty: mornings start unlogged, and the
// demo persona's data always ends yesterday — a pet that can never be fed is a sad showcase.
const yesterday = computed(() => shiftDays(today.value, -1))
const mealDay = computed(() => {
  if (todayEntry.value?.peptides?.length) return today.value
  const y = entries.value.find(e => e.date === yesterday.value)
  return y?.peptides?.length ? yesterday.value : today.value
})
const mealIsYesterday = computed(() => mealDay.value !== today.value)
const dosesToday = computed(() => entries.value.find(e => e.date === mealDay.value)?.peptides ?? [])

const minutesOn = (date: string) => Math.round(
  (workoutsData.value ?? []).filter(w => w.date === date).reduce((s, w) => s + (w.duration_min ?? 0), 0)
)
const walkDay = computed(() => minutesOn(today.value) > 0 ? today.value : yesterday.value)
const walkIsYesterday = computed(() => walkDay.value !== today.value && minutesOn(walkDay.value) > 0)
const workoutMinutes = computed(() => minutesOn(walkDay.value))

const latestHealth = computed(() => (healthData.value ?? []).at(-1) ?? null)
const recovery = computed(() => latestHealth.value?.recovery_score ?? null)
const sluggish = computed(() => (latestHealth.value?.sleep_total_min ?? 420) < 420)

const streak = computed(() => loggedStreak(entries.value, today.value))

const weight = computed(() => {
  for (let i = entries.value.length - 1; i >= 0; i--) {
    const w = entries.value[i]?.weight_lbs
    if (w != null) return w
  }
  return null
})

/** Days since the first recorded anything — the pet's age. */
const ageDays = computed(() => {
  const firsts = [entries.value[0]?.date, (healthData.value ?? [])[0]?.date, (workoutsData.value ?? [])[0]?.date]
    .filter((d): d is string => !!d)
  if (!firsts.length) return null
  return diffDays(firsts.sort()[0]!, today.value)
})

// --- mood: the held pose between interactions -------------------------------------------------

const heldPose = computed<TickerPose | null>(() => {
  if (sluggish.value) return null // the sluggish prop draws the coffee slump itself
  if (sodasToday.value >= 3) return 'worried'
  if (recovery.value != null && recovery.value >= 80) return 'happy'
  if (recovery.value != null && recovery.value < 34) return 'worried'
  return null
})

const moodWord = computed(() => {
  if (sluggish.value) return 'sleepy'
  if (sodasToday.value >= 3) return 'queasy'
  if (recovery.value != null && recovery.value >= 80) return 'great'
  if (recovery.value != null && recovery.value < 34) return 'rough'
  return 'steady'
})

// --- actions ----------------------------------------------------------------------------------

const pet = useTemplateRef('pet')
const stage = ref<HTMLElement | null>(null)
const reducedMotion = usePreferredReducedMotion()

const busy = ref(false)
const actionPose = ref<TickerPose | null>(null)
const poseOverride = computed(() => actionPose.value ?? heldPose.value)
const x = ref(0)
const facing = ref(1)
const line = ref('')
const caption = computed(() => rhr.value != null ? null : '♥ its own beat')

const timers: Array<ReturnType<typeof setTimeout>> = []
function wait(ms: number) {
  return new Promise<void>((resolve) => {
    timers.push(setTimeout(resolve, ms))
  })
}
onUnmounted(() => timers.forEach(clearTimeout))

// Petting: the counter is a per-viewer convenience, so localStorage is exactly enough.
const PETS_KEY = 'ticker:pets'
const pets = ref({ total: 0, today: 0 })
onMounted(() => {
  try {
    const raw = JSON.parse(localStorage.getItem(PETS_KEY) ?? '{}') as { total?: number, date?: string, today?: number }
    pets.value = { total: raw.total ?? 0, today: raw.date === today.value ? raw.today ?? 0 : 0 }
  }
  catch { /* private windows etc. — the counter just starts fresh */ }
})

const SQUEAKS = ['♥!', 'squeak!', 'hehe — ok', 'that\'s the spot', 'ok, that\'s plenty', '…there IS a digest to write, you know', '(happy wiggle)']

interface HeartParticle { id: number, x: number }
const heartParticles = ref<HeartParticle[]>([])
let particleId = 0

async function petIt() {
  pets.value = { total: pets.value.total + 1, today: pets.value.today + 1 }
  try {
    localStorage.setItem(PETS_KEY, JSON.stringify({ ...pets.value, date: today.value }))
  }
  catch { /* fine */ }

  const h = { id: ++particleId, x: x.value + (Math.random() * 36 - 18) }
  heartParticles.value = [...heartParticles.value.slice(-5), h]
  const clear = setTimeout(() => {
    heartParticles.value = heartParticles.value.filter(p => p.id !== h.id)
  }, 1100)
  timers.push(clear)

  line.value = SQUEAKS[Math.min(pets.value.today - 1, SQUEAKS.length - 1)]!
  pet.value?.trigger('celebrate')
  if (busy.value) return // mid-walk pats are allowed; don't fight the walk's poses
  actionPose.value = 'petted'
  await wait(1300)
  if (actionPose.value === 'petted') actionPose.value = null
}

async function feed() {
  if (busy.value || !dosesToday.value.length) return
  busy.value = true
  const menu = dosesToday.value
    .map(d => `${d.compound} ${d.dose} ${d.unit === 'iu' ? 'IU' : d.unit}`)
    .join(' · ')
  line.value = `fed: ${menu}${mealIsYesterday.value ? ' (yesterday\'s plate)' : ''}`
  actionPose.value = 'eating'
  await wait(2600)
  actionPose.value = null
  line.value = `all ${dosesToday.value.length} dose${dosesToday.value.length === 1 ? '' : 's'} down. ♥`
  busy.value = false
}

async function walk() {
  if (busy.value) return
  busy.value = true
  const minutes = workoutMinutes.value

  if (!minutes) {
    // No workout logged: two sad shuffles, then it sits back down.
    line.value = 'no workout in the log today…'
    for (let i = 0; i < 2; i++) {
      actionPose.value = 'walk1'
      await wait(420)
      actionPose.value = 'walk2'
      await wait(420)
      if (reducedMotion.value !== 'reduce') x.value += 10
    }
    actionPose.value = 'sleepy'
    line.value = '…TICKER sat back down. (it walks when you do)'
    await wait(1900)
    actionPose.value = null
    x.value = 0
    busy.value = false
    return
  }

  // One lap per ~20 logged minutes, capped: across the stage and home again.
  const laps = Math.min(3, Math.max(1, Math.round(minutes / 20)))
  const range = Math.max(40, ((stage.value?.clientWidth ?? 480) / 2) - 110)
  line.value = `walking off ${minutes} min of workouts${walkIsYesterday.value ? ' (yesterday\'s)' : ''}…`

  const stepMs = 190
  let frame: TickerPose = 'walk1'
  const animate = reducedMotion.value !== 'reduce'
  for (let lap = 0; lap < laps * 2; lap++) {
    const target = lap % 2 === 0 ? range : -range
    facing.value = target > x.value ? 1 : -1
    const steps = Math.max(4, Math.round(Math.abs(target - x.value) / 14))
    for (let s = 0; s < steps; s++) {
      frame = frame === 'walk1' ? 'walk2' : 'walk1'
      actionPose.value = frame
      if (animate) x.value += (target - x.value) / (steps - s)
      await wait(animate ? stepMs : 90)
    }
  }
  // trot home
  facing.value = x.value > 0 ? -1 : 1
  while (animate && Math.abs(x.value) > 10) {
    frame = frame === 'walk1' ? 'walk2' : 'walk1'
    actionPose.value = frame
    x.value -= Math.sign(x.value) * 14
    await wait(stepMs)
  }
  x.value = 0
  facing.value = 1
  actionPose.value = 'happy'
  line.value = minutes >= 45 ? `${minutes} minutes — a proper outing. ♥` : `${minutes} minutes walked together.`
  await wait(1400)
  actionPose.value = null
  busy.value = false
}

// --- stats ------------------------------------------------------------------------------------

const stats = computed(() => [
  { label: 'AGE', value: ageDays.value != null ? `${ageDays.value.toLocaleString('en-US')}d` : '—', hint: 'since the first data point' },
  { label: 'WEIGHT', value: weight.value != null ? `${weight.value} lb` : '—', hint: 'yours, borrowed' },
  { label: 'STREAK', value: `${streak.value}d`, hint: 'logged days' },
  { label: 'MOOD', value: moodWord.value, hint: recovery.value != null ? `recovery ${recovery.value}%` : undefined },
  { label: 'PETS', value: String(pets.value.today), hint: `${pets.value.total.toLocaleString('en-US')} all-time` }
])

const todaySummary = computed(() => {
  const parts = [
    dosesToday.value.length ? `${dosesToday.value.length} dose${dosesToday.value.length === 1 ? '' : 's'} to eat` : 'nothing served yet',
    workoutMinutes.value ? `${workoutMinutes.value} min walked` : 'no walk yet',
    sodasToday.value ? `${sodasToday.value} soda${sodasToday.value === 1 ? '' : 's'} (it noticed)` : 'no sodas (it approves)'
  ]
  return `${parts.join(', ')}.`
})

// greet on arrival
onMounted(() => {
  line.value = sluggish.value
    ? '(needs coffee — short night)'
    : moodWord.value === 'great'
      ? 'recovery\'s up — TICKER is thriving'
      : moodWord.value === 'queasy'
        ? 'three sodas. it remembers.'
        : 'TICKER looks up expectantly.'
})
</script>

<style scoped>
.pet-heart {
  position: absolute;
  bottom: 150px;
  font-size: 13px;
  color: var(--color-danger);
  pointer-events: none;
  animation: pet-heart-float 1.05s ease-out forwards;
}
@keyframes pet-heart-float {
  0% { opacity: 0; transform: translateY(6px) scale(0.6); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-26px) scale(1.15); }
}
@media (prefers-reduced-motion: reduce) {
  .pet-heart { animation: none; opacity: 0.8; }
}
</style>
