// The save/delete handler every form page wrote by hand: a pending flag, the request, a success
// toast, a failure toast, and the flag cleared in `finally`. More than twenty copies, and nearly
// all of them showed `err.message` on failure. For a failed $fetch that is ofetch's
// `[POST] "/api/journal/save": 400 Bad Request`, so the server's reason (a zod message naming
// the bad field) never reached the screen. The failure toast here goes through
// extractErrorMessage.
//
//   const save = useSaveAction(async () => {
//     await $fetch('/api/journal/supplements/save', { method: 'POST', body: { ...form } })
//     await refresh()
//     formModalOpen.value = false
//   }, { success: () => form.id ? 'Supplement updated' : 'Supplement added' })
//
//   <UButton :loading="save.pending.value" @click="save.run()">
//
// `run` ignores a second call while one is in flight (Enter plus a click used to post twice),
// never throws, and resolves to the action's result, or undefined when it failed or was skipped.
// Confirmations ("Delete X?") stay with the caller, before `run`.

interface SuccessToast {
  title: string
  description?: string
  icon?: string
}

interface SaveActionOptions<A extends unknown[], R> {
  /** Toast shown on success; a string, or built from the result and arguments. Omit for none.
   * NoInfer: the action's own signature decides the arguments, not a callback that reads fewer. */
  success?: string | NoInfer<(result: R, ...args: A) => string | SuccessToast | null | undefined>
  /** Title of the failure toast; the server's reason goes in its description. */
  error?: string
}

export function useSaveAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  { success, error = 'Save failed' }: SaveActionOptions<A, R> = {}
) {
  const toast = useToast()
  const pending = ref(false)

  async function run(...args: A): Promise<R | undefined> {
    if (pending.value) return undefined
    pending.value = true
    try {
      const result = await action(...args)
      const shown = typeof success === 'function' ? success(result, ...args) : success
      if (shown) {
        const t = typeof shown === 'string' ? { title: shown } : shown
        toast.add({ icon: 'i-lucide-check', ...t, color: 'success' })
      }
      return result
    }
    catch (err) {
      toast.add({ title: error, description: extractErrorMessage(err, 'Unknown error'), color: 'error' })
      return undefined
    }
    finally {
      pending.value = false
    }
  }

  return { run, pending }
}
