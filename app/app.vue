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
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = 'JCK'
const description = 'James Christopher Klonowski'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})
</script>
