<template>
  <UModal
    v-model:open="open"
    title="Command palette"
    description="Jump to a marker, day, or compound"
    :ui="{
      overlay: 'bg-bg/75 backdrop-blur-sm',
      content: 'w-155 max-w-[92vw] bg-raised border border-accent shadow-(--panel-shadow) ring-0'
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
          input: '[&>input]:text-row [&>input]:h-11',
          label: 'tui-label px-2 pt-3 pb-1',
          item: 'text-small py-1.5 data-highlighted:not-data-disabled:before:bg-nav-active',
          itemLabelSuffix: 'text-faint',
          itemTrailingKbds: 'text-faint'
        }"
        @update:open="open = $event"
      >
        <template #empty>
          <div class="py-6 text-center text-small text-muted">
            no matches
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { isFullAccessRole } from '#shared/utils/access'
import { courseOnFile } from '#shared/utils/accutane'
import type { Cycle } from '#shared/utils/cycles'
import { E2_IMMUNOASSAY, E2_SENSITIVE, isEstradiolKey, markerSlotLabel } from '#shared/utils/estradiol'
import { fmtMarkerValue } from '#shared/utils/markerValue'
import { BIOMARKERS, getStatus } from '~/data/biomarkers'
import type { CompoundInfo } from '~/data/compoundInfo'

const open = useState('command-palette-open', () => false)
const digestOpen = useState('digest-panel-open', () => false)
const searchTerm = ref('')

const { role, isOwner, canEdit } = await useAuth()
// The scalar shell summary — this component sits in the default layout, so it must not drag
// the full journal and labs lists onto every page the way useOverview() would.
const { data: summary, current, measured } = useOverviewSummary(role)

defineShortcuts({
  meta_k: () => { open.value = !open.value }
})

// The dossier file is ~70KB of prose and this component sits in the default layout, so a static
// import would ride along on every page load. Fetch it the first time the palette opens instead.
const dossiers = shallowRef<Record<string, CompoundInfo>>({})
// The planned cycles, for one question: is there an isotretinoin course to offer the course
// page for? Read the same lazy way and for the same reason — a list on every page load, for
// a row most sessions never look at. null until the palette has been opened (and for a
// visitor who may not read it).
const cycles = shallowRef<Cycle[] | null>(null)

