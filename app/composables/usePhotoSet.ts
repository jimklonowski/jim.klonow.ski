import type { PhotoCategory } from '#shared/utils/photoCategories'
import { PHOTO_SETS, defaultPhotoSet, photoSet, type PhotoSetKey } from '#shared/utils/photoSets'

/**
 * The photo SET a page is working in (shared/utils/photoSets.ts): which categories the tab strip
 * shows, which slots the checklist counts, and which order a dropped batch files into.
 *
 * Opens on the set the day calls for — the acne set while the isotretinoin course is active on
 * `date`, else physique — and re-defaults when the date changes, so a manual switch holds for the
 * day on screen and no longer. The demo sandbox has no cycles, so it always opens on physique.
 */
export async function usePhotoSet(date: MaybeRefOrGetter<string>) {
  const { data: cycles } = await useCycles()
  const set = ref<PhotoSetKey>(defaultPhotoSet(cycles.value ?? [], toValue(date)))
  watch([() => toValue(date), cycles], ([d]) => {
    set.value = defaultPhotoSet(cycles.value ?? [], d)
  })

  const categories = computed<readonly PhotoCategory[]>(() => photoSet(set.value).categories)
  const hint = computed(() => photoSet(set.value).hint ?? null)
  /** TuiTabs items for the set picker. */
  const setTabs = PHOTO_SETS.map(s => ({ label: s.label, value: s.key, count: s.categories.length }))

  return { set, categories, hint, setTabs }
}
