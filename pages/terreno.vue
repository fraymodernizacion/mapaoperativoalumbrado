<script setup lang="ts">
import type { LightingRecord } from '~/types/municipal';

const { data, pending, error, refresh } = await useAsyncData('terreno-dataset', () => $fetch('/api/alumbrado/'), { server: false });

type Mode = 'new' | 'edit';

const mode = ref<Mode>('new');
const selectedPointId = ref<string | null>(null);
const draftLocation = ref<{ lat: number; lng: number } | null>(null);
const isSavingNewPoint = ref(false);
const isSavingSelectedPoint = ref(false);
const createPointError = ref('');
const createPointMessage = ref('');
const savePointError = ref('');
const savePointMessage = ref('');

const newPointName = ref('');
const newPointTechnology = ref('');
const newPointPowerW = ref('');
const newPointEncendido = ref('');
const newPointPostType = ref('');
const newPointCableType = ref('');
const newPointLocality = ref('');
const newPointAddressPreset = ref('');
const newPointAddress = ref('');
const newPointSupply = ref('');
const newPointQuantity = ref('1');
const newPointObservations = ref('');

const editTechnology = ref('');
const editPowerW = ref('');
const editEncendido = ref('');
const editPostType = ref('');
const editCableType = ref('');

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const allRecords = computed(() => data.value?.records ?? []);
const options = computed(() => data.value?.options);
const selectedPoint = computed<LightingRecord | null>(() => {
  if (!selectedPointId.value) return null;
  return allRecords.value.find((record) => record.recordId === selectedPointId.value) ?? null;
});
const nextManualPointCode = computed(() => {
  const manualPointValues = allRecords.value
    .map((record) => String(record.point).trim().toUpperCase())
    .map((point) => {
      const match = point.match(/^M-(\d{4,})$/);
      return match ? Number(match[1]) : Number.NaN;
    })
    .filter((value) => Number.isInteger(value) && value > 0);

  const nextValue = manualPointValues.length ? Math.max(...manualPointValues) + 1 : 1;
  return `M-${String(nextValue).padStart(4, '0')}`;
});
const nearbyLocalitySuggestions = computed(() => {
  if (!draftLocation.value) return [];

  const origin = draftLocation.value;
  const grouped = new Map<string, { locality: string; count: number; minDistanceKm: number }>();

  for (const record of allRecords.value) {
    if (!record.locality || record.lat === null || record.lng === null) continue;
    const distanceKm = haversineDistanceKm(origin.lat, origin.lng, record.lat, record.lng);
    if (distanceKm > 0.8) continue;

    const current = grouped.get(record.locality) ?? {
      locality: record.locality,
      count: 0,
      minDistanceKm: Number.POSITIVE_INFINITY
    };

    current.count += 1;
    current.minDistanceKm = Math.min(current.minDistanceKm, distanceKm);
    grouped.set(record.locality, current);
  }

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.minDistanceKm - right.minDistanceKm;
  });
});
const newPointLocalitySuggestedOptions = computed(() => nearbyLocalitySuggestions.value.map((item) => item.locality));
const newPointLocalityOtherOptions = computed(() => {
  const suggested = new Set(newPointLocalitySuggestedOptions.value);
  return (data.value?.localities ?? []).map((item) => item.name).filter((name) => !suggested.has(name));
});
const nearbyAddressSuggestions = computed(() => {
  if (!draftLocation.value) return [];

  const origin = draftLocation.value;
  const grouped = new Map<string, { label: string; count: number; minDistanceKm: number }>();

  for (const record of allRecords.value) {
    const candidates = [record.address, record.sectorLabel]
      .map((value) => String(value ?? '').trim())
      .filter((value) => value && normalizeText(value) !== 'SIN DIRECCION');

    if (!candidates.length || record.lat === null || record.lng === null) continue;

    const distanceKm = haversineDistanceKm(origin.lat, origin.lng, record.lat, record.lng);
    if (distanceKm > 0.8) continue;

    for (const label of candidates) {
      const current = grouped.get(label) ?? {
        label,
        count: 0,
        minDistanceKm: Number.POSITIVE_INFINITY
      };

      current.count += 1;
      current.minDistanceKm = Math.min(current.minDistanceKm, distanceKm);
      grouped.set(label, current);
    }
  }

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.minDistanceKm - right.minDistanceKm;
  });
});
const nearbyAddressSuggestionLabels = computed(() => nearbyAddressSuggestions.value.map((item) => item.label));
const mapVisualKey = computed(() =>
  allRecords.value
    .map((record) => [record.recordId, record.technology, record.powerW ?? '', record.encendido, record.technologyGroup].join(':'))
    .join('|')
);
const mapFitBoundsKey = computed(() => 'terreno-initial-fit');

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function resetNewPointForm() {
  newPointName.value = nextManualPointCode.value;
  newPointTechnology.value = '';
  newPointPowerW.value = '';
  newPointEncendido.value = '';
  newPointPostType.value = '';
  newPointCableType.value = '';
  newPointLocality.value = newPointLocalitySuggestedOptions.value[0] ?? '';
  newPointAddressPreset.value = nearbyAddressSuggestionLabels.value[0] ?? '__manual__';
  newPointAddress.value = newPointAddressPreset.value === '__manual__' ? '' : newPointAddressPreset.value;
  newPointSupply.value = '';
  newPointQuantity.value = '1';
  newPointObservations.value = '';
  createPointError.value = '';
  createPointMessage.value = '';
}

