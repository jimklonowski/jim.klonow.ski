<template>
  <div>
    <JournalHeader
      section="ENTRY"
      :meta="headingLabel"
    >
      <template #actions>
        <NuxtLink
          v-if="prevEntry"
          :to="`/journal/${prevEntry.date}`"
          class="text-[13px] text-faint hover:text-accent"
          aria-label="Previous entry"
        >‹</NuxtLink>
        <NuxtLink
          v-if="nextEntry"
          :to="`/journal/${nextEntry.date}`"
          class="text-[13px] text-faint hover:text-accent"
          aria-label="Next entry"
        >›</NuxtLink>
        <NuxtLink
          to="/journal/calendar"
          class="tui-btn"
        >
          CALENDAR
        </NuxtLink>
        <button
          v-if="canEdit"
          type="button"
          class="tui-btn tui-btn-accent"
          :disabled="saving || !canSave"
          @click="save"
        >
          {{ saving ? 'SAVING…' : '✓ SAVE' }}
        </button>
        <span
          v-else
          class="text-[10.5px] text-faint border border-line-input px-2 py-1.5 uppercase tracking-[0.08em]"
        >read-only</span>
      </template>
    </JournalHeader>
    <JournalNav />

    <!-- A failed list fetch must never present a blank "new entry" whose save would overwrite
         the real row (journal/save is a full-column upsert) — surface it and hold Save. -->
    <TuiDataState
      :error="entriesError"
      @retry="refresh"
    />

    <div class="px-4 sm:px-6 py-4 space-y-5">
      <!-- Every editable control sits inside one fieldset: a disabled fieldset disables all of
           its descendant inputs, selects and buttons at once, so a read-only role (friend) can't
           change a value the hidden Save button would never have sent. min-w-0 undoes the UA's
           min-inline-size: min-content, which would otherwise break the grids inside. -->
      <fieldset
        :disabled="!canEdit"
        class="min-w-0 space-y-5"
      >
        <!-- Date & vitals -->
        <section>
          <TuiHeader
            label="DATE · VITALS"
            :dashes="12"
          />
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-2.5">
            <UFormField
              label="Date"
              :ui="FIELD_UI"
            >
              <UInput
                v-model="form.date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Weight (lbs)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="form.weight_lbs"
                type="number"
                step="0.1"
                placeholder="155.0"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="BP Sys"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="form.bp_systolic"
                type="number"
                placeholder="120"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="BP Dia"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="form.bp_diastolic"
                type="number"
                placeholder="80"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="RHR (bpm)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="form.rhr"
                type="number"
                placeholder="50"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="HRV (ms)"
              :ui="FIELD_UI"
            >
              <UInput
                v-model.number="form.hrv"
                type="number"
                placeholder="44"
                class="w-full"
              />
            </UFormField>
          </div>
        </section>

        <!-- Peptides -->
        <section>
          <TuiHeader
            label="PROTOCOL · DOSES"
            :dashes="10"
          >
            <span class="flex items-center gap-3 text-[11px]">
              <button
                v-if="canEdit && prevEntry?.peptides?.length"
                type="button"
                class="text-accent hover:text-accent-hover cursor-pointer"
                @click="copyFromPrevious"
              >copy prev</button>
              <button
                v-if="canEdit"
                type="button"
                class="text-accent hover:text-accent-hover cursor-pointer"
                @click="addPeptide"
              >+ add</button>
            </span>
          </TuiHeader>

          <div
            v-if="form.peptides.length"
            class="space-y-2 mt-2.5"
          >
            <div
              v-for="(peptide, i) in form.peptides"
              :key="i"
              class="grid grid-cols-12 gap-2 items-end"
            >
              <UFormField
                label="Time"
                class="col-span-4 sm:col-span-2"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model="peptide.time"
                  type="time"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Compound"
                class="col-span-8 sm:col-span-4"
                :ui="FIELD_UI"
              >
                <UInputMenu
                  v-model="peptide.compound"
                  mode="autocomplete"
                  :items="KNOWN_COMPOUNDS"
                  open-on-click
                  placeholder="MOTS-C"
                  class="w-full"
                  :ui="SELECT_UI"
                />
              </UFormField>
              <UFormField
                label="Dose"
                class="col-span-4 sm:col-span-2"
                :ui="FIELD_UI"
                :hint="doseHelp(peptide)"
              >
                <UInput
                  v-model.number="peptide.dose"
                  type="number"
                  step="0.1"
                  placeholder="2.5"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Unit"
                class="col-span-3 sm:col-span-1"
                :ui="FIELD_UI"
              >
                <USelect
                  v-model="peptide.unit"
                  :items="DOSE_UNITS"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  :ui="SELECT_UI"
                />
              </UFormField>
              <UFormField
                label="Site"
                class="col-span-4 sm:col-span-2"
                :ui="FIELD_UI"
              >
                <USelect
                  v-model="peptide.site"
                  :items="INJECTION_SITES"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  :ui="SELECT_UI"
                />
              </UFormField>
              <div class="col-span-1 flex items-end pb-2">
                <button
                  v-if="canEdit"
                  type="button"
                  class="text-[12px] text-faint hover:text-danger cursor-pointer"
                  :aria-label="`Remove dose ${i + 1}`"
                  @click="removePeptide(i)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
          <p
            v-else
            class="mt-2.5 text-[12px] text-muted"
          >
            No doses logged.<template v-if="canEdit">
              Use + add to record injections.
            </template>
          </p>
        </section>

        <!-- Reconstitutions -->
        <section>
          <TuiHeader
            label="VIAL RECONSTITUTIONS"
            :dashes="6"
          >
            <button
              v-if="canEdit"
              type="button"
              class="text-[11px] text-accent hover:text-accent-hover cursor-pointer"
              @click="addReconstitution"
            >
              ⚗ add
            </button>
          </TuiHeader>

          <div
            v-if="form.reconstitutions.length"
            class="space-y-2 mt-2.5"
          >
            <div
              v-for="(r, i) in form.reconstitutions"
              :key="i"
              class="grid grid-cols-12 gap-2 items-end"
            >
              <UFormField
                label="Compound"
                class="col-span-6 sm:col-span-3"
                :ui="FIELD_UI"
              >
                <UInputMenu
                  v-model="r.compound"
                  mode="autocomplete"
                  :items="KNOWN_COMPOUNDS"
                  open-on-click
                  placeholder="GHK-Cu"
                  class="w-full"
                  :ui="SELECT_UI"
                />
              </UFormField>
              <UFormField
                label="Vial size"
                class="col-span-3 sm:col-span-2"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model.number="r.vial_amount"
                  type="number"
                  placeholder="50"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Unit"
                class="col-span-2 sm:col-span-1"
                :ui="FIELD_UI"
              >
                <USelect
                  v-model="r.vial_unit"
                  :items="DOSE_UNITS"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  :ui="SELECT_UI"
                />
              </UFormField>
              <UFormField
                label="Supplier"
                class="col-span-6 sm:col-span-3"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model="r.supplier"
                  placeholder="EZ Peptides"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="BAC water (mL)"
                class="col-span-5 sm:col-span-2"
                :ui="FIELD_UI"
              >
                <UInput
                  v-model.number="r.bac_water_ml"
                  type="number"
                  step="0.5"
                  placeholder="2"
                  class="w-full"
                />
              </UFormField>
              <div class="col-span-1 flex items-end pb-2">
                <button
                  v-if="canEdit"
                  type="button"
                  class="text-[12px] text-faint hover:text-danger cursor-pointer"
                  :aria-label="`Remove reconstitution ${i + 1}`"
                  @click="removeReconstitution(i)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
          <p
            v-else
            class="mt-2.5 text-[12px] text-muted"
          >
            No reconstitutions today.
          </p>
        </section>

        <!-- Food + sodas -->
        <div class="grid gap-5 lg:grid-cols-2">
          <section>
            <TuiHeader
              label="FOOD"
              :dashes="20"
            />
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
              <UFormField
                v-for="slot in MEAL_SLOTS"
                :key="slot.key"
                :label="slot.label"
                :ui="FIELD_UI"
              >
                <UInputMenu
                  v-model="form.food[slot.key]"
                  mode="autocomplete"
                  :items="mealHistory"
                  open-on-click
                  :placeholder="slot.placeholder"
                  class="w-full"
                  :ui="SELECT_UI"
                />
              </UFormField>
            </div>
          </section>

          <section>
            <TuiHeader
              label="SODA"
              :dashes="20"
            >
              <button
                v-if="canEdit"
                type="button"
                class="text-[11px] text-accent hover:text-accent-hover cursor-pointer"
                @click="addSoda"
              >
                + add
              </button>
            </TuiHeader>

            <div
              v-if="form.sodas.length"
              class="space-y-2 mt-2.5"
            >
              <div
                v-for="(soda, i) in form.sodas"
                :key="i"
                class="grid grid-cols-12 gap-2 items-end"
              >
                <UFormField
                  label="Time"
                  class="col-span-3"
                  :ui="FIELD_UI"
                >
                  <UInput
                    v-model="soda.time"
                    type="time"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Drink"
                  class="col-span-4"
                  :ui="FIELD_UI"
                >
                  <UInputMenu
                    v-model="soda.drink"
                    mode="autocomplete"
                    :items="SODA_DRINKS"
                    open-on-click
                    placeholder="Dr Pepper"
                    class="w-full"
                    :ui="SELECT_UI"
                  />
                </UFormField>
                <UFormField
                  label="Size"
                  class="col-span-4"
                  :ui="FIELD_UI"
                >
                  <UInputMenu
                    v-model="soda.size"
                    mode="autocomplete"
                    :items="SODA_SIZES"
                    open-on-click
                    placeholder="12oz can"
                    class="w-full"
                    :ui="SELECT_UI"
                  />
                </UFormField>
                <div class="col-span-1 flex items-end pb-2">
                  <button
                    v-if="canEdit"
                    type="button"
                    class="text-[12px] text-faint hover:text-danger cursor-pointer"
                    :aria-label="`Remove soda ${i + 1}`"
                    @click="removeSoda(i)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <p
              v-else
              class="mt-2.5 text-[12px] text-muted"
            >
              No sodas logged.
            </p>
          </section>
        </div>
      </fieldset>

      <!-- Progress photos -->
      <section>
        <TuiHeader
          label="PROGRESS PHOTOS"
          :dashes="8"
        >
          <span
            v-if="dayPhotos.length"
            class="text-[10.5px] text-muted"
          >{{ dayPhotos.length }} on file</span>
        </TuiHeader>

        <!-- Same category strip as the photos page, so a photo is filed the same way from either. -->
        <TuiTabs
          v-if="isOwner"
          v-model="uploadCategory"
          :items="PHOTO_CATEGORIES"
          cols="grid-cols-3 md:grid-cols-6"
          class="mt-2.5"
        />

        <UFileUpload
          v-if="isOwner"
          v-model="pendingFile"
          accept="image/*"
          layout="list"
          position="inside"
          icon="i-lucide-camera"
          :label="`Drop a ${photoCategoryLabel(uploadCategory)} photo here`"
          description="or click to browse — date is detected automatically from EXIF"
          class="w-full mt-2.5"
          :ui="{
            base: 'bg-raised border border-dashed border-line-input',
            label: 'text-[12.5px] text-body',
            description: 'text-[11px] text-muted'
          }"
        >
          <template #file="{ removeFile }">
            <!-- .stop: this slot renders inside the dropzone, whose own click handler opens
                 the file picker — without it, UPLOAD/CANCEL/date clicks re-open the picker. -->
            <div
              class="flex items-center gap-4 w-full"
              @click.stop
            >
              <!-- Decorative: the date field beside it is the content. -->
              <img
                v-if="pendingPreviewUrl"
                :src="pendingPreviewUrl"
                alt=""
                class="w-24 h-24 object-cover border border-line"
              >
              <div class="flex-1 space-y-2">
                <UFormField
                  label="Date"
                  description="Detected from the photo's EXIF data — edit if it's wrong"
                  :ui="FIELD_UI"
                >
                  <UInput
                    v-model="pendingDate"
                    type="date"
                    class="w-full"
                  />
                </UFormField>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="tui-btn tui-btn-accent"
                    :disabled="photoUploading"
                    @click="confirmUploadPhoto"
                  >
                    {{ photoUploading ? 'UPLOADING…' : '↑ UPLOAD' }}
                  </button>
                  <button
                    type="button"
                    class="tui-btn"
                    @click="removeFile()"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          </template>
        </UFileUpload>

        <p
          v-if="photoError"
          class="mt-2 text-[12px] text-danger"
        >
          {{ photoError }}
        </p>

        <template
          v-for="c in PHOTO_CATEGORIES"
          :key="c.value"
        >
          <div
            v-if="photosFor(c.value).length"
            class="mt-3"
          >
            <p class="text-[10.5px] text-muted uppercase tracking-[0.12em] mb-1.5">
              {{ c.label }}
            </p>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="photo in photosFor(c.value)"
                :key="photo.id"
                class="relative group"
              >
                <!-- A button, not a click handler on the image: opening the lightbox has to be
                     reachable by keyboard and announced as an action. -->
                <button
                  type="button"
                  class="block"
                  :aria-label="`Enlarge the ${photoCategoryLabel(photo.category)} photo`"
                  @click="lightboxPhoto = photo"
                >
                  <img
                    :src="photo.thumbUrl ?? photo.url"
                    alt=""
                    loading="lazy"
                    class="w-20 h-20 object-cover border border-line cursor-pointer hover:border-line-accent transition-colors"
                  >
                </button>
                <button
                  v-if="isOwner"
                  type="button"
                  class="absolute top-0 right-0 px-1 text-[11px] bg-bg text-faint hover:text-danger tui-row-action cursor-pointer"
                  aria-label="Delete photo"
                  @click="deletePhoto(photo.id)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </template>

        <UEmpty
          v-if="!dayPhotos.length"
          icon="i-lucide-image-off"
          title="No progress photos"
          description="No progress photos for this day yet."
          class="mt-2"
          :ui="{ title: 'text-[12.5px] text-body', description: 'text-[11px] text-muted' }"
        />
      </section>

      <!-- Synced workouts -->
      <section v-if="dayWorkouts.length">
        <TuiHeader
          label="WORKOUTS · SYNCED"
          :dashes="8"
        />
        <div class="mt-2.5">
          <div
            v-for="(w, i) in dayWorkouts"
            :key="w.id"
            class="flex items-baseline justify-between gap-3 px-2 py-1.5 text-[12.5px]"
            :class="i % 2 ? 'bg-inset' : ''"
            :title="w.sources.length > 1 ? w.sources.join(' + ') : undefined"
          >
            <span class="text-hi">{{ w.workout_type ?? 'Workout' }}</span>
            <span class="text-muted">{{ workoutMeta(w) }}</span>
          </div>
        </div>
      </section>

      <!-- Notes -->
      <section>
        <TuiHeader
          label="NOTES"
          :dashes="20"
        />
        <UTextarea
          v-model="form.notes"
          :disabled="!canEdit"
          placeholder="Any observations, how you felt, etc."
          :rows="3"
          class="w-full mt-2.5"
        />
      </section>

      <div
        v-if="canEdit"
        class="flex justify-end gap-2"
      >
        <NuxtLink
          to="/journal"
          class="tui-btn"
        >
          CANCEL
        </NuxtLink>
        <button
          type="button"
          class="tui-btn tui-btn-accent"
          :disabled="saving || !canSave"
          @click="save"
        >
          {{ saving ? 'SAVING…' : '✓ SAVE ENTRY' }}
        </button>
      </div>
    </div>

    <JournalPhotoLightbox v-model:photo="lightboxPhoto" />
  </div>
