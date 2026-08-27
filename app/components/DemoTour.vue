<template>
  <!-- One UPopover whose anchor hops between steps (useTour is headless — copy and chrome
       are ours, so it stays in the terminal aesthetic). Rendered only for demo sessions. -->
  <UPopover
    v-if="isDemo"
    :open="tour.open.value"
    :reference="tour.reference.value"
    :dismissible="false"
    :content="{ side: current?.side ?? 'bottom', align: current?.align ?? 'start', sideOffset: 10, collisionPadding: 12 }"
    :ui="{ content: 'p-0 bg-transparent ring-0 shadow-none' }"
  >
    <template #content>
      <div class="w-76 max-w-[calc(100vw-1.5rem)] bg-raised border border-accent px-3.5 py-3">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[10.5px] tracking-widest uppercase text-accent font-medium">{{ current?.title }}</span>
          <span class="text-[10px] text-faint shrink-0">{{ tour.index.value + 1 }} / {{ tour.total.value }}</span>
        </div>
        <p class="mt-1.5 text-[12px] text-muted leading-[1.65]">
          {{ current?.body }}
        </p>
        <div class="mt-3 flex items-center gap-2">
          <button
            v-if="tour.hasPrev.value"
            type="button"
            class="tui-btn"
            @click="tour.prev()"
          >
            ← back
          </button>
          <button
            v-if="tour.hasNext.value"
            type="button"
            class="tui-btn tui-btn-accent"
            @click="tour.next()"
          >
            next →
          </button>
          <button
            v-else
            type="button"
            class="tui-btn tui-btn-accent"
            @click="tour.finish()"
          >
            explore →
          </button>
          <button
            v-if="tour.hasNext.value"
            type="button"
            class="ml-auto text-[10.5px] text-faint hover:text-accent"
            @click="tour.finish()"
          >
            skip
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
// Short guided tour for demo sessions. The anchored steps live on the home mission control
// (ids added there and in AppHeader); intro/outro are viewport-centered (target: null).
const { role } = await useAuth()
const isDemo = computed(() => role.value === 'demo')
const route = useRoute()

// side/align flow through to the UPopover :content placement — each anchored step names
// which edge of its anchor the popover should hug, so it lands next to what it describes.
const steps = [
  {
    target: null,
    title: 'Fictional persona',
    body: 'Everything on this site — labs, journal, photos, protocol — belongs to a synthetic demo persona. Edits are welcome: they land in a sandbox that resets daily. Nothing here is real health data.'
  },
  {
    target: '#tour-nav',
    side: 'bottom',
    align: 'end',
    title: 'Navigate',
    body: 'LABS is bloodwork over time, JOURNAL the daily protocol log, TOOLS the calculators and vial inventory. All of it works in demo.'
  },
  {
    target: '#tour-vitals',
    side: 'right',
    title: 'Daily vitals',
    body: 'Morning weight, blood pressure, resting heart rate and HRV — logged daily, trended over 90 days.'
  },
  {
    target: '#tour-flagged',
    side: 'bottom',
    title: 'Bloodwork flags',
    body: 'Markers outside their reference range on the latest draw. LABS has the full panel with per-marker history and reference bands.'
  },
  {
    target: '#tour-digest',
    side: 'left',
    title: 'TICKER',
    body: 'The resident AI coach digests the data into a daily brief. In demo the digests are pre-written; the live site generates them from real numbers.'
  },
  {
    target: null,
    title: 'Have a look around',
    body: 'Try + LOG TODAY to edit a journal day, open a vial under TOOLS → INVENTORY, or dig into LABS. The sandbox is yours.'
  }
]

const tour = useTour(steps)
const current = tour.current

// Auto-start once per browser session, only where the anchors live.
onMounted(() => {
  if (!isDemo.value || route.path !== '/') return
  if (sessionStorage.getItem('demo-tour-seen')) return
  sessionStorage.setItem('demo-tour-seen', '1')
  tour.start()
})

// Replays requested from the DemoBanner [tour] button — from any page.
const tourLaunch = useState('demo-tour-launch', () => 0)
watch(tourLaunch, async () => {
  if (!isDemo.value) return
  if (route.path !== '/') {
    await navigateTo('/')
    await nextTick()
  }
  tour.start(0)
})
</script>
