<script setup lang="ts">
const { data } = await useAsyncData('reports-dataset', () => $fetch('/api/dashboard'));

function printPage() {
  window.print();
}

useHead({ title: 'Reportes | Municipalidad FME' });
</script>

<template>
  <div class="space-y-5">
    <header class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-[0.45em] text-slate-500">Exportación operativa</p>
      <h1 class="text-4xl font-semibold tracking-tight text-slate-950">Reportes y exportaciones</h1>
      <p class="max-w-3xl text-sm leading-6 text-slate-600">
        Cortes listos para imprimir o guardar como PDF según el filtro aplicado en cada módulo.
      </p>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <UCard
        v-for="card in [
          { label: 'Reporte ejecutivo', desc: 'Resumen general con KPIs y cobertura LED' },
          { label: 'Cobertura por localidad', desc: 'Corte municipal listo para presentación' },
          { label: 'Puntos no LED', desc: 'Listado de prioridades de reconversión' },
          { label: 'Medidores municipales', desc: 'Padrón y georreferencia' },
          { label: 'Inconsistencias', desc: 'Registros a revisar' },
          { label: 'Vista filtrada', desc: 'Imprimir el mapa con el sector actual' }
        ]"
        :key="card.label"
        class="glass"
      >
        <p class="text-sm font-semibold text-slate-900">{{ card.label }}</p>
        <p class="mt-2 text-sm text-slate-600">{{ card.desc }}</p>
      </UCard>
    </div>

    <div class="flex flex-wrap gap-3">
      <UButton color="primary" @click="printPage">Exportar PDF de la vista</UButton>
      <UButton variant="outline" color="gray" @click="printPage">Imprimir reporte ejecutivo</UButton>
    </div>

    <UCard class="glass">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-slate-900">Resumen actual</p>
          <p class="text-xs text-slate-500">Se actualiza con la carga de datos</p>
        </div>
      </template>

      <pre class="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{{
        JSON.stringify(
          {
            alumbrado: data?.lighting?.metrics,
            medidores: data?.meters?.metrics
          },
          null,
          2
        )
      }}</pre>
    </UCard>
  </div>
</template>
