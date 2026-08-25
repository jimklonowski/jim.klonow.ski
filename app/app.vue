<template>
  <UApp>
    <!-- Pages await their data in setup, so SPA navigation suspends with no feedback —
         this phosphor progress bar is the loading state for every route. -->
    <NuxtLoadingIndicator
      color="#2ce8a4"
      :height="2"
    />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup>
useHead({
  meta: [
    // viewport-fit=cover lets the standalone PWA paint behind the iPhone notch/home bar
    // instead of showing white bands there.
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#070a09' },
    // Add-to-homescreen: open as a standalone dark app rather than a Safari tab.
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },
    { name: 'apple-mobile-web-app-title', content: 'JCK Health' }
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
  ogDescription: description,
  ogImage: 'https://jim.klonow.ski/og.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: description,
  twitterCard: 'summary_large_image'
})
</script>
