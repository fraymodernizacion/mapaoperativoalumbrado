<script setup lang="ts">
const { data, pending, error } = await useAsyncData('quality-dataset', () => $fetch('/api/dashboard'), { server: false });

const lighting = computed(() => data.value?.lighting);
const meters = computed(() => data.value?.meters);

useHead({ title: 'Calidad de datos | Municipalidad FME' });
</script>

<template>
  <div class="space-y-5">
    <header class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-[0.45em] text-slate-500">Control interno</p>
      <h1 class="text-4xl font-semibold tracking-tight text-slate-950">Calidad de datos</h1>
      <p class="max-w-3xl text-sm leading-6 text-slate-600">
        Estado de coordenadas, potencias faltantes, domicilios incompletos y registros que conviene corregir antes de reportar.
      </p>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Sin coordenadas</p>
        <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ lighting?.metrics.noCoordinate ?? 0 }}</p>
      </UCard>
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Sin potencia</p>
        <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ lighting?.metrics.noPower ?? 0 }}</p>
      </UCard>
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Medidores sin coordenadas</p>
        <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ meters?.metrics.noCoordinate ?? 0 }}</p>
      </UCard>
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Duplicados probables</p>
        <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{{ lighting?.metrics.duplicates ?? 0 }}</p>
      </UCard>
    </div>

    <div class="grid gap-5 xl:grid-cols-2">
      <UCard class="glass">
        <template #header>
          <div>
            <p class="text-sm font-semibold text-slate-900">Alumbrado: observaciones clave</p>
            <p class="text-xs text-slate-500">Primeros casos a revisar manualmente</p>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="item in lighting?.records.filter((record) => record.qualityFlags.length > 0).slice(0, 10) ?? []"
            :key="item.point"
            class="rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            <p class="text-sm font-medium text-slate-900">{{ item.point }} · {{ item.address || 'Sin dirección' }}</p>
            <p class="text-xs text-slate-500">{{ item.qualityFlags.join(' · ') }}</p>
          </div>
        </div>
      </UCard>

      <UCard class="glass">
        <template #header>
          <div>
            <p class="text-sm font-semibold text-slate-900">Medidores: observaciones clave</p>
            <p class="text-xs text-slate-500">Registros con problemas de origen</p>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="item in meters?.records.filter((record) => record.qualityFlags.length > 0).slice(0, 10) ?? []"
            :key="item.meter"
            class="rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            <p class="text-sm font-medium text-slate-900">{{ item.holder || item.user }}</p>
            <p class="text-xs text-slate-500">{{ item.qualityFlags.join(' · ') }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <div v-if="pending" class="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Cargando calidad de datos...
    </div>
    <div v-if="error" class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      No se pudo cargar la vista de calidad.
    </div>
  </div>
</template>
