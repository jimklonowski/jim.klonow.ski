<template>
  <UPageHero
    title="Jim Klonowski"
    description="Vibe coding for my health."
    :links="[
      { label: 'Bloodwork Tracker', to: '/labs', icon: 'i-lucide-activity', color: 'primary', size: 'lg' },
      { label: 'GitHub', to: 'https://github.com/jimklonowski', target: '_blank', icon: 'i-simple-icons-github', color: 'neutral', variant: 'ghost', size: 'lg' }
    ]"
    :ui="{
      root: 'pb-24 sm:pb-32',
      container: 'relative z-10 lg:py-32',
      wrapper: 'flex flex-col items-center',
      title: 'sm:text-6xl lg:text-7xl xl:text-[80px] tracking-tighter leading-[1.05]',
      description: 'mt-5 max-w-xl mx-auto text-base sm:text-lg leading-relaxed',
      links: 'gap-3'
    }"
  >
    <template #top>
      <!-- <HeroShaders class="absolute top-0 inset-x-0 opacity-15 h-full" /> -->
      <GradientGlow class="top-0 w-2/3 h-1/2" />
    </template>
  </UPageHero>
</template>

<script setup lang="ts">
</script>