watch(open, (v) => {
  if (!v) {
    searchTerm.value = ''
    return
  }
  if (!Object.keys(dossiers.value).length) {
    import('~/data/compoundInfo').then((m) => {
      dossiers.value = m.COMPOUND_INFO
    })
  }
  if (!cycles.value && role.value) {
    $fetch<Cycle[]>('/api/journal/cycles/list').then((list) => {
      cycles.value = list
    }).catch(() => { /* not readable for this session: no course row, nothing else changes */ })
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

const todayStr = useToday()

// The doctor role gets a curated clinical view — no daily entries, photos, or AI digests.
// See shared/utils/access.ts; offering those rows would just bounce them to /labs.
const isFullAccess = computed(() => isFullAccessRole(role.value))

// Journal sections are real routes since the hub-and-spoke split, so these are plain jumps
// rather than the scroll-anchors they used to be.
//
// Every page the site has is here, in ACTIONS or in MANAGE — tests/drift.test.mjs fails when
// a page is added and the palette is not told (the ledger, the report, the protocol and the
// cycle planner all shipped without a row, and the supplements page kept one after it was gone;
// audit #44 item 57).
const jumpItems = computed(() => {
  const items = [
    { label: 'home', suffix: '/', onSelect: () => go('/') },
    { label: 'labs · bloodwork', suffix: '/labs', onSelect: () => go('/labs') },
    { label: 'body composition · dexa', suffix: '/labs/dexa', onSelect: () => go('/labs/dexa') },
    // Plain words, no middle dot: the search is strict about a contiguous match, and "hematocrit
    // control" is what gets typed.
    { label: 'hematocrit control panel', suffix: '/labs/hematocrit · ladder · phlebotomies · iron', onSelect: () => go('/labs/hematocrit') },
    { label: 'draw ledger', suffix: '/labs/ledger · protocol + timing per draw', onSelect: () => go('/labs/ledger') },
    { label: 'clinical summary', suffix: '/labs/report · one page for a visit · print', onSelect: () => go('/labs/report') },
    { label: 'journal · overview', suffix: '/journal', onSelect: () => go('/journal') },
    { label: 'journal · trends', suffix: 'vitals + health charts', onSelect: () => go('/journal/trends') },
    { label: 'journal · compounds', suffix: 'usage + timeline', onSelect: () => go('/journal/compounds') },
    // "supplements" and "stack" are what this page used to be called, and still what gets typed.
    { label: 'journal · protocol', suffix: 'schedule · supplements · stack · dated history', onSelect: () => go('/journal/protocol') },
    { label: 'journal · cycles', suffix: 'cycle planner', onSelect: () => go('/journal/cycles') },
    { label: 'journal · workouts', suffix: 'session log', onSelect: () => go('/journal/workouts') },
    { label: 'calendar', suffix: '/journal/calendar', onSelect: () => go('/journal/calendar') },
    { label: 'vaccines', suffix: 'immunization record', onSelect: () => go('/journal/vaccines') },
    { label: 'tools · calculator', suffix: '/tools/calculator', onSelect: () => go('/tools/calculator') }
  ]
  // Only while there is a course, like the journal's ACCUTANE tab (courseOnFile).
  if (cycles.value && courseOnFile(cycles.value, todayStr.value)) {
    items.push({ label: 'accutane course', suffix: '/journal/accutane · isotretinoin · cumulative dose', onSelect: () => go('/journal/accutane') })
  }
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
  const items = []
  // The vial inventory is open to demo (edits land in the sandbox DB); sharing and import
  // stay owner-only.
  if (canEdit.value) {
    items.push({ label: 'inventory · vials', suffix: '/tools/inventory', onSelect: () => go('/tools/inventory') })
  }
  if (isOwner.value) {
    items.unshift(
      { label: 'sharing · invite links', suffix: 'share with friends + doctor', onSelect: () => go('/tools/sharing') },
      { label: 'import', suffix: 'apple health export.xml', onSelect: () => go('/tools/import') },
      { label: 'data · export + history', suffix: 'download, undo a delete', onSelect: () => go('/tools/data') }
    )
  }
  return items
})

const actionItems = computed(() => {
  if (!role.value) return [{ label: 'sign in', suffix: '/labs/login', onSelect: () => go('/labs/login') }]
  const items = []
  // Logging is an edit (owner/demo); digests are readable by the whole full-access tier.
  if (canEdit.value) {
    items.push({ label: '+ log today', suffix: todayStr.value, onSelect: () => go(`/journal/${todayStr.value}`) })
  }
  if (isFullAccess.value) {
    items.push(
      { label: 'view digests', suffix: 'ai recaps', onSelect: openDigests },
      { label: '♥ visit ticker', suffix: 'the resident companion', onSelect: () => go('/ticker') }
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
  // Only markers some draw has measured (or derived — those sit in `current`): the catalogue's
  // never-drawn entries led to an empty card (audit #43 item 51). Each one's current reading —
  // the latest draw's, or an earlier one in the window (an add-on draw doesn't blank every
  // marker it didn't test) — printed the way every card prints it; a marker last measured
  // before the window says so instead of a bare unit.
  const known = new Set([...measured.value, ...Object.keys(current.value)])
  // Estradiol is one entry for its two assays (shared/utils/estradiol.ts): the one `current`
  // holds, which the server has already folded to a single reading; with neither current, the
  // LC/MS/MS key stands for the pair. Either key opens the one card.
  const estradiol = [E2_SENSITIVE, E2_IMMUNOASSAY].find(k => current.value[k]) ?? [E2_SENSITIVE, E2_IMMUNOASSAY].find(k => known.has(k))
  return Object.entries(BIOMARKERS).filter(([key]) => known.has(key) && (!isEstradiolKey(key) || key === estradiol)).map(([key, meta]) => {
    const value = current.value[key]?.value
    const status = getStatus(value ?? null, meta)
    const flag = status === 'high' ? ' · HIGH' : status === 'low' ? ' · LOW' : ''
    return {
      label: markerSlotLabel(key, meta.label).toLowerCase(),
      suffix: value != null ? `${fmtMarkerValue(value)}${meta.unit ? ` ${meta.unit}` : ''}${flag}` : 'not on a recent draw',
      onSelect: () => go(`/labs?marker=${key}`)
    }
  })
})

/** Compound → date it was last dosed, most-recent use first (server-derived from the dose log). */
const loggedCompounds = computed(() =>
  new Map((summary.value?.compounds ?? []).map(c => [c.compound, c.lastDate] as const))
)

/** The newest journal days, newest first — the palette's DAYS group. Empty for the doctor role. */
const recentDays = computed(() => summary.value?.recentDays ?? [])

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
    // Only the recent window is on hand, so an older date gets no weight suffix rather than a
    // guess about whether it has an entry ([date].vue opens a blank form either way).
    const day = recentDays.value.find(d => d.date === typedDate.value)
    return [{
      label: typedDate.value,
      suffix: day?.weight_lbs != null ? `${day.weight_lbs} lbs` : '',
      onSelect: () => go(`/journal/${typedDate.value}`)
    }]
  }
  return recentDays.value.map(d => ({
    label: d.date,
    suffix: d.weight_lbs != null ? `${d.weight_lbs} lbs` : '',
    onSelect: () => go(`/journal/${d.date}`)
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
