<template>
  <UPageHero
    title="jim.klonow.ski"
    description="vibe coding for my health."
    :links="[
      { label: 'GitHub', to: 'https://github.com/jimklonowski', target: '_blank', icon: 'i-simple-icons-github', color: 'neutral', variant: 'ghost' }
    ]"
    :ui="{
      root: 'pb-24 sm:pb-32',
      container: 'relative z-10 lg:py-32',
      wrapper: 'flex flex-col items-center',
      title: 'sm:text-6xl lg:text-7xl xl:text-[80px] tracking-tighter leading-[1.05] font-mono',
      description: 'mt-5 max-w-xl mx-auto text-base sm:text-lg leading-relaxed'
    }"
  >
    <template #top>
      <!-- <HeroShaders class="absolute top-0 inset-x-0 opacity-15 h-full" /> -->
      <GradientGlow class="top-0 w-2/3 h-1/2" />
    </template>

    <UPageGrid class="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 max-w-2xl mx-auto gap-3 sm:gap-4">
      <UPageCard
        v-for="card in cards"
        :key="card.title"
        :to="card.to"
        :icon="card.icon"
        :title="card.title"
        :description="card.description"
        spotlight
        highlight
        class="text-center sm:text-left"
        :ui="{
          container: 'aspect-square sm:aspect-auto flex flex-col items-center justify-center sm:items-stretch sm:justify-start p-3 sm:p-6',
          wrapper: 'flex-none items-center justify-center text-center sm:flex-1 sm:items-start sm:justify-start sm:text-left',
          body: 'flex-none sm:flex-1',
          leading: 'mx-auto mb-2 sm:mx-0 sm:mb-2.5',
          leadingIcon: 'size-7 sm:size-5',
          title: 'text-sm sm:text-base',
          description: 'text-xs line-clamp-2 sm:text-[15px] sm:line-clamp-none'
        }"
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
