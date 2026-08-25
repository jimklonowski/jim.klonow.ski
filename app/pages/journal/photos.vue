<template>
  <div>
    <JournalHeader
      section="PHOTOS"
      :meta="headerMeta"
    >
      <template #actions>
        <span class="text-[11px] text-muted hidden sm:inline">framing is non-destructive · originals untouched</span>
      </template>
    </JournalHeader>
    <JournalNav />

    <!-- One-time backfill for photos uploaded before thumbnails existed -->
    <div
      v-if="isOwner && missingThumbnails.length"
      class="px-4 sm:px-6 pt-4"
    >
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-image"
        title="Some photos are missing thumbnails"
        :description="backfillDescription"
        :actions="backfillActions"
        :ui="{
          root: 'bg-warn/10 border border-warn/25 ring-0 p-3 gap-2.5',
          icon: 'size-4 text-warn',
          title: 'text-[12px] text-hi font-medium',
          description: 'text-[11.5px] text-dim opacity-100 mt-1',
          actions: 'mt-2'
        }"
      />
    </div>

    <!-- Add Photos (bulk backfill — no need to visit a day's journal entry) -->
    <section
      v-if="isOwner"
      class="px-4 sm:px-6 pt-4"
    >
      <TuiHeader
        label="ADD PHOTOS"
        :dashes="11"
      >
        <span class="text-[10.5px] text-muted normal-case">date auto-detected from EXIF</span>
      </TuiHeader>

      <div class="mt-2 bg-raised border border-line-soft px-3.5 py-3">
        <UFileUpload
          v-model="files"
          multiple
          accept="image/*"
          layout="list"
          position="inside"
          icon="i-lucide-upload-cloud"
          label="Drop photos here — old or new, one at a time or a whole batch"
          description="Date is detected automatically from each photo's EXIF data"
          class="w-full"
          :ui="{
            base: 'bg-inset border-line-input',
            label: 'text-[12px] text-dim mt-2 font-normal',
            description: 'text-[11px] text-muted mt-1',
            icon: 'text-faint',
            file: 'border-b border-line-soft last:border-0 py-2'
          }"
        >
          <template #file="{ file, index, removeFile }">
            <div class="flex flex-col w-full">
              <div class="flex items-center gap-2.5 w-full">
                <img
                  :src="previewUrlFor(file)"
                  class="w-12 h-12 object-cover shrink-0 border border-line-soft"
                >
                <div class="flex-1 grid grid-cols-2 gap-2">
                  <UInput
                    v-model="metaFor(file).date"
                    type="date"
                    size="xs"
                    :disabled="metaFor(file).status !== 'pending'"
                  />
                  <USelect
                    v-model="metaFor(file).category"
                    :items="[...PHOTO_CATEGORIES]"
                    value-key="value"
                    label-key="label"
                    size="xs"
                    :disabled="metaFor(file).status !== 'pending'"
                  />
                </div>
                <UIcon
                  v-if="metaFor(file).status === 'uploading'"
                  name="i-lucide-loader-2"
                  class="w-4 h-4 animate-spin text-muted shrink-0"
                />
                <UIcon
                  v-else-if="metaFor(file).status === 'done'"
                  name="i-lucide-check"
                  class="w-4 h-4 text-accent shrink-0"
                />
                <button
                  v-else
                  type="button"
                  class="text-[11px] text-faint hover:text-danger cursor-pointer shrink-0 px-1"
                  aria-label="Remove file"
                  @click="removeFile(index)"
                >
                  ✕
                </button>
              </div>
              <p
                v-if="metaFor(file).status === 'error'"
                class="mt-1.5 w-full text-[11px] text-danger"
              >
                {{ metaFor(file).error }}
              </p>
            </div>
          </template>
        </UFileUpload>

        <div
          v-if="files.length"
          class="flex gap-2 pt-3"
        >
          <button
            v-if="pendingCount"
            type="button"
            class="tui-btn tui-btn-accent disabled:opacity-50"
            :disabled="uploadingAll"
            @click="uploadAllPending"
          >
            {{ uploadLabel }}
          </button>
          <button
            v-if="hasFinished"
            type="button"
            class="tui-btn"
            @click="clearFinished"
          >
            CLEAR FINISHED
          </button>
        </div>
      </div>
    </section>

    <!-- Category selector -->
    <div class="px-4 sm:px-6 pt-4">
      <div class="grid grid-cols-3 sm:grid-cols-5 gap-px bg-line border border-line">
        <button
          v-for="c in PHOTO_CATEGORIES"
          :key="c.value"
          type="button"
          class="px-3 py-2.5 text-[11px] tracking-widest uppercase cursor-pointer transition-colors"
          :class="category === c.value
            ? 'bg-nav-active text-accent'
            : 'bg-bg text-[#6b8578] hover:text-accent'"
          @click="category = c.value"
        >
          {{ c.label }} <span class="text-faint">{{ countByCategory[c.value] ?? 0 }}</span>
        </button>
      </div>
    </div>

    <UEmpty
      v-if="!photosForCategory.length"
      icon="i-lucide-image-off"
      title="No photos yet"
      :description="emptyDescription"
      :ui="{
        root: 'p-6',
        title: 'text-[13px] text-hi font-medium',
        description: 'text-[12px] text-muted'
      }"
    />

    <template v-else>
      <!-- Before / After picker + comparison -->
      <section class="px-4 sm:px-6 py-4">
        <TuiHeader
          label="COMPARE"
          :dashes="13"
        >
          <span class="text-[10.5px] text-muted normal-case">{{ compareMeta }}</span>
        </TuiHeader>

        <div class="mt-2 flex flex-wrap items-end gap-2.5">
          <UFormField
            label="Before"
            class="flex-1 min-w-40"
            :ui="{ label: 'tui-label' }"
          >
            <USelect
              v-model.nullable="beforeId"
              :items="photoOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <button
            type="button"
            class="tui-btn disabled:opacity-50"
            :disabled="beforeId == null || afterId == null"
            @click="swapBeforeAfter"
          >
            ⇄ SWAP
          </button>
          <UFormField
            label="After"
            class="flex-1 min-w-40"
            :ui="{ label: 'tui-label' }"
          >
            <USelect
              v-model.nullable="afterId"
              :items="photoOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Drag-to-reveal before/after comparison, full quality (not the thumbnail) -->
        <div class="mt-2.5">
          <PhotoCompareSlider
            v-if="beforePhoto && afterPhoto"
            :before-url="beforePhoto.url"
            :after-url="afterPhoto.url"
            :before-label="formatDate(beforePhoto.date)"
            :after-label="formatDate(afterPhoto.date)"
            :before-style="frameStyle(beforePhoto)"
            :after-style="frameStyle(afterPhoto)"
          >
            <button
              type="button"
              class="absolute top-2 left-2 px-1.5 py-0.5 text-[11px] bg-bg/80 border border-line-accent text-accent cursor-pointer"
              aria-label="Expand before photo"
              @pointerdown.stop
              @click="lightboxPhoto = beforePhoto"
            >
              ⤢
            </button>
            <button
              type="button"
              class="absolute top-2 right-2 px-1.5 py-0.5 text-[11px] bg-bg/80 border border-line-accent text-accent cursor-pointer"
              aria-label="Expand after photo"
              @pointerdown.stop
              @click="lightboxPhoto = afterPhoto"
            >
              ⤢
            </button>
          </PhotoCompareSlider>

          <div
            v-else
            class="grid grid-cols-2 gap-2.5"
          >
            <div>
              <div
                v-if="beforePhoto"
                class="w-full aspect-square border border-line-soft overflow-hidden cursor-zoom-in"
                @click="lightboxPhoto = beforePhoto"
              >
                <img
                  :src="beforePhoto.url"
                  class="w-full h-full object-cover"
                  :style="frameStyle(beforePhoto)"
                >
              </div>
              <div
                v-else
                class="w-full aspect-square border border-dashed border-line-input flex items-center justify-center text-[12px] text-muted"
              >
                no photo
              </div>
              <p class="mt-1.5 text-[11px] text-muted text-center">
                {{ beforePhoto ? formatDate(beforePhoto.date) : '' }}
              </p>
            </div>
            <div>
              <div
                v-if="afterPhoto"
                class="w-full aspect-square border border-line-soft overflow-hidden cursor-zoom-in"
                @click="lightboxPhoto = afterPhoto"
              >
                <img
                  :src="afterPhoto.url"
                  class="w-full h-full object-cover"
                  :style="frameStyle(afterPhoto)"
                >
              </div>
              <div
                v-else
                class="w-full aspect-square border border-dashed border-line-input flex items-center justify-center text-[12px] text-muted"
              >
                no photo
              </div>
              <p class="mt-1.5 text-[11px] text-muted text-center">
                {{ afterPhoto ? formatDate(afterPhoto.date) : '' }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Every individual photo in this category, for quick stepping (a day can have more than one) -->
      <section class="px-4 sm:px-6 py-4 border-t border-line">
        <TuiHeader
          :label="`ALL ${photoCategoryLabel(category).toUpperCase()} · ${photosForCategory.length}`"
          :dashes="8"
        >
          <!-- Doubles as the legend and the slot picker: whichever chip is armed is the slot
               the next thumbnail tap fills. -->
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] normal-case">
            <button
              v-for="slot in (['before', 'after'] as const)"
              :key="slot"
              type="button"
              class="inline-flex items-center gap-1.5 px-1.5 py-0.5 border cursor-pointer transition-colors"
              :class="pickTarget === slot
                ? (slot === 'before' ? 'border-warn text-warn' : 'border-accent text-accent')
                : 'border-transparent text-muted hover:text-hi'"
              :aria-pressed="pickTarget === slot"
              @click="pickTarget = slot"
            >
              <span
                class="w-2 h-2 rounded-full"
                :class="slot === 'before' ? 'bg-warn' : 'bg-accent glow-dot'"
              />
              {{ slot }}
            </button>
          </span>
        </TuiHeader>

        <div class="flex flex-wrap gap-1.5 mt-2.5">
          <UContextMenu
            v-for="opt in photoOptions"
            :key="opt.value"
            :items="menuItemsFor(opt.photo)"
            :disabled="!isOwner"
            :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
          >
            <button
              type="button"
              class="relative overflow-hidden border transition-colors cursor-pointer"
              :class="[
                opt.value === beforeId ? 'border-warn'
                : opt.value === afterId ? 'border-accent'
                  : 'border-line-soft hover:border-line-accent'
              ]"
              :title="opt.label"
              @click="pickPhoto(opt.value)"
            >
              <img
                :src="opt.photo.thumbUrl ?? opt.photo.url"
                loading="lazy"
                class="w-15 h-15 object-cover"
                :style="frameStyle(opt.photo)"
              >
              <!-- The border colour alone is easy to miss at thumbnail size on a phone. -->
              <span
                v-if="opt.value === beforeId || opt.value === afterId"
                class="absolute top-0 left-0 px-1 text-[9px] leading-normal text-bg"
                :class="opt.value === beforeId ? 'bg-warn' : 'bg-accent'"
              >{{ opt.value === beforeId ? 'B' : 'A' }}</span>
            </button>
          </UContextMenu>
        </div>

        <p class="mt-2.5 text-[11px] text-muted">
          Tap <span class="text-warn">before</span> or <span class="text-accent">after</span> above to pick the slot you're filling, then tap a thumbnail. Filling Before arms After for you.{{ isOwner ? ' Long-press a thumbnail for reframe / edit / delete.' : '' }}
        </p>
      </section>
    </template>

    <UModal
      v-model:open="lightboxOpen"
      :title="lightboxPhoto ? photoCategoryLabel(lightboxPhoto.category) : ''"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
      <template #body>
        <img
          v-if="lightboxPhoto"
          :src="lightboxPhoto.url"
          class="w-full h-auto"
        >
      </template>
    </UModal>

    <UModal
      v-model:open="editOpen"
      title="Edit Photo"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Date"
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model="editForm.date"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Category"
            :ui="{ label: 'tui-label' }"
          >
            <USelect
              v-model="editForm.category"
              :items="[...PHOTO_CATEGORIES]"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="tui-btn"
              @click="editOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="savingEdit"
              :disabled="!editForm.date"
              @click="saveEdit"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="reframeOpen"
      title="Reframe Photo"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
      <template #body>
        <div class="space-y-4">
          <div
            ref="reframeContainerRef"
            class="relative w-full max-w-xs mx-auto aspect-square overflow-hidden border border-line-input select-none touch-none cursor-move"
            @pointerdown="onReframePointerDown"
            @pointermove="onReframePointerMove"
            @pointerup="onReframePointerUp"
            @pointercancel="onReframePointerUp"
          >
            <img
              v-if="reframingPhoto"
              :src="reframingPhoto.url"
              class="absolute inset-0 w-full h-full object-cover pointer-events-none"
              :style="{ transform: `translate(${reframeForm.offsetX}%, ${reframeForm.offsetY}%) scale(${reframeForm.scale})` }"
              draggable="false"
            >
            <div class="absolute inset-0 pointer-events-none">
              <div class="absolute left-1/2 top-0 bottom-0 w-px bg-accent/40" />
              <div class="absolute top-1/2 left-0 right-0 h-px bg-accent/40" />
            </div>
          </div>
          <p class="text-[11px] text-muted text-center">
            Drag the photo to reposition, use the slider to zoom.
          </p>

          <UFormField
            label="Zoom"
            :ui="{ label: 'tui-label' }"
          >
            <USlider
              v-model="reframeForm.scale"
              :min="1"
              :max="3"
              :step="0.05"
            />
          </UFormField>

          <div class="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              class="tui-btn"
              @click="resetReframeForm"
            >
              ⟲ RESET
            </button>
            <div class="flex gap-2">
              <button
                type="button"
                class="tui-btn"
                @click="reframeOpen = false"
              >
                CANCEL
              </button>
              <UButton
                :loading="savingReframe"
                @click="saveReframe"
              >
                Save
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import exifr from 'exifr'
import type { ProgressPhoto } from '~/composables/usePhotoEntries'

