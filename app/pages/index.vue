<template>
  <div>
    <UPageHero
      title="jim.klonow.ski"
      description="i like computers and cats and stuff"
      orientation="horizontal"
      :reverse="isDark"
      :ui="{
        container: 'text-center select-none',
        headline: '',
        title: 'font-serif text-highlighted',
        description: 'font-mono text-dimmed',
      }"
    >
      <template #headline>
        <UBadge color="primary" icon="i-la-cat" :variant="isDark ? 'solid' : 'subtle'" size="lg">welcome</UBadge>
      </template>

      <template #default>
        <UColorModeImage
          light="/simon2.jpg"
          dark="/simon3.jpg"
          @click="colorMode.preference = colorMode.preference === 'light' ? 'dark' : 'light'"
        />
      </template>
    </UPageHero>
    <SimonMarquees />
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode()

const isDark = computed(() => colorMode.value === 'dark')
</script>
