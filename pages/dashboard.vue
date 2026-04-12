<script setup lang="ts">
const { data, pending, error } = await useAsyncData('dashboard-dataset', () => $fetch('/api/dashboard'));

const lighting = computed(() => data.value?.lighting);
const meters = computed(() => data.value?.meters);
const totalPower = computed(() => (lighting.value?.metrics.totalPowerW ?? 0).toLocaleString('es-AR'));
const formatPower = (value: number) => `${value.toLocaleString('es-AR')} W`;

const localityPowerRanking = computed(() =>
  [...(lighting.value?.localities ?? [])].sort((a, b) => b.powerTotalW - a.powerTotalW)
);

const sectorPowerRanking = computed(() =>
  [...(lighting.value?.sectors ?? [])].sort((a, b) => b.powerTotalW - a.powerTotalW)
);

useHead({
  title: 'Dashboard | Municipalidad FME'
});
</script>

<template>
  <div class="space-y-5">
    <header class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-[0.45em] text-slate-500">Vista ejecutiva</p>
      <h1 class="text-4xl font-semibold tracking-tight text-slate-950">Dashboard general</h1>
      <p class="max-w-3xl text-sm leading-6 text-slate-600">
        Resumen municipal para seguir cobertura LED, potencia instalada, medidores y el estado general del padrón.
      </p>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard
        v-for="card in [
          { label: 'Puntos de alumbrado', value: lighting?.metrics.totalPoints ?? 0 },
          { label: 'Luminarias estimadas', value: lighting?.metrics.totalLuminaries ?? 0 },
          { label: 'Medidores municipales', value: meters?.metrics.totalMeters ?? 0 },
          { label: 'Cobertura LED', value: `${lighting?.metrics.ledSharePoints ?? 0}%` }
        ]"
        :key="card.label"
        class="glass"
      >
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{{ card.label }}</p>
        <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ card.value }}</p>
      </UCard>
    </div>

    <div class="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <UCard class="glass">
        <template #header>
          <div>
            <p class="text-sm font-semibold text-slate-900">Cobertura y potencia</p>
            <p class="text-xs text-slate-500">Lectura ejecutiva de alumbrado</p>
          </div>
        </template>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl border border-slate-200 bg-white p-4">
            <p class="text-xs text-slate-500">LED por luminarias</p>
            <p class="mt-2 text-3xl font-semibold text-slate-950">{{ lighting?.metrics.ledShareLuminaries ?? 0 }}%</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4">
            <p class="text-xs text-slate-500">LED por potencia</p>
            <p class="mt-2 text-3xl font-semibold text-slate-950">{{ lighting?.metrics.ledSharePower ?? 0 }}%</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4">
            <p class="text-xs text-slate-500">Potencia total</p>
            <p class="mt-2 text-3xl font-semibold text-slate-950">{{ totalPower }} W</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4">
            <p class="text-xs text-slate-500">Potencia LED</p>
            <p class="mt-2 text-3xl font-semibold text-slate-950">
              {{ lighting?.metrics.ledPowerW?.toLocaleString('es-AR') ?? 0 }} W
            </p>
          </div>
        </div>
      </UCard>

      <UCard class="glass">
        <template #header>
          <div>
            <p class="text-sm font-semibold text-slate-900">Potencia total por localidad</p>
            <p class="text-xs text-slate-500">Ranking de potencia instalada por jurisdicción</p>
          </div>
        </template>

        <div class="max-h-[34rem] space-y-2 overflow-auto pr-1">
          <div
            v-for="item in localityPowerRanking"
            :key="item.name"
            class="rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-slate-900">{{ item.name }}</p>
                <p class="text-xs text-slate-500">{{ item.count }} puntos · {{ item.ledPercentage }}% LED</p>
              </div>
              <strong class="shrink-0 text-slate-800">{{ formatPower(item.powerTotalW) }}</strong>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid gap-5 xl:grid-cols-1">
      <UCard class="glass">
        <template #header>
          <div>
            <p class="text-sm font-semibold text-slate-900">Potencia total por domicilio o sector</p>
            <p class="text-xs text-slate-500">Ranking de los sectores con mayor carga instalada</p>
          </div>
        </template>

        <div class="max-h-[34rem] space-y-2 overflow-auto pr-1">
          <div
            v-for="item in sectorPowerRanking"
            :key="item.key"
            class="rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-slate-900">{{ item.label }}</p>
                <p class="text-xs text-slate-500">{{ item.count }} puntos · {{ item.ledPercentage }}% LED</p>
              </div>
              <strong class="shrink-0 text-slate-800">{{ formatPower(item.powerTotalW) }}</strong>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <div v-if="pending" class="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Cargando dashboard...
    </div>
    <div v-if="error" class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      No se pudo cargar el dashboard.
    </div>
  </div>
</template>
