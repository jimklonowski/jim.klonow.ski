import { AS_NEEDED_COMPOUNDS, PROTOCOL_RULES, STANDING_COMPOUNDS } from '#shared/utils/protocolRules'
import type { LoadedProtocol } from '#shared/utils/protocolStore'

/**
 * The standing schedule as the server resolves it: the protocol tables once they are seeded, the
 * code constants until then (the protocol plan, P5). Pages `await` it like the other list stores,
 * so a client navigation renders with the server's answer; a component reads it without awaiting.
 * The constants only stand in when there is no answer at all (a failed first load), so rings and
 * annotations never render from nothing. The demo sandbox is answered with an empty schedule
 * (server/utils/protocolLoader.ts publicProtocol).
 */
export function useProtocol() {
  const resource = useListResource<LoadedProtocol>('/journal/protocol', '/api/journal/protocol/list', { label: 'protocol' })
  const fields = {
    data: resource.data,
    pending: resource.pending,
    error: resource.error,
    status: resource.status,
    refresh: resource.refresh,
    rules: computed(() => resource.data.value?.rules ?? PROTOCOL_RULES),
    standing: computed(() => resource.data.value?.standing ?? STANDING_COMPOUNDS),
    asNeeded: computed(() => resource.data.value?.asNeeded ?? AS_NEEDED_COMPOUNDS)
  }
  // The shape useAsyncData itself returns: a promise resolving to the fields, with the fields on
  // it too. Spreading the resource instead copied its `then`, and `await useProtocol()` then
  // resolved to the bare resource — without the three computeds.
  const promise = Promise.resolve(resource).then(() => fields)
  return Object.assign(promise, fields)
}
