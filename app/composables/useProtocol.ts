import type { LoadedProtocol } from '#shared/utils/protocolStore'

/**
 * The standing schedule as the server resolves it from the protocol tables (the protocol plan,
 * P5). Pages `await` it like the other list stores, so a client navigation renders with the
 * server's answer; a component reads it without awaiting. Before the first answer (or after a
 * failed first load) there is no schedule: no rings, no annotations. The demo sandbox is answered
 * with its own rows, or an empty schedule when it has none (server/utils/protocolLoader.ts).
 */
export function useProtocol() {
  const resource = useListResource<LoadedProtocol>('/journal/protocol', '/api/journal/protocol/list', { label: 'protocol' })
  const fields = {
    data: resource.data,
    pending: resource.pending,
    error: resource.error,
    status: resource.status,
    refresh: resource.refresh,
    rules: computed(() => resource.data.value?.rules ?? []),
    standing: computed(() => resource.data.value?.standing ?? []),
    asNeeded: computed(() => resource.data.value?.asNeeded ?? [])
  }
  // The shape useAsyncData itself returns: a promise resolving to the fields, with the fields on
  // it too. Spreading the resource instead copied its `then`, and `await useProtocol()` then
  // resolved to the bare resource — without the three computeds.
  const promise = Promise.resolve(resource).then(() => fields)
  return Object.assign(promise, fields)
}
