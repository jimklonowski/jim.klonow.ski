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
          aria-label="TICKER"
          @open="nudge"
        />
        <p
          class="ticker-bubble relative mt-4 w-full px-3 py-2.5 bg-raised border border-line-soft text-[12px] leading-[1.6] text-dim"
          aria-live="polite"
        >
          {{ bubble }}
        </p>
      </div>
      <AskThreadList
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
          aria-label="TICKER"
          @open="nudge"
        />
        <h1 class="num-display text-hi text-[19px] leading-none">
          ASK
        </h1>
        <p class="hidden sm:block text-[11px] text-muted tracking-[0.06em] uppercase">
          ticker · labs + dexa + journal + whoop + protocol
        </p>
        <div class="flex items-center gap-3 ml-auto text-[11px]">
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

      <!-- Transcript -->
      <div class="flex-1 px-4 sm:px-6 py-4 space-y-4">
        <div
          v-if="!messages.length"
          class="space-y-3"
        >
          <!-- On a phone the rail (and its speech bubble) is hidden, so the greeting moves here. -->
          <p class="text-[12.5px] text-muted leading-[1.7]">
            <span class="lg:hidden">{{ GREETING }}</span>
            <span class="hidden lg:inline">Every draw, scan, dose, and Whoop night is in context.</span>
            {{ ' ' }}Answers cite the numbers they reason from; correlations are flagged as observations, not causes.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="q in SAMPLE_QUESTIONS"
              :key="q"
              type="button"
              class="px-2.5 py-1.5 border border-line-input text-[11.5px] text-dim hover:text-accent hover:border-line-accent cursor-pointer text-left"
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
            class="text-[12.5px] text-hi"
          >
            <span class="text-accent">❯</span> {{ m.content }}
          </p>
          <div
            v-else
            class="pl-4 border-l border-line-soft"
          >
            <p class="text-[10px] tracking-[0.14em] uppercase text-faint">
              <span class="text-danger">♥</span> ticker
            </p>
            <div class="mt-1 text-[12.5px] leading-[1.75] text-dim digest-prose">
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
          <span class="text-accent text-[13px] leading-[2.2]">❯</span>
          <!-- Grows with the question up to ~7 lines, then scrolls; Enter sends, Shift+Enter breaks. -->
          <UTextarea
            v-model="draft"
            :rows="1"
            :maxrows="7"
            autoresize
            placeholder="ask ticker about our data…"
            class="flex-1"
            :ui="{ base: 'resize-none text-[12.5px] placeholder:text-ghost' }"
            :disabled="streaming"
            @keydown.enter.exact.prevent="send()"
          />
          <button
            type="submit"
            class="tui-btn tui-btn-accent disabled:opacity-50"
            :disabled="streaming || !draft.trim()"
          >
            {{ streaming ? '…' : 'ASK' }}
          </button>
        </form>
        <p class="mt-1.5 text-[10.5px] text-ghost">
          answers are generated from your logged data · observations, not medical advice<span class="hidden sm:inline"> · enter to send, shift+enter for a new line</span>
        </p>
      </div>
    </div>

    <!-- Saved conversations on narrow screens -->
    <USlideover
      v-model:open="historyOpen"
      title="SAVED CONVERSATIONS"
      :ui="{ content: 'max-w-xs bg-bg border-l border-line ring-0', header: 'border-b border-line', title: 'num-display text-hi text-[16px]' }"
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

const { data: threadData, refresh: refreshThreads } = await useAsyncData('ask-threads',
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

function scrollToBottom() {
  nextTick(() => bottomAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
}

// --- saved conversations --------------------------------------------------------------------

watch(threadId, (id) => {
  const current = route.query.thread ? Number(route.query.thread) : null
  if (id !== current) router.replace({ query: { ...route.query, thread: id ?? undefined } })
})

onMounted(() => {
  const fromUrl = Number(route.query.thread)
  if (Number.isInteger(fromUrl) && fromUrl > 0 && fromUrl !== threadId.value) openThread(fromUrl)
})

function newConversation() {
  if (streaming.value) return
  messages.value = []
  threadId.value = null
  phase.value = 'idle'
}

async function openThread(id: number) {
  if (streaming.value) return
  try {
    const thread = await $fetch<AskThread>(`/api/ai/threads/${id}`)
    messages.value = thread.messages
    threadId.value = thread.id
    phase.value = 'idle'
    scrollToBottom()
  }
  catch (err) {
    toast.add({ title: 'Couldn\'t open that conversation', description: extractErrorMessage(err, 'It may have been deleted.'), color: 'error' })
    if (threadId.value === id) newConversation()
    refreshThreads()
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
  if (!question || streaming.value) return
  // UTextarea's autoresize watches the model, so clearing the draft shrinks it back too.
  draft.value = ''

  messages.value.push({ role: 'user', content: question })
  const assistant = reactive<ChatMessage>({ role: 'assistant', content: '' })
  messages.value.push(assistant)
  streaming.value = true
  phase.value = 'thinking'
  startThinking()
  scrollToBottom()

  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      scrollToBottom()
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
    if (!assistant.content.trim()) assistant.content = '*[no answer returned — try again]*'
    if (trailer) threadId.value = trailer.threadId
    phase.value = 'idle'
    if (trailer && !trailer.ok) {
      // The server kept this exchange out of the thread — its in-band note is the last line
      // above. Mark both turns so a retry doesn't replay a half-answer as conversation.
      assistant.failed = true
      const q = messages.value[messages.value.indexOf(assistant) - 1]
      if (q?.role === 'user') q.failed = true
    }
    else {
      tickerEvent('digest')
    }
    refreshThreads()
  }
  catch (err) {
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
    stopThinking()
    streaming.value = false
    scrollToBottom()
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