definePageMeta({ middleware: 'journal-auth' })

const PHOTO_CATEGORIES = [
  { value: 'chest', label: 'Chest' },
  { value: 'left_bicep', label: 'Left Bicep' },
  { value: 'right_bicep', label: 'Right Bicep' },
  { value: 'face', label: 'Face' },
  { value: 'hairline', label: 'Hairline' }
] as const
type PhotoCategory = typeof PHOTO_CATEGORIES[number]['value']

function photoCategoryLabel(value: string) {
  return PHOTO_CATEGORIES.find(c => c.value === value)?.label ?? value
}

const { data: photosData, refresh } = await usePhotoEntries()
const { isOwner } = await useAuth()
onMounted(refresh)

// --- One-time thumbnail backfill for photos uploaded before thumbnails existed ---
// Re-fetches each already-uploaded original through the authenticated proxy, regenerates a
// thumbnail from that in-browser (same path as a fresh upload), and pushes just the thumbnail up
// - no need to re-select the original files.
const missingThumbnails = computed(() => (photosData.value ?? []).filter(p => !p.thumbUrl))
const backfilling = ref(false)
const backfillDone = ref(0)
const backfillTotal = ref(0)

async function backfillThumbnails() {
  const targets = [...missingThumbnails.value]
  if (!targets.length) return
  backfilling.value = true
  backfillTotal.value = targets.length
  backfillDone.value = 0
  for (const photo of targets) {
    try {
      const blob = await (await fetch(photo.url)).blob()
      const thumb = await createPhotoThumbnail(blob)
      await $fetch(`/api/journal/photos/thumbnail?id=${photo.id}`, { method: 'POST', body: thumb })
    }
    catch {
      // Skip this one - it'll just keep falling back to the full-size image.
    }
    backfillDone.value++
  }
  backfilling.value = false
  await refresh()
}

