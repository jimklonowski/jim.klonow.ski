<script setup>
  useHead({
    meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    link: [{ rel: 'icon', href: '/favicon.ico' }],
    htmlAttrs: {
      lang: 'en',
    },
  })

  const title = 'jim.klonow.ski'
  const description = 'hello world'

  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    // ogImage: 'https://ui4.nuxt.com/assets/templates/nuxt/starter-light.png',
    // twitterImage: 'https://ui4.nuxt.com/assets/templates/nuxt/starter-light.png',
    twitterCard: 'app',
  })
</script>

<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="font-serif"
        >
          jim.klonow.ski
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />

        <UButton
          to="https://github.com/jimklonowski"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
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

      <template #right>
        <UButton
          to="https://github.com/jimklonowski"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </template>
    </UFooter>
  </UApp>
</template>
