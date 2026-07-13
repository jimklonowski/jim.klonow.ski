<script setup>
defineProps({
  title: { type: String, default: 'Jim Klonowski' },
  description: { type: String, default: '' }
})
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between relative bg-neutral-950 text-white p-12 rounded-2xl overflow-hidden">
    <div
      class="pointer-events-none absolute -top-80 -right-40 w-180 h-180 rounded-full"
      style="background: radial-gradient(circle, rgba(45, 212, 191, 0.16) 0%, transparent 70%);"
    />

    <div class="relative flex items-center gap-3">
      <div class="w-3 h-3 rounded-full bg-teal-400" />
      <span
        class="text-[26px] tracking-[0.2em] uppercase text-teal-400"
        style="font-family: 'IBM Plex Mono', monospace;"
      >
        jim.klonow.ski
      </span>
    </div>

    <div class="relative flex flex-col gap-6">
      <h1
        class="text-[76px] font-bold leading-[1.05] tracking-tight max-w-245 m-0"
        style="font-family: 'IBM Plex Sans', sans-serif; display: block; line-clamp: 2; text-overflow: ellipsis;"
      >
        {{ title }}
      </h1>
      <p
        v-if="description"
        class="text-[32px] text-neutral-400 max-w-210 leading-relaxed m-0"
        style="font-family: 'IBM Plex Sans', sans-serif; display: block; line-clamp: 2; text-overflow: ellipsis;"
      >
        {{ description }}
      </p>
    </div>
  </div>
</template>
