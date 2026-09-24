<template>
  <div>
    <ToolsHeader
      section="SHARING"
      :meta="countsMeta"
    />
    <ToolsNav />

    <!-- Access model note -->
    <div class="mx-4 sm:mx-6 mt-4 px-3.5 py-3 border border-dashed border-line-input bg-inset text-[12px] leading-[1.7] text-dim">
      Share links grant read-only access without handing out your password.
      <span class="text-hi">FRIEND</span> sees the whole site;
      <!-- Mirrors DOCTOR_PAGES in shared/utils/access.ts; keep the two in step. -->
      <span class="text-hi">DOCTOR</span> sees the clinical record: labs, body composition, vitals and
      protocol trends, compounds, supplements, vaccines and planned cycles, but no daily entries,
      notes or photos.
      Revoking a link also signs out everyone who used it.
    </div>

    <!-- Create -->
    <section class="px-4 sm:px-6 py-4">
      <div class="bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="NEW SHARE LINK"
          :dashes="7"
        >
          <span class="text-[10.5px] text-muted normal-case">shown once on create</span>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-2.5">
          <UFormField
            label="Access level"
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
            :ui="{ hint: 'text-[10.5px] text-faint' }"
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
            :ui="{ hint: 'text-[10.5px] text-faint' }"
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

        <!-- The only time this URL exists anywhere outside the recipient's hands: the database
             stores a hash of it, so nothing server-side can rebuild it later. -->
        <div
          v-if="createdLink"
          class="mt-3 px-3 py-2.5 border border-line-accent bg-inset"
        >
          <p class="tui-label text-accent">
            Copy this now — it can't be shown again
          </p>
          <div class="flex flex-wrap items-center gap-2 mt-1.5">
            <code class="flex-1 min-w-0 truncate text-[12px] text-hi">{{ createdLink }}</code>
            <button
              type="button"
              class="tui-btn shrink-0"
              @click="copyCreated"
            >
              {{ copied ? '✓ COPIED' : 'COPY' }}
            </button>
            <button
              type="button"
              class="tui-btn shrink-0"
              @click="createdLink = null"
            >
              DONE
            </button>
          </div>
          <p class="mt-1.5 text-[11px] text-muted leading-[1.6]">
            Lost it? Revoke the link below and create a new one.
          </p>
        </div>
      </div>
    </section>

    <!-- Existing links -->
    <section class="px-4 sm:px-6 pb-5">
      <TuiHeader
        :label="`LINKS · ${invites.length}`"
        :dashes="9"
      >
        <span class="text-[10.5px] text-muted normal-case">URLs aren't stored — revoke and reissue if one is lost</span>
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
            class="shrink-0 px-1.5 py-0.5 border text-[10.5px] tracking-widest uppercase"
            :class="roleChipClass(invite)"
          >{{ invite.role }}</span>

          <span
            class="text-[13px] truncate"
            :class="invite.revoked ? 'line-through text-muted' : 'text-hi'"
          >{{ invite.label || 'Unlabeled' }}</span>

          <span
            v-if="invite.revoked"
            class="text-[10.5px] tracking-widest uppercase text-danger"
          >✕ revoked</span>

          <span class="text-[11px] text-muted">{{ inviteMeta(invite) }}</span>

          <span
            v-if="!invite.revoked"
            class="ml-auto flex items-baseline gap-2.5 shrink-0 text-[11px]"
          >
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

    <!-- Owner sessions -->
    <section class="px-4 sm:px-6 pb-6">
      <div class="bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="YOUR SESSIONS"
          :dashes="7"
        >
          <span class="text-[10.5px] text-muted normal-case">a lost or shared device</span>
        </TuiHeader>
        <p class="mt-2 text-[12px] leading-[1.7] text-dim">
          Signs you out on every other device and browser, and locks lab uploads until the PIN is
          entered again. This device stays signed in. Share links aren't affected; revoke those above.
        </p>
        <div class="mt-3 pt-3 border-t border-line-soft">
          <button
            type="button"
            class="tui-btn disabled:opacity-50"
            :disabled="signingOut"
            @click="confirmSignOutElsewhere"
          >
            {{ signingOut ? 'SIGNING OUT…' : 'SIGN OUT OTHER DEVICES' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Invite } from '#shared/types/invites'

useSeoMeta({ title: 'Tools · Sharing' })

const ROLE_OPTIONS = [
  { label: 'Friend — everything, read-only', value: 'friend' },
  { label: 'Doctor — clinical record, no daily log', value: 'doctor' }
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
// Held only in this component, only until the panel is dismissed or the page leaves.
const createdLink = ref<string | null>(null)
const copied = ref(false)
const toast = useToast()

const { data, refresh } = await useAsyncData('invites', () => useRequestFetch()<Invite[]>('/api/auth/invites'))
// Active links first, revoked sunk to the bottom — each group keeps the API's newest-first order.
const invites = computed(() => {
  const list = data.value ?? []
  return [...list.filter(i => !i.revoked), ...list.filter(i => i.revoked)]
})

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

const { run: createInvite, pending: creating } = useSaveAction(async () => {
  // `token` comes back exactly once — the row holds only its hash.
  const res = await $fetch<{ token: string }>('/api/auth/invites', {
    method: 'POST',
    body: {
      role: form.role,
      label: form.label,
      expiresDays: form.expiresDays || null,
      maxUses: form.maxUses || null
    }
  })
  form.label = ''
  createdLink.value = `${window.location.origin}/share/${res.token}`
  copied.value = false
  await refresh()
  // Best-effort convenience; the URL is on screen either way, which matters now that it
  // can't be recovered if the clipboard write is blocked.
  await copyCreated()
}, { error: 'Could not create the link' })

async function copyCreated() {
  if (!createdLink.value) return
  try {
    await navigator.clipboard.writeText(createdLink.value)
    copied.value = true
    toast.add({ title: 'Link copied', description: 'It is not stored — paste it somewhere now.', color: 'success' })
  }
  catch {
    toast.add({ title: 'Copy it by hand', description: 'The clipboard was blocked; the link is shown above.', color: 'warning' })
  }
}

const { run: revoke } = useSaveAction(async (id: string) => {
  await $fetch('/api/auth/invites/revoke', { method: 'POST', body: { id } })
  await refresh()
}, {
  error: 'Could not revoke the link',
  success: () => ({ title: 'Link revoked', description: 'Sessions from this link are signed out.' })
})

const { run: signOutElsewhere, pending: signingOut } = useSaveAction(async () => {
  await $fetch('/api/auth/sign-out-everywhere', { method: 'POST' })
}, {
  error: 'Could not sign out other devices',
  success: () => ({ title: 'Other devices signed out', description: 'It can take up to a minute to reach every location.' })
})

function confirmSignOutElsewhere() {
  if (window.confirm('Sign out every other device? You stay signed in here.')) signOutElsewhere()
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
