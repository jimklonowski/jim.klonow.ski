<template>
  <UContainer>
    <div class="py-8 max-w-4xl mx-auto space-y-6">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
        <h1 class="text-2xl font-bold">Progress Photos</h1>
      </div>

      <!-- Add Photos (bulk backfill - no need to visit a day's journal entry) -->
      <UCard>
        <template #header><p class="text-sm font-semibold">Add Photos</p></template>

        <div
          class="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-neutral-700 hover:border-neutral-500'"
          @click="fileInput?.click()"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <UIcon name="i-lucide-upload-cloud" class="w-10 h-10 text-muted mb-3" />
          <p class="text-sm font-medium">Drop photos here — old or new, one at a time or a whole batch</p>
          <p class="text-xs text-muted mt-1">Date is detected automatically from each photo's EXIF data</p>
          <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFileSelect" />
        </div>

        <div v-if="pending.length" class="mt-4 space-y-2">
          <div
            v-for="p in pending"
            :key="p.id"
            class="p-2 rounded-lg border border-default"
          >
            <div class="flex items-center gap-3">
              <img :src="p.previewUrl" class="w-14 h-14 object-cover rounded-md shrink-0" />
              <div class="flex-1 grid grid-cols-2 gap-2">
                <UInput v-model="p.date" type="date" size="xs" class="font-mono" :disabled="p.status !== 'pending'" />
                <USelect
                  v-model="p.category"
                  :items="PHOTO_CATEGORIES"
                  value-key="value"
                  label-key="label"
                  size="xs"
                  :disabled="p.status !== 'pending'"
                />
              </div>
              <UIcon v-if="p.status === 'uploading'" name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-muted shrink-0" />
              <UIcon v-else-if="p.status === 'done'" name="i-lucide-check" class="w-4 h-4 text-success shrink-0" />
              <UButton
                v-else
                variant="ghost"
                color="error"
                size="xs"
                icon="i-lucide-x"
                @click="removePending(p.id)"
              />
            </div>
            <p v-if="p.status === 'error'" class="text-xs text-error mt-1.5">{{ p.error }}</p>
          </div>

          <div class="flex gap-2 pt-1">
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

      <div v-if="!datesForCategory.length" class="text-sm text-muted py-12 text-center">
        No {{ photoCategoryLabel(category) }} photos yet. Drop some above to get started.
      </div>

      <template v-else>
        <!-- Before / After picker -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Before">
            <USelect v-model="beforeDate" :items="dateOptions" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="After">
            <USelect v-model="afterDate" :items="dateOptions" value-key="value" label-key="label" class="w-full" />
          </UFormField>
        </div>

        <!-- Side by side -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <img
              v-if="beforePhoto"
              :src="beforePhoto.url"
              class="w-full aspect-square object-cover rounded-lg border border-default"
            />
            <div v-else class="w-full aspect-square rounded-lg border border-dashed border-default flex items-center justify-center text-sm text-muted">
              No photo
            </div>
            <p class="text-xs text-muted text-center">{{ beforeDate ? formatDate(beforeDate) : '' }}</p>
          </div>
          <div class="space-y-2">
            <img
              v-if="afterPhoto"
              :src="afterPhoto.url"
              class="w-full aspect-square object-cover rounded-lg border border-default"
            />
            <div v-else class="w-full aspect-square rounded-lg border border-dashed border-default flex items-center justify-center text-sm text-muted">
              No photo
            </div>
            <p class="text-xs text-muted text-center">{{ afterDate ? formatDate(afterDate) : '' }}</p>
          </div>
        </div>

        <!-- All dates for this category, for quick stepping -->
        <div class="pt-4 border-t border-default">
          <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">All {{ photoCategoryLabel(category) }} photos</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="d in datesForCategory"
              :key="d"
              class="relative rounded-lg overflow-hidden border transition-all"
              :class="[
                d === beforeDate || d === afterDate ? 'ring-2 ring-primary' : 'border-default',
              ]"
              @click="pickDate(d)"
            >
              <img :src="photoFor(d)?.url" class="w-16 h-16 object-cover" />
            </button>
          </div>
          <p class="text-xs text-muted mt-2">Click a thumbnail to fill Before, then again to fill After.</p>
        </div>
      </template>

    </div>
  </UContainer>
</template>

<script setup lang="ts">
import exifr from 'exifr'

definePageMeta({ middleware: 'journal-auth' })

