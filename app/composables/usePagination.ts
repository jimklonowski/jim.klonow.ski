// Client-side paging over an already-loaded list: the entries ledger and the workouts log.
// Rendered by <TuiPager>.
//
// The page clamps when the list shrinks. Deleting the only row on the last page used to leave
// `page` past the end, showing an empty page with a "page 4 / 3" pager.
export function usePagination<T>(list: Ref<T[]> | ComputedRef<T[]>, pageSize: number) {
  const page = ref(1)
  const totalPages = computed(() => Math.max(1, Math.ceil(list.value.length / pageSize)))
  watch(totalPages, (n) => {
    if (page.value > n) page.value = n
  })
  const pageRows = computed(() => list.value.slice((page.value - 1) * pageSize, page.value * pageSize))
  return { page, totalPages, pageRows }
}
