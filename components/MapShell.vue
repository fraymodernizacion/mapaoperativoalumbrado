<script setup lang="ts">
const props = defineProps<{
  title: string;
  subtitle: string;
}>();
</script>

<template>
  <section class="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,129,0.06),transparent_40%)]" />
    <div class="relative flex min-h-[78vh] flex-col">
      <div class="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 px-5 py-5">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Mapa operativo</p>
          <h2 class="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            {{ title }}
          </h2>
          <p class="mt-1 max-w-2xl text-sm text-slate-500">
            {{ subtitle }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <slot name="actions" />
        </div>
      </div>

      <div class="grid flex-1 grid-cols-1 gap-0 xl:grid-cols-[1.2fr_0.8fr]">
        <div class="relative min-h-[62vh] bg-[linear-gradient(180deg,#eaf2f8_0%,#dbeaf6_100%)]">
          <slot name="map" />
        </div>
        <div class="border-l border-slate-200/80 bg-slate-50/70 p-4">
          <slot name="side" />
        </div>
      </div>
    </div>
  </section>
</template>
