<template>
  <div>
    <ToolsHeader
      section="DATA"
      :meta="`${entries.length} recent changes`"
    />
    <ToolsNav />

    <!-- Export -->
    <section class="px-4 sm:px-6 py-4">
      <div class="bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="EXPORT"
          :dashes="7"
        >
          <span class="text-[10.5px] text-muted normal-case">everything, as one JSON file</span>
        </TuiHeader>
        <p class="mt-2 text-[12px] leading-[1.7] text-dim">
          Every table: journal days, labs, DEXA, vitals, workouts, photos (their metadata; the images
          stay in storage), supplements, vials, vaccines, cycles, digests and this change history.
          It's the same format as the weekly backup, so <code class="text-hi">scripts/restore-backup.mjs</code>
          can load it back. Whoop's sign-in tokens are left out.
        </p>
        <div class="mt-3 pt-3 border-t border-line-soft">
          <!-- A button rather than a link: /api/export is a file download, not a page, and the
               response's Content-Disposition keeps the browser on this page. -->
          <button
            type="button"
            class="tui-btn tui-btn-accent"
            @click="downloadExport"
          >
            ↓ DOWNLOAD EXPORT
          </button>
        </div>
      </div>
    </section>

    <!-- History -->
    <section class="px-4 sm:px-6 pb-5">
      <TuiHeader
        :label="`CHANGE HISTORY · ${entries.length}`"
        :dashes="9"
      >
        <span class="text-[10.5px] text-muted normal-case">your edits and deletes, newest first — any of them can be put back</span>
      </TuiHeader>

      <UTable
        v-if="entries.length"
        :data="entries"
        :columns="COLUMNS"
        :meta="rowMeta"
        class="mt-2.5 border border-line-soft"
      >
        <template #when-cell="{ row }">
          <span
            class="text-muted"
            :title="row.original.at"
          >{{ when(row.original.at) }}</span>
        </template>
        <template #action-cell="{ row }">
          <span
            class="text-[10.5px] tracking-widest uppercase border px-1.5 py-0.5"
            :class="ACTION_CHIP[row.original.action]"
          >{{ row.original.action }}</span>
        </template>
        <template #what-cell="{ row }">
          <span class="text-faint">{{ TABLE_LABELS[row.original.table] ?? row.original.table }}</span>
          <span class="text-hi ml-2 whitespace-normal">{{ row.original.summary }}</span>
        </template>
        <template #restore-cell="{ row }">
          <span
            v-if="row.original.blocked"
            class="text-[11px] text-faint"
          >{{ row.original.blocked }}</span>
          <button
            v-else
            type="button"
            class="tui-btn disabled:opacity-50"
            :disabled="restoring"
            @click="restore(row.original)"
          >
            {{ RESTORE_LABEL[row.original.action] }}
          </button>
        </template>
      </UTable>

      <UEmpty
        v-else
        icon="i-lucide-history"
        variant="naked"
        title="No changes recorded yet"
        description="Saves and deletes you make from here on are listed, and can be undone."
        :ui="{
          root: 'py-8 px-4 gap-2',
          avatar: 'bg-inset text-faint ring-0 mb-1',
          title: 'text-[12.5px] font-normal',
          description: 'text-[11.5px] text-muted'
        }"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AuditEntry } from '#shared/types/audit'

useSeoMeta({ title: 'Tools · Data' })

const TABLE_LABELS: Record<string, string> = {
  journal_entries: 'Journal',
  labs_entries: 'Labs',
  dexa_entries: 'DEXA',
  supplements: 'Supplement',
  vials: 'Vial',
  vaccinations: 'Vaccine',
  cycles: 'Cycle',
  progress_photos: 'Photo',
  profile: 'Profile'
}

const ACTION_CHIP: Record<AuditEntry['action'], string> = {
  create: 'text-accent border-line-accent',
  update: 'text-dim border-line-input',
  delete: 'text-danger border-line-input',
  restore: 'text-warn border-line-input'
}

// What pressing the button does to this entry's row.
const RESTORE_LABEL: Record<AuditEntry['action'], string> = {
  delete: 'RESTORE',
  update: 'REVERT',
  create: 'UNDO',
  restore: 'UNDO'
}

const COLUMNS: TableColumn<AuditEntry>[] = [
  { id: 'when', header: 'When' },
  { id: 'action', header: 'Change' },
  { id: 'what', header: 'What' },
  // A real header, not '': UTable renders an empty-string header differently on the server and
  // the client, and the page failed hydration over it. It names the column for screen readers too.
  { id: 'restore', header: 'Undo', meta: { class: { th: 'text-right', td: 'text-right' } } }
]
// An entry that has been put back reads as done.
const rowMeta = {
  class: {
    tr: (row: { original: AuditEntry }) => row.original.restoredAt ? 'opacity-55' : ''
  }
}

const { data, refresh } = await useAsyncData('audit', () => useRequestFetch()<AuditEntry[]>('/api/audit'))
const entries = computed(() => data.value ?? [])

function downloadExport() {
  window.location.assign('/api/export')
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function confirmText(e: AuditEntry): string {
  const what = `${TABLE_LABELS[e.table] ?? e.table} — ${e.summary ?? e.key}`
  if (e.action === 'delete') return `Put back ${what}?`
  if (e.action === 'create') return `Remove ${what}, undoing its creation?`
  return `Put ${what} back the way it was before this change? Anything edited on it since is replaced (that's logged too, so it can be undone).`
}

// Other pages need no nudge: every list revalidates when its page mounts (useListResource).
const { run: runRestore, pending: restoring } = useSaveAction(async (e: AuditEntry) => {
  await $fetch('/api/audit/restore', { method: 'POST', body: { id: e.id } })
  await refresh()
}, {
  error: 'Could not restore',
  success: () => ({ title: 'Restored', description: 'Logged in the history, so it can be undone.' })
})

function restore(e: AuditEntry) {
  if (window.confirm(confirmText(e))) runRestore(e)
}
</script>
