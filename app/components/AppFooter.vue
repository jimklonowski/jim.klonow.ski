<template>
  <UFooter>
    <ULocaleSelect
      :model-value="locale"
      :locales="[en, es, fr]"
      @update:model-value="setLocale($event)"
    />
  </UFooter>
</template>

<script setup lang="ts">
import { en, es, fr} from '@nuxt/ui/locale'

const { locale, setLocale } = useI18n()
</script>
