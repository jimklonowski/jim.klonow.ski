<template>
  <div class="flex min-h-[calc(100dvh-7.25rem)]">
    <!-- Rail (wide screens): TICKER hosts, with the saved conversations under it. -->
    <aside class="hidden lg:flex flex-col w-64 shrink-0 border-r border-line px-4 py-5">
      <div class="flex flex-col items-center">
        <TickerCompanion
          ref="railTicker"
          size="lg"
          :rhr="rhr"
          :mood="mood"
          :sluggish="tickerSluggish && !mood"
          :accessories="tickerAccessories"
          :build="tickerBuild"
          aria-label="TICKER"
          @open="nudge"
        />
        <p
          class="ticker-bubble relative mt-4 w-full px-3 py-2.5 bg-raised border border-line-soft text-small leading-[1.6] text-dim"
          aria-live="polite"
        >
          {{ bubble }}
        </p>
      </div>
      <!-- A failed list must not read as "no conversations saved yet". -->
      <p
        v-if="threadsError"
        class="mt-6 text-small text-danger"
      >
        Couldn't load saved conversations.
        <button
          type="button"
          class="text-accent hover:text-accent-hover cursor-pointer"
          @click="() => refreshThreads()"
        >
          retry ⟳
        </button>
      </p>
      <AskThreadList
        v-else
        class="mt-6"
        :threads="threads"
        :active-id="threadId"
        :disabled="streaming"
        @new="newConversation"
        @open="openThread"
        @delete="deleteThread"
      />
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Title row -->
      <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 sm:px-6 py-3 border-b border-line">
        <TickerCompanion
          ref="headerTicker"
          class="lg:hidden -my-1"
          :rhr="rhr"
          :mood="mood"
          :sluggish="tickerSluggish && !mood"
          :accessories="tickerAccessories"
          :build="tickerBuild"
          aria-label="TICKER"
          @open="nudge"
        />
        <h1 class="num-display text-hi text-head leading-none">
          ASK
        </h1>
        <p class="hidden sm:block text-meta text-muted tracking-[0.06em] uppercase">
          ticker · labs + dexa + journal + whoop + protocol
        </p>
        <div class="flex items-center gap-3 ml-auto text-meta">
          <button
            type="button"
            class="lg:hidden text-accent hover:text-accent-hover cursor-pointer"
            @click="historyOpen = true"
          >
            saved ({{ threads.length }})
          </button>
          <button
            v-if="messages.length"
            type="button"
            class="text-accent hover:text-accent-hover cursor-pointer disabled:opacity-50"
            :disabled="streaming"
            @click="newConversation"
          >
            new ⊕
          </button>
        </div>
      </div>

      <!-- Transcript. A polite live region that is BUSY while an answer streams: a reader
           announces the finished answer once, not every token as it lands. -->
      <div
        class="flex-1 px-4 sm:px-6 py-4 space-y-4"
        aria-live="polite"
        :aria-busy="streaming"
      >
        <!-- A ?thread= link still loading: say so, and hold the sample questions back — one sent
             now would have started a second conversation under the one about to appear. -->
        <p
          v-if="!messages.length && opening"
          class="text-row text-muted"
          data-ask-opening
        >
          Opening the saved conversation…
        </p>
        <div
          v-else-if="!messages.length"
          class="space-y-3"
        >
          <!-- On a phone the rail (and its speech bubble) is hidden, so the greeting moves here. -->
          <p class="text-row text-muted leading-[1.7]">
            <span class="lg:hidden">{{ GREETING }}</span>
            <span class="hidden lg:inline">Every draw, scan, dose, and Whoop night is in context.</span>
            {{ ' ' }}Answers cite the numbers they reason from; correlations are flagged as observations, not causes.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="q in SAMPLE_QUESTIONS"
              :key="q"
              type="button"
              class="px-2.5 py-1.5 border border-line-input text-small text-dim hover:text-accent hover:border-line-accent cursor-pointer text-left"
              @click="send(q)"
            >
              ❯ {{ q }}
            </button>
          </div>
        </div>

        <template
          v-for="(m, i) in messages"
          :key="i"
        >
          <p
            v-if="m.role === 'user'"
            class="text-row text-hi"
          >
            <span class="text-accent">❯</span> {{ m.content }}
          </p>
          <div
            v-else
            class="pl-4 border-l border-line-soft"
          >
            <p class="text-micro tracking-[0.14em] uppercase text-faint">
              <span class="text-danger">♥</span> ticker
            </p>
            <div class="mt-1 text-row leading-[1.75] text-dim digest-prose">
              <p
                v-if="streaming && i === messages.length - 1 && !m.content"
                class="text-muted"
              >
                <span class="text-accent">{{ spinnerFrame }}</span>
                thinking<span class="text-ghost">… {{ thinkingSeconds }}s</span>
              </p>
              <template v-else>
                <Markdown :value="m.content" />
                <span
                  v-if="streaming && i === messages.length - 1"
                  class="inline-block w-2 h-3.5 bg-accent align-middle animate-pulse"
                />
              </template>
            </div>
          </div>
        </template>
        <div ref="bottomAnchor" />
      </div>

      <!-- Prompt line -->
      <div class="sticky bottom-0 bg-bg border-t border-line px-4 sm:px-6 py-3">
        <form
          class="flex items-end gap-2.5"
          @submit.prevent="send()"
        >
          <span class="text-accent text-prose leading-[2.2]">❯</span>
          <!-- Grows with the question up to ~7 lines, then scrolls; Enter sends, Shift+Enter breaks.
               On touch screens the text is never under 16px, like every field's (main.css,
               "Touch"): iOS Safari zooms the page into any smaller field on focus, and on a
               phone that pushed the ASK button off the right edge. -->
          <UTextarea
            v-model="draft"
            :rows="1"
            :maxrows="7"
            autoresize
            placeholder="ask ticker about our data…"
            class="flex-1"
            :ui="{ base: 'resize-none text-row placeholder:text-ghost' }"
            :readonly="streaming"
            aria-label="Your question"
            @keydown.enter.exact.prevent="send()"
          />
          <button
            type="submit"
            class="tui-btn tui-btn-accent disabled:opacity-50"
            :disabled="streaming || opening || !draft.trim()"
            :title="opening ? 'Opening the saved conversation…' : undefined"
          >
            {{ streaming || opening ? '…' : 'ASK' }}
          </button>
        </form>
        <p class="mt-1.5 text-label text-ghost">
          answers are generated from your logged data · observations, not medical advice<span class="hidden sm:inline"> · enter to send, shift+enter for a new line</span>
        </p>
      </div>
    </div>

    <!-- Saved conversations on narrow screens -->
    <USlideover
      v-model:open="historyOpen"
      title="SAVED CONVERSATIONS"
      :ui="{ content: 'max-w-xs bg-bg border-l border-line ring-0', header: 'border-b border-line', title: 'num-display text-hi text-stat' }"
    >
      <template #body>
        <AskThreadList
          :threads="threads"
          :active-id="threadId"
          :disabled="streaming"
          @new="newConversation(); historyOpen = false"
          @open="openFromHistory"
          @delete="deleteThread"
        />
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { AskMessage } from '#shared/utils/askHistory'
import { ASK_TRAILER_MARK, type AskStreamTrailer, type AskThread, type AskThreadSummary } from '#shared/types/ask'

