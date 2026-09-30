import { localToday } from '#shared/utils/time'

// The HOME_TZ date as a ref that actually rolls over at midnight. Pages used to compute
// localToday() once in setup, so a PWA reopened the next morning still treated yesterday as
// today everywhere that snapshot reached: "+ LOG TODAY" opened yesterday's entry, the status
// bar dated itself wrong, and SodaTracker's ✕ deleted against the wrong day.
//
// One shared state, armed once per app: a minute tick plus a visibility re-check (the
// wake-from-background path), each just a string compare until the day really changes.
export function useToday(): Readonly<Ref<string>> {
  const today = useState('local-today', () => localToday())
  if (import.meta.client) {
    const armed = useState('local-today-armed', () => false)
    if (!armed.value) {
      armed.value = true
      const check = () => {
        const now = localToday()
        if (now !== today.value) today.value = now
      }
      // App-lifetime singleton on purpose: never torn down, so no component owns (or leaks) it.
      setInterval(check, 60_000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    }
  }
  return readonly(today)
}