</template>

<script setup lang="ts">
import { KNOWN_COMPOUNDS, DOSE_UNITS, INJECTION_SITES, SODA_DRINKS, SODA_SIZES, blankEntry, blankSoda, oppositeSite } from '~/data/journal'
import type { PeptideEntry, ReconstitutionEntry, SodaEntry } from '~/data/journal'
import type { ProgressPhoto } from '~/composables/usePhotoEntries'
import type { WorkoutEntry } from '#shared/types/journal'
import type { PhotoCategory } from '#shared/utils/photoCategories'
import { PHOTO_CATEGORIES, photoCategoryLabel } from '#shared/utils/photoCategories'

// Shared :ui overrides so every field on this long form reads the same.
const FIELD_UI = { hint: 'text-[10px] text-faint' }
// Shared by the USelects and the autocomplete UInputMenus (compound / food / soda) so every
// popover on the form matches. Autocomplete mode keeps whatever is typed as the value and only
// suggests from `items`, so off-list compounds and freeform meals still work.
const SELECT_UI = { item: 'text-[12px]' }

/** Live "≈ 0.67 mg" hint beside the Dose label for IU compounds with a known mass factor. */
function doseHelp(p: PeptideEntry): string | undefined {
  if (p.unit !== 'iu') return undefined
  return iuEquivalentLabel(p.compound, p.dose) ?? undefined
}