function resetEditForm(point: LightingRecord | null) {
  savePointError.value = '';
  savePointMessage.value = '';

  if (!point) {
    editTechnology.value = '';
    editPowerW.value = '';
    editEncendido.value = '';
    editPostType.value = '';
    editCableType.value = '';
    return;
  }

  editTechnology.value = point.technology ?? '';
  editPowerW.value = point.powerW === null ? '' : String(point.powerW);
  editEncendido.value = point.encendido ?? '';
  editPostType.value = point.postType ?? '';
  editCableType.value = point.cableType ?? '';
}

function startNewMode() {
  mode.value = 'new';
  selectedPointId.value = null;
  draftLocation.value = null;
  resetNewPointForm();
}

function startEditMode(point: LightingRecord) {
  mode.value = 'edit';
  selectedPointId.value = point.recordId;
  resetEditForm(point);
}

function clearDraftLocation() {
  draftLocation.value = null;
  resetNewPointForm();
}

function handleMapClick(location: { lat: number; lng: number }) {
  if (mode.value !== 'new') return;
  draftLocation.value = location;
  if (!newPointLocality.value) {
    newPointLocality.value = newPointLocalitySuggestedOptions.value[0] ?? '';
  }
  if (!newPointAddress.value) {
    newPointAddressPreset.value = nearbyAddressSuggestionLabels.value[0] ?? '__manual__';
    newPointAddress.value = newPointAddressPreset.value === '__manual__' ? '' : newPointAddressPreset.value;
  }
}

watch(
  nearbyLocalitySuggestions,
  (suggestions) => {
    if (mode.value !== 'new') return;
    if (newPointLocality.value) return;
    newPointLocality.value = suggestions[0]?.locality ?? '';
  },
  { immediate: true }
);

watch(
  nearbyAddressSuggestions,
  (suggestions) => {
    if (mode.value !== 'new') return;
    if (newPointAddressPreset.value && newPointAddressPreset.value !== '__manual__') return;
    const firstSuggestion = suggestions[0]?.label ?? '';
    if (firstSuggestion && !newPointAddress.value) {
      newPointAddressPreset.value = firstSuggestion;
      newPointAddress.value = firstSuggestion;
    }
  },
  { immediate: true }
);

watch(newPointAddressPreset, (preset) => {
  if (preset === '__manual__') {
    newPointAddress.value = '';
    return;
  }

  if (preset) {
    newPointAddress.value = preset;
  }
});

