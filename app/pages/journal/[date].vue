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
          class="text-prose text-faint hover:text-accent"
          aria-label="Previous entry"
        >‹</NuxtLink>
        <NuxtLink
          v-if="nextEntry"
          :to="`/journal/${nextEntry.date}`"
          class="text-prose text-faint hover:text-accent"
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
          {{ saveLabel }}
        </button>
        <span
          v-else
          class="text-label text-faint border border-line-input px-2 py-1.5 uppercase tracking-[0.08em]"
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
              :help="dateHelp"
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
            <span class="flex items-center gap-3 text-meta">
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
                  class="text-small text-faint hover:text-danger cursor-pointer"
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
            class="mt-2.5 text-small text-muted"
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
              class="text-meta text-accent hover:text-accent-hover cursor-pointer"
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
                  class="text-small text-faint hover:text-danger cursor-pointer"
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
            class="mt-2.5 text-small text-muted"
          >
            No reconstitutions today.
          </p>
        </section>

        <!-- Food + sodas + water: food takes the left column for both rows, the two drink logs
             stack on the right. Below lg they simply follow one another. -->
        <div class="grid gap-5 lg:grid-cols-2">
          <section class="lg:row-span-2">
            <TuiHeader
              label="FOOD"
              :dashes="20"
            >
              <!-- The day's total, sodas included — "≈ … est." when any figure is the model's,
                   and a floor (the trailing +) while any meal has no figures at all. -->
              <span
                v-if="foodTotals.estimated"
                class="text-meta text-muted"
              >{{ foodEstimated ? '≈ ' : '' }}{{ fmtKcal(foodTotals.kcal) }} kcal · {{ fmtMacros(foodTotals) }}<span class="text-faint">{{ foodEstimated ? ' est.' : '' }}{{ foodTotals.missing.length ? ' +' : '' }}</span></span>
            </TuiHeader>
            <!-- Day order, one column: the three meals always, a snack slot where one was logged
                 or opened with its "+ snack", the legacy single Snack only on days that have one. -->
            <div class="space-y-2.5 mt-2.5">
              <template
                v-for="row in FOOD_ROWS"
                :key="row.key"
              >
                <UFormField
                  v-if="!row.snack || snackOpen(row.key)"
                  :label="row.label"
                  :ui="FIELD_UI"
                >
                  <UInputMenu
                    v-model="form.food[row.key]"
                    mode="autocomplete"
                    :items="mealHistoryBySlot[row.key]"
                    open-on-click
                    :placeholder="row.placeholder"
                    class="w-full"
                    :ui="SELECT_UI"
                  />
                  <template #help>
                    <JournalMealEstimate
                      :text="form.food[row.key]"
                      @replace="form.food[row.key] = $event"
                    />
                  </template>
                </UFormField>
                <button
                  v-else-if="canEdit && row.key !== 'snack'"
                  type="button"
                  class="block text-meta text-faint hover:text-accent cursor-pointer"
                  @click="openSnack(row.key)"
                >
                  + {{ row.label.toLowerCase() }}
                </button>
              </template>
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
                class="text-meta text-accent hover:text-accent-hover cursor-pointer"
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
                    class="text-small text-faint hover:text-danger cursor-pointer"
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
              class="mt-2.5 text-small text-muted"
            >
              No sodas logged.
            </p>
          </section>

          <section>
            <TuiHeader
              label="WATER"
              :dashes="20"
            >
              <span class="flex items-center gap-3 text-meta">
                <span
                  v-if="form.water.length"
                  class="text-muted"
                >{{ waterTotals(form.water).oz }} oz</span>
                <button
                  v-if="canEdit"
                  type="button"
                  class="text-accent hover:text-accent-hover cursor-pointer"
                  @click="addWater"
                >+ cup</button>
              </span>
            </TuiHeader>

            <div
              v-if="form.water.length"
              class="space-y-2 mt-2.5"
            >
              <div
                v-for="(w, i) in form.water"
                :key="i"
                class="grid grid-cols-12 gap-2 items-end"
              >
                <UFormField
                  label="Time"
                  class="col-span-4"
                  :ui="FIELD_UI"
                >
                  <UInput
                    v-model="w.time"
                    type="time"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Ounces"
                  class="col-span-7"
                  :ui="FIELD_UI"
                >
                  <UInput
                    v-model.number="w.oz"
                    type="number"
                    inputmode="decimal"
                    min="1"
                    :max="WATER_MAX_OZ_PER_ENTRY"
                    step="0.5"
                    class="w-full"
                  />
                </UFormField>
                <div class="col-span-1 flex items-end pb-2">
                  <button
                    v-if="canEdit"
                    type="button"
                    class="text-small text-faint hover:text-danger cursor-pointer"
                    :aria-label="`Remove pour ${i + 1}`"
                    @click="removeWater(i)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <p
              v-else
              class="mt-2.5 text-small text-muted"
            >
              No water logged.
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
            class="text-label text-muted"
          >{{ dayPhotos.length }} on file</span>
        </TuiHeader>

        <!-- Desktop: uploader in a fixed left column, the day's photos beside it, so the
             dropzone doesn't stretch across the whole page. Stacks below lg. -->
        <div
          class="mt-2.5 grid gap-4"
          :class="{ 'lg:grid-cols-[24rem_minmax(0,1fr)]': isOwner }"
        >
          <div
            v-if="isOwner"
            class="min-w-0"
          >
            <!-- Same category strip as the photos page, so a photo is filed the same way from either. -->
            <TuiTabs
              v-model="uploadCategory"
              :items="PHOTO_CATEGORIES"
              cols="grid-cols-3 md:grid-cols-6 lg:grid-cols-3"
            />

            <UFileUpload
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
                label: 'text-row text-body',
                description: 'text-meta text-muted'
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
              class="mt-2 text-small text-danger"
            >
              {{ photoError }}
            </p>
          </div>

          <!-- Contact sheet: one square tile per photo in category order, captioned underneath.
               For the owner an empty category keeps its slot as a dashed tile that points the
               uploader at it, so the sheet doubles as "what's still missing today". -->
          <div class="min-w-0">
            <div
              v-if="isOwner || dayPhotos.length"
              class="grid grid-cols-3 sm:grid-cols-6 gap-2.5"
            >
              <template
                v-for="c in PHOTO_CATEGORIES"
                :key="c.value"
              >
                <figure
                  v-for="photo in photosFor(c.value)"
                  :key="photo.id"
                  class="relative group min-w-0"
                >
                  <!-- A button, not a click handler on the image: opening the lightbox has to be
                       reachable by keyboard and announced as an action. -->
                  <button
                    type="button"
                    class="block w-full aspect-square overflow-hidden border border-line-soft hover:border-line-accent transition-colors cursor-zoom-in"
                    :aria-label="`Enlarge the ${c.label} photo`"
                    @click="lightboxPhoto = photo"
                  >
                    <img
                      :src="photo.thumbUrl ?? photo.url"
                      alt=""
                      loading="lazy"
                      class="w-full h-full object-cover"
                      :class="{ '-scale-x-100': photo.frameFlip }"
                    >
                  </button>
                  <button
                    v-if="isOwner"
                    type="button"
                    class="absolute top-1 right-1 px-1 text-meta bg-bg/80 text-faint hover:text-danger tui-row-action cursor-pointer"
                    aria-label="Delete photo"
                    @click="deletePhoto(photo.id)"
                  >
                    ✕
                  </button>
                  <figcaption
                    class="mt-1 text-label uppercase tracking-[0.12em] truncate"
                    :class="isOwner && uploadCategory === c.value ? 'text-accent' : 'text-muted'"
                  >
                    {{ c.label }}
                  </figcaption>
                </figure>

                <figure
                  v-if="isOwner && !photosFor(c.value).length"
                  class="min-w-0"
                >
                  <button
                    type="button"
                    class="w-full aspect-square flex flex-col items-center justify-center gap-1 border border-dashed text-meta transition-colors cursor-pointer"
                    :class="uploadCategory === c.value
                      ? 'border-line-accent text-accent bg-raised'
                      : 'border-line-input text-faint hover:text-muted hover:border-line-accent'"
                    :aria-label="`Upload a ${c.label} photo`"
                    :aria-pressed="uploadCategory === c.value"
                    @click="uploadCategory = c.value"
                  >
                    <UIcon
                      name="i-lucide-plus"
                      class="w-4 h-4"
                    />
                    <span>add</span>
                  </button>
                  <figcaption
                    class="mt-1 text-label uppercase tracking-[0.12em] truncate"
                    :class="uploadCategory === c.value ? 'text-accent' : 'text-faint'"
                  >
                    {{ c.label }}
                  </figcaption>
                </figure>
              </template>
            </div>

            <!-- h-full: fills the row beside the uploader instead of a short box floating at the top. -->
            <UEmpty
              v-if="!isOwner && !dayPhotos.length"
              icon="i-lucide-image-off"
              title="No progress photos"
              description="No progress photos for this day yet."
              class="h-full"
              :ui="{ title: 'text-row text-body', description: 'text-meta text-muted' }"
            />
          </div>
        </div>
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
            class="flex items-baseline justify-between gap-3 px-2 py-1.5 text-row"
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
          {{ saveLabel === '✓ SAVE' ? '✓ SAVE ENTRY' : saveLabel }}
        </button>
      </div>
    </div>

    <JournalPhotoLightbox v-model:photo="lightboxPhoto" />
  </div>
