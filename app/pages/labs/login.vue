<template>
  <div class="min-h-screen flex items-center justify-center">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold">Bloodwork Tracker</h1>
        <p class="text-sm text-muted">Enter password to continue</p>
      </template>

      <UForm :state="form" @submit="handleSubmit">
        <UFormField name="password" class="mb-4">
          <UInput
            v-model="form.password"
            type="password"
            placeholder="Password"
            :disabled="loading"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UButton type="submit" class="w-full" :loading="loading" :disabled="!form.password">
          Sign in
        </UButton>

        <p v-if="error" class="mt-3 text-sm text-error">
          {{ error }}
        </p>
      </UForm>
    </UCard>
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
