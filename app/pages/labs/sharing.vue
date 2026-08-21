<template>
  <UContainer>
    <div class="py-8 max-w-3xl mx-auto space-y-8">
      <div class="flex items-center gap-3">
        <UButton
          to="/labs"
          variant="ghost"
          icon="i-lucide-arrow-left"
          size="sm"
        >
          Labs
        </UButton>
        <h1 class="text-2xl font-bold">
          Sharing
        </h1>
      </div>

      <p class="text-sm text-muted">
        Share links grant read-only access without your password. <strong>Friends</strong> see the whole
        site; <strong>doctors</strong> see labs, body composition, and vitals/protocol trends only.
        Revoking a link also signs out everyone who used it.
      </p>

      <!-- Create -->
      <UCard>
        <template #header>
          <p class="text-sm font-semibold text-muted uppercase tracking-wider">
            New share link
          </p>
        </template>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UFormField label="Access level">
            <USelect
              v-model="form.role"
              :items="ROLE_OPTIONS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Label"
            hint="who it's for"
          >
            <UInput
              v-model="form.label"
              placeholder="Dr. Smith"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Link valid for"
            hint="redemption window"
          >
            <USelect
              v-model="form.expiresDays"
              :items="EXPIRY_OPTIONS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Max uses">
            <USelect
              v-model="form.maxUses"
              :items="USES_OPTIONS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>
        <template #footer>
          <UButton
            icon="i-lucide-link"
            :loading="creating"
            @click="createInvite"
          >
            Create link
          </UButton>
        </template>
      </UCard>

      <!-- Existing links -->
      <section v-if="invites.length">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Links
        </h2>
        <div class="space-y-3">
          <UCard
            v-for="invite in invites"
            :key="invite.id"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="invite.revoked ? 'neutral' : invite.role === 'doctor' ? 'info' : 'success'"
                    variant="subtle"
                    class="capitalize"
                  >
                    {{ invite.role }}
                  </UBadge>
                  <p class="text-sm font-medium truncate">
                    {{ invite.label || 'Unlabeled' }}
                  </p>
                  <UBadge
                    v-if="invite.revoked"
                    color="error"
                    variant="subtle"
                  >
                    Revoked
                  </UBadge>
                </div>
                <p class="text-xs text-muted mt-1">
                  Created {{ shortDate(invite.created_at) }}
                  · {{ invite.uses }}{{ invite.max_uses != null ? `/${invite.max_uses}` : '' }} uses
                  <template v-if="invite.expires_at">
                    · expires {{ shortDate(invite.expires_at) }}
                  </template>
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="!invite.revoked"
                  variant="outline"
                  size="xs"
                  :icon="copiedId === invite.id ? 'i-lucide-check' : 'i-lucide-copy'"
                  @click="copyLink(invite.id)"
                >
                  {{ copiedId === invite.id ? 'Copied' : 'Copy link' }}
                </UButton>
                <UButton
                  v-if="!invite.revoked"
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="i-lucide-ban"
                  @click="revoke(invite.id)"
                >
                  Revoke
                </UButton>
              </div>
            </div>
          </UCard>
        </div>
      </section>
      <UEmpty
        v-else
        icon="i-lucide-users"
        title="No share links yet"
        description="Create one above and send it to a friend or your doctor."
      />
    </div>
  </UContainer>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'labs-auth' })

interface Invite {
  id: string
  role: string
  label: string | null
  created_at: string
  expires_at: string | null
  max_uses: number | null
  uses: number
  revoked: boolean
}

const ROLE_OPTIONS = [
  { label: 'Friend — everything, read-only', value: 'friend' },
  { label: 'Doctor — labs, DEXA, vitals & protocol', value: 'doctor' }
]
const EXPIRY_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: 'No deadline', value: 0 }
]
const USES_OPTIONS = [
  { label: '1 use', value: 1 },
  { label: '5 uses', value: 5 },
  { label: 'Unlimited', value: 0 }
]

const form = reactive({ role: 'friend', label: '', expiresDays: 30, maxUses: 0 })
const creating = ref(false)
const copiedId = ref<string | null>(null)
const toast = useToast()

const { data, refresh } = await useAsyncData('invites', () => useRequestFetch()<Invite[]>('/api/auth/invites'))
const invites = computed(() => data.value ?? [])

async function createInvite() {
  creating.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/auth/invites', {
      method: 'POST',
      body: {
        role: form.role,
        label: form.label,
        expiresDays: form.expiresDays || null,
        maxUses: form.maxUses || null
      }
    })
    form.label = ''
    await refresh()
    await copyLink(res.id)
    toast.add({ title: 'Share link created and copied', color: 'success' })
  }
  catch {
    toast.add({ title: 'Could not create the link', color: 'error' })
  }
  finally {
    creating.value = false
  }
}

async function copyLink(id: string) {
  const url = `${window.location.origin}/share/${id}`
  await navigator.clipboard.writeText(url)
  copiedId.value = id
  setTimeout(() => {
    if (copiedId.value === id) copiedId.value = null
  }, 2000)
}

async function revoke(id: string) {
  try {
    await $fetch('/api/auth/invites/revoke', { method: 'POST', body: { id } })
    await refresh()
    toast.add({ title: 'Link revoked', description: 'Sessions from this link are signed out.', color: 'success' })
  }
  catch {
    toast.add({ title: 'Could not revoke the link', color: 'error' })
  }
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
