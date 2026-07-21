<template>
  <UApp>
   
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

  </UApp>
</template>

<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#0a0f0e' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
    { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/favicon-48.png' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/site.webmanifest' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'JCK - Health Dashboard'
const description = 'James Christopher Klonowski'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

defineOgImage('Default', { title, description, alt: description })
</script>
