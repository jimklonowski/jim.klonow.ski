import { locales } from './i18n/locales'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxtjs/seo',
    '@vueuse/nuxt',
    '@nuxt/scripts',
    '@nuxtjs/i18n',
    '@pinia/nuxt',
    'nitro-cloudflare-dev',
    'nuxt-charts'
  ],

  compatibilityDate: '2026-05-01',

  css: ['~/assets/css/main.css'],

  devServer: {
    host: 'local.emkay.com',
    port: 3000,
    https: {
      cert: 'certs/local.emkay.com.pem',
      key: 'certs/local.emkay.com-key.pem'
    }
  },

  devtools: { enabled: true },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  experimental: {
    nitroAutoImports: true
  },

  fonts: {
    provider: 'fontsource',
    families: [
      {
        name: 'IBM Plex Mono',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal', 'italic'],
        subsets: ['latin']
      },
      {
        name: 'IBM Plex Sans',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal', 'italic'],
        subsets: ['latin']
      },
      {
        name: 'IBM Plex Serif',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal', 'italic'],
        subsets: ['latin']
      }
    ]
  },

  i18n: {
    baseUrl: 'https://jim.klonow.ski',
    defaultDirection: 'ltr',
    defaultLocale: 'en',
    langDir: '../i18n/locales',
    locales,
    strategy: 'prefix_except_default',
    vueI18n: '../i18n/i18n.config.ts'
  },

  icon: {
    customCollections: [
      { prefix: 'jck', dir: './app/assets/icons' }
    ]
  },

  image: {
    provider: 'ipx',
    ipx: {
      maxAge: 60 * 60 * 24 * 365
    },
    domains: [
      'jim.klonow.ski'
    ]
  },

  nitro: {
    preset: "cloudflare_module",
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },
    compressPublicAssets: true,
    experimental: { websocket: true, tasks: true },
    scheduledTasks: {
      '0 11 * * *': ['whoop:sync']
    }
  },

  routeRules: {
    // '/': { prerender: true }
  },

  site: {
    name: 'jim.klonow.ski',
    url: 'https://jim.klonow.ski'
  },

  ui: {

  },

  vite: {
    optimizeDeps: {
      include: [
        '@unhead/schema-org/vue',
        'shaders/vue'
      ]
    },
    server: {
      allowedHosts: true
    }
  }
})