watch(
  selectedPoint,
  (point) => {
    resetEditForm(point);
  },
  { immediate: true }
);

watch(
  data,
  () => {
    newPointName.value = nextManualPointCode.value;
  },
  { immediate: true }
);

async function saveNewPoint() {
  if (isSavingNewPoint.value) return;
  if (!draftLocation.value) {
    createPointError.value = 'Marcá primero la ubicación tocando el mapa.';
    return;
  }

  const pointValue = newPointName.value.trim();
  const technologyValue = newPointTechnology.value.trim();
  const encendidoValue = newPointEncendido.value.trim();
  const powerValue = newPointPowerW.value.trim();
  const postTypeValue = newPointPostType.value.trim();
  const cableTypeValue = newPointCableType.value.trim();
  const quantityValue = newPointQuantity.value.trim();

  if (!technologyValue || !encendidoValue || !powerValue || !postTypeValue || !cableTypeValue) {
    createPointError.value = 'Completá tecnología, potencia, encendido, poste y cableado antes de guardar.';
    return;
  }

  const parsedPower = Number(powerValue);
  const parsedQuantity = quantityValue ? Number(quantityValue) : 1;

  if (!Number.isFinite(parsedPower)) {
    createPointError.value = 'La potencia debe ser un número válido.';
    return;
  }

  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    createPointError.value = 'La cantidad debe ser un número válido mayor a cero.';
    return;
  }

  isSavingNewPoint.value = true;
  createPointError.value = '';
  createPointMessage.value = '';

  try {
    const response = await $fetch<{
      ok: boolean;
      recordIds: string[];
      records: LightingRecord[];
    }>('/api/alumbrado/create/', {
      method: 'POST',
      body: {
        locations: [draftLocation.value],
        point: pointValue || nextManualPointCode.value,
        technology: technologyValue,
        powerW: parsedPower,
        encendido: encendidoValue,
        postType: postTypeValue,
        cableType: cableTypeValue,
        locality: newPointLocality.value.trim(),
        address: newPointAddress.value.trim(),
        supply: newPointSupply.value.trim(),
        observations: newPointObservations.value.trim(),
        quantity: parsedQuantity
      }
    });

    await refresh();
    selectedPointId.value = response.recordIds[0] ?? null;
    mode.value = 'edit';
    draftLocation.value = null;
    resetNewPointForm();
    createPointMessage.value = 'El nuevo punto quedó guardado y listo para editar.';
  } catch (error) {
    createPointError.value = error instanceof Error ? error.message : 'No se pudo crear el punto.';
  } finally {
    isSavingNewPoint.value = false;
  }
}

async function saveSelectedPoint() {
  if (!selectedPoint.value || isSavingSelectedPoint.value) return;

  const updates: {
    technology?: string;
    powerW?: number;
    encendido?: string;
    postType?: string;
    cableType?: string;
  } = {};

  const technologyValue = editTechnology.value.trim();
  const encendidoValue = editEncendido.value.trim();
  const powerValue = editPowerW.value.trim();
  const postTypeValue = editPostType.value.trim();
  const cableTypeValue = editCableType.value.trim();

  if (technologyValue) updates.technology = technologyValue;
  if (encendidoValue) updates.encendido = encendidoValue;
  if (postTypeValue) updates.postType = postTypeValue;
  if (cableTypeValue) updates.cableType = cableTypeValue;

  if (powerValue) {
    const parsedPower = Number(powerValue);
    if (!Number.isFinite(parsedPower)) {
      savePointError.value = 'La potencia debe ser un número válido.';
      return;
    }
    updates.powerW = parsedPower;
  }

  if (!Object.keys(updates).length) {
    savePointError.value = 'Elegí al menos un dato para cambiar.';
    return;
  }

  isSavingSelectedPoint.value = true;
  savePointError.value = '';
  savePointMessage.value = '';

  try {
    await $fetch('/api/alumbrado/bulk-update/', {
      method: 'POST',
      body: {
        recordIds: [selectedPoint.value.recordId],
        ...updates
      }
    });

    await refresh();
    savePointMessage.value = 'El punto quedó actualizado.';
  } catch (error) {
    savePointError.value = error instanceof Error ? error.message : 'No se pudieron guardar los cambios.';
  } finally {
    isSavingSelectedPoint.value = false;
  }
}