</template>

<script setup lang="ts">
import { KNOWN_COMPOUNDS, DOSE_UNITS, INJECTION_SITES, SODA_DRINKS, SODA_SIZES, blankEntry, blankSoda, blankWater, oppositeSite } from '~/data/journal'
import type { PeptideEntry, ReconstitutionEntry, SodaEntry, WaterEntry } from '~/data/journal'
import { WATER_DEFAULT_CUP_OZ, WATER_MAX_OZ_PER_ENTRY, waterSetting, waterTotals } from '#shared/utils/water'
import { MEAL_SLOTS, dayNutrition, fmtKcal, fmtMacros, knownMeals, mealHistory, nutritionIsEstimated, resolveMealText, type MealSlot } from '#shared/utils/nutrition'
import type { DayLogFields } from '#shared/utils/journalMerge'
import type { ProgressPhoto } from '~/composables/usePhotoEntries'
import type { WorkoutEntry } from '#shared/types/journal'
import type { PhotoCategory } from '#shared/utils/photoCategories'
import { PHOTO_CATEGORIES, photoCategoryLabel } from '#shared/utils/photoCategories'

// Shared :ui overrides so every field on this long form reads the same.
const FIELD_UI = { hint: 'text-micro text-faint' }
// Shared by the USelects and the autocomplete UInputMenus (compound / food / soda) so every
// popover on the form matches. Autocomplete mode keeps whatever is typed as the value and only
// suggests from `items`, so off-list compounds and freeform meals still work.
const SELECT_UI = { item: 'text-small' }

