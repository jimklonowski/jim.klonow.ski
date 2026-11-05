<template>
  <nav
    ref="nav"
    class="flex gap-3.5 sm:gap-4 px-4 sm:px-6 border-b border-line overflow-x-auto"
  >
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="py-2 text-meta tracking-[0.08em] uppercase whitespace-nowrap border-b-2 transition-colors"
      :class="isActive(tab)
        ? 'text-accent border-accent'
        : 'text-nav-idle border-transparent hover:text-accent'"
      :data-active="isActive(tab) || undefined"
    >
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
import { canAccessPage } from '#shared/utils/access'
import { isotretinoinCycle } from '#shared/utils/accutane'
import { cycleEnd, cycleStatusOn } from '#shared/utils/cycles'
import { diffDays } from '#shared/utils/dates'

// Sub-nav shared by every /journal/* page. Tabs the current role can't open are dropped
// rather than rendered dead — the doctor view has no entries or photos.
const ALL_TABS = [
  { label: 'Overview', to: '/journal' },
  { label: 'Trends', to: '/journal/trends' },
  { label: 'Compounds', to: '/journal/compounds' },
  { label: 'Protocol', to: '/journal/protocol' },
  { label: 'Cycles', to: '/journal/cycles' },
  // The course page is a tab only while there is a course: planned, running, or ended within
  // the last eight weeks (the recovery draw's window). Nothing on file → no eleventh tab.
  { label: 'Accutane', to: '/journal/accutane', course: true },
  { label: 'Workouts', to: '/journal/workouts' },
  { label: 'Entries', to: '/journal/entries' },
  { label: 'Calendar', to: '/journal/calendar' },
  { label: 'Photos', to: '/journal/photos' },
  { label: 'Vaccines', to: '/journal/vaccines' }
]

const COURSE_TAB_AFTER_END_DAYS = 56

const route = useRoute()
const { role } = await useAuth()
const today = useToday()
// The cycles list is already cached by every page that reads it; the demo sandbox has none.
const { data: cyclesData } = await useCycles()

const courseTab = computed(() => {
  const c = isotretinoinCycle(cyclesData.value ?? [], today.value)
  if (!c) return false
  return cycleStatusOn(c, today.value) !== 'done' || diffDays(cycleEnd(c), today.value) <= COURSE_TAB_AFTER_END_DAYS
})

const tabs = computed(() =>
  ALL_TABS.filter(t => (!t.course || courseTab.value) && (!role.value || canAccessPage(role.value, t.to)))
)

// Longest match wins so /journal/compound/<name> keeps COMPOUNDS lit and the bare
// /journal overview doesn't claim every child route.
function isActive(tab: { to: string }) {
  const path = route.path.replace(/\/+$/, '') || '/'
  if (path === tab.to) return true
  if (tab.to === '/journal') {
    // The dossier pages live beneath /journal/compounds conceptually, not the hub.
    return false
  }
  if (tab.to === '/journal/compounds') return path.startsWith('/journal/compound/')
  // A day's entry page (/journal/2026-10-21) belongs to the day log — nothing lit otherwise.
  if (tab.to === '/journal/entries') return path.startsWith('/journal/entries') || /^\/journal\/\d{4}-\d{2}-\d{2}$/.test(path)
  // The dossier pages live at the singular /journal/cycle/<id>.
  if (tab.to === '/journal/cycles') return path.startsWith('/journal/cycle/')
  return path.startsWith(tab.to + '/')
}

// Ten tabs overflow a phone, and the lit one sat off the right edge on CALENDAR, PHOTOS and
// VACCINES (audit #43 item 52). Centre it by scrolling the strip itself — not scrollIntoView,
// which would also move the page vertically — on mount and on every route change.
const nav = useTemplateRef<HTMLElement>('nav')
function revealActive() {
  const strip = nav.value
  const active = strip?.querySelector<HTMLElement>('[data-active]')
  if (!strip || !active || strip.scrollWidth <= strip.clientWidth) return
  strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
}
onMounted(revealActive)
watch(() => route.path, () => nextTick(revealActive))
</script>
