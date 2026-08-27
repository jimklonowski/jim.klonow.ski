<template>
  <div class="flex flex-col min-h-[calc(100dvh-7.25rem)]">
    <!-- Title row -->
    <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 sm:px-6 py-3 border-b border-line">
      <h1 class="num-display text-hi text-[19px] leading-none">
        ASK
      </h1>
      <p class="text-[11px] text-muted tracking-[0.06em] uppercase">
        analysis console · labs + dexa + journal + whoop + protocol
      </p>
      <div class="flex items-center gap-3 ml-auto text-[11px]">
        <button
          v-if="messages.length"
          type="button"
          class="text-accent hover:text-accent-hover cursor-pointer"
          :disabled="streaming"
          @click="clear"
        >
          clear ⌫
        </button>
      </div>
    </div>

    <!-- Transcript -->
    <div class="flex-1 px-4 sm:px-6 py-4 space-y-4">
      <div
        v-if="!messages.length"
        class="space-y-3"
      >
        <p class="text-[12.5px] text-muted">
          Ask anything about your data — every draw, scan, dose, and Whoop night is in context. Answers cite the numbers they reason from; correlations are flagged as observations, not causes.
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
          class="text-[12.5px] leading-[1.75] text-dim digest-prose pl-4 border-l border-line-soft"
        >
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
        <textarea
          ref="inputEl"
          v-model="draft"
          rows="1"
          placeholder="ask about your data…"
          class="flex-1 resize-none bg-inset border border-line-field px-3 py-2 text-[12.5px] text-body placeholder:text-ghost focus:outline-none focus:border-line-accent max-h-40"
          :disabled="streaming"
          @keydown.enter.exact.prevent="send()"
          @input="autosize"
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
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'journal-auth' })

interface ChatMessage { role: 'user' | 'assistant', content: string }

const SAMPLE_QUESTIONS = [
  'How has my BP trended since the test cut to 150mg/wk?',
  'Which markers moved most between the last two draws?',
  'Is the HRV drop correlated with anything I started?',
  'What should be in range before I add an oral anabolic?'
]

// Survives navigating away mid-conversation; cleared explicitly.
const messages = useState<ChatMessage[]>('ask-messages', () => [])
const draft = ref('')
const streaming = ref(false)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const bottomAnchor = ref<HTMLElement | null>(null)
const toast = useToast()

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const spinnerFrame = ref(SPINNER_FRAMES[0])
const thinkingSeconds = ref(0)
let thinkingTimer: ReturnType<typeof setInterval> | undefined

function startThinking() {
  const startedAt = Date.now()
  thinkingSeconds.value = 0
  let frame = 0
  thinkingTimer = setInterval(() => {
    frame = (frame + 1) % SPINNER_FRAMES.length
    spinnerFrame.value = SPINNER_FRAMES[frame]
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

function autosize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

function scrollToBottom() {
  nextTick(() => bottomAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
}

function clear() {
  messages.value = []
}

async function send(preset?: string) {
  const question = (preset ?? draft.value).trim()
  if (!question || streaming.value) return
  draft.value = ''
  autosize()

  messages.value.push({ role: 'user', content: question })
  const assistant = reactive<ChatMessage>({ role: 'assistant', content: '' })
  messages.value.push(assistant)
  streaming.value = true
  startThinking()
  scrollToBottom()

  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // The assistant placeholder just pushed is stripped; empty content would 400.
        messages: messages.value.filter(m => m.content).slice(-20),
        today: localToday()
      })
    })
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => null) as { message?: string } | null
      throw new Error(err?.message ?? `HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      assistant.content += decoder.decode(value, { stream: true })
      if (assistant.content) stopThinking()
      scrollToBottom()
    }
    if (!assistant.content.trim()) assistant.content = '*[no answer returned — try again]*'
  }
  catch (err) {
    // Drop the empty placeholder and put the question back in the box so a retry is one keypress.
    messages.value = messages.value.filter(m => m !== assistant)
    draft.value = question
    toast.add({ title: 'Ask failed', description: err instanceof Error ? err.message : 'Try again in a moment.', color: 'error' })
  }
  finally {
    stopThinking()
    streaming.value = false
    scrollToBottom()
  }
}

useSeoMeta({ title: 'Ask' })
</script>
