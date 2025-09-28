<template>
  <div>
    <UPageHero
      title="jim.klonow.ski"
      description="i like computers and cats and stuff"
      orientation="horizontal"
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