const PHOTO_CATEGORIES = [
  { value: 'chest', label: 'Chest' },
  { value: 'left_bicep', label: 'Left Bicep' },
  { value: 'right_bicep', label: 'Right Bicep' },
  { value: 'face_hairline', label: 'Face / Hairline' }
] as const
type PhotoCategory = typeof PHOTO_CATEGORIES[number]['value']

function photoCategoryLabel(value: string) {
  return PHOTO_CATEGORIES.find(c => c.value === value)?.label ?? value
}

const { data: photosData, refresh } = await usePhotoEntries()
onMounted(refresh)

const category = ref<PhotoCategory>('chest')

const photosForCategory = computed(() =>
  (photosData.value ?? [])
    .filter(p => p.category === category.value)
    .sort((a, b) => a.date.localeCompare(b.date))
)

const datesForCategory = computed(() => [...new Set(photosForCategory.value.map(p => p.date))])

const dateOptions = computed(() => datesForCategory.value.map(d => ({ value: d, label: formatDate(d) })))

function photoFor(date: string) {
  return photosForCategory.value.find(p => p.date === date)
}

// --- Bulk upload (backfilling old photos without visiting a day's journal entry) ---

interface PendingPhoto {
  id: number
  file: File
  previewUrl: string
  date: string
  category: PhotoCategory
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const pending = ref<PendingPhoto[]>([])
const uploadingAll = ref(false)
let nextPendingId = 0

function toLocalDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function addFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue

    const entry: PendingPhoto = {
      id: nextPendingId++,
      file,
      previewUrl: URL.createObjectURL(file),
      date: '',
      category: category.value,
      status: 'pending'
    }
    pending.value.push(entry)

    let exifDate: unknown = null
    try {
      const tags = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
      exifDate = tags?.DateTimeOriginal ?? tags?.CreateDate ?? null
    }
    catch {
      exifDate = null
    }
    entry.date = exifDate instanceof Date ? toLocalDateStr(exifDate) : toLocalDateStr(new Date(file.lastModified))
  }
}

function onFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) addFiles(files)
  if (fileInput.value) fileInput.value.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const files = e.dataTransfer?.files
  if (files?.length) addFiles(files)
}

function removePending(id: number) {
  const idx = pending.value.findIndex(p => p.id === id)
  if (idx < 0) return
  URL.revokeObjectURL(pending.value[idx].previewUrl)
  pending.value.splice(idx, 1)
}

const pendingCount = computed(() => pending.value.filter(p => p.status === 'pending' || p.status === 'error').length)
const hasFinished = computed(() => pending.value.some(p => p.status === 'done'))

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
  const toUpload = pending.value.filter(p => p.status === 'pending' || p.status === 'error')
  for (const p of toUpload) {
    p.status = 'uploading'
    p.error = undefined
    try {
      const body = new FormData()
      body.append('photo', p.file)
      body.append('category', p.category)
      body.append('date', p.date)
      await $fetch('/api/journal/photos/upload', { method: 'POST', body })
      p.status = 'done'
    }
    catch (err: unknown) {
      p.status = 'error'
      p.error = extractErrorMessage(err)
    }
  }
  uploadingAll.value = false
  await refresh()
}

function clearFinished() {
  pending.value = pending.value.filter((p) => {
    if (p.status !== 'done') return true
    URL.revokeObjectURL(p.previewUrl)
    return false
  })
}

onBeforeUnmount(() => {
  for (const p of pending.value) URL.revokeObjectURL(p.previewUrl)
})

const beforeDate = ref('')
const afterDate = ref('')

watch(datesForCategory, (dates) => {
  if (!dates.length) {
    beforeDate.value = ''
    afterDate.value = ''
    return
  }
  if (!dates.includes(beforeDate.value)) beforeDate.value = dates[0]
  if (!dates.includes(afterDate.value)) afterDate.value = dates.at(-1)!
}, { immediate: true })

const beforePhoto = computed(() => beforeDate.value ? photoFor(beforeDate.value) : null)
const afterPhoto = computed(() => afterDate.value ? photoFor(afterDate.value) : null)

// Clicking a thumbnail fills Before first, then After, then starts overwriting Before again.
function pickDate(date: string) {
  if (date === beforeDate.value || date === afterDate.value) return
  if (!beforeDate.value) beforeDate.value = date
  else if (!afterDate.value) afterDate.value = date
  else { beforeDate.value = afterDate.value; afterDate.value = date }
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
