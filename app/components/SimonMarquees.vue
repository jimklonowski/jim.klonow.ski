<template>
  <div class="relative w-full h-[400px] bg-muted overflow-hidden my-4">
    <UMarquee
      reverse
      orientation="vertical"
      :overlay="false"
      :ui="{
        root: '[--duration:40s] absolute w-[500px] h-[1000px] -left-[100px] -top-[300px] transform-3d rotate-x-45 rotate-z-30'
      }"
    >
      <NuxtImg
        v-for="i in [6, 1, 3, 11]"
        :key="i"
        :src="`/simon${i}.jpg`"
        :alt="`Simon ${i}`"
        width="500"
        :modifiers="{ fit: 'cover' }"
        class="aspect-video object-cover border border-default rounded-lg bg-white"
      />
    </UMarquee>
    <UMarquee
      orientation="vertical"
      :overlay="false"
      :ui="{
        root: '[--duration:44s] absolute w-[500px] h-[1200px] left-[500px] -top-[420px] transform-3d rotate-x-45 rotate-z-30'
      }"
    >
      <NuxtImg
        v-for="i in [4, 5, 8, 10]"
        :key="i"
        :src="`/simon${i}.jpg`"
        :alt="`Simon ${i}`"
        width="500"
        :modifiers="{ fit: 'cover' }"
        class="aspect-video object-cover border border-default rounded-lg bg-white"
      />
    </UMarquee>
    <UMarquee
      reverse
      orientation="vertical"
      :overlay="false"
      :ui="{
        root: '[--duration:44s] absolute w-[500px] h-[1200px] left-[1000px] -top-[320px] transform-3d rotate-x-45 rotate-z-30'
      }"
    >
      <NuxtImg
        v-for="i in [7, 2, 9, 12]"
        :key="i"
        :src="`/simon${i}.jpg`"
        :alt="`Simon ${i}`"
        width="500"
        :modifiers="{ fit: 'cover' }"
        class="aspect-video object-cover border border-default rounded-lg bg-white"
      />
    </UMarquee>
    <UMarquee
      orientation="vertical"
      :overlay="false"
      :ui="{
        root: '[--duration:40s] absolute w-[500px] h-[1000px] -top-[190px] left-[1560px] transform-3d rotate-x-45 rotate-z-30'
      }"
    >
      <NuxtImg
        v-for="i in [13, 14, 15, 16]"
        :key="i"
        :src="`/simon${i}.jpg`"
        :alt="`Simon ${i}`"
        width="500"
        :modifiers="{ fit: 'cover' }"
        class="aspect-video object-cover border border-default rounded-lg bg-white"
      />
    </UMarquee>
  </div>
</template>