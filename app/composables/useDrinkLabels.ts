import type { DrinkLabel } from '#shared/utils/drinks'

/**
 * The owner's own label figures for drinks (drink_labels): hand-entered or scanned and checked,
 * read in place of the built-in drink table. One shared store: useMealEstimates folds it into
 * the figures index, and the drink list reads it for each row's source.
 */
export function useDrinkLabels() {
  return useListResource<DrinkLabel[]>('/journal/drink-labels', '/api/journal/drinks/labels', { label: 'drink labels' })
}