/** A transcript turn. `failed` marks an exchange the server kept out of the thread (a refusal or
 * dropped answer): it stays readable, but never goes back out as history. */
interface ChatMessage extends AskMessage { failed?: boolean }

const GREETING = 'I\'ve got every draw, scan, dose, and Whoop night we\'ve logged in here. Ask me anything — I\'ll show my numbers.'

const SAMPLE_QUESTIONS = [
  'How has my BP moved since the testosterone cut on Aug 24?',
  'Which markers moved most between the last two draws?',
  'Is the HRV climb tied to anything I started?',
  'What should be in range before I add an oral anabolic?'
]

// Survives navigating away mid-conversation. The thread id ties it to the saved copy, and is
// mirrored in the URL (?thread=) so a reload lands back in the same conversation.
const messages = useState<ChatMessage[]>('ask-messages', () => [])
const threadId = useState<number | null>('ask-thread-id', () => null)
const draft = ref('')
const streaming = ref(false)
const bottomAnchor = ref<HTMLElement | null>(null)
const historyOpen = ref(false)
const toast = useToast()
const route = useRoute()
const router = useRouter()

const { role } = await useAuth()
const { data: overview } = useOverviewSummary(role)
const rhr = computed(() => overview.value?.latestRhr ?? null)
// The same pet as on the home page and /ticker: its wardrobe, its build and its short-sleep slump.
// It was a bare default heart here. Not awaited — the page does not wait for its pet — and the
// slump gives way while it thinks or talks (the phone header's heart is the face alone, so there
// it shows in the eyes and the beat only).
const { accessories: tickerAccessories, build: tickerBuild, sluggish: tickerSluggish } = useTickerOutfit()

