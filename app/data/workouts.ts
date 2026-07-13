const WORKOUT_ICONS: Record<string, string> = {
  'Running': 'i-lucide-footprints',
  'Walking': 'i-lucide-footprints',
  'Cycling': 'i-lucide-bike',
  'Swimming': 'i-lucide-waves',
  'Traditional Strength Training': 'i-lucide-dumbbell',
  'Functional Strength Training': 'i-lucide-dumbbell'
}

export function workoutIcon(type: string | null | undefined): string {
  return (type && WORKOUT_ICONS[type]) ?? 'i-lucide-dumbbell'
}
