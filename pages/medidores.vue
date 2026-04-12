<script setup lang="ts">
import type { MeterRecord } from '~/types/municipal';

const { data, pending, error, refresh } = await useAsyncData('meters-dataset', () => $fetch('/api/medidores'));

const search = ref('');
const consumptionType = ref('');
const userType = ref('');
const connectionType = ref('');
const selectedMeter = ref<MeterRecord | null>(null);

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const allRecords = computed(() => data.value?.records ?? []);
const metrics = computed(() => data.value?.metrics);
const options = computed(() => data.value?.options);

const filteredRecords = computed(() =>
  allRecords.value.filter((record) => {
    if (search.value) {
      const haystack = [record.user, record.holder, record.address, record.meter, record.pointGeo].join(' ');
      if (!normalizeText(haystack).includes(normalizeText(search.value))) return false;
    }
    if (consumptionType.value && normalizeText(record.consumptionType) !== normalizeText(consumptionType.value)) return false;
    if (userType.value && normalizeText(record.userType) !== normalizeText(userType.value)) return false;
    if (connectionType.value && normalizeText(record.connectionType) !== normalizeText(connectionType.value)) return false;
    return true;
  })
);

function clearFilters() {
  search.value = '';
  consumptionType.value = '';
  userType.value = '';
  connectionType.value = '';
  selectedMeter.value = null;
}

useHead({ title: 'Medidores | Municipalidad FME' });
</script>

<template>
  <div class="space-y-5">
    <header class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-[0.45em] text-slate-500">MÃ³dulo independiente</p>
      <h1 class="text-4xl font-semibold tracking-tight text-slate-950">Medidores municipales</h1>
      <p class="max-w-3xl text-sm leading-6 text-slate-600">
        Lectura territorial del padrÃ³n municipal con mapa, filtros y detecciÃ³n de medidores vinculados por cercanÃ­a.
      </p>
    </header>

    <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside class="space-y-4 xl:sticky xl:top-24 xl:h-fit">
        <UCard class="glass">
          <template #header>
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Resumen</p>
          </template>
          <div class="space-y-3">
            <div class="rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Medidores</p>
              <p class="mt-2 text-3xl font-semibold text-slate-950">{{ metrics?.totalMeters ?? 0 }}</p>
            </div>
            <div class="rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Georreferenciados</p>
              <p class="mt-2 text-3xl font-semibold text-slate-950">{{ metrics?.georeferencedMeters ?? 0 }}</p>
            </div>
            <div class="rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Vinculados</p>
              <p class="mt-2 text-3xl font-semibold text-slate-950">{{ metrics?.linkedMeters ?? 0 }}</p>
            </div>
            <div class="rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">HuÃ©rfanos</p>
              <p class="mt-2 text-3xl font-semibold text-slate-950">{{ metrics?.orphanMeters ?? 0 }}</p>
            </div>
          </div>
        </UCard>
      </aside>

      <main class="space-y-5">
        <UCard class="glass">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Filtros</p>
                <p class="text-sm text-slate-500">BuscÃ¡ por usuario, titular, domicilio o medidor.</p>
              </div>
              <UButton variant="ghost" color="gray" @click="clearFilters">Limpiar filtros</UButton>
            </div>
          </template>

          <div class="grid gap-3 xl:grid-cols-4">
            <UInput v-model="search" placeholder="Buscar usuario, titular, domicilio o medidor" />
            <select v-model="consumptionType" class="fme-select">
              <option value="">Todos los consumos</option>
              <option v-for="item in options?.consumptionTypes ?? []" :key="item" :value="item">{{ item }}</option>
            </select>
            <select v-model="userType" class="fme-select">
              <option value="">Todos los tipos de usuario</option>
              <option v-for="item in options?.userTypes ?? []" :key="item" :value="item">{{ item }}</option>
            </select>
            <select v-model="connectionType" class="fme-select">
              <option value="">Todos los tipos de conexiÃ³n</option>
              <option v-for="item in options?.connectionTypes ?? []" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
        </UCard>

        <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
          <div class="h-[66vh] min-h-[520px]">
            <ClientOnly>
              <MeterMap
                :points="filteredRecords"
                @select="selectedMeter = $event"
              />
            </ClientOnly>
          </div>
        </section>

        <div class="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <UCard class="glass">
            <template #header>
              <div>
                <p class="text-sm font-semibold text-slate-900">Medidores filtrados</p>
                <p class="text-xs text-slate-500">{{ filteredRecords.length }} registros visibles</p>
              </div>
            </template>

            <div class="max-h-[30rem] space-y-2 overflow-auto pr-1">
              <button
                v-for="meter in filteredRecords.slice(0, 16)"
                :key="meter.meter"
                type="button"
                class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300"
                @click="selectedMeter = meter"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-slate-900">{{ meter.holder || meter.user || 'Sin usuario' }}</p>
                    <p class="truncate text-xs text-slate-500">{{ meter.address || 'Sin domicilio' }}</p>
                  </div>
                  <div class="text-right text-xs text-slate-500">
                    <p class="font-semibold text-slate-800">{{ meter.meter || 'Sin medidor' }}</p>
                    <p>{{ meter.nearbyLightingCount }} puntos cercanos</p>
                  </div>
                </div>
              </button>
            </div>
          </UCard>

          <UCard class="glass">
            <template #header>
              <div>
                <p class="text-sm font-semibold text-slate-900">Detalle del medidor</p>
                <p class="text-xs text-slate-500">InformaciÃ³n territorial y relaciÃ³n con alumbrado</p>
              </div>
            </template>

            <div v-if="selectedMeter" class="space-y-3">
              <div class="rounded-2xl border border-slate-200 bg-white p-4">
                <p class="text-xs text-slate-500">Titular</p>
                <p class="text-lg font-semibold text-slate-950">{{ selectedMeter.holder || selectedMeter.user }}</p>
                <p class="text-sm text-slate-600">{{ selectedMeter.address || 'Sin domicilio' }}</p>
              </div>
                            <div class="grid gap-2 sm:grid-cols-2">
                <div class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="text-xs text-slate-500">Medidor</p>
                  <p class="font-semibold text-slate-900">{{ selectedMeter.meter || '—' }}</p>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="text-xs text-slate-500">Conexión</p>
                  <p class="font-semibold text-slate-900">{{ selectedMeter.connectionType || '—' }}</p>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="text-xs text-slate-500">Consumo</p>
                  <p class="font-semibold text-slate-900">{{ selectedMeter.consumptionType || '—' }}</p>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="text-xs text-slate-500">Tipo usuario</p>
                  <p class="font-semibold text-slate-900">{{ selectedMeter.userType || '—' }}</p>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="text-xs text-slate-500">Titular servicio</p>
                  <p class="font-semibold text-slate-900">{{ selectedMeter.serviceHolder || '—' }}</p>
                </div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="text-xs text-slate-500">Puntos cercanos</p>
                  <p class="font-semibold text-slate-900">{{ selectedMeter.nearbyLightingCount }}</p>
                </div>
              </div>
              <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {{ selectedMeter.nearbyLightingPoints.length ? selectedMeter.nearbyLightingPoints.join(' Â· ') : 'No se detectaron puntos de alumbrado cercanos dentro del radio operativo.' }}
              </div>
            </div>
            <div v-else class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              SeleccionÃ¡ un medidor en el mapa o en la lista para ver su ficha.
            </div>
          </UCard>
        </div>
      </main>
    </div>

    <div v-if="pending" class="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Cargando medidores...
    </div>
    <div v-if="error" class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      No se pudieron cargar los medidores.
    </div>
  </div>
</template>

