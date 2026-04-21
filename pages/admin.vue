<script setup lang="ts">
const { data } = await useAsyncData('admin-dataset', () => $fetch('/api/dashboard/'), { server: false });

function refreshPage() {
  window.location.reload();
}

useHead({ title: 'Administración | Municipalidad FME' });
</script>

<template>
  <div class="space-y-5">
    <header class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-[0.45em] text-slate-500">Backoffice liviano</p>
      <h1 class="text-4xl font-semibold tracking-tight text-slate-950">Panel de administración</h1>
      <p class="max-w-3xl text-sm leading-6 text-slate-600">
        Estado del sistema, accesos a la carga de datos y control rápido de la sincronización local.
      </p>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Dataset alumbrado</p>
        <p class="mt-2 text-2xl font-semibold text-slate-950">{{ data?.lighting?.records.length ?? 0 }} registros</p>
      </UCard>
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Dataset medidores</p>
        <p class="mt-2 text-2xl font-semibold text-slate-950">{{ data?.meters?.records.length ?? 0 }} registros</p>
      </UCard>
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Última actualización</p>
        <p class="mt-2 text-2xl font-semibold text-slate-950">En memoria</p>
      </UCard>
      <UCard class="glass">
        <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Acción rápida</p>
        <UButton class="mt-3" @click="refreshPage">Refrescar</UButton>
      </UCard>
    </div>

    <UCard class="glass">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-slate-900">Configuración inicial</p>
          <p class="text-xs text-slate-500">Próximo paso: conectar edición y cron si hace falta</p>
        </div>
      </template>

      <div class="grid gap-3 md:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Hojas base</p>
          <p class="font-semibold text-slate-900">alumbrado.xlsx · medidores.xlsx</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Fuente</p>
          <p class="font-semibold text-slate-900">Archivo local en el repositorio</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Exportación</p>
          <p class="font-semibold text-slate-900">Vista filtrada a PDF</p>
        </div>
      </div>
    </UCard>
  </div>
</template>
