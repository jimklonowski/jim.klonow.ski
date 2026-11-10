import type { PhotoCategory } from '#shared/utils/photoCategories'
import { PHOTO_SETS, defaultPhotoSet, photoSet, type PhotoSetKey } from '#shared/utils/photoSets'

/**
 * The photo SET a page is working in (shared/utils/photoSets.ts): which categories the tab strip
 * shows, which slots the checklist counts, and which order a dropped batch files into.
 *
 * Opens on the set the day calls for — the acne set while the isotretinoin course is active on
 * `date`, else physique — and re-defaults only when that answer changes (a new day on screen, a
 * course planned or ended), so a manual switch holds until then. Watching the cycles list itself
 * reset the pick on every refresh of it (audit #43 item 96).
 */
export async function usePhotoSet(date: MaybeRefOrGetter<string>) {
  const { data: cycles } = await useCycles()
  const defaultSet = computed(() => defaultPhotoSet(cycles.value ?? [], toValue(date)))
  const set = ref<PhotoSetKey>(defaultSet.value)
  watch(defaultSet, (d) => {
    set.value = d
  })

  const categories = computed<readonly PhotoCategory[]>(() => photoSet(set.value).categories)
  const hint = computed(() => photoSet(set.value).hint ?? null)
  /** TuiTabs items for the set picker. */
  const setTabs = PHOTO_SETS.map(s => ({ label: s.label, value: s.key, count: s.categories.length }))

  return { set, categories, hint, setTabs }
}