function selectPoint(point: LightingRecord, additive: boolean) {
  if (additive) {
    selectedPointId.value = point.recordId;
    mode.value = 'edit';
    return;
  }

  startEditMode(point);
}

useHead({
  title: 'Terreno | Municipalidad FME',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }
  ]
});
</script>

<template>
  <div class="pb-4">
    <div class="mb-4 flex items-start justify-between gap-3 rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-500">Sección móvil</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Terreno</h1>
        <p class="mt-1 text-sm text-slate-600">
          Carga y edición rápida pensada para trabajar desde el celular, con un flujo simple y tocando el mapa.
        </p>
      </div>
      <UButton to="/alumbrado" size="sm" color="gray" variant="solid" class="shrink-0">
        Visor completo
      </UButton>
    </div>

    <div class="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
      <div class="relative h-[72vh] min-h-[72vh]">
        <ClientOnly>
          <LightingMap
            :points="allRecords"
            :selected-key="selectedPoint?.recordId ?? null"
            :fit-bounds-key="mapFitBoundsKey"
            :visual-key="mapVisualKey"
            :map-layer="'street'"
            :draft-location="draftLocation"
            @select="selectPoint"
            @map-click="handleMapClick($event)"
          />
        </ClientOnly>
      </div>

      <div class="pointer-events-none absolute inset-x-3 bottom-3 z-[5600]">
        <div class="pointer-events-auto rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
          <div class="flex items-center gap-2">
            <UButton size="sm" :color="mode === 'new' ? 'primary' : 'gray'" variant="solid" @click="startNewMode">
              Nuevo punto
            </UButton>
            <UButton size="sm" :color="mode === 'edit' ? 'primary' : 'gray'" variant="solid" @click="mode = 'edit'">
              Editar
            </UButton>
            <UButton size="sm" color="gray" variant="ghost" @click="clearDraftLocation">
              Limpiar pin
            </UButton>
          </div>

          <div class="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span v-if="mode === 'new'">
              Tocá el mapa para fijar la ubicación y completá solo lo necesario.
            </span>
            <span v-else>
              Tocá una luminaria en el mapa para editarla.
            </span>
          </div>

          <div v-if="mode === 'new'" class="mt-3 space-y-3">
            <div class="grid gap-2 sm:grid-cols-2">
              <UInput v-model="newPointName" placeholder="Código" />
              <UInput v-model="newPointQuantity" type="number" min="1" placeholder="Cantidad" />
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <select v-model="newPointTechnology" class="fme-select">
                <option value="">Tecnología</option>
                <option v-for="item in options?.technologies ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="newPointPowerW" class="fme-select">
                <option value="">Potencia</option>
                <option v-for="item in options?.powerValues ?? []" :key="item" :value="item">{{ item }} W</option>
              </select>
              <select v-model="newPointEncendido" class="fme-select">
                <option value="">Encendido</option>
                <option v-for="item in options?.encendidos ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="newPointPostType" class="fme-select">
                <option value="">Tipo de poste</option>
                <option v-for="item in options?.postTypes ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="newPointCableType" class="fme-select sm:col-span-2">
                <option value="">Tipo de cableado</option>
                <option v-for="item in options?.cableTypes ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
            </div>

            <div class="grid gap-2 sm:grid-cols-2">
              <select v-model="newPointLocality" class="fme-select">
                <option value="">Localidad</option>
                <optgroup v-if="newPointLocalitySuggestedOptions.length" label="Sugeridas">
                  <option v-for="item in newPointLocalitySuggestedOptions" :key="item" :value="item">{{ item }}</option>
                </optgroup>
                <optgroup v-if="newPointLocalityOtherOptions.length" label="Otras">
                  <option v-for="item in newPointLocalityOtherOptions" :key="`other-${item}`" :value="item">{{ item }}</option>
                </optgroup>
              </select>
              <select v-model="newPointAddressPreset" class="fme-select">
                <option value="">Dirección / sector</option>
                <optgroup v-if="nearbyAddressSuggestionLabels.length" label="Sugeridas">
                  <option v-for="item in nearbyAddressSuggestionLabels" :key="`addr-${item}`" :value="item">{{ item }}</option>
                </optgroup>
                <option value="__manual__">Escribir manual</option>
              </select>
            </div>

            <UInput
              v-if="newPointAddressPreset === '__manual__'"
              v-model="newPointAddress"
              placeholder="Nueva dirección / sector"
            />
            <UInput v-model="newPointSupply" placeholder="Suministro" />
            <UInput v-model="newPointObservations" placeholder="Observaciones" />

            <div class="flex items-center gap-2">
              <UButton color="primary" :loading="isSavingNewPoint" :disabled="isSavingNewPoint" @click="saveNewPoint">
                Guardar nuevo
              </UButton>
              <span class="text-xs text-slate-500">
                {{ draftLocation ? 'Pin listo' : 'Sin ubicación todavía' }}
              </span>
            </div>

            <p v-if="createPointError" class="text-xs font-medium text-rose-600">{{ createPointError }}</p>
            <p v-else-if="createPointMessage" class="text-xs font-medium text-emerald-700">{{ createPointMessage }}</p>
          </div>

          <div v-else class="mt-3 space-y-3">
            <div v-if="selectedPoint" class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Seleccionado</p>
              <p class="mt-1 text-sm font-semibold text-slate-950">{{ selectedPoint.point || 'Punto sin nombre' }}</p>
              <p class="text-xs text-slate-600">{{ selectedPoint.address || 'Sin dirección' }}</p>
              <p class="text-[11px] text-slate-500">
                Poste: {{ selectedPoint.postType || 'Sin dato' }} · Cable: {{ selectedPoint.cableType || 'Sin dato' }}
              </p>
            </div>
            <div v-else class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
              Tocá una luminaria sobre el mapa para cargarla acá.
            </div>

            <div class="grid gap-2">
              <select v-model="editTechnology" class="fme-select">
                <option value="">Tecnología</option>
                <option v-for="item in options?.technologies ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="editPowerW" class="fme-select">
                <option value="">Potencia</option>
                <option v-for="item in options?.powerValues ?? []" :key="item" :value="item">{{ item }} W</option>
              </select>
              <select v-model="editEncendido" class="fme-select">
                <option value="">Encendido</option>
                <option v-for="item in options?.encendidos ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="editPostType" class="fme-select">
                <option value="">Tipo de poste</option>
                <option v-for="item in options?.postTypes ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="editCableType" class="fme-select">
                <option value="">Tipo de cableado</option>
                <option v-for="item in options?.cableTypes ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
            </div>

            <div class="flex items-center gap-2">
              <UButton color="primary" :loading="isSavingSelectedPoint" :disabled="isSavingSelectedPoint || !selectedPoint" @click="saveSelectedPoint">
                Guardar cambios
              </UButton>
              <UButton color="gray" variant="ghost" @click="selectedPointId = null">
                Quitar selección
              </UButton>
            </div>

            <p v-if="savePointError" class="text-xs font-medium text-rose-600">{{ savePointError }}</p>
            <p v-else-if="savePointMessage" class="text-xs font-medium text-emerald-700">{{ savePointMessage }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 flex justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      <span>{{ pending ? 'Cargando datos...' : `${allRecords.length.toLocaleString('es-AR')} puntos disponibles` }}</span>
      <span v-if="error" class="text-rose-600">Error al cargar el dataset</span>
    </div>
  </div>
</template>
