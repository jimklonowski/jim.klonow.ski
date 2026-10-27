<template>
  <div>
    <JournalHeader
      section="PROTOCOL"
      :meta="`${runningCount} running`"
    >
      <template #actions>
        <span class="text-meta text-muted hidden sm:inline">the schedule the rings, digests and summaries read</span>
        <button
          v-if="canEdit"
          type="button"
          class="tui-btn tui-btn-accent"
          @click="openAddItem"
        >
          + ADD
        </button>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <p
      v-if="!rows.length"
      class="px-4 sm:px-6 py-5 text-small text-muted"
    >
      Nothing on the protocol yet.{{ canEdit ? ' Use + ADD to put the first compound or supplement on it.' : '' }}
    </p>

    <!-- Capped at 5xl: full-width, a desktop row put the dose 1,800px from its name. The hint
         drops to its own line under the header on a phone, where it ate the rule and wrapped. -->
    <div class="px-4 sm:px-6 py-4 space-y-5 max-w-5xl">
      <section
        v-for="group in groups"
        :key="group.key"
      >
        <TuiHeader
          :label="`${group.title} · ${group.rows.length}`"
          fill
        >
          <span class="hidden sm:inline text-label text-muted normal-case">{{ group.hint }}</span>
        </TuiHeader>
        <p
          v-if="group.hint"
          class="sm:hidden mt-0.5 text-meta text-faint"
        >
          {{ group.hint }}
        </p>

        <!-- Collapsed groups keep their rows behind a link, like the old supplements page -->
        <button
          v-if="group.collapsible && !expanded[group.key]"
          type="button"
          class="mt-1.5 text-meta text-accent hover:text-accent-hover cursor-pointer"
          @click="expanded[group.key] = true"
        >
          view →
        </button>

        <div
          v-else
          class="mt-1.5"
        >
          <div
            v-for="row in group.rows"
            :key="row.item.id"
            class="py-2 border-b border-line-row last:border-0"
          >
            <!-- One shape for every row. On a phone it is two lines: the name, chips and dose
                 on the first, the dates, notes, version count and actions on the second — a
                 free-wrapping flex row used to put the dose beside a short name and under a long
                 one, so the column of doses jumped about. From sm the second line's wrapper is
                 `contents`, its children join the one flex line, and `order` puts them where the
                 one-line read wants them: name · chips · since · notes ······ dose · versions ·
                 actions. -->
            <div class="flex flex-wrap items-baseline gap-x-2.5 group sm:flex-nowrap">
              <span
                class="text-prose min-w-0 sm:shrink-0"
                :class="row.stopped ? 'line-through text-muted' : 'text-hi'"
              >{{ row.item.name }}</span>

              <span
                v-if="row.cadence"
                class="shrink-0 text-meta text-accent border border-line-accent px-1.5 py-0.5"
              >{{ row.cadence }}</span>

              <!-- A logged pill sits among the standing ones: say which it is -->
              <span
                v-if="row.item.kind === 'logged' && row.item.category !== 'injectable'"
                class="shrink-0 text-meta text-faint border border-line-soft px-1.5 py-0.5"
                title="Logged in the journal and scored against the schedule"
              >logged</span>

              <span
                v-if="row.dose"
                class="ml-auto shrink-0 text-row text-muted sm:order-2"
              >{{ row.dose }}</span>

              <div
                v-if="row.since || row.item.notes || row.versions.length || canEdit"
                class="basis-full mt-0.5 flex items-baseline gap-x-2.5 min-w-0 sm:contents"
              >
                <span
                  v-if="row.since"
                  class="shrink-0 text-small text-faint sm:order-1"
                >{{ row.since }}</span>

                <span
                  v-if="row.item.notes"
                  class="min-w-0 truncate text-small text-faint sm:order-1 sm:max-w-md"
                  :title="row.item.notes"
                >{{ row.item.notes }}</span>

                <span
                  class="ml-auto flex items-baseline gap-2 shrink-0 sm:order-3"
                  :class="row.dose ? 'sm:ml-0' : ''"
                >
                  <!-- A fixed 10ch from sm so "1 version" and "5 versions" don't shift the dose
                       column by a character from row to row. -->
                  <button
                    v-if="row.versions.length"
                    type="button"
                    class="text-meta text-faint hover:text-accent cursor-pointer sm:inline-block sm:w-[10ch] sm:text-left"
                    :aria-expanded="!!history[row.item.id]"
                    @click="history[row.item.id] = !history[row.item.id]"
                  >{{ history[row.item.id] ? 'hide' : `${row.versions.length} version${row.versions.length === 1 ? '' : 's'}` }}</button>
                  <template v-if="canEdit">
                    <button
                      v-if="row.item.kind !== 'as_needed' && !row.stopped"
                      type="button"
                      class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
                      :aria-label="`Change ${row.item.name}`"
                      @click="openChange(row)"
                    >change</button>
                    <button
                      v-if="row.current && !row.item.on_hand"
                      type="button"
                      class="text-meta text-faint hover:text-warn cursor-pointer tui-row-action"
                      :aria-label="`Stop ${row.item.name}`"
                      @click="openStop(row)"
                    >stop</button>
                    <button
                      v-else-if="row.stopped"
                      type="button"
                      class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
                      :aria-label="`Resume ${row.item.name}`"
                      @click="openResume(row)"
                    >resume</button>
                    <button
                      type="button"
                      class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
                      :aria-label="`Edit ${row.item.name}`"
                      @click="openEditItem(row.item)"
                    >edit</button>
                    <button
                      type="button"
                      class="text-meta text-faint hover:text-danger cursor-pointer tui-row-action"
                      :aria-label="`Delete ${row.item.name}`"
                      @click="confirmDeleteItem(row)"
                    >✕</button>
                  </template>
                </span>
              </div>
            </div>

            <!-- The dated history: one line per version, newest first -->
            <ul
              v-if="history[row.item.id]"
              class="mt-1.5 ml-3 space-y-0.5"
            >
              <li
                v-for="v in [...row.versions].reverse()"
                :key="v.id"
                class="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap text-meta text-muted group"
              >
                <span class="num">{{ spanOf(v) }}</span>
                <span
                  v-if="v.dose_label"
                  class="text-hi"
                >{{ v.dose_label }}</span>
                <span v-if="cadenceOf(v)">{{ cadenceOf(v) }}</span>
                <span
                  v-if="v.note"
                  class="text-faint truncate max-w-md"
                  :title="v.note"
                >{{ v.note }}</span>
                <template v-if="canEdit">
                  <button
                    type="button"
                    class="text-faint hover:text-accent cursor-pointer tui-row-action"
                    :aria-label="`Edit this version of ${row.item.name}`"
                    @click="openEditVersion(row, v)"
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    class="text-faint hover:text-danger cursor-pointer tui-row-action"
                    :aria-label="`Delete this version of ${row.item.name}`"
                    @click="confirmDeleteVersion(row, v)"
                  >
                    ✕
                  </button>
                </template>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>

    <!-- Add / edit an item -->
    <UModal
      v-model:open="itemModalOpen"
      :title="itemForm.id ? 'Edit item' : 'Add to the protocol'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
            :help="itemForm.kind === 'logged' ? 'Exactly as it is logged in the journal, so the doses match' : undefined"
          >
            <UInput
              v-model="itemForm.name"
              placeholder="Magnesium glycinate"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Tracked as"
              :help="KIND_HELP[itemForm.kind]"
            >
              <USelect
                v-model="itemForm.kind"
                :items="KIND_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Category">
              <USelect
                v-model="itemForm.category"
                :items="CATEGORY_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="flex flex-wrap gap-x-5 gap-y-2">
            <UCheckbox
              v-model="itemForm.injected"
              label="Injected"
            />
            <UCheckbox
              v-model="itemForm.on_hand"
              label="On hand, not taking it"
            />
          </div>

          <template v-if="!itemForm.id && itemForm.kind !== 'as_needed' && !itemForm.on_hand">
            <TuiHeader
              label="STARTS"
              :dashes="6"
            />
            <div class="grid grid-cols-2 gap-3">
              <UFormField
                label="First day"
                help="Blank = long-standing"
              >
                <UInput
                  v-model="itemForm.start.from_date"
                  type="date"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Dose">
                <UInput
                  v-model="itemForm.start.dose_label"
                  placeholder="250 IU"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField label="Days">
              <WeekdayPicker v-model="itemForm.start.weekdays" />
            </UFormField>
          </template>

          <UFormField
            label="Notes"
            help="Read by the AI prompts while it runs — say how to read the data, not just what changed"
          >
            <UTextarea
              v-model="itemForm.notes"
              :rows="2"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Stop note"
            help="Read by the AI prompts once it has ended — why it stopped"
          >
            <UTextarea
              v-model="itemForm.stop_note"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="tui-btn"
              @click="itemModalOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="savingItem"
              :disabled="!itemForm.name.trim()"
              @click="saveItem"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Change / stop / resume / edit a version -->
    <UModal
      v-model:open="versionModalOpen"
      :title="versionTitle"
    >
      <template #body>
        <div class="space-y-4">
          <p
            v-if="versionForm.mode === 'change'"
            class="text-small text-muted"
          >
            A new version starts on this day; whatever is running closes the day before. Earlier days keep their old dose and cadence.
          </p>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              v-if="versionForm.mode !== 'stop'"
              label="First day"
              :help="versionForm.kind === 'logged' ? 'Required for a logged compound' : 'Blank = long-standing'"
            >
              <UInput
                v-model="versionForm.from_date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-if="versionForm.mode === 'stop' || versionForm.mode === 'edit'"
              label="Last day"
              :help="versionForm.mode === 'edit' ? 'Blank while current' : undefined"
            >
              <UInput
                v-model="versionForm.to_date"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>

          <template v-if="versionForm.mode !== 'stop'">
            <UFormField label="Dose">
              <UInput
                v-model="versionForm.dose_label"
                placeholder="250 IU"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Days">
              <WeekdayPicker v-model="versionForm.weekdays" />
            </UFormField>
          </template>

          <UFormField
            :label="versionForm.mode === 'stop' ? 'Stop note' : 'Note'"
            :help="versionForm.mode === 'stop' ? 'Read by the AI prompts once it has ended — why it stopped' : 'Read by the AI prompts for this version — why it changed'"
          >
            <UTextarea
              v-model="versionForm.note"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="tui-btn"
              @click="versionModalOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="savingVersion"
              :disabled="!versionValid"
              @click="saveVersion"
            >
              {{ versionForm.mode === 'stop' ? 'Stop' : 'Save' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { cadenceOf as cadenceText } from '#shared/utils/protocolRules'
import { parseWeekdays, type ProtocolItemRow, type ProtocolVersionRow } from '#shared/utils/protocolStore'
import type { PROTOCOL_CATEGORIES, PROTOCOL_KINDS } from '#shared/utils/schemas'
import { localToday } from '#shared/utils/time'

// The protocol page (the protocol plan, P6): everything taken, grouped by how it is tracked, each
// with its dated history of dose and cadence. It edits protocol_items / protocol_versions by id
// (useProtocolItems); the mapped schedule the rings, digests and summaries read is useProtocol(),
// refreshed after every write here.

type Kind = typeof PROTOCOL_KINDS[number]
type Category = typeof PROTOCOL_CATEGORIES[number]

useSeoMeta({ title: 'Journal · Protocol' })

const { canEdit } = await useAuth()
const { data, refresh, error } = await useProtocolItems()

const DAILY = [0, 1, 2, 3, 4, 5, 6]

interface Row {
  item: ProtocolItemRow
  /** Oldest first. */
  versions: ProtocolVersionRow[]
  /** The open version, if one is running. */
  current: ProtocolVersionRow | null
  last: ProtocolVersionRow | null
  /** Had a history and nothing is running now (not on hand, not as-needed). */
  stopped: boolean
  dose: string | null
  cadence: string | null
  since: string | null
}

const rows = computed<Row[]>(() => {
  const byItem = new Map<number, ProtocolVersionRow[]>()
  for (const v of data.value?.versions ?? []) {
    const list = byItem.get(v.item_id) ?? []
    list.push(v)
    byItem.set(v.item_id, list)
  }
  return [...(data.value?.items ?? [])]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((item) => {
      const versions = (byItem.get(item.id) ?? []).sort((a, b) => (a.from_date ?? '').localeCompare(b.from_date ?? ''))
      const current = versions.find(v => v.to_date == null) ?? null
      const last = versions.at(-1) ?? null
      const stopped = !item.on_hand && item.kind !== 'as_needed' && !current && versions.length > 0
      const shown = current ?? last
      return {
        item, versions, current, last, stopped,
        dose: shown?.dose_label ?? null,
        cadence: cadenceOf(shown),
        since: current?.from_date
          ? `since ${formatDate(current.from_date, 'monthDay')}`
          : stopped && last?.to_date ? `stopped ${formatDate(last.to_date, 'monthDay')}` : null
      }
    })
})

const runningCount = computed(() => rows.value.filter(r => r.current && !r.item.on_hand).length)

const live = (r: Row) => !r.item.on_hand && !r.stopped

// Grouped by what a thing IS, not by how it is tracked: the injectables, then every pill
// together — finasteride (logged daily and scored) beside tadalafil (standing, never logged),
// with a "logged" chip telling the two apart.
const groups = computed(() => [
  { key: 'injectables', title: 'INJECTABLES', hint: 'weekday-scheduled, scored against the dose log', rows: rows.value.filter(r => r.item.kind !== 'as_needed' && r.item.category === 'injectable' && live(r)) },
  { key: 'meds', title: 'DAILY MEDS', hint: 'pills — logged ones are scored, the rest are standing', rows: rows.value.filter(r => r.item.kind !== 'as_needed' && r.item.category === 'oral' && live(r)) },
  { key: 'supplements', title: 'DAILY STACK', hint: 'taken consistently, not dose-logged', rows: rows.value.filter(r => r.item.kind === 'standing' && r.item.category === 'supplement' && live(r)) },
  { key: 'skin', title: 'SKIN & HAIR', hint: 'topicals and routine', rows: rows.value.filter(r => r.item.kind === 'standing' && r.item.category === 'skin' && live(r)) },
  { key: 'asneeded', title: 'AS NEEDED', hint: 'no schedule — gaps in the log are the plan', rows: rows.value.filter(r => r.item.kind === 'as_needed') },
  { key: 'onhand', title: 'ON HAND · NOT TAKING', hint: '', collapsible: true, rows: rows.value.filter(r => r.item.on_hand) },
  { key: 'stopped', title: 'DISCONTINUED', hint: 'recent stops stay relevant to lab trends', collapsible: true, rows: rows.value.filter(r => r.stopped && !r.item.on_hand) }
].filter(g => g.rows.length))

const expanded = reactive<Record<string, boolean>>({})
const history = reactive<Record<number, boolean>>({})

/** The cadence chip: nothing for daily (the assumed default) or no fixed days, 'MON+THU' otherwise. */
function cadenceOf(v: ProtocolVersionRow | null): string | null {
  const days = parseWeekdays(v?.weekdays ?? null)
  if (!days || days.length === 7) return null
  return cadenceText(days).toUpperCase()
}

function spanOf(v: ProtocolVersionRow): string {
  return `${v.from_date ?? '…'} → ${v.to_date ?? 'now'}`
}

// --- forms ---

const KIND_OPTIONS: Array<{ label: string, value: Kind }> = [
  { label: 'Logged compound', value: 'logged' },
  { label: 'Daily, not logged', value: 'standing' },
  { label: 'As needed', value: 'as_needed' }
]
const KIND_HELP: Record<Kind, string> = {
  logged: 'Weekday rings and the schedule check score it against the dose log',
  standing: 'Taken on a cadence but never logged — a supplement, a daily pill',
  as_needed: 'Taken when something calls for it; no rings, no misses'
}
const CATEGORY_OPTIONS: Array<{ label: string, value: Category }> = [
  { label: 'Injectable', value: 'injectable' },
  { label: 'Oral med', value: 'oral' },
  { label: 'Supplement', value: 'supplement' },
  { label: 'Skin & hair', value: 'skin' }
]

interface ItemForm {
  id?: number
  name: string
  kind: Kind
  category: Category
  injected: boolean
  on_hand: boolean
  notes: string
  stop_note: string
  sort?: number
  /** The first version, for a new item. */
  start: { from_date: string, dose_label: string, weekdays: number[] }
}

function emptyItemForm(): ItemForm {
  return {
    id: undefined, name: '', kind: 'standing', category: 'supplement', injected: false, on_hand: false, notes: '', stop_note: '', sort: undefined,
    start: { from_date: localToday(), dose_label: '', weekdays: [...DAILY] }
  }
}

const itemForm = reactive<ItemForm>(emptyItemForm())
const itemGuard = useDirtyGuard(() => itemForm)
const itemModalOpen = itemGuard.guardOpen(ref(false))

// A kind implies a category and a route until the form says otherwise.
watch(() => itemForm.kind, (kind) => {
  if (itemForm.id) return
  if (kind === 'logged') {
    itemForm.category = 'injectable'
    itemForm.injected = true
  }
  else if (kind === 'as_needed') {
    itemForm.category = 'injectable'
    itemForm.injected = true
  }
  else {
    itemForm.category = 'supplement'
    itemForm.injected = false
  }
})

function openAddItem() {
  Object.assign(itemForm, emptyItemForm())
  itemGuard.markClean()
  itemModalOpen.value = true
}

function openEditItem(item: ProtocolItemRow) {
  Object.assign(itemForm, emptyItemForm(), {
    id: item.id, name: item.name, kind: item.kind as Kind, category: item.category as Category,
    injected: !!item.injected, on_hand: !!item.on_hand, notes: item.notes ?? '', stop_note: item.stop_note ?? '', sort: item.sort
  })
  itemGuard.markClean()
  itemModalOpen.value = true
}

/** Both stores: the rows this page edits and the mapped schedule every other page reads. */
async function refreshAll() {
  await Promise.all([refresh(), refreshNuxtData('/journal/protocol')])
}

const { run: saveItem, pending: savingItem } = useSaveAction(async () => {
  const { start, ...item } = itemForm
  const saved = await $fetch<{ ok: boolean, id: number }>('/api/journal/protocol/save', { method: 'POST', body: item })
  // A new item that is taken starts with its first version; one on hand has nothing dated yet.
  if (!item.id && item.kind !== 'as_needed' && !item.on_hand) {
    await $fetch('/api/journal/protocol/version', {
      method: 'POST',
      body: { item_id: saved.id, from_date: start.from_date || null, to_date: null, dose_label: start.dose_label || null, weekdays: start.weekdays, note: null }
    })
  }
  await refreshAll()
  itemGuard.markClean()
  itemModalOpen.value = false
}, { success: () => itemForm.id ? 'Protocol item updated' : 'Added to the protocol' })

type VersionMode = 'change' | 'stop' | 'resume' | 'edit'

interface VersionForm {
  id?: number
  item_id: number
  itemName: string
  kind: Kind
  mode: VersionMode
  from_date: string
  to_date: string
  dose_label: string
  weekdays: number[]
  note: string
  /** For 'stop': the item's stop note, saved on the item alongside the end date. */
  stopNoteBefore: string
}

function emptyVersionForm(): VersionForm {
  return { id: undefined, item_id: 0, itemName: '', kind: 'standing', mode: 'change', from_date: localToday(), to_date: '', dose_label: '', weekdays: [...DAILY], note: '', stopNoteBefore: '' }
}

const versionForm = reactive<VersionForm>(emptyVersionForm())
const versionGuard = useDirtyGuard(() => versionForm)
const versionModalOpen = versionGuard.guardOpen(ref(false))

const versionTitle = computed(() => ({
  change: `Change ${versionForm.itemName} from a date`,
  stop: `Stop ${versionForm.itemName}`,
  resume: `Resume ${versionForm.itemName}`,
  edit: `Edit a version of ${versionForm.itemName}`
})[versionForm.mode])

const versionValid = computed(() => {
  if (versionForm.mode === 'stop') return !!versionForm.to_date
  if (versionForm.kind === 'logged' && (!versionForm.from_date || !versionForm.weekdays.length)) return false
  return true
})

function openVersion(row: Row, mode: VersionMode, seed: Partial<VersionForm>) {
  Object.assign(versionForm, emptyVersionForm(), {
    item_id: row.item.id, itemName: row.item.name, kind: row.item.kind as Kind, mode, stopNoteBefore: row.item.stop_note ?? ''
  }, seed)
  versionGuard.markClean()
  versionModalOpen.value = true
}

/** A new open version from a date, seeded with what runs now so a dose-only change is one field. */
function openChange(row: Row) {
  const base = row.current ?? row.last
  openVersion(row, 'change', { dose_label: base?.dose_label ?? '', weekdays: parseWeekdays(base?.weekdays ?? null) ?? [...DAILY] })
}

/** Close the running version on a day; the stop note lands on the item for the prompts. */
function openStop(row: Row) {
  if (!row.current) return
  openVersion(row, 'stop', { id: row.current.id, from_date: row.current.from_date ?? '', to_date: localToday(), dose_label: row.current.dose_label ?? '', weekdays: parseWeekdays(row.current.weekdays) ?? [], note: row.item.stop_note ?? '' })
}

function openResume(row: Row) {
  const base = row.last
  openVersion(row, 'resume', { dose_label: base?.dose_label ?? '', weekdays: parseWeekdays(base?.weekdays ?? null) ?? [...DAILY] })
}

function openEditVersion(row: Row, v: ProtocolVersionRow) {
  openVersion(row, 'edit', { id: v.id, from_date: v.from_date ?? '', to_date: v.to_date ?? '', dose_label: v.dose_label ?? '', weekdays: parseWeekdays(v.weekdays) ?? [], note: v.note ?? '' })
}

const { run: saveVersion, pending: savingVersion } = useSaveAction(async () => {
  const f = versionForm
  if (f.mode === 'stop') {
    // The end date goes on the running version; the note is the item's stop note.
    await $fetch('/api/journal/protocol/version', {
      method: 'POST',
      body: { id: f.id, item_id: f.item_id, from_date: f.from_date || null, to_date: f.to_date, dose_label: f.dose_label || null, weekdays: f.weekdays.length ? f.weekdays : null, note: null }
    })
    if (f.note !== f.stopNoteBefore) {
      const item = rows.value.find(r => r.item.id === f.item_id)?.item
      if (item) {
        await $fetch('/api/journal/protocol/save', {
          method: 'POST',
          body: { id: item.id, name: item.name, kind: item.kind, category: item.category, injected: !!item.injected, on_hand: !!item.on_hand, notes: item.notes, stop_note: f.note || null, sort: item.sort }
        })
      }
    }
  }
  else {
    await $fetch('/api/journal/protocol/version', {
      method: 'POST',
      body: {
        id: f.mode === 'edit' ? f.id : undefined,
        item_id: f.item_id,
        from_date: f.from_date || null,
        to_date: f.mode === 'edit' ? (f.to_date || null) : null,
        dose_label: f.dose_label || null,
        weekdays: f.weekdays.length ? f.weekdays : null,
        note: f.note || null
      }
    })
  }
  await refreshAll()
  versionGuard.markClean()
  versionModalOpen.value = false
}, {
  success: () => ({ change: 'Changed', stop: 'Stopped', resume: 'Resumed', edit: 'Version updated' })[versionForm.mode]
})

const { run: deleteItem } = useSaveAction(async (row: Row) => {
  await $fetch('/api/journal/protocol/delete', { method: 'POST', body: { item_id: row.item.id } })
  await refreshAll()
}, { success: 'Deleted', error: 'Delete failed' })

const { run: deleteVersion } = useSaveAction(async (v: ProtocolVersionRow) => {
  await $fetch('/api/journal/protocol/delete', { method: 'POST', body: { version_id: v.id } })
  await refreshAll()
}, { success: 'Version deleted', error: 'Delete failed' })

async function confirmDeleteItem(row: Row) {
  const n = row.versions.length
  if (!confirm(`Delete ${row.item.name}${n ? ` and its ${n} version${n === 1 ? '' : 's'}` : ''}? If you stopped taking it, use "stop" instead so the history stays visible to the AI and the rings.`)) return
  await deleteItem(row)
}

async function confirmDeleteVersion(row: Row, v: ProtocolVersionRow) {
  if (!confirm(`Delete the ${row.item.name} version ${spanOf(v)}? The days it covered will have no schedule.`)) return
  await deleteVersion(v)
}
</script>
