<template>
  <div>
    <!-- Breadcrumb title row -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-3.5 border-b border-line">
      <span class="text-[11px] text-muted tracking-[0.06em] uppercase">
        <NuxtLink
          to="/labs"
          class="hover:text-accent"
        >labs</NuxtLink> /
      </span>
      <h1 class="num-display text-hi text-[24px] leading-none">
        SHARING
      </h1>
      <p class="text-[11px] text-muted tracking-[0.06em] uppercase">
        {{ countsMeta }}
      </p>
      <NuxtLink
        to="/labs"
        class="tui-btn ml-auto"
      >
        BLOODWORK →
      </NuxtLink>
    </div>

    <!-- Access model note -->
    <div class="mx-4 sm:mx-6 mt-4 px-3.5 py-3 border border-dashed border-line-input bg-inset text-[12px] leading-[1.7] text-dim">
      Share links grant read-only access without handing out your password.
      <span class="text-hi">FRIEND</span> sees the whole site;
      <span class="text-hi">DOCTOR</span> sees labs, body composition, and vitals/protocol trends only.
      Revoking a link also signs out everyone who used it.
    </div>

    <!-- Create -->
    <section class="px-4 sm:px-6 py-4">
      <div class="bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="NEW SHARE LINK"
          :dashes="7"
        >
          <span class="text-[10.5px] text-muted normal-case">copied to your clipboard on create</span>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-2.5">
          <UFormField
            label="Access level"
            :ui="{ label: 'tui-label' }"
          >
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
            :ui="{ label: 'tui-label', hint: 'text-[10.5px] text-faint' }"
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
            :ui="{ label: 'tui-label', hint: 'text-[10.5px] text-faint' }"
          >
            <USelect
              v-model="form.expiresDays"
              :items="EXPIRY_OPTIONS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Max uses"
            :ui="{ label: 'tui-label' }"
          >
            <USelect
              v-model="form.maxUses"
              :items="USES_OPTIONS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="mt-3 pt-3 border-t border-line-soft">
          <button
            type="button"
            class="tui-btn tui-btn-accent disabled:opacity-50"
            :disabled="creating"
            @click="createInvite"
          >
            {{ creating ? 'CREATING…' : '+ CREATE LINK' }}
          </button>
        </div>
      </div>
    </section>

    <!-- Existing links -->
    <section class="px-4 sm:px-6 pb-5">
      <TuiHeader
        :label="`LINKS · ${invites.length}`"
        :dashes="9"
      >
        <span class="text-[10.5px] text-muted normal-case">/share/&lt;id&gt;</span>
      </TuiHeader>

      <div
        v-if="invites.length"
        class="border border-line-soft mt-2.5"
      >
        <div
          v-for="(invite, i) in invites"
          :key="invite.id"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 border-b border-line-soft last:border-0"
          :class="[i % 2 ? 'bg-inset' : 'bg-raised', invite.revoked ? 'opacity-60' : '']"
        >
          <span
            class="shrink-0 px-1.5 py-0.5 border text-[10.5px] tracking-[0.1em] uppercase"
            :class="roleChipClass(invite)"
          >{{ invite.role }}</span>

          <span
            class="text-[13px] truncate"
            :class="invite.revoked ? 'line-through text-muted' : 'text-hi'"
          >{{ invite.label || 'Unlabeled' }}</span>

          <span
            v-if="invite.revoked"
            class="text-[10.5px] tracking-[0.1em] uppercase text-danger"
          >✕ revoked</span>

          <span class="text-[11px] text-muted">{{ inviteMeta(invite) }}</span>

          <span
            v-if="!invite.revoked"
            class="ml-auto flex items-baseline gap-2.5 shrink-0 text-[11px]"
          >
            <button
              type="button"
              class="cursor-pointer"
              :class="copiedId === invite.id ? 'text-accent' : 'text-faint hover:text-accent'"
              :aria-label="`Copy link for ${invite.label || 'unlabeled link'}`"
              @click="copyLink(invite.id)"
            >{{ copiedId === invite.id ? '✓ copied' : 'copy link' }}</button>
            <span class="text-ghost">·</span>
            <button
              type="button"
              class="text-faint hover:text-danger cursor-pointer"
              :aria-label="`Revoke link for ${invite.label || 'unlabeled link'}`"
              @click="revoke(invite.id)"
            >revoke</button>
          </span>
        </div>
      </div>

      <UEmpty
        v-else
        icon="i-lucide-users"
        variant="naked"
        title="No share links yet"
        description="Create one above and send it to a friend or your doctor."
        :ui="{
          root: 'py-8 px-4 gap-2',
          avatar: 'bg-inset text-faint ring-0 mb-1',
          title: 'text-[12.5px] font-normal',
          description: 'text-[11.5px] text-muted'
        }"
      />
    </section>
  </div>
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

// Row meta and the title-row counts are assembled here — adjacent <template v-if> blocks in the
// markup lose the spaces between them once Vue condenses whitespace.
const countsMeta = computed(() => {
  const active = invites.value.filter(invite => !invite.revoked).length
  const revoked = invites.value.length - active
  const parts = [`${active} active`]
  if (revoked) parts.push(`${revoked} revoked`)
  return parts.join(' · ')
})

function inviteMeta(invite: Invite) {
  const uses = invite.max_uses != null
    ? `${invite.uses}/${invite.max_uses} uses`
    : `${invite.uses} uses`
  const parts = [`created ${shortDate(invite.created_at)}`, uses]
  if (invite.expires_at) parts.push(`expires ${shortDate(invite.expires_at)}`)
  return parts.join(' · ')
}

/** Friend links read as accent, doctor links as the restricted-scope warn tone. */
function roleChipClass(invite: Invite) {
  if (invite.revoked) return 'text-faint border-line-input'
  return invite.role === 'doctor'
    ? 'text-warn border-line-input'
    : 'text-accent border-line-accent'
}

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
