<template>
  <UContainer>
    <div class="py-8 max-w-4xl mx-auto space-y-6">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
        <h1 class="text-2xl font-bold">Progress Photos</h1>
      </div>

      <!-- One-time backfill for photos uploaded before thumbnails existed -->
      <UAlert
        v-if="missingThumbnails.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-image"
        title="Some photos are missing thumbnails"
        :description="`${missingThumbnails.length} photo${missingThumbnails.length === 1 ? '' : 's'} uploaded before thumbnails existed — generate them now to speed up loading, no re-upload needed.`"
        :actions="backfillActions"
      />

      <!-- Add Photos (bulk backfill - no need to visit a day's journal entry) -->
      <UCard>
        <template #header><p class="text-sm font-semibold">Add Photos</p></template>

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
        >
          <template #file="{ file, index, removeFile }">
            <div class="flex flex-col w-full">
              <div class="flex items-center gap-3 w-full">
                <img :src="previewUrlFor(file)" class="w-14 h-14 object-cover rounded-md shrink-0" />
                <div class="flex-1 grid grid-cols-2 gap-2">
                  <UInput
                    v-model="metaFor(file).date"
                    type="date"
                    size="xs"
                    class="font-mono"
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
                <UIcon v-if="metaFor(file).status === 'uploading'" name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-muted shrink-0" />
                <UIcon v-else-if="metaFor(file).status === 'done'" name="i-lucide-check" class="w-4 h-4 text-success shrink-0" />
                <UButton
                  v-else
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="i-lucide-x"
                  @click="removeFile(index)"
                />
              </div>
              <p v-if="metaFor(file).status === 'error'" class="text-xs text-error mt-1.5 w-full">{{ metaFor(file).error }}</p>
            </div>
          </template>
        </UFileUpload>

        <div v-if="files.length" class="flex gap-2 pt-3">
          <UButton
            v-if="pendingCount"
            size="sm"
            icon="i-lucide-upload"
            :loading="uploadingAll"
            @click="uploadAllPending"
          >
            Upload {{ pendingCount }} photo{{ pendingCount === 1 ? '' : 's' }}
          </UButton>
          <UButton v-if="hasFinished" size="sm" variant="ghost" @click="clearFinished">Clear finished</UButton>
        </div>
      </UCard>

      <!-- Category selector -->
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="c in PHOTO_CATEGORIES"
          :key="c.value"
          size="sm"
          :variant="category === c.value ? 'solid' : 'outline'"
          @click="category = c.value"
        >
          {{ c.label }}
        </UButton>
      </div>

      <UEmpty
        v-if="!photosForCategory.length"
        icon="i-lucide-image-off"
        title="No photos yet"
        :description="`No ${photoCategoryLabel(category)} photos yet. Drop some above to get started.`"
      />

      <template v-else>
        <!-- Before / After picker -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Before">
            <USelect v-model.nullable="beforeId" :items="photoOptions" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="After">
            <USelect v-model.nullable="afterId" :items="photoOptions" value-key="value" label-key="label" class="w-full" />
          </UFormField>
        </div>

        <!-- Side by side -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <img
              v-if="beforePhoto"
              :src="beforePhoto.thumbUrl ?? beforePhoto.url"
              class="w-full aspect-square object-cover rounded-lg border border-default cursor-zoom-in"
              @click="lightboxPhoto = beforePhoto"
            />
            <div v-else class="w-full aspect-square rounded-lg border border-dashed border-default flex items-center justify-center text-sm text-muted">
              No photo
            </div>
            <p class="text-xs text-muted text-center">{{ beforePhoto ? formatDate(beforePhoto.date) : '' }}</p>
          </div>
          <div class="space-y-2">
            <img
              v-if="afterPhoto"
              :src="afterPhoto.thumbUrl ?? afterPhoto.url"
              class="w-full aspect-square object-cover rounded-lg border border-default cursor-zoom-in"
              @click="lightboxPhoto = afterPhoto"
            />
            <div v-else class="w-full aspect-square rounded-lg border border-dashed border-default flex items-center justify-center text-sm text-muted">
              No photo
            </div>
            <p class="text-xs text-muted text-center">{{ afterPhoto ? formatDate(afterPhoto.date) : '' }}</p>
          </div>
        </div>

        <!-- Every individual photo in this category, for quick stepping (a day can have more than one) -->
        <div class="pt-4 border-t border-default">
          <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">All {{ photoCategoryLabel(category) }} photos</p>
          <div class="flex flex-wrap gap-2">
            <UContextMenu v-for="opt in photoOptions" :key="opt.value" :items="menuItemsFor(opt.photo)">
              <button
                class="relative rounded-lg overflow-hidden border transition-all"
                :class="[
                  opt.value === beforeId || opt.value === afterId ? 'ring-2 ring-primary' : 'border-default',
                ]"
                :title="opt.label"
                @click="pickPhoto(opt.value)"
              >
                <img :src="opt.photo.thumbUrl ?? opt.photo.url" loading="lazy" class="w-16 h-16 object-cover" />
              </button>
            </UContextMenu>
          </div>
          <p class="text-xs text-muted mt-2">Tap a thumbnail to fill Before, then again to fill After. Long-press for options.</p>
        </div>
      </template>

      <UModal v-model:open="lightboxOpen" :title="lightboxPhoto ? photoCategoryLabel(lightboxPhoto.category) : ''">
        <template #body>
          <img v-if="lightboxPhoto" :src="lightboxPhoto.url" class="w-full h-auto rounded-lg" />
        </template>
      </UModal>

    </div>
  </UContainer>
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

const backfillActions = computed(() => [{
  label: backfilling.value ? `Generating (${backfillDone.value}/${backfillTotal.value})…` : 'Generate thumbnails',
  loading: backfilling.value,
  onClick: backfillThumbnails
}])

const category = ref<PhotoCategory>('chest')

const photosForCategory = computed(() =>
  (photosData.value ?? [])
    .filter(p => p.category === category.value)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
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
    resolveExifDate(f).then((d) => { meta.date = d })
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

// Clicking a thumbnail fills Before first, then After, then starts overwriting Before again.
function pickPhoto(id: number) {
  if (id === beforeId.value || id === afterId.value) return
  if (beforeId.value == null) beforeId.value = id
  else if (afterId.value == null) afterId.value = id
  else { beforeId.value = afterId.value; afterId.value = id }
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

function menuItemsFor(photo: ProgressPhoto) {
  return [[{
    label: 'Delete',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => deletePhoto(photo.id)
  }]]
}
</script>
