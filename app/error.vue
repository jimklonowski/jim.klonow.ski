<template>
  <!-- Nuxt swaps this in for app.vue whenever an error is fatal (an SSR throw, an unmatched
       route, showError), so nothing here may lean on the app shell: the default layout awaits
       useAuth and the overview summary, and if one of those is what fell over, mounting it
       again here would re-throw straight into Nuxt's bare fallback page. Same shell-less
       treatment as labs/login.vue — own wordmark line, centred card — with TICKER breaking
       the news in the digest-bubble composition from home/Digest.vue. -->
  <UApp>
    <div class="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-[560px]">
        <!-- Wordmark — a real link home; client-side navigation clears the error on its own. -->
        <div class="flex items-center gap-2.5">
          <NuxtLink
            to="/"
            class="flex items-center gap-2.5 group"
          >
            <span class="w-6 h-6 flex items-center justify-center bg-raised border border-accent text-accent text-[10px] leading-none">▲</span>
            <span class="num-display text-[15px] tracking-tight group-hover:text-accent transition-colors">jim.klonow.ski</span>
          </NuxtLink>
          <span class="ml-auto flex items-center gap-1.5 text-[10.5px] text-faint tracking-[0.12em] uppercase">
            <span
              class="w-1.75 h-1.75 rounded-full"
              :class="kind.dot"
            />
            err {{ status }}
          </span>
        </div>

        <div class="mt-3">
          <TickerDigestPanel
            :label="`TICKER · ${kind.label}`"
            :meta="`HTTP ${status}`"
            :dashes="4"
          >
            <p v-if="kind.id === 'notFound'">
              I looked everywhere for <strong>{{ path }}</strong> — both atria, both ventricles, even the
              little pocket where I keep the good HRV. It isn't in here. Either it moved or it never
              existed, and neither one is on us. I know the way home by heart. Follow me?
            </p>
            <p v-else-if="kind.id === 'denied'">
              That room is owner-only. I'd wave you through — I like you — but I'm a heart, not a
              bouncer. Sign in and we'll pick this back up from the labs. Fair?
            </p>
            <p v-else-if="kind.id === 'request'">
              The server took one look at that request and sent back
              <strong>{{ status }} {{ statusText }}</strong>. Nothing's wrong in here — rhythm's steady,
              no drama — so let's back up a step and run it again clean. Deal?
            </p>
            <p v-else>
              Okay. <em>That</em> was a flatline. Something upstream dropped the request before it
              reached us — not my doing, I'm still beating, see? Give it a second and we'll try again
              together. If it keeps happening, the server is having a rough night and I'll be right
              here until it's over. Deal?
            </p>
          </TickerDigestPanel>

          <!-- Same footer as the home digest column: the heart under a divider that dips into a
               speech chevron, actions and the technical line to its right. -->
          <div class="ticker-footer relative mt-3 pt-3 border-t border-line-soft flex items-center gap-4">
            <TickerCompanion
              ref="companion"
              :rhr="kind.bpm"
              :caption="kind.caption"
              :aria-label="`TICKER — ${primary.label}`"
              @open="primary.run()"
            />
            <div class="flex-1 min-w-0 flex flex-col gap-1.5 text-[11.5px]">
              <div class="flex flex-wrap items-baseline gap-3.5">
                <button
                  v-for="action in kind.actions"
                  :key="action.label"
                  type="button"
                  class="text-accent hover:text-accent-hover cursor-pointer"
                  @click="action.run()"
                >
                  {{ action.label }}
                </button>
              </div>
              <span class="text-muted truncate">
                {{ reason }} · {{ path }}
              </span>
            </div>
          </div>
        </div>

        <!-- Dev only: Nuxt strips stacks from production payloads, and a 404 has nothing useful
             to say here. -->
        <pre
          v-if="stack"
          class="mt-4 p-3 border border-dashed border-line-input text-[10.5px] leading-[1.6] text-faint overflow-x-auto whitespace-pre-wrap break-words"
        >{{ stack }}</pre>
      </div>
    </div>
  </UApp>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

// Snapshot, as Nuxt's own error page does: clearError() empties the prop before this component
// unmounts, and a reactive read in that window would throw on `undefined`.
const err = props.error

