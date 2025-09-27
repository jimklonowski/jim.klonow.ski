<script setup>
  useHead({
    meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    link: [{ rel: 'icon', href: '/favicon.ico' }],
    htmlAttrs: { lang: 'en' }
  })

  const title = 'jim.klonow.ski'
  const description = 'hello world'

  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogImage: 'https://jim.klonow.ski/simon.jpg',
    twitterImage: 'https://jim.klonow.ski/simon.jpg',
    twitterCard: 'summary_large_image',
  })
</script>

<template>
  <UApp>
    <UHeader :toggle="false">
      <template #left>
        <NuxtLink to="/" class="font-serif">
          jim.klonow.ski
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <USeparator
      icon="i-la-cat"
      size="xl"
      type="dashed"
      :ui="{ icon: 'size-12' }"
    />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">Jim Klonowski LLC © {{ new Date().getFullYear() }}</p>
      </template>
    </UFooter>
  </UApp>
</template>