const { data: threadData, error: threadsError, refresh: refreshThreads } = await useAsyncData('ask-threads',
  () => useRequestFetch()<AskThreadSummary[]>('/api/ai/threads'))
const threads = computed(() => threadData.value ?? [])

// --- TICKER ---------------------------------------------------------------------------------

const railTicker = useTemplateRef('railTicker')
const headerTicker = useTemplateRef('headerTicker')
type TickerEvent = 'digest' | 'flatline' | 'bigbeat'
function tickerEvent(event: TickerEvent) {
  // Only one of the two is on screen at a time; the hidden one ignores it harmlessly.
  railTicker.value?.trigger(event)
  headerTicker.value?.trigger(event)
}
function nudge() {
  tickerEvent('bigbeat')
}

const phase = ref<'idle' | 'thinking' | 'talking' | 'failed'>('idle')
const mood = computed(() => phase.value === 'thinking' ? 'thinking' : phase.value === 'talking' ? 'talking' : null)
const bubble = computed(() => {
  switch (phase.value) {
    case 'thinking': return 'Hang on — pulling up our numbers…'
    case 'talking': return 'Here\'s what I\'m seeing…'
    case 'failed': return 'Ugh, that one didn\'t go through. Try me again?'
    default: return messages.value.length ? 'Anything else you want to dig into?' : GREETING
  }
})

// --- thinking spinner -------------------------------------------------------------------------

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const spinnerFrame = ref(SPINNER_FRAMES[0])
const thinkingSeconds = ref(0)
let thinkingTimer: ReturnType<typeof setInterval> | undefined

// The braille spinner is driven by a timer, so the global prefers-reduced-motion rule in
// main.css (which only stops CSS animation) can't reach it — check the preference here.
const reducedMotion = usePreferredReducedMotion()

function startThinking() {
  const startedAt = Date.now()
  thinkingSeconds.value = 0
  let frame = 0
  thinkingTimer = setInterval(() => {
    // Under reduced motion the glyph holds still and the elapsed count keeps ticking — that
    // was the part carrying the information anyway.
    if (reducedMotion.value !== 'reduce') {
      frame = (frame + 1) % SPINNER_FRAMES.length
      spinnerFrame.value = SPINNER_FRAMES[frame]
    }
    thinkingSeconds.value = Math.floor((Date.now() - startedAt) / 1000)
  }, 100)
}

function stopThinking() {
  if (thinkingTimer) {
    clearInterval(thinkingTimer)
    thinkingTimer = undefined
  }
}

onUnmounted(stopThinking)

// The in-flight answer's fetch, aborted when the page unmounts. Without it the stream kept
// writing into the shared `messages` state after navigating away, and a question asked on
// returning could overlap it (audit #42 item 14).
let inFlight: AbortController | null = null
onUnmounted(() => inFlight?.abort())

/** Marks an exchange as one the server did not (or may not have) saved, so it is never replayed as history. */
function markFailed(assistant: ChatMessage) {
  assistant.failed = true
  const q = messages.value[messages.value.indexOf(assistant) - 1]
  if (q?.role === 'user') q.failed = true
}

// --- transcript scrolling -------------------------------------------------------------------
// The transcript never chases a streaming answer on its own. A follow-up question lands while
// the previous answer is still being read, and following the new tokens dragged that answer off
// the top of the screen. So: one programmatic scroll per question (to show the question and the
// thinking line, and only when the reader was already at the bottom), after which the page
// follows the stream only while the reader has scrolled themselves to the bottom — scrolling
// back up stops it again. Programmatic scrolls fire scroll events too, so only scrolls that
// began with a wheel, touch or pointer gesture count towards that decision.

const FOLLOW_SLACK_PX = 48
let follow = false
let readerScrolled = false