// h3 v2 names these status/statusText; the statusCode/statusMessage pair is the deprecated
// alias that older createError callers still set. Accept either.
const status = Number(err.status ?? err.statusCode ?? 500)
const statusText = err.statusText ?? err.statusMessage ?? (status === 404 ? 'Page Not Found' : 'Server Error')

// The URL that failed, on both server and client. Compound routes carry encoded names; show
// them decoded, but never let a malformed sequence take the error page down with it.
const path = (() => {
  const raw = useRequestURL().pathname
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return raw
  }
})()

// Nuxt's unmatched-route error spells the path into its own status text ("Page not found:
// /x"), which would print it twice beside the path column — drop a trailing path there.
const reason = statusText.replace(/:\s*\/\S*$/, '').toLowerCase() || 'error'

const stack = import.meta.dev && status !== 404
  ? [err.message, err.stack].filter(Boolean).join('\n')
  : ''

type Action = { label: string, run: () => void }

const home: Action = { label: 'back home →', run: () => clearError({ redirect: '/' }) }
// No redirect: Nuxt drops the error and mounts app.vue at the current URL, so the page's own
// setup re-runs its fetches — a real retry, without a full reload. Not offered on a 404, where
// there is no page to re-run and the router would render nothing.
const retry: Action = { label: 'try again ⟳', run: () => clearError() }
const signIn: Action = { label: 'sign in ❯', run: () => clearError({ redirect: '/labs/login' }) }

// One persona per class of failure: header label, page title, the heart's caption and beat
// rate, the wordmark dot, the one-shot TICKER plays on arrival, and which exits to offer.
const kind = (() => {
  if (status === 404) {
    return {
      id: 'notFound' as const,
      label: 'NOT FOUND',
      title: 'Not Found',
      caption: '♥ searching…',
      bpm: 84,
      dot: 'bg-warn',
      event: 'thump' as const,
      actions: [
        home,
        { label: 'labs →', run: () => clearError({ redirect: '/labs' }) },
        { label: 'journal →', run: () => clearError({ redirect: '/journal' }) }
      ]
    }
  }
  if (status === 401 || status === 403) {
    return {
      id: 'denied' as const,
      label: 'ACCESS DENIED',
      title: 'Access Denied',
      caption: '♥ standing by',
      bpm: 63,
      dot: 'bg-warn',
      event: null,
      actions: [signIn, home]
    }
  }
  if (status < 500) {
    return {
      id: 'request' as const,
      label: 'REQUEST ERROR',
      title: 'Request Error',
      caption: '♥ steady',
      bpm: 63,
      dot: 'bg-warn',
      event: null,
      actions: [retry, home]
    }
  }
  return {
    id: 'server' as const,
    label: 'SERVER ERROR',
    title: 'Server Error',
    caption: '♥ recovering…',
    bpm: 72,
    dot: 'bg-danger',
    event: 'flatline' as const,
    actions: [retry, home]
  }
})()

// Clicking the heart takes the first exit — the one the bubble copy is steering toward.
const primary = kind.actions[0] ?? home

// app.vue is not rendered underneath this page, so its title frame has to be restated.
useSeoMeta({
  titleTemplate: '%s | %siteName',
  title: `${status} · ${kind.title}`
})

// TICKER reacts once the page has settled: a startled thump for a missing page, the flatline
// gag (X eyes, beeeep, then shakes it off) for a server fault. Both return to idle within 2s;
// reduced-motion users get the static sprite with a glow pulse, as everywhere else.
const companion = useTemplateRef('companion')

onMounted(() => {
  if (!kind.event) return
  const timer = setTimeout(() => companion.value?.trigger(kind.event), 400)
  onUnmounted(() => clearTimeout(timer))
})
</script>

<style scoped>
/* Speech chevron on the divider, pointing down at the heart — a copy of home/Digest.vue's
   notch, with the same page-coloured fill masking the divider across its mouth so the line
   reads as dipping into the wedge. Both values assume this sits on bg-bg. */
.ticker-footer::before {
  content: '';
  position: absolute;
  top: -5px;
  left: 27px;
  width: 10px;
  height: 10px;
  background: var(--color-bg);
  border-right: 1px solid var(--color-line-soft);
  border-bottom: 1px solid var(--color-line-soft);
  transform: rotate(45deg);
}
</style>
