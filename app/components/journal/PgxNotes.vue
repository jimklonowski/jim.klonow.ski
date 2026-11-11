<template>
  <section
    v-if="notes.length || canEdit"
    data-pgx
  >
    <TuiHeader
      :label="`DRUG–GENE NOTES · ${notes.length}`"
      fill
    >
      <button
        v-if="canEdit"
        type="button"
        class="text-label text-accent hover:text-accent-hover cursor-pointer"
        @click="openForm()"
      >
        + add a note
      </button>
    </TuiHeader>
    <p class="mt-0.5 text-meta text-faint">
      Pharmacogenomic findings, entered by hand: shown beside the compounds and markers they bear on, and read by the digests, the summaries and the ask chat. Stored in the database only.
    </p>

    <div
      v-for="n in notes"
      :key="n.id"
      class="py-2 border-b border-line-row last:border-0 group"
    >
      <div class="flex flex-wrap items-baseline gap-x-2.5">
        <span class="text-prose text-hi">{{ pgxHeading(n) }}</span>
        <span
          v-for="c in n.compounds"
          :key="c"
          class="shrink-0 text-meta text-accent border border-line-accent px-1.5 py-0.5"
        >{{ c }}</span>
        <span
          v-for="m in n.markers"
          :key="m"
          class="shrink-0 text-meta text-faint border border-line-soft px-1.5 py-0.5"
        >{{ BIOMARKERS[m]?.label ?? m }}</span>
        <span
          v-if="canEdit"
          class="ml-auto flex items-baseline gap-2 shrink-0"
        >
          <button
            type="button"
            class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
            :aria-label="`Edit the ${n.gene} note`"
            @click="openForm(n)"
          >edit</button>
          <button
            type="button"
            class="text-meta text-faint hover:text-danger cursor-pointer tui-row-action"
            :aria-label="`Delete the ${n.gene} note`"
            @click="confirmDelete(n)"
          >✕</button>
        </span>
      </div>
      <p class="mt-0.5 text-small text-dim leading-[1.6]">
        {{ n.note }}
      </p>
    </div>

    <UModal
      v-model:open="open"
      :title="form.id ? 'Edit drug–gene note' : 'Add a drug–gene note'"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UFormField
              label="Gene"
              required
            >
              <UInput
                v-model="form.gene"
                placeholder="CYP2D6"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Genotype / phenotype"
              help="As the report words it"
            >
              <UInput
                v-model="form.genotype"
                placeholder="*1/*4 — intermediate metabolizer"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Compounds"
            help="Comma-separated, as they are named on the protocol; a salt or ester matches its base name"
          >
            <UInput
              v-model="form.compounds"
              placeholder="Tamoxifen, Clomiphene"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Markers"
            help="Optional — lab markers the finding changes the reading of"
          >
            <USelectMenu
              v-model="form.markers"
              :items="markerItems"
              value-key="value"
              multiple
              placeholder="none"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Note"
            required
            help="What it means in practice — shown on the pages and given to the model as written"
          >
            <UTextarea
              v-model="form.note"
              :rows="4"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="tui-btn"
              @click="open = false"
            >
              CANCEL
            </button>
            <button
              type="button"
              class="tui-btn tui-btn-accent"
              :disabled="saving || !form.gene.trim() || !form.note.trim()"
              @click="save"
            >
              {{ saving ? 'SAVING…' : 'SAVE' }}
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import { parseList, pgxHeading, type PgxNote } from '#shared/utils/pgx'
import { BIOMARKERS } from '~/data/biomarkers'

// The drug-gene notes' home (audit #43 item 78), at the foot of /journal/protocol: the list and
// its editor. The rows live in pgx_notes — entered here, never in the repository.
const props = defineProps<{ canEdit: boolean }>()

const { data, refresh } = usePgxNotes()
const notes = computed(() => data.value ?? [])

const markerItems = Object.entries(BIOMARKERS)
  .filter(([, m]) => !m.computed)
  .map(([value, m]) => ({ label: m.label, value }))
  .sort((a, b) => a.label.localeCompare(b.label))

const open = ref(false)
const form = reactive({ id: undefined as number | undefined, gene: '', genotype: '', compounds: '', markers: [] as string[], note: '' })

function openForm(n?: PgxNote) {
  if (!props.canEdit) return
  Object.assign(form, n
    ? { id: n.id, gene: n.gene, genotype: n.genotype ?? '', compounds: n.compounds.join(', '), markers: [...n.markers], note: n.note }
    : { id: undefined, gene: '', genotype: '', compounds: '', markers: [], note: '' })
  open.value = true
}

const { run: save, pending: saving } = useSaveAction(async () => {
  await $fetch('/api/journal/pgx/save', {
    method: 'POST',
    body: { id: form.id, gene: form.gene, genotype: form.genotype || null, compounds: parseList(form.compounds), markers: form.markers, note: form.note }
  })
  await refresh()
  open.value = false
}, { success: 'Note saved', error: 'Save failed' })

const { run: remove } = useSaveAction(async (n: PgxNote) => {
  await $fetch('/api/journal/pgx/delete', { method: 'POST', body: { id: n.id } })
  await refresh()
}, { success: 'Note deleted', error: 'Delete failed' })

async function confirmDelete(n: PgxNote) {
  if (!confirm(`Delete the ${n.gene} note?`)) return
  await remove(n)
}
</script>