const backfillDescription = computed(() => {
  const n = missingThumbnails.value.length
  return `${n} photo${n === 1 ? '' : 's'} uploaded before thumbnails existed — generate them now to speed up loading, no re-upload needed.`
})

const backfillActions = computed(() => [{
  label: backfilling.value ? `Generating (${backfillDone.value}/${backfillTotal.value})…` : 'Generate thumbnails',
  size: 'xs' as const,
  loading: backfilling.value,
  onClick: backfillThumbnails
}])

const category = ref<PhotoCategory>('chest')

const photosForCategory = computed(() =>
  (photosData.value ?? [])
    .filter(p => p.category === category.value)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
)

/** Per-category totals for the segmented category row. */
const countByCategory = computed(() => {
  const counts: Record<string, number> = {}
  for (const p of photosData.value ?? []) counts[p.category] = (counts[p.category] ?? 0) + 1
  return counts
})

// Multi-part strings are assembled here rather than in the template — adjacent <template v-if>
// blocks lose the separating whitespace once Vue condenses them.
const headerMeta = computed(() => {
  const all = photosData.value ?? []
  if (!all.length) return 'no photos yet'
  const parts = [`${all.length} total`]
  const latest = [...all].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  if (latest) parts.push(`latest ${formatDateTerse(latest.date)}`)
  return parts.join(' · ')
})

