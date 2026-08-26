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

  $production: {
    security: {
      removeLoggers: { consoleType: ['log', 'debug'] }
    }
  },

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  site: {
    name: 'jim.klonow.ski',
    url: 'https://jim.klonow.ski'
  },

  // Phosphor Terminal is a dark-only design — default (and fall back) to dark.
  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  ui: {

  },

  routeRules: {
    // '/': { prerender: true }
    // The calculator, vial inventory, and Apple Health import moved out of /journal — and
    // sharing out of /labs — into the TOOLS section (Aug 2026). Old bookmarks land on the new
    // homes; the naked section URL resolves to the calculator while there's no /tools hub page.
    '/journal/calculator': { redirect: { to: '/tools/calculator', statusCode: 301 } },
    '/journal/inventory': { redirect: { to: '/tools/inventory', statusCode: 301 } },
    '/journal/import': { redirect: { to: '/tools/import', statusCode: 301 } },
    '/labs/sharing': { redirect: { to: '/tools/sharing', statusCode: 301 } },
    '/tools': { redirect: { to: '/tools/calculator', statusCode: 302 } },
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
    },
    '/api/ai/ask': {
      security: {
        rateLimiter: {
          tokensPerInterval: 20,
          interval: 300000, // owner-only chat, but each request spends Anthropic tokens — cap runaways
          ipHeader: 'cf-connecting-ip'
        }
      }
    },
    // Body-size raises over the global 2 MB / 8 MB defaults (see security.requestSizeLimiter).
    '/api/journal/photos/upload': {
      security: {
        requestSizeLimiter: {
          maxRequestSizeInBytes: 25000000 // full-res phone photos arrive as a raw binary body, not multipart
        }
      }
    },
    '/api/labs/process-pdf': {
      security: {
        requestSizeLimiter: {
          maxUploadFileRequestInBytes: 20000000 // multipart lab-PDF uploads
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
        '@unhead/schema-org/vue',
        'exifr'
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
        name: 'JetBrains Mono',
        provider: 'fontsource',
        weights: [400, 500, 700],
        styles: ['normal'],
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

  // Deliberately OFF: xssValidator (regex input filter would false-positive on freeform journal
  // text; Vue escaping + CSP cover XSS), corsHandler (same-origin API — sending no CORS headers
  // is already the most restrictive state, and the Bearer-token Shortcuts flow is non-browser),
  // allowedMethodsRestricter (nitro's .get.ts/.post.ts file routing already 405s wrong methods).
  // The KV storage driver must be declared on the global rateLimiter object — it's the only place
  // the module reads it from — which is why global limiting is disabled via the '/**' route rule
  // above rather than here.
  security: {
    headers: {
      contentSecurityPolicy: {
        // The module REPLACES arrays rather than merging, so 'self'/data: must be restated.
        // blob: is for photo-upload previews (URL.createObjectURL in photos.vue / [date].vue);
        // every other directive keeps module defaults — all assets on this site are self-hosted.
        'img-src': ['\'self\'', 'data:', 'blob:']
      }
    },
    rateLimiter: {
      driver: { name: 'cloudflareKVBinding', options: { binding: 'RATE_LIMIT' } }
    },
    // 2 MB standard bodies / 8 MB multipart (the module defaults, restated because `true` isn't
    // a valid value). Raised per-route above for the raw-binary photo upload and lab-PDF upload.
    requestSizeLimiter: {
      maxRequestSizeInBytes: 2000000,
      maxUploadFileRequestInBytes: 8000000,
      throwError: true
    },
    xssValidator: false,
    corsHandler: false,
    allowedMethodsRestricter: false,
    nonce: true,
    sri: true,
    // Enabled for prod builds only via the $production block (top of config). `true` is a no-op on
    // Vite 8 (it sets esbuild `drop`, which oxc transforms ignore — build prints a WARN), so the
    // object form (unplugin-remove) is required — and that form has no dev-mode guard in the
    // module, hence the env split. console.warn/error and all nitro-built server/api logging
    // survive, so `wrangler tail` stays useful.
    removeLoggers: false,
    hidePoweredBy: true
  }
})