/** Live "≈ 0.67 mg" hint beside the Dose label for IU compounds with a known mass factor. */
function doseHelp(p: PeptideEntry): string | undefined {
  if (p.unit !== 'iu') return undefined
  return iuEquivalentLabel(p.compound, p.dose) ?? undefined
}

// Day order (shared/utils/nutrition.ts MEAL_SLOTS). `snack` is the legacy single slot: shown
// when a day has one, never offered as a "+ snack" — new snacks say which gap they sit in.
const FOOD_ROWS: Array<{ key: MealSlot, label: string, placeholder: string, snack?: boolean }> = [
  { key: 'breakfast', label: 'Breakfast', placeholder: 'Protein shake + creatine' },
  { key: 'snack', label: 'Snack', placeholder: 'Sourdough', snack: true },
  { key: 'snack_am', label: 'Morning snack', placeholder: 'Beef sticks', snack: true },
  { key: 'lunch', label: 'Lunch', placeholder: 'Chipotle bowl' },
  { key: 'snack_pm', label: 'Afternoon snack', placeholder: 'Sourdough', snack: true },
  { key: 'dinner', label: 'Dinner', placeholder: 'Steak + veggies' },
  { key: 'snack_eve', label: 'Evening snack', placeholder: 'Watermelon', snack: true }
]

// Snack slots opened with "+ snack" this visit, so an empty one stays visible to type into.
const openedSnacks = ref<MealSlot[]>([])
function snackOpen(slot: MealSlot): boolean {
  return form.food[slot] !== '' || openedSnacks.value.includes(slot)
}
function openSnack(slot: MealSlot) {
  if (!openedSnacks.value.includes(slot)) openedSnacks.value = [...openedSnacks.value, slot]
}

/** Every slot as '' or its text — the form always holds all keys, the row only the logged ones. */
function blankFood(food?: Partial<Record<MealSlot, string>> | null): Record<MealSlot, string> {
  return Object.fromEntries(MEAL_SLOTS.map(s => [s, food?.[s] ?? ''])) as Record<MealSlot, string>
}

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
const { data: profileData } = await useProfile()
const { index: estimateIndex } = await useMealEstimates()

/** What "+ cup" pre-fills — the tracker's cup size from the profile, or the default. */
const cupOz = computed(() => waterSetting(profileData.value ?? {}, 'cup_oz', WATER_DEFAULT_CUP_OZ))