const emptyDescription = computed(() =>
  `No ${photoCategoryLabel(category.value).toLowerCase()} photos yet.${isOwner.value ? ' Drop some above to get started.' : ''}`
)

// One option per photo (not per date) - a day can have more than one shot in the same
// category, so dates alone can't disambiguate which one to pick for Before/After.
const photoOptions = computed(() => {
  const totalByDate: Record<string, number> = {}
  for (const p of photosForCategory.value) totalByDate[p.date] = (totalByDate[p.date] ?? 0) + 1
  const seenByDate: Record<string, number> = {}
  return photosForCategory.value.map((p) => {
    seenByDate[p.date] = (seenByDate[p.date] ?? 0) + 1
    const label = (totalByDate[p.date] ?? 0) > 1 ? `${formatDate(p.date)} (#${seenByDate[p.date] ?? 1})` : formatDate(p.date)
    return { value: p.id, label, photo: p }
  })
})

// --- Bulk upload (backfilling old photos without visiting a day's journal entry) ---
// UFileUpload owns file selection + drag/drop + the file list itself (`files`, driven by its
// v-model); per-file date/category/status metadata lives in a side Map keyed by file identity,
// created via reactive() up front so later mutations (once EXIF resolves) always go through the
// tracked proxy - mutating a plain object *after* pushing it into a reactive array/map is what
// caused the last file's auto-detected date to silently not render until an unrelated re-render.
interface PhotoMeta {
  date: string
  category: PhotoCategory
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

const files = ref<File[]>([])
const fileMeta = reactive(new Map<File, PhotoMeta>())
const previewUrls = new Map<File, string>()
const uploadingAll = ref(false)

function toLocalDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function resolveExifDate(file: File): Promise<string> {
  let exifDate: unknown = null
  try {
    const tags = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    exifDate = tags?.DateTimeOriginal ?? tags?.CreateDate ?? null
  }
  catch {
    exifDate = null
  }
  return exifDate instanceof Date ? toLocalDateStr(exifDate) : toLocalDateStr(new Date(file.lastModified))
}

watch(files, (newFiles, oldFiles) => {
  for (const f of oldFiles ?? []) {
    if (newFiles.includes(f)) continue
    fileMeta.delete(f)
    const url = previewUrls.get(f)
    if (url) URL.revokeObjectURL(url)
    previewUrls.delete(f)
  }
  for (const f of newFiles) {
    if (fileMeta.has(f)) continue
    previewUrls.set(f, URL.createObjectURL(f))
    const meta = reactive<PhotoMeta>({ date: '', category: category.value, status: 'pending' })
    fileMeta.set(f, meta)
    resolveExifDate(f).then((d) => {
      meta.date = d
    })
  }
})

function metaFor(file: File): PhotoMeta {
  return fileMeta.get(file) ?? reactive({ date: '', category: category.value, status: 'pending' })
}

function previewUrlFor(file: File): string {
  return previewUrls.get(file) ?? ''
}

const pendingCount = computed(() => [...fileMeta.values()].filter(m => m.status === 'pending' || m.status === 'error').length)
const hasFinished = computed(() => [...fileMeta.values()].some(m => m.status === 'done'))

const uploadLabel = computed(() => {
  if (uploadingAll.value) return 'UPLOADING…'
  const n = pendingCount.value
  return `↑ UPLOAD ${n} PHOTO${n === 1 ? '' : 'S'}`
})

// ofetch wraps failures as "[POST] \"/api/...\": <status> <text>" with the server's actual
// error (from h3's createError) tucked away in `.data.message` - surface that instead so
// upload failures are actually diagnosable from the UI.
function extractErrorMessage(err: unknown): string {
  const e = err as { data?: { message?: string, statusMessage?: string }, statusCode?: number, message?: string }
  const serverMsg = e?.data?.message ?? e?.data?.statusMessage
  if (serverMsg) return e.statusCode ? `${serverMsg} (${e.statusCode})` : serverMsg
  return e?.message ?? 'Upload failed'
}

async function uploadAllPending() {
  uploadingAll.value = true
  const toUpload = files.value.filter((f) => {
    const m = fileMeta.get(f)
    return m && (m.status === 'pending' || m.status === 'error')
  })
  for (const f of toUpload) {
    const meta = fileMeta.get(f)!
    meta.status = 'uploading'
    meta.error = undefined
    try {
      const params = new URLSearchParams({ category: meta.category, date: meta.date })
      const created = await $fetch<{ id: number }>(`/api/journal/photos/upload?${params}`, { method: 'POST', body: f })
      try {
        const thumb = await createPhotoThumbnail(f)
        await $fetch(`/api/journal/photos/thumbnail?id=${created.id}`, { method: 'POST', body: thumb })
      }
      catch {
        // Best-effort - the grid just falls back to the full-size image for this photo.
      }
      meta.status = 'done'
    }
    catch (err: unknown) {
      meta.status = 'error'
      meta.error = extractErrorMessage(err)
    }
  }
  uploadingAll.value = false
  await refresh()
}

function clearFinished() {
  files.value = files.value.filter(f => fileMeta.get(f)?.status !== 'done')
}

onBeforeUnmount(() => {
  for (const url of previewUrls.values()) URL.revokeObjectURL(url)
})

const beforeId = ref<number | null>(null)
const afterId = ref<number | null>(null)

watch(photoOptions, (opts) => {
  if (!opts.length) {
    beforeId.value = null
    afterId.value = null
    return
  }
  if (!opts.some(o => o.value === beforeId.value)) beforeId.value = opts[0]!.value
  if (!opts.some(o => o.value === afterId.value)) afterId.value = opts.at(-1)!.value
}, { immediate: true })

const beforePhoto = computed(() => photosForCategory.value.find(p => p.id === beforeId.value) ?? null)
const afterPhoto = computed(() => photosForCategory.value.find(p => p.id === afterId.value) ?? null)

/** "Jul 2 → Aug 22 · 51d apart" — the meta line on the COMPARE header. Spans that cross a
 *  year boundary keep the year, otherwise "May 5 → Aug 16 · 833d apart" reads as nonsense. */
const compareMeta = computed(() => {
  const b = beforePhoto.value
  const a = afterPhoto.value
  if (!b || !a) return 'pick two photos'
  const style = b.date.slice(0, 4) === a.date.slice(0, 4) ? 'monthDay' : 'short'
  const days = Math.abs(Math.round(
    (new Date(a.date + 'T12:00:00').getTime() - new Date(b.date + 'T12:00:00').getTime()) / 86400000
  ))
  return `${formatDate(b.date, style)} → ${formatDate(a.date, style)} · ${days}d apart`
})

/**
 * Which slot the next thumbnail tap fills. Both slots are pre-filled on load, so a tap always
 * has to overwrite one of them — arming a slot explicitly is the only way that reads as
 * predictable on a phone. The old rolling behaviour (fill Before, then After, then shift both
 * along and re-sort by date) meant the photo you tapped often landed in the slot you weren't
 * aiming at.
 */
type CompareSlot = 'before' | 'after'
const pickTarget = ref<CompareSlot>('before')

// Filling Before hands the arm to After, so the usual "set both" pass is two taps rather than
// four. Staying on After afterwards makes stepping through later photos one tap each.
function pickPhoto(id: number) {
  if (pickTarget.value === 'before') {
    // Picking the photo already in the other slot would leave both sides identical; give that
    // slot the outgoing photo instead, which reads as a swap.
    if (afterId.value === id) afterId.value = beforeId.value
    beforeId.value = id
    pickTarget.value = 'after'
  }
  else {
    if (beforeId.value === id) beforeId.value = afterId.value
    afterId.value = id
  }
}

function swapBeforeAfter() {
  const tmp = beforeId.value
  beforeId.value = afterId.value
  afterId.value = tmp
}

// --- Lightbox + per-photo context menu ---

const lightboxPhoto = ref<ProgressPhoto | null>(null)
const lightboxOpen = computed({
  get: () => !!lightboxPhoto.value,
  set: (v: boolean) => { if (!v) lightboxPhoto.value = null }
})

async function deletePhoto(id: number) {
  await $fetch('/api/journal/photos/delete', { method: 'POST', body: { id } })
  if (beforeId.value === id) beforeId.value = null
  if (afterId.value === id) afterId.value = null
  if (lightboxPhoto.value?.id === id) lightboxPhoto.value = null
  await refresh()
}

const editingPhoto = ref<ProgressPhoto | null>(null)
const editForm = reactive<{ date: string, category: PhotoCategory }>({ date: '', category: 'chest' })
const editOpen = computed({
  get: () => !!editingPhoto.value,
  set: (v: boolean) => { if (!v) editingPhoto.value = null }
})
const savingEdit = ref(false)

function openEdit(photo: ProgressPhoto) {
  editingPhoto.value = photo
  editForm.date = photo.date
  editForm.category = photo.category
}

async function saveEdit() {
  const photo = editingPhoto.value
  if (!photo) return
  savingEdit.value = true
  try {
    await $fetch('/api/journal/photos/update', {
      method: 'POST',
      body: { id: photo.id, date: editForm.date, category: editForm.category }
    })
    editingPhoto.value = null
    await refresh()
  }
  finally {
    savingEdit.value = false
  }
}

function isReframed(photo: ProgressPhoto) {
  return photo.frameOffsetX !== 0 || photo.frameOffsetY !== 0 || photo.frameScale !== 1
}

function menuItemsFor(photo: ProgressPhoto) {
  const reframeGroup = [{
    label: 'Reframe',
    icon: 'i-lucide-move',
    onSelect: () => openReframe(photo)
  }]
  if (isReframed(photo)) {
    reframeGroup.push({
      label: 'Reset Framing',
      icon: 'i-lucide-rotate-ccw',
      onSelect: () => resetFraming(photo)
    })
  }
  return [reframeGroup, [{
    label: 'Edit',
    icon: 'i-lucide-pencil',
    onSelect: () => openEdit(photo)
  }], [{
    label: 'Delete',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => deletePhoto(photo.id)
  }]]
}

// --- Reframing (manual pan/zoom to line up consistent framing across photos) ---
// Stored as a percent offset + scale on the photo row and applied as a CSS transform
// wherever it renders - non-destructive, the original pixels are untouched.
// Always returns the same key set so the style binding stays assignable to
// `Record<string, string>` (PhotoCompareSlider's before/after style props).
function frameStyle(photo: ProgressPhoto | null): Record<string, string> {
  if (!photo || !isReframed(photo)) return { transform: 'none' }
  return { transform: `translate(${photo.frameOffsetX}%, ${photo.frameOffsetY}%) scale(${photo.frameScale})` }
}

const reframingPhoto = ref<ProgressPhoto | null>(null)
const reframeForm = reactive({ offsetX: 0, offsetY: 0, scale: 1 })
const reframeOpen = computed({
  get: () => !!reframingPhoto.value,
  set: (v: boolean) => { if (!v) reframingPhoto.value = null }
})
const savingReframe = ref(false)
const reframeContainerRef = ref<HTMLElement | null>(null)
const reframeDragging = ref(false)
let reframeLastPointer = { x: 0, y: 0 }

function openReframe(photo: ProgressPhoto) {
  reframingPhoto.value = photo
  reframeForm.offsetX = photo.frameOffsetX
  reframeForm.offsetY = photo.frameOffsetY
  reframeForm.scale = photo.frameScale
}

function resetReframeForm() {
  reframeForm.offsetX = 0
  reframeForm.offsetY = 0
  reframeForm.scale = 1
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function onReframePointerDown(e: PointerEvent) {
  reframeDragging.value = true
  reframeLastPointer = { x: e.clientX, y: e.clientY }
  reframeContainerRef.value?.setPointerCapture(e.pointerId)
}

function onReframePointerMove(e: PointerEvent) {
  if (!reframeDragging.value) return
  const el = reframeContainerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const dxPct = ((e.clientX - reframeLastPointer.x) / rect.width) * 100
  const dyPct = ((e.clientY - reframeLastPointer.y) / rect.height) * 100
  reframeLastPointer = { x: e.clientX, y: e.clientY }
  reframeForm.offsetX = clamp(reframeForm.offsetX + dxPct, -75, 75)
  reframeForm.offsetY = clamp(reframeForm.offsetY + dyPct, -75, 75)
}

function onReframePointerUp() {
  reframeDragging.value = false
}

async function saveReframe() {
  const photo = reframingPhoto.value
  if (!photo) return
  savingReframe.value = true
  try {
    await $fetch('/api/journal/photos/update', {
      method: 'POST',
      body: {
        id: photo.id,
        frameOffsetX: reframeForm.offsetX,
        frameOffsetY: reframeForm.offsetY,
        frameScale: reframeForm.scale
      }
    })
    reframingPhoto.value = null
    await refresh()
  }
  finally {
    savingReframe.value = false
  }
}

async function resetFraming(photo: ProgressPhoto) {
  await $fetch('/api/journal/photos/update', {
    method: 'POST',
    body: { id: photo.id, frameOffsetX: 0, frameOffsetY: 0, frameScale: 1 }
  })
  await refresh()
}
</script>
