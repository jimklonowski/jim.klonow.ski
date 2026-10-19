<template>
  <UApp>
    <!-- Pages await their data in setup, so SPA navigation suspends with no feedback —
         this phosphor progress bar is the loading state for every route. -->
    <NuxtLoadingIndicator
      :color="CHART_ACCENT"
      :height="2"
    />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup>
import { CHART_ACCENT } from '~/utils/chartTheme'

// The display preset, face and size, from the `display` cookie (so they are in the SSR HTML and
// never flash), or the ones the header's picker is previewing. Going on <html> as
// data-theme/data-font/data-scale is all it takes: app/assets/css/themes.css redefines every
// --color-*, --font-* and --type-scale token under those attributes, and nothing on the site
// paints or sets type with anything else.
const { active: theme, activeFont: font, activeScale: scale, preset } = useTheme()

useHead({
  meta: [
    // viewport-fit=cover lets the standalone PWA paint behind the iPhone notch/home bar
    // instead of showing white bands there.
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    // The browser chrome matches the page surface of whichever preset is on.
    { name: 'theme-color', content: () => preset.value.tokens.bg },
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
    'lang': 'en',
    'data-theme': theme,
    'data-font': font,
    'data-scale': scale
  }
})

// Each page sets its own `useSeoMeta({ title, description })` with just the bare leaf name
// ('Home', 'Journal · Trends'); this is the frame around them. In the template, %s is that
// page title and %siteName is `site.name` from nuxt.config, so /journal/trends renders as
// "Journal · Trends | jim.klonow.ski". Keeping the site name as a param rather than a literal
// means it only has to be right in nuxt.config.
//
// og:title and og:description are deliberately NOT set here. @nuxtjs/seo registers unhead's
// InferSeoMetaPlugin, which fills both per route — og:title from the *templated* title,
// og:description from the page's description — but only when no one else has claimed those
// tags. A static ogTitle used to sit here and claim them, which is why every share card read
// "JCK - Health Dashboard" no matter which page was shared. twitter:description is likewise
// left off so it falls back to og:description; hardcoding the site blurb there would be worse
// than the fallback on every page but the homepage.
const title = 'Health Dashboard'
const description = 'Personal health terminal — bloodwork, body composition, training, and protocol tracking.'

useSeoMeta({
  titleTemplate: '%s | %siteName',
  title,
  description,
  ogImage: 'https://jim.klonow.ski/og.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: description,
  twitterCard: 'summary_large_image'
})
</script>