const dayWorkouts = computed(() => (workoutsData.value ?? []).filter(w => w.date === dateParam.value))

/** "MON 2026-08-24" — the terminal heading form. The day being edited, even while the Date field holds a move. */
const headingLabel = computed(() => {
  if (isNew.value) return 'NEW ENTRY'
  const weekday = new Date(dateParam.value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
  return `${weekday.toUpperCase()} ${dateParam.value}`
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
const { run: runDeletePhoto } = useSaveAction(async (id: number) => {
  await $fetch('/api/journal/photos/delete', { method: 'POST', body: { id } })
  if (lightboxPhoto.value?.id === id) lightboxPhoto.value = null
  await refreshPhotos()
}, { error: 'Delete failed' })

function deletePhoto(id: number) {
  if (window.confirm('Delete this photo? It can be restored from Tools → Data for 30 days.')) runDeletePhoto(id)
}

const lightboxPhoto = ref<ProgressPhoto | null>(null)

const existingEntry = computed(() =>
  allEntries.value?.find(e => e.date === dateParam.value) ?? null
)

// "New" only once the list has actually loaded — a failed fetch is unknown, not empty.
const isNew = computed(() => allEntries.value != null && !existingEntry.value)

// Saving needs the list: without it we can't tell a genuinely new day from a row we simply
// failed to load, and journal/save would overwrite that row with the blank form. And a real
// date — a cleared date input reads as '' and would be a 400 from the schema.
const canSave = computed(() => !entriesError.value && allEntries.value != null && isIsoDate(form.date))

// The Date field moves the day. Saving under a changed date used to be a silent overwrite:
// journal/save upserts on the body's date, so the target day's row was replaced and this one
// left behind with no record of it. Now an existing row is saved under the day it was opened
// from, journal/move renames it in one audited transaction, and the page follows it. A day that
// already holds an entry is replaced only after a confirm, and `replace` goes to the server only
// when the list showed the day occupied — a row that appeared since the page loaded (the Apple
// Health webhook writes today's weight) is a 409 and a toast, not a loss.
const dateMoved = computed(() => form.date !== dateParam.value)
const targetEntry = computed(() => (dateMoved.value ? allEntries.value?.find(e => e.date === form.date) ?? null : null))
const dateHelp = computed(() => {
  if (!dateMoved.value || !isIsoDate(form.date)) return undefined
  if (targetEntry.value) return `${form.date} already has an entry (${entrySummary(targetEntry.value)}) — saving replaces it`
  return isNew.value ? `Saves under ${form.date}` : `Saving moves this entry to ${form.date}`
})

/** "3 doses, weight 169.8, 2 sodas, 84 oz water, notes" — what a day holds, for the replace confirm. */
function entrySummary(e: NonNullable<typeof allEntries.value>[number]): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  return [
    e.peptides?.length ? n(e.peptides.length, 'dose') : null,
    e.weight_lbs != null ? `weight ${e.weight_lbs}` : null,
    e.sodas?.length ? n(e.sodas.length, 'soda') : null,
    e.water?.length ? `${waterTotals(e.water).oz} oz water` : null,
    e.notes?.trim() ? 'notes' : null
  ].filter(Boolean).join(', ') || 'vitals only'
}

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
// autocompletes for dinner too, but ranked per slot (this slot's own history first) and with
// every spelling of a meal folded into its most-used one — shared/utils/nutrition.ts.
const mealHistoryBySlot = computed(() =>
  Object.fromEntries(MEAL_SLOTS.map(s => [s, mealHistory(allEntries.value ?? [], s).map(h => h.text)])) as Record<MealSlot, string[]>
)

// The day as this form LOADED it. Sent with the save so the server keeps anything logged
// elsewhere while the form was open (a phone water tap, a hub quick-logged lunch, a webhook
// weight) instead of overwriting it — shared/utils/journalMerge.ts. Re-snapshotted whenever
// the form is rebuilt from the row, which only happens while the form is clean.
const loadedBase = ref<DayLogFields | null>(null)

const form = reactive<{
  date: string
  weight_lbs: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  rhr: number | null
  hrv: number | null
  peptides: PeptideEntry[]
  reconstitutions: ReconstitutionEntry[]
  food: Record<MealSlot, string>
  sodas: SodaEntry[]
  water: WaterEntry[]
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

/**
 * The day's nutrition as the form stands — unsaved edits included, since the chips follow the
 * inputs. Nothing is estimated automatically: a meal with no figures shows "enter macros →" on
 * its chip (and an explicit AI option) for the owner.
 */
const foodTotals = computed(() => dayNutrition({ food: form.food, sodas: form.sodas }, estimateIndex.value))
const foodEstimated = computed(() => nutritionIsEstimated(foodTotals.value))

/** Every meal with figures, for pairing a re-worded entry with the one it means (see resolveMealText). */
const knownMealList = computed(() => knownMeals(allEntries.value ?? [], estimateIndex.value))

function buildForm() {
  const entry = existingEntry.value
  loadedBase.value = {
    weight_lbs: entry?.weight_lbs ?? null,
    bp_systolic: entry?.bp_systolic ?? null,
    bp_diastolic: entry?.bp_diastolic ?? null,
    rhr: entry?.rhr ?? null,
    hrv: entry?.hrv ?? null,
    sodas: (entry?.sodas ?? []).map(s => ({ ...s })),
    water: (entry?.water ?? []).map(w => ({ ...w })),
    food: { ...(entry?.food ?? {}) }
  }
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
      food: blankFood(),
      sodas: [] as SodaEntry[],
      water: [] as WaterEntry[],
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
    food: blankFood(entry.food),
    sodas: (entry.sodas ?? []).map(s => ({ ...s })),
    water: (entry.water ?? []).map(w => ({ ...w })),
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

function addWater() {
  form.water.push(blankWater(localTimeNow(), cupOz.value))
}

function removeWater(i: number) {
  form.water.splice(i, 1)
}

/** The confirm stays with the caller (see useSaveAction): replacing an occupied day is asked here, once. */
function save() {
  const target = targetEntry.value
  if (target && !window.confirm(
    `${form.date} already has an entry (${entrySummary(target)}). Replace it with this one? The replaced day can be restored from Tools → Data.`
  )) return
  runSave()
}

const { run: runSave, pending: saving } = useSaveAction(async () => {
  const from = dateParam.value
  const to = form.date
  // An existing row moves: saved under the day it was opened from, then renamed. A new day is
  // simply written under the date chosen. Either way the page follows the entry.
  const moving = to !== from && existingEntry.value != null
  // A meal typed as a new spelling of one that has figures is saved as that one (same key or a
  // strong match) and the toast below says so; the form shows the saved spelling after refresh.
  const paired: string[] = []
  const food = Object.fromEntries(
    Object.entries(form.food)
      .filter(([, v]) => v.trim() !== '')
      .map(([slot, v]) => {
        const r = resolveMealText(v, knownMealList.value)
        if (r.changed) paired.push(`${slot}: "${r.text}"`)
        return [slot, r.text]
      })
  )
  const payload = {
    ...form,
    date: moving ? from : to,
    food,
    // A pour row added and never filled (or cleared — v-model.number hands back '') is not a
    // pour; zWaterEntry refuses a missing volume rather than storing a 0 oz tap.
    water: form.water.filter(w => typeof w.oz === 'number' && w.oz > 0),
    // What this form started from, so the server merges rather than overwrites (see loadedBase).
    base: loadedBase.value ?? undefined
  }
  const saved = await $fetch<{ ok: boolean, date: string, kept: string[] }>('/api/journal/save', { method: 'POST', body: payload })
  if (moving) await $fetch('/api/journal/move', { method: 'POST', body: { from, to, replace: targetEntry.value != null } })
  if (paired.length) {
    toast.add({ title: 'Meals matched to ones with figures', description: `Saved as ${paired.join(', ')}. Edit the field if that was wrong.`, color: 'info', icon: 'i-lucide-link' })
  }
  if (saved.kept?.length) {
    toast.add({ title: 'Kept what was logged elsewhere', description: `${saved.kept.join(', ')} had been added while this page was open and ${saved.kept.length === 1 ? 'was' : 'were'} kept.`, color: 'info', icon: 'i-lucide-merge' })
  }
  // What was just saved is now the baseline, so the refresh below may rebuild from the row.
  formGuard.markClean()
  // The shell's streak / logged / soda figures come from the scalar summary, not this list.
  await Promise.all([refresh(), refreshNuxtData('overview')])
  if (to !== from) await navigateTo(`/journal/${to}`)
  return { moved: moving, to }
}, { success: r => (r.moved ? `Entry moved to ${r.to}` : 'Entry saved') })

const saveLabel = computed(() => {
  if (saving.value) return 'SAVING…'
  if (dateMoved.value && isIsoDate(form.date)) return isNew.value ? `✓ SAVE AS ${form.date}` : `✓ MOVE TO ${form.date}`
  return '✓ SAVE'
})
</script>
