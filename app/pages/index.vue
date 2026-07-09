<template>
  <UPageHero
    title="Jim Klonowski"
    description="Vibe coding for my health."
    :links="[
      { label: 'GitHub', to: 'https://github.com/jimklonowski', target: '_blank', icon: 'i-simple-icons-github', color: 'neutral', variant: 'ghost' }
    ]"
    :ui="{
      root: 'pb-24 sm:pb-32',
      container: 'relative z-10 lg:py-32',
      wrapper: 'flex flex-col items-center',
      title: 'sm:text-6xl lg:text-7xl xl:text-[80px] tracking-tighter leading-[1.05]',
      description: 'mt-5 max-w-xl mx-auto text-base sm:text-lg leading-relaxed'
    }"
  >
    <template #top>
      <!-- <HeroShaders class="absolute top-0 inset-x-0 opacity-15 h-full" /> -->
      <GradientGlow class="top-0 w-2/3 h-1/2" />
    </template>

    <UPageGrid class="sm:grid-cols-2 lg:grid-cols-2 max-w-2xl mx-auto">
      <UPageCard
        v-for="card in cards"
        :key="card.title"
        :to="card.to"
        :icon="card.icon"
        :title="card.title"
        :description="card.description"
        spotlight
        highlight
        class="text-left"
      />
    </UPageGrid>
  </UPageHero>
</template>

<script setup lang="ts">
const cards = [
  { title: 'Bloodwork Tracker', description: 'Biomarker trends and lab results over time.', to: '/labs', icon: 'i-lucide-activity' },
  { title: 'Body Composition', description: 'DEXA scan history — body fat, lean mass, and bone density.', to: '/labs/dexa', icon: 'i-lucide-scan' },
  { title: 'Peptide Journal', description: 'Daily vitals, peptide protocols, and workout log.', to: '/journal', icon: 'i-lucide-book-open' },
  { title: 'Peptide Calculator', description: 'Calculate syringe units for any peptide reconstitution.', to: '/journal/calculator', icon: 'i-lucide-calculator' }
]
</script>
