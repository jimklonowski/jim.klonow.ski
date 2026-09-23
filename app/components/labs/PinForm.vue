<script setup lang="ts">
// The 9-digit upload-PIN form: the second factor on lab writes (uploads, regenerating a
// summary). A correct PIN sets the httpOnly labs-upload-auth cookie server-side, and the form
// emits `unlocked` so the page can carry on with whatever needed it.
//
// `inline` is the upload page's panel (❯ prompt, left-aligned error). `modal` is the compact
// body for the labs index's "regenerate" modal.
const props = withDefaults(defineProps<{
  variant?: 'inline' | 'modal'
  buttonLabel?: string
}>(), {
  variant: 'inline',
  buttonLabel: 'Unlock'
})
const emit = defineEmits<{ unlocked: [] }>()

const PIN_LENGTH = 9
const pin = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (pin.value.length !== PIN_LENGTH || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/labs/upload-auth', { method: 'POST', body: { pin: pin.value } })
    pin.value = ''
    emit('unlocked')
  }
  catch {
    error.value = 'Incorrect PIN. Try again.'
    pin.value = ''
  }
  finally {
    loading.value = false
  }
}

const modal = computed(() => props.variant === 'modal')
</script>

<template>
  <div :class="modal ? 'space-y-3' : ''">
    <div
      :class="modal ? '' : 'flex items-center gap-2 mt-3'"
    >
      <span
        v-if="!modal"
        class="shrink-0 text-accent text-[13px] leading-none"
      >❯</span>
      <UInput
        v-model="pin"
        type="password"
        inputmode="numeric"
        :maxlength="PIN_LENGTH"
        :placeholder="`${PIN_LENGTH}-digit PIN`"
        autofocus
        class="w-full text-center tracking-widest"
        @keydown.enter="submit"
      />
    </div>
    <UButton
      class="w-full justify-center"
      :class="modal ? '' : 'mt-3'"
      :loading="loading"
      :disabled="pin.length !== PIN_LENGTH"
      @click="submit"
    >
      {{ buttonLabel }}
    </UButton>
    <p
      v-if="error"
      class="text-[12px] text-danger"
      :class="modal ? 'text-center' : 'mt-2.5'"
    >
      {{ modal ? error : `✕ ${error}` }}
    </p>
  </div>
</template>
