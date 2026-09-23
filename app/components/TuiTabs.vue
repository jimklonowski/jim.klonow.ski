<script setup lang="ts" generic="V extends string">
// The terminal tab strip: equal cells ruled by 1px lines, the active cell lit on the nav surface
// in accent. Used by the labs categories, the photo categories and the upload report type.
//
// Built on UTabs (content off: these switch the data below, they don't own panels), which
// brings real tab semantics: one tab stop, arrow keys between cells, and the active tab announced.
// The hand-rolled button rows before this had none of that.
interface TuiTab {
  label: string
  value: V
  /** Shown faint after the label, e.g. how many markers or photos are in the category. */
  count?: number
}

withDefaults(defineProps<{
  items: readonly TuiTab[]
  /** Grid columns for the list, e.g. 'grid-cols-3 md:grid-cols-6'. */
  cols?: string
}>(), {
  cols: 'grid-cols-3'
})

const model = defineModel<V>({ required: true })
</script>

<template>
  <!-- UTabs reports string | number; every value here is one of the items' own V values. -->
  <UTabs
    :model-value="model"
    :items="[...items]"
    :content="false"
    :ui="{
      root: 'block',
      list: `grid ${cols} gap-px bg-line border border-line p-0 rounded-none`,
      indicator: 'hidden',
      trigger: 'px-3 py-2.5 gap-1.5 justify-center rounded-none font-normal text-[11px] tracking-widest uppercase cursor-pointer bg-bg data-[state=inactive]:text-nav-idle hover:data-[state=inactive]:not-disabled:text-accent data-[state=active]:bg-nav-active data-[state=active]:text-accent'
    }"
    @update:model-value="model = $event as V"
  >
    <template #trailing="{ item }">
      <span
        v-if="item.count != null"
        class="text-faint"
      >{{ item.count }}</span>
    </template>
  </UTabs>
</template>
