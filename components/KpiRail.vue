<script setup lang="ts">
defineProps<{
  items: Array<{ label: string; value: string }>
}>();
</script>

<template>
  <aside class="space-y-3">
    <div
      v-for="item in items"
      :key="item.label"
      class="glass rounded-3xl px-4 py-4"
    >
      <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
        {{ item.label }}
      </p>
      <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {{ item.value }}
      </p>
    </div>
  </aside>
</template>
