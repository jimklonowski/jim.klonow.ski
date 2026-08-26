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
        :fuse="{ resultLimit: 100 }"
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
import type { CompoundInfo } from '~/data/compoundInfo'

const open = useState('command-palette-open', () => false)
const digestOpen = useState('digest-panel-open', () => false)
const searchTerm = ref('')

const { role, isOwner } = await useAuth()
const { entries, latestDraw } = useOverview(role)

defineShortcuts({
  meta_k: () => { open.value = !open.value }
})

// The dossier file is ~70KB of prose and this component sits in the default layout, so a static
// import would ride along on every page load. Fetch it the first time the palette opens instead.
const dossiers = shallowRef<Record<string, CompoundInfo>>({})

watch(open, async (v) => {
  if (!v) {
    searchTerm.value = ''
    return
  }
  if (!Object.keys(dossiers.value).length) {
    dossiers.value = (await import('~/data/compoundInfo')).COMPOUND_INFO
  }
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
    { label: 'tools · calculator', suffix: '/tools/calculator', onSelect: () => go('/tools/calculator') }
  ]
  if (isFullAccess.value) {
    items.push(
      { label: 'journal · entries', suffix: 'day log', onSelect: () => go('/journal/entries') },
      { label: 'photos', suffix: '/journal/photos', onSelect: () => go('/journal/photos') }
    )
  }
  return items
})

// Owner-only management surfaces, kept out of JUMP so neither list runs long. They were the tail
// of JUMP until UCommandPalette's default `resultLimit: 12` started silently slicing them off
// once the owner list hit 15 entries — hence the explicit :fuse limit above as well. Suffixes
// carry the words worth searching for ("invite", "share", "apple health").
const manageItems = computed(() => {
  if (!isOwner.value) return []
  return [
    { label: 'sharing · invite links', suffix: 'share with friends + doctor', onSelect: () => go('/tools/sharing') },
    { label: 'import', suffix: 'apple health export.xml', onSelect: () => go('/tools/import') },
    { label: 'inventory · vials', suffix: '/tools/inventory', onSelect: () => go('/tools/inventory') }
  ]
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
    items.push(
      { label: '↑ upload lab results', suffix: 'pdf', onSelect: () => go('/labs/upload') },
      { label: '? ask the data', suffix: 'ai analysis console', onSelect: () => go('/ask') }
    )
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
      onSelect: () => go(`/labs?marker=${key}`)
    }
  })
})

/** Compound → date it was last dosed, most-recent use first. */
const loggedCompounds = computed(() => {
  const seen = new Map<string, string>()
  for (const e of [...entries.value].reverse()) {
    for (const p of e.peptides ?? []) {
      if (p.compound && !seen.has(p.compound)) seen.set(p.compound, e.date)
    }
  }
  return seen
})

// Brand names are how these get searched for ("primo", "anavar"), so the aka rides along in the
// suffix — fuse matches on it, and it explains the hit when the label doesn't contain the term.
function akaOf(compound: string) {
  return dossiers.value[compound]?.aka?.toLowerCase() ?? ''
}

const compoundItems = computed(() =>
  [...loggedCompounds.value.entries()].map(([compound, lastDate]) => ({
    label: compound.toLowerCase(),
    suffix: [`last ${formatDate(lastDate, 'monthDay').toLowerCase()}`, akaOf(compound)].filter(Boolean).join(' · '),
    onSelect: () => go(`/journal/compound/${encodeURIComponent(compound)}`)
  }))
)

// Compounds that have a dossier but have never been dosed. /journal/compounds deliberately
// leaves these out of its lists and points here instead ("never-used compounds hidden until
// searched"), so they join the palette only once something is typed — otherwise the empty
// state opens on ~60 rows of things Jim has never taken.
const dossierItems = computed(() => {
  if (searchTerm.value.trim().length < 2) return []
  return Object.entries(dossiers.value)
    .filter(([c]) => !loggedCompounds.value.has(c))
    .map(([c, dossier]) => ({
      label: c.toLowerCase(),
      suffix: [akaOf(c), dossier.category.toLowerCase()].filter(Boolean).join(' · '),
      onSelect: () => go(`/journal/compound/${encodeURIComponent(c)}`)
    }))
})

/**
 * A fully-typed ISO date, or null. Rejects 2026-13-40 — Date rolls overflow forward into the
 * next month rather than failing, so the parsed parts are compared back against the input.
 */
const typedDate = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(searchTerm.value.trim())
  if (!m) return null
  const [iso, , month, day] = m
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime()) || d.getMonth() + 1 !== +month! || d.getDate() !== +day!) return null
  return iso!
})

const dateItems = computed(() => {
  if (!isFullAccess.value) return []
  // Typing a date jumps to that exact day, whether or not it's in the recent list below and
  // whether or not it has an entry yet ([date].vue opens a blank form for empty days). Without
  // this the list was the only candidate set, and Fuse scored "2026-08-20" as a hit for a typed
  // "2026-03-20" — one character apart — offering the wrong day as the only result.
  if (typedDate.value) {
    const entry = entries.value.find(e => e.date === typedDate.value)
    return [{
      label: typedDate.value,
      suffix: entry?.weight_lbs != null ? `${entry.weight_lbs} lbs` : entry ? '' : 'no entry yet',
      onSelect: () => go(`/journal/${typedDate.value}`)
    }]
  }
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
  if (manageItems.value.length) list.push({ id: 'manage', label: 'MANAGE', items: manageItems.value })
  if (markerItems.value.length) list.push({ id: 'markers', label: 'MARKERS', items: markerItems.value })
  if (compoundItems.value.length) list.push({ id: 'compounds', label: 'COMPOUNDS', items: compoundItems.value })
  if (dateItems.value.length) list.push({ id: 'dates', label: 'DAYS', items: dateItems.value })
  if (dossierItems.value.length) list.push({ id: 'dossiers', label: 'DOSSIERS · NEVER LOGGED', items: dossierItems.value })
  return list
})
</script>
