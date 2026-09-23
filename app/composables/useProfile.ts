import type { Profile } from '#shared/utils/profile'

export function useProfile() {
  return useListResource<Profile>('/journal/profile', '/api/journal/profile')
}
