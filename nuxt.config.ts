// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@comark/nuxt',
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxtjs/seo',
    '@vueuse/nuxt',
    '@nuxt/scripts',
    'nitro-cloudflare-dev',
    'nuxt-echarts',
    'nuxt-security'
  ],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  site: {
    name: 'jim.klonow.ski',
    url: 'https://jim.klonow.ski'
  },

  ui: {

  },

  routeRules: {
    // '/': { prerender: true }
    // Rate limiting is off everywhere except the two credential endpoints below (the '/**'
    // rule disables the module's default global limiter, which would otherwise write to KV on
    // every request). Counters live in the RATE_LIMIT KV namespace so they survive Worker
    // isolate recycling; limits are per IP via cf-connecting-ip (set by Cloudflare, unspoofable).
    '/**': { security: { rateLimiter: false } },
    '/api/labs/auth': {
      security: {
        rateLimiter: {
          tokensPerInterval: 5,
          interval: 300000, // 5 attempts per 5 minutes
          ipHeader: 'cf-connecting-ip'
        }
      }
    },
    '/api/labs/upload-auth': {
      security: {
        rateLimiter: {
          tokensPerInterval: 5,
          interval: 900000, // 5 attempts per 15 minutes — the PIN is the smaller keyspace
          ipHeader: 'cf-connecting-ip'
        }
      }
    },
    '/api/auth/redeem': {
      security: {
        rateLimiter: {
          tokensPerInterval: 10,
          interval: 300000, // share-link redemption; tokens are 24 random bytes so this is belt-and-suspenders
          ipHeader: 'cf-connecting-ip'
        }
      }
    }
  },

  devServer: {
    host: 'local.emkay.com',
    port: 3000,
    https: {
      cert: 'certs/local.emkay.com.pem',
      key: 'certs/local.emkay.com-key.pem'
    }
  },

  experimental: {
    nitroAutoImports: true
  },

  compatibilityDate: '2026-05-01',

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },
    compressPublicAssets: true,
    experimental: { websocket: true, tasks: true },
    scheduledTasks: {
      '0 11 * * *': ['whoop:sync'],
      // Digests run after the morning Whoop sync (11:00) and Apple Health export have landed.
      '0 14 * * *': ['digest:daily'],
      '0 15 * * 1': ['digest:weekly']
    }
  },

  vite: {
    optimizeDeps: {
      include: [
        '@unhead/schema-org/vue'
      ]
    },
    server: {
      allowedHosts: true
    }
  },

  echarts: {
    renderer: 'svg',
    charts: ['LineChart', 'BarChart'],
    components: ['GridComponent', 'TooltipComponent', 'LegendComponent'],
    features: ['LabelLayout']
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: 'stroustrup'
      }
    }
  },

  fonts: {
    // NOTE: a global `provider` deletes all other providers (including `local`),
    // which breaks per-family provider overrides — set provider per family instead
    // provider: 'fontsource',
    families: [
      {
        name: 'Departure Mono',
        provider: 'local',
        weights: [400],
        styles: ['normal']
      },
      {
        name: 'IBM Plex Mono',
        provider: 'fontsource',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal', 'italic'],
        subsets: ['latin']
      },
      {
        name: 'IBM Plex Sans',
        provider: 'fontsource',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal', 'italic'],
        subsets: ['latin']
      },
      {
        name: 'IBM Plex Serif',
        provider: 'fontsource',
        weights: [100, 200, 300, 400, 500, 600, 700],
        styles: ['normal', 'italic'],
        subsets: ['latin']
      }
    ]
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

  // Static og.png in /public instead of runtime generation — the takumi WASM renderer
  // alone was 1.6 MiB gzipped, over half the free-plan Worker size limit.
  ogImage: {
    enabled: false
  },

  // Rate limiting is the only feature enabled for now; everything else is off but listed here
  // so future features (CSP headers, etc.) are a one-line flip. The KV storage driver must be
  // declared on the global rateLimiter object — it's the only place the module reads it from —
  // which is why global limiting is disabled via the '/**' route rule above rather than here.
  security: {
    headers: false,
    rateLimiter: {
      driver: { name: 'cloudflareKVBinding', options: { binding: 'RATE_LIMIT' } }
    },
    requestSizeLimiter: false,
    xssValidator: false,
    corsHandler: false,
    allowedMethodsRestricter: false,
    nonce: false,
    sri: false,
    removeLoggers: false,
    hidePoweredBy: true
  }
})
