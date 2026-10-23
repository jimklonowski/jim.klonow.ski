import { clockLabel, hourOf, isAsleep, isNight, skyFor } from '#shared/utils/tickerDay'
import { localTimeNow } from '#shared/utils/time'

/**
 * The clock on TICKER's wall: the HOME timezone's time (shared/utils/time.ts), not the viewer's —
 * it is one pet in one place, so a friend visiting from another timezone finds it awake or asleep
 * by its own evening, not theirs. Null until mounted, so the server and the first client paint
 * agree on a daytime stage; then it ticks on the minute. The bands (dusk, bedtime, wake) are
 * shared/utils/tickerDay.ts.
 */
export function useTickerClock() {
  /** "HH:MM" in the home timezone, 24-hour. */
  const now = ref<string | null>(null)
  const hour = computed(() => hourOf(now.value))
  const night = computed(() => isNight(hour.value))
  const asleep = computed(() => isAsleep(hour.value))
  /** What the window shows: the sun by day, amber around dawn and dusk, the moon and stars at night. */
  const sky = computed(() => skyFor(hour.value))
  /** The clock under the window, 12-hour: "3:14 pm". */
  const clock = computed(() => clockLabel(now.value))

  let timer: ReturnType<typeof setTimeout> | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    const tick = () => {
      now.value = localTimeNow()
    }
    tick()
    // Then on the minute, so the clock under the window never lags.
    timer = setTimeout(() => {
      tick()
      interval = setInterval(tick, 60_000)
    }, 60_000 - (Date.now() % 60_000))
  })
  onUnmounted(() => {
    clearTimeout(timer)
    clearInterval(interval)
  })

  return { now, hour, night, asleep, sky, clock }
}