function nearBottom() {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - FOLLOW_SLACK_PX
}

function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  nextTick(() => bottomAnchor.value?.scrollIntoView({ behavior, block: 'end' }))
}

function onReaderGesture() {
  readerScrolled = true
}
useEventListener('wheel', onReaderGesture, { passive: true })
useEventListener('touchmove', onReaderGesture, { passive: true })
useEventListener('pointerdown', onReaderGesture, { passive: true })
useEventListener('scroll', () => {
  if (readerScrolled) follow = nearBottom()
}, { passive: true })

// --- saved conversations --------------------------------------------------------------------

/** Makes ?thread= name the conversation on screen (or drops it when there is none). */
function syncUrl() {
  const current = route.query.thread ? Number(route.query.thread) : null
  if (threadId.value !== current) router.replace({ query: { ...route.query, thread: threadId.value ?? undefined } })
}
watch(threadId, syncUrl)

onMounted(() => {
  const fromUrl = Number(route.query.thread)
  if (Number.isInteger(fromUrl) && fromUrl > 0) {
    if (fromUrl !== threadId.value) openThread(fromUrl)
  }
  // Back on the page with a conversation still in memory: the watcher above only fires when the
  // id CHANGES, so the address stayed a bare /ask and a reload opened an empty page instead of
  // the conversation on screen (audit #44 item 29).
  else syncUrl()
})

// A saved conversation being fetched. Two things went wrong without this (audit #44 item 29):
// a question sent before a ?thread= link had loaded started a NEW thread, then the late response
// replaced the transcript and the id under it, so the page showed one conversation while saving
// into another; and clicking thread A then thread B let A's slower response land on top of B.
// So a question waits for the open to finish (`opening` shuts ASK), and only the newest open —
// one that nothing has superseded since — is applied (`openRun`).
const opening = ref(false)
let openRun = 0

function newConversation() {
  if (streaming.value) return
  openRun++ // an open still in flight is no longer wanted
  opening.value = false
  messages.value = []
  threadId.value = null
  phase.value = 'idle'
}

async function openThread(id: number) {
  if (streaming.value) return
  const run = ++openRun
  opening.value = true
  try {
    // Bounded: ASK stays shut while this is out, and a hung request must not hold it shut.
    const thread = await $fetch<AskThread>(`/api/ai/threads/${id}`, { timeout: 15_000 })
    if (run !== openRun || streaming.value) return
    messages.value = thread.messages
    threadId.value = thread.id
    phase.value = 'idle'
    scrollToBottom()
  }
  catch (err) {
    if (run !== openRun) return
    toast.add({ title: 'Couldn\'t open that conversation', description: extractErrorMessage(err, 'It may have been deleted.'), color: 'error' })
    if (threadId.value === id) newConversation()
    // A dead ?thread= link: the address goes back to naming what is actually on screen.
    syncUrl()
    refreshThreads()
  }
  finally {
    if (run === openRun) opening.value = false
  }
}

function openFromHistory(id: number) {
  historyOpen.value = false
  openThread(id)
}

const { run: runDelete } = useSaveAction(async (thread: AskThreadSummary) => {
  await $fetch('/api/ai/threads/delete', { method: 'POST', body: { id: thread.id } })
  if (threadId.value === thread.id) newConversation()
  await refreshThreads()
}, { error: 'Could not delete the conversation' })

function deleteThread(thread: AskThreadSummary) {
  if (window.confirm(`Delete "${thread.title}"?`)) runDelete(thread)
}

// --- asking ---------------------------------------------------------------------------------

