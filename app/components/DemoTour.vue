<template>
  <!-- One UPopover whose anchor hops between steps (useTour is headless — copy and chrome
       are ours, so it stays in the terminal aesthetic). Rendered only for demo sessions. -->
  <UPopover
    v-if="isDemo"
    :open="tour.open.value"
    :reference="tour.reference.value"
    :dismissible="false"
    :content="{ side, align: current?.align ?? 'start', sideOffset: 10, collisionPadding: 12 }"
    :ui="{ content: 'p-0 bg-transparent ring-0 shadow-none' }"
  >
    <template #content>
      <!-- Flex column capped at the popper's available height: on cramped viewports
           (landscape phones) only the body scrolls — title and buttons stay reachable. -->
      <div class="w-76 max-w-[calc(100vw-1.5rem)] max-h-(--reka-popper-available-height) flex flex-col bg-raised border border-accent px-3.5 py-3">
        <div class="flex items-baseline justify-between gap-3 shrink-0">
          <span class="text-[10.5px] tracking-widest uppercase text-accent font-medium">{{ current?.title }}</span>
          <span class="text-[10px] text-faint shrink-0">{{ tour.index.value + 1 }} / {{ tour.total.value }}</span>
        </div>
        <p class="mt-1.5 text-[12px] text-muted leading-[1.65] min-h-0 overflow-y-auto">
          {{ current?.body }}
        </p>
        <div class="mt-3 flex items-center gap-2 shrink-0">
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

// Below lg the home grid is a single full-width column: there is no horizontal room
// beside an anchor, so left/right placements land the popover off-screen — and with
// dismissible off, the tour can't be advanced or cleared. Coerce them to bottom.
const isDesktop = useMediaQuery('(min-width: 1024px)')

// Worst-case room an anchored popover needs below (or above) its anchor: tallest
// anchored step ≈ 175px, plus sideOffset 10 and collisionPadding 12.
const POPOVER_ROOM = 200

// Anchors can be taller than a phone viewport (vitals/digest on small screens). Then no
// side has room and floating-ui parks the popover off-screen, stranding the tour. Each
// anchored step targets a virtual element instead: normally the element's own rect, but
// collapsed to the midline of its visible slice when neither below nor above has room —
// which always leaves ~half the viewport free. floating-ui re-reads the rect on every
// scroll/update, so the fallback engages only while the anchor doesn't fit.
function safeTarget(selector: string) {
  return {
    // lets floating-ui's autoUpdate watch the real element for scroll/resize
    get contextElement() {
      return document.querySelector(selector) ?? undefined
    },
    getBoundingClientRect() {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const r = document.querySelector(selector)?.getBoundingClientRect()
      // missing anchor: viewport center, mirroring useTour's intro/outro anchor
      if (!r) return DOMRect.fromRect({ x: vw / 2, y: vh / 2, width: 0, height: 0 })
      if (isDesktop.value || vh - r.bottom >= POPOVER_ROOM || r.top >= POPOVER_ROOM) return r
      const mid = (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2
      return DOMRect.fromRect({ x: r.x, y: mid, width: r.width, height: 0 })
    }
  }
}

// anchor (the raw selector, for the scroll watcher below) + the virtual target
function anchored(selector: string) {
  return { anchor: selector, target: safeTarget(selector) }
}

// side/align flow through to the UPopover :content placement — each anchored step names
// which edge of its anchor the popover should hug, so it lands next to what it describes.
const steps = [
  {
    target: null,
    title: 'Fictional persona',
    body: 'Everything on this site — labs, journal, photos, protocol — belongs to a synthetic demo persona. Edits are welcome: they land in a sandbox that resets daily. Nothing here is real health data.'
  },
  {
    ...anchored('#tour-nav'),
    side: 'bottom',
    align: 'end',
    title: 'Navigate',
    body: 'LABS is bloodwork over time, JOURNAL the daily protocol log, TOOLS the calculators and vial inventory. All of it works in demo.'
  },
  {
    ...anchored('#tour-vitals'),
    side: 'right',
    title: 'Daily vitals',
    body: 'Morning weight, blood pressure, resting heart rate and HRV — logged daily, trended over 90 days.'
  },
  {
    ...anchored('#tour-flagged'),
    side: 'bottom',
    title: 'Bloodwork flags',
    body: 'Markers outside their reference range on the latest draw. LABS has the full panel with per-marker history and reference bands.'
  },
  {
    ...anchored('#tour-digest'),
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

const side = computed(() => {
  const authored = current.value?.side ?? 'bottom'
  return !isDesktop.value && (authored === 'left' || authored === 'right') ? 'bottom' : authored
})

// useTour only auto-scrolls Element targets; the virtual safeTarget steps scroll here.
watch([tour.open, tour.index], () => {
  if (!tour.open.value) return
  nextTick(() => {
    const anchor = current.value?.anchor
    if (anchor) document.querySelector(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
})

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
