<script setup lang="ts">
// A progress photo at full size in a modal. Bound to the photo itself: set it to open, and
// closing the modal clears it. Used by the photos page and a day's journal entry.
import type { ProgressPhoto } from '~/composables/usePhotoEntries'
import { photoCategoryLabel } from '#shared/utils/photoCategories'

const photo = defineModel<ProgressPhoto | null>('photo', { default: null })

const open = computed({
  get: () => !!photo.value,
  set: (v: boolean) => {
    if (!v) photo.value = null
  }
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="photo ? photoCategoryLabel(photo.category) : ''"
    :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
  >
    <template #body>
      <img
        v-if="photo"
        :src="photo.url"
        :alt="`${photoCategoryLabel(photo.category)} progress photo, ${formatDate(photo.date)}`"
        class="w-full h-auto"
      >
    </template>
  </UModal>
</template>