async function send(preset?: string) {
  const question = (preset ?? draft.value).trim()
  // Not while a saved conversation is loading: the question belongs in it, not beside it. The
  // draft stays in the box.
  if (!question || streaming.value || opening.value) return
  // UTextarea's autoresize watches the model, so clearing the draft shrinks it back too.
  draft.value = ''

  // Measured before the question lands: a reader at the bottom (the usual case, having just
  // typed) is shown the question and the thinking line; one partway up an older answer stays put.
  const wasNearBottom = nearBottom()
  messages.value.push({ role: 'user', content: question })
  const assistant = reactive<ChatMessage>({ role: 'assistant', content: '' })
  messages.value.push(assistant)
  streaming.value = true
  phase.value = 'thinking'
  startThinking()
  follow = false
  readerScrolled = false
  if (wasNearBottom) scrollToBottom()
  const controller = new AbortController()
  inFlight = controller

  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        // Drops the empty assistant placeholder just pushed and caps the history at a user
        // turn — a bare slice(-N) opened on an assistant turn after ten exchanges and the API
        // rejected every request until "clear" (shared/utils/askHistory.ts). Failed exchanges
        // stay visible in the transcript but are never sent back as conversation.
        messages: trimAskHistory(messages.value.filter(m => !m.failed)),
        today: localToday(),
        ...(threadId.value != null ? { threadId: threadId.value } : {})
      })
    })
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => null) as { message?: string } | null
      throw new Error(err?.message ?? `HTTP ${res.status}`)
    }
    // The thread id comes from the end-of-stream trailer, not the X-Thread-Id header: a failed
    // first question drops its just-created thread server-side, and adopting the header early
    // left the page (and ?thread=) pointing at a conversation that no longer existed — every
    // follow-up then 404'd until "new ⊕".
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      full += decoder.decode(value, { stream: true })
      // Hold back the trailer so it never flashes in the transcript, even split across chunks.
      const mark = full.indexOf(ASK_TRAILER_MARK)
      assistant.content = mark === -1 ? full : full.slice(0, mark)
      if (assistant.content) {
        stopThinking()
        phase.value = 'talking'
      }
      if (follow) scrollToBottom('auto')
    }
    let trailer: AskStreamTrailer | null = null
    const mark = full.indexOf(ASK_TRAILER_MARK)
    if (mark !== -1) {
      try {
        trailer = JSON.parse(full.slice(mark + 1)) as AskStreamTrailer
      }
      catch { trailer = null }
      assistant.content = full.slice(0, mark).trimEnd()
    }
    if (!trailer) {
      // The stream ended without its trailer (a dropped connection, a Worker cut off
      // mid-answer): nothing says whether the exchange was saved or which thread it landed in.
      // Reading that as success adopted no thread and forked the conversation on the next
      // send — so it is a failure: left visible, kept out of future history.
      assistant.content = [assistant.content.trimEnd(), '*[the answer was cut off before it finished — ask again]*'].filter(Boolean).join('\n\n')
      markFailed(assistant)
      phase.value = 'failed'
      tickerEvent('flatline')
    }
    else {
      if (!assistant.content.trim()) assistant.content = '*[no answer returned — try again]*'
      threadId.value = trailer.threadId
      phase.value = 'idle'
      if (trailer.ok) {
        tickerEvent('digest')
      }
      else {
        // The server kept this exchange out of the thread — its in-band note is the last line
        // above. Mark both turns so a retry doesn't replay a half-answer as conversation.
        markFailed(assistant)
      }
    }
    refreshThreads()
  }
  catch (err) {
    if (controller.signal.aborted) {
      // Left the page mid-answer. Whatever streamed stays, marked so it is never replayed as
      // history; no toast — nobody is on this page to read it.
      assistant.content = [assistant.content.trimEnd(), '*[interrupted — ask again]*'].filter(Boolean).join('\n\n')
      markFailed(assistant)
      phase.value = 'idle'
      return
    }
    // Drop the failed exchange — placeholder and the question it answered — and put the
    // question back in the box so a retry is one keypress. Leaving the question in the
    // transcript would send it twice (two consecutive user turns) on that retry.
    const question_ = messages.value[messages.value.indexOf(assistant) - 1]
    messages.value = messages.value.filter(m => m !== assistant && m !== question_)
    draft.value = question
    phase.value = 'failed'
    tickerEvent('flatline')
    toast.add({ title: 'Ask failed', description: extractErrorMessage(err, 'Try again in a moment.'), color: 'error' })
  }
  finally {
    if (inFlight === controller) inFlight = null
    stopThinking()
    streaming.value = false
    if (follow) scrollToBottom('auto')
  }
}

useSeoMeta({ title: 'Ask' })
</script>

<style scoped>
/* The bubble's tail points up at TICKER, the same notch the home digest uses pointing down. */
.ticker-bubble::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  background: var(--color-raised);
  border-left: 1px solid var(--color-line-soft);
  border-top: 1px solid var(--color-line-soft);
  transform: rotate(45deg);
}
</style>