const MEAL_SLOTS = [
  { key: 'breakfast', label: 'Breakfast', placeholder: 'Protein shake + creatine' },
  { key: 'snack', label: 'Snack', placeholder: 'Sourdough' },
  { key: 'lunch', label: 'Lunch', placeholder: 'Chipotle bowl' },
  { key: 'dinner', label: 'Dinner', placeholder: 'Steak + veggies' }
] as const

const route = useRoute()
const toast = useToast()

const dateParam = computed(() => route.params.date as string)

// /journal/not-a-date used to open a blank form whose save inserted a garbage-dated row
// (journal/save checks only that `date` is a string). A real calendar day or nothing.
if (!isIsoDate(dateParam.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Not a journal date' })
}

// Must come after dateParam: on the client unhead resolves the title getter synchronously
// during setup, so declaring this above `dateParam` threw a TDZ ReferenceError that aborted
// hydration and left the whole form inert (SSR markup only, no click handlers).
useSeoMeta({ title: () => `Journal · ${dateParam.value}` })

const { data: allEntries, error: entriesError, refresh } = await useJournalEntries()
const { isOwner, canEdit } = await useAuth()
const { data: workoutsData } = await useWorkoutsEntries()
const { data: photosData, refresh: refreshPhotos } = await usePhotoEntries()

const dayWorkouts = computed(() => (workoutsData.value ?? []).filter(w => w.date === dateParam.value))

/** "MON 2026-08-24" — the terminal heading form. */
const headingLabel = computed(() => {
  if (isNew.value) return 'NEW ENTRY'
  const weekday = new Date(form.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
  return `${weekday.toUpperCase()} ${form.date}`
})

function workoutMeta(w: WorkoutEntry) {
  return [
    w.duration_min != null ? `${w.duration_min} min` : null,
    w.calories != null ? `${w.calories} kcal` : null,
    w.avg_hr != null ? `♥ ${w.avg_hr}` : null,
    w.distance_mi != null ? `${w.distance_mi} mi` : null
  ].filter(Boolean).join(' · ')
}

// --- Progress Photos --- (categories: shared/utils/photoCategories.ts)

const dayPhotos = computed(() => (photosData.value ?? []).filter(p => p.date === dateParam.value))
function photosFor(category: PhotoCategory) {
  return dayPhotos.value.filter(p => p.category === category)
}

const uploadCategory = ref<PhotoCategory>('chest')
const pendingFile = ref<File | null>(null)
const pendingPreviewUrl = ref('')
const pendingDate = ref(dateParam.value)
const photoUploading = ref(false)
const photoError = ref('')

// UFileUpload owns selection/drag-drop via its v-model - react to the file it hands us instead
// of wiring up input/drop events ourselves.
watch(pendingFile, async (file) => {
  if (pendingPreviewUrl.value) {
    URL.revokeObjectURL(pendingPreviewUrl.value)
    pendingPreviewUrl.value = ''
  }
  photoError.value = ''
  if (!file) return

  pendingPreviewUrl.value = URL.createObjectURL(file)
  pendingDate.value = await photoDateOf(file)
})

async function confirmUploadPhoto() {
  if (!pendingFile.value) return
  photoUploading.value = true
  photoError.value = ''
  try {
    await uploadProgressPhoto(pendingFile.value, uploadCategory.value, pendingDate.value)
    pendingFile.value = null
    await refreshPhotos()
    toast.add({ title: 'Photo uploaded', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err: unknown) {
    photoError.value = extractErrorMessage(err, 'Upload failed')
  }
  finally {
    photoUploading.value = false
  }
}

// No catch used to mean a failed delete was an unhandled rejection with nothing on screen.
const { run: deletePhoto } = useSaveAction(async (id: number) => {
  await $fetch('/api/journal/photos/delete', { method: 'POST', body: { id } })
  if (lightboxPhoto.value?.id === id) lightboxPhoto.value = null
  await refreshPhotos()
}, { error: 'Delete failed' })

const lightboxPhoto = ref<ProgressPhoto | null>(null)

const existingEntry = computed(() =>
  allEntries.value?.find(e => e.date === dateParam.value) ?? null
)

// "New" only once the list has actually loaded — a failed fetch is unknown, not empty.
const isNew = computed(() => allEntries.value != null && !existingEntry.value)

// Saving needs the list: without it we can't tell a genuinely new day from a row we simply
// failed to load, and journal/save would overwrite that row with the blank form.
const canSave = computed(() => !entriesError.value && allEntries.value != null)

const prevEntry = computed(() => {
  if (!allEntries.value?.length) return null
  return allEntries.value.filter(e => e.date < dateParam.value).at(-1) ?? null
})

const nextEntry = computed(() => {
  if (!allEntries.value?.length) return null
  return allEntries.value.filter(e => e.date > dateParam.value)[0] ?? null
})

// Sides alternate day to day, so each copied dose lands on the mirror of the
// previous entry's site (left_glute → right_glute); unsided routes copy as-is.
function copyFromPrevious() {
  if (!prevEntry.value?.peptides?.length) return
  form.peptides = prevEntry.value.peptides.map(p => ({ ...p, site: oppositeSite(p.site) }))
}

// Pooled across all four meal slots (and all days) so an order typed for lunch once
// autocompletes for dinner too - powers the suggestion menu on each Food input.
const mealHistory = computed(() => {
  const counts: Record<string, number> = {}
  for (const e of allEntries.value ?? []) {
    for (const slot of MEAL_SLOTS) {
      const v = e.food?.[slot.key]?.trim()
      if (v) counts[v] = (counts[v] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .sort(([va, a], [vb, b]) => b - a || va.localeCompare(vb))
    .map(([v]) => v)
})

const form = reactive<{
  date: string
  weight_lbs: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  rhr: number | null
  hrv: number | null
  peptides: PeptideEntry[]
  reconstitutions: ReconstitutionEntry[]
  food: { breakfast: string, snack: string, lunch: string, dinner: string }
  sodas: SodaEntry[]
  notes: string
}>(buildForm())

// "Clean" = the form still matches what it was last built from (or saved as). The guard also
// asks before leaving the page, or closing the tab, with unsaved edits.
//
// The mounted revalidation (and any refresh triggered elsewhere) replaces the list a few hundred
// ms after the page renders, which gives `existingEntry` a new identity. Rebuilding
// unconditionally wiped whatever had been typed in that window, so it rebuilds only while clean.
const formGuard = useDirtyGuard(() => form)

watch(existingEntry, () => {
  if (formGuard.isDirty.value) return
  Object.assign(form, buildForm())
  formGuard.markClean()
})

function buildForm() {
  const entry = existingEntry.value
  if (!entry) {
    const blank = blankEntry(dateParam.value)
    return {
      date: blank.date,
      weight_lbs: blank.weight_lbs ?? null,
      bp_systolic: blank.bp_systolic ?? null,
      bp_diastolic: blank.bp_diastolic ?? null,
      rhr: blank.rhr ?? null,
      hrv: blank.hrv ?? null,
      peptides: [] as PeptideEntry[],
      reconstitutions: [] as ReconstitutionEntry[],
      food: { breakfast: '', snack: '', lunch: '', dinner: '' },
      sodas: [] as SodaEntry[],
      notes: ''
    }
  }
  return {
    date: entry.date,
    weight_lbs: entry.weight_lbs ?? null,
    bp_systolic: entry.bp_systolic ?? null,
    bp_diastolic: entry.bp_diastolic ?? null,
    rhr: entry.rhr ?? null,
    hrv: entry.hrv ?? null,
    peptides: (entry.peptides ?? []).map(p => ({ ...p })),
    reconstitutions: (entry.reconstitutions ?? []).map(r => ({ ...r })),
    food: {
      breakfast: entry.food?.breakfast ?? '',
      snack: entry.food?.snack ?? '',
      lunch: entry.food?.lunch ?? '',
      dinner: entry.food?.dinner ?? ''
    },
    sodas: (entry.sodas ?? []).map(s => ({ ...s })),
    notes: entry.notes ?? ''
  }
}

function addPeptide() {
  form.peptides.push({ time: '', compound: '', dose: 0, unit: 'mg', site: 'left_glute' })
}

function removePeptide(i: number) {
  form.peptides.splice(i, 1)
}

function addReconstitution() {
  form.reconstitutions.push({ compound: '', vial_amount: 0, vial_unit: 'mg', supplier: '', bac_water_ml: 0 })
}

function removeReconstitution(i: number) {
  form.reconstitutions.splice(i, 1)
}

function addSoda() {
  form.sodas.push(blankSoda(localTimeNow()))
}

function removeSoda(i: number) {
  form.sodas.splice(i, 1)
}

const { run: save, pending: saving } = useSaveAction(async () => {
  const payload = {
    ...form,
    food: Object.fromEntries(
      Object.entries(form.food).filter(([, v]) => v !== '')
    )
  }
  await $fetch('/api/journal/save', { method: 'POST', body: payload })
  // What was just saved is now the baseline, so the refresh below may rebuild from the row.
  formGuard.markClean()
  // The shell's streak / logged / soda figures come from the scalar summary, not this list.
  await Promise.all([refresh(), refreshNuxtData('overview')])
}, { success: 'Entry saved' })
</script>
