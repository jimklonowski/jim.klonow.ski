<template>
  <UModal
    v-model:open="open"
    title="Command palette"
    description="Jump to a marker, day, or compound"
    :ui="{
      overlay: 'bg-[rgba(3,5,4,0.75)] backdrop-blur-sm',
      content: 'w-155 max-w-[92vw] bg-raised border border-accent shadow-[0_0_28px_rgba(44,232,164,0.18)] ring-0'
    }"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="searchTerm"
        :groups="groups"
        placeholder="jump to a marker, day, or compound…"
        icon=""
        close
        :ui="{
          root: 'bg-raised divide-line-soft',
          input: '[&>input]:text-[12.5px] [&>input]:h-11',
          label: 'tui-label px-2 pt-3 pb-1',
          item: 'text-[12px] py-1.5 data-highlighted:not-data-disabled:before:bg-nav-active',
          itemLabelSuffix: 'text-faint',
          itemTrailingKbds: 'text-faint'
        }"
        @update:open="open = $event"
      >
        <template #empty>
          <div class="py-6 text-center text-[12px] text-muted">
            no matches
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { BIOMARKERS, getStatus } from '~/data/biomarkers'

const open = useState('command-palette-open', () => false)
const digestOpen = useState('digest-panel-open', () => false)
const searchTerm = ref('')

const { role, isOwner } = await useAuth()
const { entries, latestDraw } = useOverview(role)

defineShortcuts({
  meta_k: () => { open.value = !open.value }
})

watch(open, (v) => {
  if (!v) searchTerm.value = ''
})

function go(to: string) {
  open.value = false
  navigateTo(to)
}

function openDigests() {
  open.value = false
  digestOpen.value = true
}

const todayStr = localToday()

// The doctor role gets a curated clinical view — no daily entries, photos, or AI digests.
// See shared/utils/access.ts; offering those rows would just bounce them to /labs.
const isFullAccess = computed(() => role.value === 'owner' || role.value === 'friend')

// Journal sections are real routes since the hub-and-spoke split, so these are plain jumps
// rather than the scroll-anchors they used to be.
const jumpItems = computed(() => {
  const items = [
    { label: 'home', suffix: '/', onSelect: () => go('/') },
    { label: 'labs · bloodwork', suffix: '/labs', onSelect: () => go('/labs') },
    { label: 'body composition · dexa', suffix: '/labs/dexa', onSelect: () => go('/labs/dexa') },
    { label: 'journal · overview', suffix: '/journal', onSelect: () => go('/journal') },
    { label: 'journal · trends', suffix: 'vitals + health charts', onSelect: () => go('/journal/trends') },
    { label: 'journal · compounds', suffix: 'usage + timeline', onSelect: () => go('/journal/compounds') },
    { label: 'journal · workouts', suffix: 'session log', onSelect: () => go('/journal/workouts') },
    { label: 'calendar', suffix: '/journal/calendar', onSelect: () => go('/journal/calendar') },
    { label: 'supplements', suffix: '/journal/supplements', onSelect: () => go('/journal/supplements') },
    { label: 'calculator', suffix: '/journal/calculator', onSelect: () => go('/journal/calculator') }
  ]
  if (isFullAccess.value) {
    items.push(
      { label: 'journal · entries', suffix: 'day log', onSelect: () => go('/journal/entries') },
      { label: 'photos', suffix: '/journal/photos', onSelect: () => go('/journal/photos') }
    )
  }
  if (isOwner.value) {
    items.push(
      { label: 'inventory · vials', suffix: '/journal/inventory', onSelect: () => go('/journal/inventory') },
      { label: 'import', suffix: '/journal/import', onSelect: () => go('/journal/import') },
      { label: 'sharing', suffix: '/labs/sharing', onSelect: () => go('/labs/sharing') }
    )
  }
  return items
})

const actionItems = computed(() => {
  if (!role.value) return [{ label: 'sign in', suffix: '/labs/login', onSelect: () => go('/labs/login') }]
  const items = []
  if (isFullAccess.value) {
    items.push(
      { label: '+ log today', suffix: todayStr, onSelect: () => go(`/journal/${todayStr}`) },
      { label: 'view digests', suffix: 'ai recaps', onSelect: openDigests }
    )
  }
  if (isOwner.value) {
    items.push({ label: '↑ upload lab results', suffix: 'pdf', onSelect: () => go('/labs/upload') })
  }
  return items
})

const markerItems = computed(() => {
  const draw = latestDraw.value
  return Object.entries(BIOMARKERS).map(([key, meta]) => {
    const value = draw?.markers[key]
    const status = draw ? getStatus(value ?? null, meta) : 'unknown'
    const flag = status === 'high' ? ' · HIGH' : status === 'low' ? ' · LOW' : ''
    return {
      label: meta.label.toLowerCase(),
      suffix: value != null ? `${value} ${meta.unit}${flag}` : meta.unit,
      onSelect: () => go('/labs')
    }
  })
})

const compoundItems = computed(() => {
  const seen = new Map<string, string>()
  for (const e of [...entries.value].reverse()) {
    for (const p of e.peptides ?? []) {
      if (p.compound && !seen.has(p.compound)) seen.set(p.compound, e.date)
    }
  }
  return [...seen.entries()].map(([compound, lastDate]) => ({
    label: compound.toLowerCase(),
    suffix: `last ${formatDate(lastDate, 'monthDay').toLowerCase()}`,
    onSelect: () => go(`/journal/compound/${encodeURIComponent(compound)}`)
  }))
})

const dateItems = computed(() => {
  if (!isFullAccess.value) return []
  return [...entries.value]
    .reverse()
    .slice(0, 14)
    .map(e => ({
      label: e.date,
      suffix: e.weight_lbs != null ? `${e.weight_lbs} lbs` : '',
      onSelect: () => go(`/journal/${e.date}`)
    }))
})

const groups = computed(() => {
  const list = [{ id: 'jump', label: 'JUMP', items: jumpItems.value }]
  if (actionItems.value.length) list.push({ id: 'actions', label: 'ACTIONS', items: actionItems.value })
  if (markerItems.value.length) list.push({ id: 'markers', label: 'MARKERS', items: markerItems.value })
  if (compoundItems.value.length) list.push({ id: 'compounds', label: 'COMPOUNDS', items: compoundItems.value })
  if (dateItems.value.length) list.push({ id: 'dates', label: 'DAYS', items: dateItems.value })
  return list
})
</script>
