<template>
  <div class="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
    <div class="w-full max-w-sm">
      <!-- Wordmark — this page runs without the app shell, so it carries its own header line -->
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 flex items-center justify-center bg-raised border border-accent text-accent text-[10px] leading-none">▲</span>
        <span class="num-display text-[15px] tracking-tight">jim.klonow.ski</span>
        <span class="ml-auto flex items-center gap-1.5 text-[10.5px] text-faint tracking-[0.12em] uppercase">
          <span class="w-[7px] h-[7px] rounded-full bg-line-accent" />
          no session
        </span>
      </div>

      <div class="mt-3 bg-raised border border-line-accent px-3.5 py-3">
        <TuiHeader
          label="BLOODWORK TRACKER"
          :dashes="4"
        />

        <p class="mt-2.5 text-[12px] text-muted leading-[1.7]">
          Private dashboard. Enter the site password to continue.
        </p>

        <UForm
          :state="form"
          class="mt-3.5"
          @submit="handleSubmit"
        >
          <UFormField
            name="password"
            label="Password"
            :ui="{ label: 'tui-label' }"
          >
            <div class="flex items-center gap-2">
              <span class="shrink-0 text-accent text-[13px] leading-none">❯</span>
              <UInput
                v-model="form.password"
                type="password"
                placeholder="password"
                :disabled="loading"
                autofocus
                class="w-full"
              />
            </div>
          </UFormField>

          <UButton
            type="submit"
            class="w-full justify-center mt-3.5"
            :loading="loading"
            :disabled="!form.password"
          >
            Sign in
          </UButton>

          <p
            v-if="error"
            class="mt-2.5 text-[12px] text-danger"
          >
            ✕ {{ error }}
          </p>
        </UForm>
      </div>

      <p class="mt-2.5 text-[10.5px] text-ghost tracking-[0.1em] uppercase">
        session cookie · read-only share links issued on request
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const form = reactive({ password: '' })
const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/labs/auth', { method: 'POST', body: { password: form.password } })
    // Hard navigation so the page SSR-renders with full data instead of hydrating empty
    window.location.href = '/labs'
  }
  catch {
    error.value = 'Incorrect password. Try again.'
  }
  finally {
    loading.value = false
  }
}
</script>
