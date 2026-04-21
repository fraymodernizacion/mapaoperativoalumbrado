<script setup lang="ts">
import type { LightingRecord } from '~/types/municipal';

const { data, pending, error, refresh } = await useAsyncData('alumbrado-dataset', () => $fetch('/api/alumbrado/'), { server: false });
const mapCaptureRef = ref<HTMLElement | null>(null);
const isExporting = ref(false);
const isColorLegendOpen = ref(true);
const isCoverageOpen = ref(true);

const locality = ref('');
const technology = ref('');
const encendido = ref('');
const powerValue = ref('');
const sectorSearch = ref('');
const selectedSector = ref('');
const mapLayer = ref<'street' | 'satellite'>('street');
const selectedPointIds = ref<string[]>([]);
const selectedPointId = ref<string | null>(null);
const isFloatingFormOpen = ref(true);
const isCreateMode = ref(false);
const isMapFullscreen = ref(false);
const isMapFiltersOpen = ref(true);
const editTechnology = ref('');
const editPowerW = ref<string>('');
const editEncendido = ref('');
const isSavingPoint = ref(false);
const savePointError = ref('');
const savePointMessage = ref('');
const newPointName = ref('');
const newPointTechnology = ref('');
const newPointPowerW = ref('');
const newPointEncendido = ref('');
const newPointLocality = ref('');
const newPointLocalityMode = ref('suggested');
const newPointAddress = ref('');
const newPointAddressPreset = ref('');
const newPointAddressMode = ref('suggested');
const newPointSupply = ref('');
const newPointObservations = ref('');
const newPointQuantity = ref('1');
const isSavingNewPoint = ref(false);
const createPointError = ref('');
const createPointMessage = ref('');
const draftLocation = ref<{ lat: number; lng: number } | null>(null);
const draftLocations = ref<Array<{ lat: number; lng: number }>>([]);
const isDownloadingExcel = ref(false);

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
const sectors = computed(() => data.value?.sectors ?? []);
const localities = computed(() => data.value?.localities ?? []);
const selectedPoints = computed(() =>
  selectedPointIds.value
    .map((recordId) => allRecords.value.find((record) => record.recordId === recordId))
    .filter((record): record is LightingRecord => Boolean(record))
);
const selectedPoint = computed(() => {
  if (selectedPointId.value) {
    return allRecords.value.find((record) => record.recordId === selectedPointId.value) ?? null;
  }

  return selectedPoints.value[0] ?? null;
});
const selectedEditablePoints = computed(() => selectedPoints.value.filter((record) => record.isLuminaire));
const selectedPointCount = computed(() => selectedPoints.value.length);
const selectedEditableCount = computed(() => selectedEditablePoints.value.length);
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

  const grouped = new Map<string, { locality: string; count: number; minDistanceKm: number }>();
  const origin = draftLocation.value;

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
  return localities.value.map((item) => item.name).filter((name) => !suggested.has(name));
});
const nearbyAddressSuggestions = computed(() => {
  if (!draftLocation.value) return [];

  const grouped = new Map<string, { label: string; count: number; minDistanceKm: number }>();
  const origin = draftLocation.value;

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
const newPointAddressSuggestedOptions = computed(() => nearbyAddressSuggestions.value.map((item) => item.label));
const mapFitBoundsKey = computed(
  () => `${locality.value}|${technology.value}|${encendido.value}|${powerValue.value}|${selectedSector.value}|${sectorSearch.value}`
);
const printTimestamp = new Date().toLocaleString('es-AR');
let fullscreenChangeHandler: (() => void) | null = null;

const filteredRecords = computed(() => {
  const normalizedSector = normalizeText(selectedSector.value);
  const selectedPower = powerValue.value ? Number(powerValue.value) : null;

  return allRecords.value.filter((record) => {
    if (locality.value && normalizeText(record.locality) !== normalizeText(locality.value)) return false;
    if (technology.value && normalizeText(record.technology) !== normalizeText(technology.value)) return false;
    if (encendido.value && normalizeText(record.encendido) !== normalizeText(encendido.value)) return false;
    if (selectedPower !== null && (record.powerW ?? -1) !== selectedPower) return false;
    if (normalizedSector && normalizeText(record.sectorLabel) !== normalizedSector && record.sectorKey !== normalizedSector) {
      return false;
    }
    return true;
  });
});

const visibleCounts = computed(() => {
  const points = filteredRecords.value;
  const luminaries = points.filter((record) => record.isLuminaire);
  const ledPoints = luminaries.filter((record) => record.isLed);

  return {
    points: points.length,
    luminaries: luminaries.length,
    ledPoints: luminaries.length ? Math.round((ledPoints.length / luminaries.length) * 100) : 0
  };
});

const filteredSectors = computed(() => {
  const query = normalizeText(sectorSearch.value);
  return sectors.value.filter((sector) => {
    if (!query) return true;
    return normalizeText(sector.label).includes(query);
  });
});

const reportFilters = computed(() => [
  { label: 'Localidad', value: locality.value || 'Todas' },
  { label: 'Tecnología', value: technology.value || 'Todas' },
  { label: 'Encendido', value: encendido.value || 'Todos' },
  { label: 'Potencia', value: powerValue.value ? `${powerValue.value} W` : 'Todas' },
  { label: 'Sector', value: selectedSector.value || 'Todos' }
]);
const powerLegend = [
  { value: 40, color: '#0f4c81' },
  { value: 50, color: '#6d28d9' },
  { value: 100, color: '#0f766e' },
  { value: 150, color: '#b45309' },
  { value: 200, color: '#be123c' }
];

function googleMapsUrl(record: LightingRecord) {
  if (record.lat !== null && record.lng !== null) {
    return `https://www.google.com/maps?q=${record.lat},${record.lng}`;
  }

  const query = [record.address, record.locality, record.point].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function gpsLabel(record: LightingRecord) {
  if (record.lat !== null && record.lng !== null) {
    return `${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}`;
  }

  return record.address || record.locality || 'Sin coordenadas';
}

function clearFilters() {
  locality.value = '';
  technology.value = '';
  encendido.value = '';
  powerValue.value = '';
  sectorSearch.value = '';
  selectedSector.value = '';
  selectedPointIds.value = [];
  selectedPointId.value = null;
}

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

function applyNearbyLocalitySuggestion(localityName: string) {
  newPointLocality.value = localityName;
  newPointLocalityMode.value = 'suggested';
}

function applyNearbyAddressSuggestion(addressLabel: string) {
  newPointAddress.value = addressLabel;
  newPointAddressPreset.value = addressLabel;
  newPointAddressMode.value = 'suggested';
}

function addDraftLocation(location: { lat: number; lng: number }) {
  draftLocation.value = location;
  draftLocations.value = [...draftLocations.value, location];
}

function removeDraftLocation(index: number) {
  draftLocations.value = draftLocations.value.filter((_, currentIndex) => currentIndex !== index);
  draftLocation.value = draftLocations.value.at(-1) ?? null;
}

function clearDraftLocations() {
  draftLocations.value = [];
  draftLocation.value = null;
}

function removeLastDraftLocation() {
  draftLocations.value = draftLocations.value.slice(0, -1);
  draftLocation.value = draftLocations.value.at(-1) ?? null;
}

function applySector(label: string) {
  selectedSector.value = label;
  sectorSearch.value = label;
}

function clearSelection() {
  selectedPointIds.value = [];
  selectedPointId.value = null;
}

function handleMapClick(location: { lat: number; lng: number }) {
  if (!isCreateMode.value) return;
  addDraftLocation(location);
}

function resetNewPointForm() {
  newPointName.value = nextManualPointCode.value;
  newPointTechnology.value = '';
  newPointPowerW.value = '';
  newPointEncendido.value = '';
  newPointLocality.value = newPointLocalitySuggestedOptions.value[0] ?? '';
  newPointLocalityMode.value = nearbyLocalitySuggestions.value.length ? 'suggested' : 'manual';
  newPointAddressPreset.value = nearbyAddressSuggestions.value[0]?.label ?? '__manual__';
  newPointAddress.value = newPointAddressPreset.value === '__manual__' ? '' : newPointAddressPreset.value;
  newPointAddressMode.value = nearbyAddressSuggestions.value.length ? 'suggested' : 'manual';
  newPointSupply.value = '';
  newPointObservations.value = '';
  newPointQuantity.value = '1';
  createPointError.value = '';
  createPointMessage.value = '';
}

function startCreateMode() {
  isCreateMode.value = true;
  draftLocation.value = null;
  draftLocations.value = [];
  resetNewPointForm();
}

function stopCreateMode() {
  isCreateMode.value = false;
  draftLocation.value = null;
  draftLocations.value = [];
  resetNewPointForm();
}

watch(
  nearbyLocalitySuggestions,
  (suggestions) => {
    if (!isCreateMode.value) return;
    if (newPointLocalityMode.value === 'manual' && newPointLocality.value) return;
    const firstSuggestion = suggestions[0]?.locality;
    if (firstSuggestion) {
      newPointLocality.value = firstSuggestion;
      newPointLocalityMode.value = 'suggested';
    }
  },
  { immediate: true }
);

watch(
  newPointAddressPreset,
  (preset) => {
    if (!isCreateMode.value) return;
    if (preset === '__manual__') {
      newPointAddressMode.value = 'manual';
      if (!newPointAddress.value) {
        newPointAddress.value = '';
      }
      return;
    }

    if (preset) {
      newPointAddress.value = preset;
      newPointAddressMode.value = 'suggested';
    }
  },
  { immediate: true }
);

const draftPointCount = computed(() => draftLocations.value.length);

async function toggleMapFullscreen() {
  if (!import.meta.client || !mapCaptureRef.value) return;

  const element = mapCaptureRef.value;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await element.requestFullscreen?.();
}

function togglePointSelection(point: LightingRecord, additive: boolean) {
  const currentIndex = selectedPointIds.value.indexOf(point.recordId);
  if (!additive) {
    selectedPointIds.value = [point.recordId];
    selectedPointId.value = point.recordId;
    return;
  }

  if (currentIndex >= 0) {
    const nextSelection = selectedPointIds.value.filter((recordId) => recordId !== point.recordId);
    selectedPointIds.value = nextSelection;
    selectedPointId.value = nextSelection[0] ?? null;
    return;
  }

  selectedPointIds.value = [...selectedPointIds.value, point.recordId];
  selectedPointId.value = point.recordId;
}

function sameValueOrBlank(records: LightingRecord[], extractor: (record: LightingRecord) => string | number | null) {
  if (!records.length) return '';
  const [first, ...rest] = records.map(extractor);
  return rest.every((value) => value === first) ? String(first ?? '') : '';
}

function formatEditValue(value: string | number | null) {
  if (value === null || value === undefined || value === '') return 'Sin dato';
  return String(value);
}

function formatPowerDisplay(value: string | number | null) {
  return value === null || value === undefined || value === '' ? 'Sin dato' : `${value} W`;
}

function formatHistoryTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString('es-AR');
}

function resetSelectedPointForm(points: LightingRecord[]) {
  savePointError.value = '';
  savePointMessage.value = '';

  if (!points.length) {
    editTechnology.value = '';
    editPowerW.value = '';
    editEncendido.value = '';
    return;
  }

  editTechnology.value = sameValueOrBlank(points, (record) => record.technology);
  editPowerW.value = sameValueOrBlank(points, (record) => record.powerW);
  editEncendido.value = sameValueOrBlank(points, (record) => record.encendido);
}

watch(
  selectedPoints,
  (points) => {
    resetSelectedPointForm(points);
    if (points.length) {
      isFloatingFormOpen.value = true;
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (!import.meta.client) return;
  fullscreenChangeHandler = () => {
    isMapFullscreen.value = Boolean(document.fullscreenElement);
    window.dispatchEvent(new Event('resize'));
  };

  document.addEventListener('fullscreenchange', fullscreenChangeHandler);
});

onBeforeUnmount(() => {
  if (fullscreenChangeHandler) {
    document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
    fullscreenChangeHandler = null;
  }
});

async function saveSelectedPoint() {
  if (!selectedPoints.value.length || isSavingPoint.value) return;

  const technologyValue = editTechnology.value.trim();
  const encendidoValue = editEncendido.value.trim();
  const powerValue = editPowerW.value.trim();
  const updates: { technology?: string; powerW?: number; encendido?: string } = {};

  if (technologyValue) {
    updates.technology = technologyValue;
  }

  if (encendidoValue) {
    updates.encendido = encendidoValue;
  }

  if (powerValue) {
    const parsedPower = Number(powerValue);
    if (!Number.isFinite(parsedPower)) {
      savePointError.value = 'La potencia debe ser un número válido.';
      return;
    }

    updates.powerW = parsedPower;
  }

  if (!Object.keys(updates).length) {
    savePointError.value = 'Elegí al menos un campo para cambiar.';
    return;
  }

  if (!selectedEditablePoints.value.length) {
    savePointError.value = 'Seleccioná al menos una luminaria editable.';
    return;
  }

  isSavingPoint.value = true;
  savePointError.value = '';
  savePointMessage.value = '';

  try {
    const response = await $fetch<{
      ok: boolean;
      recordIds: string[];
      records: Array<{ recordId: string; record: LightingRecord }>;
    }>('/api/alumbrado/bulk-update/', {
      method: 'POST',
      body: {
        recordIds: selectedEditablePoints.value.map((record) => record.recordId),
        ...updates
      }
    });

    if (data.value) {
      const updatedById = new Map(response.records.map((entry) => [entry.recordId, entry.record]));
      data.value = {
        ...data.value,
        records: allRecords.value.map((record) => {
          const updatedRecord = updatedById.get(record.recordId);
          return updatedRecord ? { ...record, ...updatedRecord } : record;
        })
      };
    }

    await refresh();
    savePointMessage.value =
      selectedEditablePoints.value.length === 1
        ? 'El cambio se guardó y quedó registrado con fecha y hora.'
        : `Los cambios se guardaron para ${selectedEditablePoints.value.length} luminarias.`;
  } catch (error) {
    savePointError.value = error instanceof Error ? error.message : 'No se pudieron guardar los cambios.';
  } finally {
    isSavingPoint.value = false;
  }
}

async function saveNewPoint() {
  if (isSavingNewPoint.value) return;

  const pointValue = newPointName.value.trim();
  const technologyValue = newPointTechnology.value.trim();
  const encendidoValue = newPointEncendido.value.trim();
  const powerValue = newPointPowerW.value.trim();
  const quantityValue = newPointQuantity.value.trim();

  if (!draftLocations.value.length) {
    createPointError.value = 'Hacé click en el mapa para marcar al menos un punto antes de guardar.';
    return;
  }

  const resolvedPointCode = pointValue || nextManualPointCode.value;

  if (!technologyValue || !encendidoValue || !powerValue) {
    createPointError.value = 'Completá tecnología, potencia y encendido antes de guardar.';
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
        locations: draftLocations.value,
        point: resolvedPointCode,
        technology: technologyValue,
        powerW: parsedPower,
        encendido: encendidoValue,
        locality: newPointLocality.value.trim(),
        address: newPointAddress.value.trim(),
        supply: newPointSupply.value.trim(),
        observations: newPointObservations.value.trim(),
        quantity: parsedQuantity
      }
    });

    await refresh();
    selectedPointIds.value = response.recordIds;
    selectedPointId.value = response.recordIds[0] ?? null;
    clearDraftLocations();
    resetNewPointForm();
    createPointMessage.value =
      response.recordIds.length === 1
        ? 'El nuevo punto quedó guardado con su ubicación.'
        : `Se crearon ${response.recordIds.length} puntos con la misma configuración.`;
  } catch (error) {
    createPointError.value = error instanceof Error ? error.message : 'No se pudo crear el punto.';
  } finally {
    isSavingNewPoint.value = false;
  }
}

async function exportPdf() {
  if (!import.meta.client || isExporting.value) return;
  isExporting.value = true;

  try {
    const { jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageMarginMm = 10;
    const lineColor = [226, 232, 240] as const;
    const textMuted = [100, 116, 139] as const;
    const textStrong = [15, 23, 42] as const;

    const drawSectionTitle = (title: string, subtitle: string, y: number) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(...textStrong);
      pdf.text(title, pageMarginMm, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.2);
      pdf.setTextColor(...textMuted);
      pdf.text(subtitle, pageMarginMm, y + 4.4);
    };

    const drawFilterChip = (x: number, y: number, width: number, label: string, value: string) => {
      pdf.setDrawColor(...lineColor);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, y, width, 16, 3, 3, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.8);
      pdf.setTextColor(...textMuted);
      pdf.text(label.toUpperCase(), x + 3, y + 4.4);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.8);
      pdf.setTextColor(...textStrong);
      pdf.text(value, x + 3, y + 10.8, { maxWidth: width - 6 });
    };

    const drawMetricCard = (x: number, y: number, width: number, label: string, value: string) => {
      pdf.setDrawColor(...lineColor);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, y, width, 20, 4, 4, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...textMuted);
      pdf.text(label.toUpperCase(), x + 3, y + 4.8);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11.5);
      pdf.setTextColor(...textStrong);
      pdf.text(value, x + 3, y + 13.6, { maxWidth: width - 6 });
    };

    const mapsEl = mapCaptureRef.value;
    if (!mapsEl) {
      throw new Error('No se pudo capturar el mapa.');
    }

    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const canvas = await html2canvas(mapsEl, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      logging: false
    });

    const usableWidth = pageWidth - pageMarginMm * 2;
    let currentY = pageMarginMm;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(94, 104, 130);
    pdf.text('MUNICIPALIDAD DE FRAY MAMERTO ESQUIÚ', pageMarginMm, currentY);

    currentY += 7;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(...textStrong);
    pdf.text('Informe operativo de alumbrado público', pageMarginMm, currentY);

    const titleWidth = 128;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.2);
    pdf.setTextColor(...textMuted);
    const subtitle = `Corte generado el ${printTimestamp}. Filtrá, revisá el mapa y descargá el informe exacto para gestión.`;
    pdf.text(subtitle, pageMarginMm, currentY + 6.4, { maxWidth: titleWidth });

    const badgeWidth = Math.max(52, Math.min(72, pdf.getTextWidth(selectedSector.value || 'Corte general') + 16));
    const badgeX = pageWidth - pageMarginMm - badgeWidth;
    const badgeY = pageMarginMm + 6.2;
    pdf.setDrawColor(...lineColor);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(badgeX, badgeY, badgeWidth, 18, 4, 4, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(...textMuted);
    pdf.text('SECTOR / CORTE', badgeX + 4, badgeY + 5.2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.4);
    pdf.setTextColor(...textStrong);
    pdf.text(selectedSector.value || 'Corte general', badgeX + 4, badgeY + 12.1, { maxWidth: badgeWidth - 8 });

    currentY += 15;

    drawSectionTitle('Filtros aplicados', 'El PDF respeta exactamente el corte visible en pantalla.', currentY);
    currentY += 7.2;
    const filterGap = 2.8;
    const filterWidth = (usableWidth - filterGap * 4) / 5;
    reportFilters.value.forEach((filter, index) => {
      drawFilterChip(pageMarginMm + index * (filterWidth + filterGap), currentY, filterWidth, filter.label, filter.value);
    });

    currentY += 20;

    drawSectionTitle('Resumen del corte', 'Métricas calculadas sobre el mismo universo filtrado.', currentY);
    currentY += 7.2;
    const metricGap = 3;
    const metricWidth = (usableWidth - metricGap * 3) / 4;
    [
      { label: 'Puntos filtrados', value: visibleCounts.value.points.toLocaleString('es-AR') },
      { label: 'Luminarias filtradas', value: visibleCounts.value.luminaries.toLocaleString('es-AR') },
      { label: 'Cobertura LED', value: `${visibleCounts.value.ledPoints}%` },
      {
        label: 'Potencia total',
        value: `${filteredRecords.value.reduce((sum, item) => sum + (item.powerTotalW || 0), 0).toLocaleString('es-AR')} W`
      }
    ].forEach((card, index) => {
      drawMetricCard(pageMarginMm + index * (metricWidth + metricGap), currentY, metricWidth, card.label, card.value);
    });

    currentY += 26;

    drawSectionTitle('Mapa del corte filtrado', 'Captura del visor con los puntos GPS visibles en este momento.', currentY);
    currentY += 6.8;

    const availableMapHeight = pageHeight - currentY - pageMarginMm - 6;
    const mapWidth = usableWidth;
    const mapHeight = Math.min(availableMapHeight, (canvas.height * mapWidth) / canvas.width);
    const mapX = pageMarginMm;
    const mapY = currentY;
    pdf.setDrawColor(...lineColor);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(mapX, mapY, mapWidth, mapHeight, 5, 5, 'FD');
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', mapX, mapY, mapWidth, mapHeight);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...textMuted);
    pdf.text('Página 1', pageWidth - pageMarginMm, pageHeight - 4, { align: 'right' });

    const annexRows = filteredRecords.value;
    const annexColumns = [
      { label: 'Punto', x: 10, width: 16, extractor: (record: LightingRecord) => String(record.point || '-').slice(0, 10) },
      { label: 'Dirección', x: 28, width: 56, extractor: (record: LightingRecord) => String(record.address || 'Sin dirección').slice(0, 36) },
      { label: 'Localidad', x: 86, width: 24, extractor: (record: LightingRecord) => String(record.locality || 'Sin localidad').slice(0, 16) },
      { label: 'Tecnología', x: 112, width: 27, extractor: (record: LightingRecord) => String(record.technology || '-').slice(0, 18) },
      { label: 'Potencia', x: 140, width: 18, extractor: (record: LightingRecord) => `${record.powerW ?? '-'} W` },
      { label: 'Encendido', x: 160, width: 24, extractor: (record: LightingRecord) => String(record.encendido || '-').slice(0, 16) },
      { label: 'GPS', x: 184, width: 18, extractor: (record: LightingRecord) => (googleMapsUrl(record) ? 'Abrir' : 'Sin vínculo') }
    ];
    const annexTop = 18;
    const annexTitleHeight = 12;
    const annexHeaderHeight = 8;
    const annexFooterHeight = 8;
    const annexRowHeight = 6.8;
    const annexRowsPerPage = Math.max(
      1,
      Math.floor((pageHeight - annexTop - annexTitleHeight - annexHeaderHeight - annexFooterHeight) / annexRowHeight)
    );
    const annexTotalPages = Math.max(1, Math.ceil(annexRows.length / annexRowsPerPage));
    const totalPdfPages = 1 + annexTotalPages;

    if (annexRows.length) {
      pdf.addPage();
    }

    annexRows.forEach((record, index) => {
      const pageIndex = Math.floor(index / annexRowsPerPage);
      const rowIndex = index % annexRowsPerPage;
      const y = annexTop + annexTitleHeight + annexHeaderHeight + rowIndex * annexRowHeight;
      const firstRowOnPage = rowIndex === 0;

      if (index > 0 && firstRowOnPage) {
        pdf.addPage();
      }

      if (firstRowOnPage) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(15, 23, 42);
        pdf.text('Anexo ampliado del corte', pageMarginMm, annexTop);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(90, 99, 112);
        pdf.text(
          `Filtros: ${reportFilters.value.map((filter) => `${filter.label} ${filter.value}`).join(' · ')}`,
          pageMarginMm,
          annexTop + 6,
          { maxWidth: pageWidth - pageMarginMm * 2 }
        );

        pdf.setFillColor(248, 250, 252);
        pdf.rect(pageMarginMm, annexTop + annexTitleHeight - 5, pageWidth - pageMarginMm * 2, annexHeaderHeight, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.3);
        pdf.setTextColor(15, 23, 42);
        annexColumns.forEach((column) => {
          pdf.text(column.label, column.x, annexTop + annexTitleHeight);
        });
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.3);
      pdf.setTextColor(15, 23, 42);
      annexColumns.slice(0, 6).forEach((column) => {
        pdf.text(column.extractor(record), column.x, y);
      });

      const href = googleMapsUrl(record);
      if (href) {
        pdf.setTextColor(15, 76, 129);
        pdf.text('Abrir', annexColumns[6].x, y);
        pdf.link(annexColumns[6].x, y - 3, 12, 4, { url: href });
      } else {
        pdf.setTextColor(15, 23, 42);
        pdf.text('Sin vínculo', annexColumns[6].x, y);
      }

      if ((index + 1) % annexRowsPerPage === 0 || index === annexRows.length - 1) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(107, 114, 128);
        pdf.text(`Página ${pageIndex + 2} de ${totalPdfPages}`, pageWidth - pageMarginMm, pageHeight - 4, { align: 'right' });
      }
    });

    const sectorSlug = selectedSector.value ? normalizeText(selectedSector.value).toLowerCase().replace(/\s+/g, '-') : 'reporte';
    pdf.save(`alumbrado_${sectorSlug}.pdf`);
  } finally {
    isExporting.value = false;
  }
}

async function exportExcel() {
  if (!import.meta.client || isDownloadingExcel.value) return;
  isDownloadingExcel.value = true;

  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();

    const recordsSheet = workbook.addWorksheet('Datos actualizados');
    recordsSheet.columns = [
      { header: 'recordId', key: 'recordId', width: 24 },
      { header: 'source', key: 'source', width: 12 },
      { header: 'PUNTO', key: 'point', width: 14 },
      { header: 'POSICIÓN', key: 'position', width: 24 },
      { header: 'TIPO', key: 'technology', width: 24 },
      { header: 'POTENCIA (W)', key: 'powerW', width: 14 },
      { header: 'TIPO DE ENCENDIDO', key: 'encendido', width: 20 },
      { header: 'OBSERVACIONES', key: 'observations', width: 24 },
      { header: 'CANTIDAD POR PUNTO', key: 'quantity', width: 18 },
      { header: 'SUMINISTRO', key: 'supply', width: 16 },
      { header: 'DIRECCIÓN', key: 'address', width: 36 },
      { header: 'LOCALIDAD', key: 'locality', width: 22 },
      { header: 'LAT', key: 'lat', width: 14 },
      { header: 'LNG', key: 'lng', width: 14 },
      { header: 'ESTADO COORDENADA', key: 'coordinateStatus', width: 18 },
      { header: 'UPDATED AT', key: 'updatedAt', width: 24 }
    ];
    recordsSheet.getRow(1).font = { bold: true };
    recordsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    recordsSheet.addRows(
      allRecords.value.map((record) => ({
        recordId: record.recordId,
        source: record.source ?? '',
        point: record.point,
        position: record.position,
        technology: record.technology,
        powerW: record.powerW ?? '',
        encendido: record.encendido,
        observations: record.observations,
        quantity: record.quantity,
        supply: record.supply,
        address: record.address,
        locality: record.locality,
        lat: record.lat ?? '',
        lng: record.lng ?? '',
        coordinateStatus: record.coordinateStatus,
        updatedAt: record.updatedAt ?? ''
      }))
    );

    const historySheet = workbook.addWorksheet('Historial');
    historySheet.columns = [
      { header: 'recordId', key: 'recordId', width: 24 },
      { header: 'timestamp', key: 'timestamp', width: 24 },
      { header: 'field', key: 'field', width: 18 },
      { header: 'before', key: 'before', width: 28 },
      { header: 'after', key: 'after', width: 28 }
    ];
    historySheet.getRow(1).font = { bold: true };
    historySheet.views = [{ state: 'frozen', ySplit: 1 }];

    const historyRows = allRecords.value.flatMap((record) =>
      (record.history ?? []).flatMap((entry) =>
        Object.entries(entry.changes).map(([field, change]) => ({
          recordId: record.recordId,
          timestamp: entry.timestamp,
          field,
          before: change.before === null || change.before === undefined ? '' : String(change.before),
          after: change.after === null || change.after === undefined ? '' : String(change.after)
        }))
      )
    );
    historySheet.addRows(historyRows);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alumbrado_actualizado.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } finally {
    isDownloadingExcel.value = false;
  }
}

useHead({
  title: 'Alumbrado público | Municipalidad FME'
});
</script>

<template>
  <div class="space-y-5">
    <div class="screen-only space-y-5">
      <header class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div class="space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.45em] text-slate-500">Mapa operativo</p>
          <h1 class="text-4xl font-semibold tracking-tight text-slate-950">Alumbrado público</h1>
          <p class="max-w-3xl text-sm leading-6 text-slate-600">
            Filtrá por localidad, tecnología, encendido y potencia real, y descargá un corte exacto para informe.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton color="primary" class="px-5" :loading="isExporting" :disabled="isExporting" @click="exportPdf">
            Descargar PDF
          </UButton>
          <UButton color="gray" variant="solid" class="px-5" :loading="isDownloadingExcel" :disabled="isDownloadingExcel" @click="exportExcel">
            Descargar Excel
          </UButton>
          <UButton variant="outline" color="gray" class="px-5" @click="refresh">
            Actualizar datos
          </UButton>
        </div>
      </header>

      <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside class="space-y-4 xl:sticky xl:top-24 xl:h-fit">
          <UCard class="glass">
            <template #header>
              <div class="flex items-center justify-between">
                <p class="text-sm font-semibold text-slate-900">Referencia de color</p>
                <span class="text-xs text-slate-500">Tecnologías</span>
              </div>
            </template>

            <div class="space-y-2 text-sm text-slate-700">
              <div class="flex items-center gap-2">
                <span class="h-3 w-3 rounded-full bg-[#0f4c81]" />
                LED
              </div>
              <div class="flex items-center gap-2">
                <span class="h-3 w-3 rounded-full bg-[#d9480f]" />
                Vapor de sodio
              </div>
              <div class="flex items-center gap-2">
                <span class="h-3 w-3 rounded-full bg-[#e67700]" />
                Bajo consumo
              </div>
              <div class="flex items-center gap-2">
                <span class="h-3 w-3 rounded-full bg-[#64748b]" />
                Gabinete / tablero
              </div>
              <div class="flex items-center gap-2">
                <span class="h-3 w-3 rounded-full bg-[#0ea5e9]" />
                Otros
              </div>
            </div>
          </UCard>

          <UCard class="glass">
            <template #header>
              <p class="text-sm font-semibold text-slate-900">Calidad del dato</p>
            </template>

            <div class="space-y-2 text-sm text-slate-600">
              <div class="flex items-center justify-between">
                <span>Sin coordenadas</span>
                <strong>{{ metrics?.noCoordinate ?? 0 }}</strong>
              </div>
              <div class="flex items-center justify-between">
                <span>Sin potencia</span>
                <strong>{{ metrics?.noPower ?? 0 }}</strong>
              </div>
              <div class="flex items-center justify-between">
                <span>Sin localidad</span>
                <strong>{{ metrics?.noLocality ?? 0 }}</strong>
              </div>
              <div class="flex items-center justify-between">
                <span>Sin suministro</span>
                <strong>{{ metrics?.noSupply ?? 0 }}</strong>
              </div>
            </div>
          </UCard>
        </aside>

        <main class="space-y-5">
          <section
            class="relative isolate overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
            :class="isMapFullscreen ? 'fixed inset-0 z-[6000] rounded-none' : ''"
          >
            <div ref="mapCaptureRef" class="relative h-full min-h-0">
            <div class="absolute left-4 top-4 z-10 rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500 shadow-sm">
              Puntos georreferenciados
            </div>
            <div class="absolute left-4 top-16 z-[5000] rounded-2xl bg-white/92 px-3 py-2 text-[11px] text-slate-600 shadow-sm">
              {{ selectedPointCount }} seleccionadas
            </div>
            <div class="pointer-events-none absolute left-4 top-28 z-[5200] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3">
              <div
                class="pointer-events-auto rounded-[22px] border border-slate-200 bg-white p-3 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-500">Referencias de color</p>
                    <h3 class="truncate text-sm font-semibold text-slate-950">Tecnologías y potencias</h3>
                    <p class="mt-0.5 text-[10px] text-slate-500">
                      Las capas usan estos colores para identificar cada punto.
                    </p>
                  </div>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="gray"
                    class="shrink-0 px-2"
                    @click="isColorLegendOpen = !isColorLegendOpen"
                  >
                    {{ isColorLegendOpen ? 'Ocultar' : 'Mostrar' }}
                  </UButton>
                </div>

                <div v-if="isColorLegendOpen" class="mt-3 grid gap-3">
                  <div>
                    <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tecnologías</p>
                    <div class="mt-2 space-y-1.5 text-sm text-slate-700">
                      <div class="flex items-center gap-2">
                        <span class="h-3 w-3 rounded-full bg-[#0f4c81] ring-1 ring-slate-200" />
                        LED
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="h-3 w-3 rounded-full bg-[#d9480f] ring-1 ring-slate-200" />
                        Vapor de sodio
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="h-3 w-3 rounded-full bg-[#e67700] ring-1 ring-slate-200" />
                        Bajo consumo
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="h-3 w-3 rounded-full bg-[#64748b] ring-1 ring-slate-200" />
                        Gabinete / tablero
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="h-3 w-3 rounded-full bg-[#0ea5e9] ring-1 ring-slate-200" />
                        Otros
                      </div>
                    </div>
                  </div>

                  <div class="h-px bg-slate-200" />

                  <div>
                    <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Potencias</p>
                    <div class="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700">
                      <div
                        v-for="item in powerLegend"
                        :key="item.value"
                        class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                      >
                        <span class="h-3 w-3 rounded-full ring-1 ring-slate-200" :style="{ backgroundColor: item.color }" />
                        <span>{{ item.value }} W</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                class="pointer-events-auto rounded-[22px] border border-slate-200 bg-white p-3 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-500">Cobertura</p>
                    <p class="text-[10px] text-slate-500">Indicadores compactos sobre el mapa</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {{ visibleCounts.points }} visibles
                    </span>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="gray"
                      class="shrink-0 px-2"
                      @click="isCoverageOpen = !isCoverageOpen"
                    >
                      {{ isCoverageOpen ? 'Ocultar' : 'Mostrar' }}
                    </UButton>
                  </div>
                </div>

                <div v-if="isCoverageOpen" class="mt-3 grid grid-cols-2 gap-2">
                  <div
                    v-for="item in [
                      { label: 'Puntos', value: visibleCounts.points },
                      { label: 'Luminarias', value: visibleCounts.luminaries },
                      { label: 'LED', value: `${visibleCounts.ledPoints}%` },
                      { label: 'Pot. total', value: `${metrics?.totalPowerW?.toLocaleString('es-AR') ?? 0} W` }
                    ]"
                    :key="item.label"
                    class="rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-2"
                  >
                    <p class="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {{ item.label }}
                    </p>
                    <p class="mt-1 text-sm font-semibold tracking-tight text-slate-950">
                      {{ item.value }}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                    <p class="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Pot. LED</p>
                    <p class="mt-1 text-sm font-semibold tracking-tight text-slate-950">
                      {{ metrics?.ledPowerW?.toLocaleString('es-AR') ?? 0 }} W
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div class="absolute right-4 top-4 z-[5000] rounded-2xl bg-white/92 p-1 shadow-sm">
              <UButton size="xs" color="gray" variant="solid" class="px-2.5" @click="toggleMapFullscreen">
                {{ isMapFullscreen ? 'Salir pantalla' : 'Pantalla completa' }}
              </UButton>
            </div>
            <div class="absolute right-4 top-16 z-[5000] rounded-2xl bg-white/92 p-1 shadow-sm">
              <div class="flex gap-1">
                <UButton
                  size="xs"
                  :color="mapLayer === 'street' ? 'primary' : 'gray'"
                  variant="solid"
                  class="px-2.5"
                  @click="mapLayer = 'street'"
                >
                  Mapa
                </UButton>
                <UButton
                  size="xs"
                  :color="mapLayer === 'satellite' ? 'primary' : 'gray'"
                  variant="solid"
                  class="px-2.5"
                  @click="mapLayer = 'satellite'"
                >
                  Satélite
                </UButton>
              </div>
            </div>
            <div class="pointer-events-none absolute inset-x-0 bottom-4 z-[5600] flex justify-center px-4">
              <div
              v-if="isMapFiltersOpen"
                class="pointer-events-auto w-[min(28rem,calc(100vw-2rem))] rounded-[22px] border border-slate-300 bg-white p-3 shadow-[0_14px_40px_rgba(15,23,42,0.16)]"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-500">Filtros</p>
                    <p class="text-[10px] text-slate-500">
                      {{ filteredRecords.length.toLocaleString('es-AR') }} visibles de {{ allRecords.length.toLocaleString('es-AR') }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <UButton size="xs" color="gray" variant="solid" class="px-2" @click="clearFilters">
                      Limpiar
                    </UButton>
                    <UButton variant="ghost" color="gray" size="xs" class="px-2" @click="isMapFiltersOpen = false">
                      Ocultar
                    </UButton>
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2">
                  <select v-model="locality" class="fme-select map-filter-select map-filter-select--fill">
                    <option value="">Todas las localidades</option>
                    <option v-for="item in localities" :key="item.name" :value="item.name">{{ item.name }}</option>
                  </select>
                  <select v-model="technology" class="fme-select map-filter-select map-filter-select--fill">
                    <option value="">Todas las tecnologías</option>
                    <option v-for="item in options?.technologies ?? []" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <select v-model="encendido" class="fme-select map-filter-select map-filter-select--compact map-filter-select--fill">
                    <option value="">Todos los encendidos</option>
                    <option v-for="item in options?.encendidos ?? []" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <select v-model="powerValue" class="fme-select map-filter-select map-filter-select--compact map-filter-select--fill">
                    <option value="">Todas las potencias</option>
                    <option v-for="item in options?.powerValues ?? []" :key="item" :value="item">{{ item }} W</option>
                  </select>
                  <div class="col-span-2 text-[10px] text-slate-500">Sector: {{ selectedSector || 'sin selección' }}</div>
                </div>
              </div>

              <div v-else class="pointer-events-auto flex justify-center">
                <UButton size="xs" color="gray" variant="solid" class="shadow-lg" @click="isMapFiltersOpen = true">
                  Mostrar filtros
                </UButton>
              </div>
            </div>

            <div class="absolute right-4 top-28 z-[5000] flex flex-col gap-2">
              <UButton
                size="xs"
                :color="isCreateMode ? 'primary' : 'gray'"
                variant="solid"
                class="justify-center shadow-sm"
                @click="isCreateMode ? stopCreateMode() : startCreateMode()"
              >
                {{ isCreateMode ? 'Cancelar alta' : 'Nuevo punto' }}
              </UButton>
            </div>

            <div
              v-if="isCreateMode"
              class="pointer-events-none absolute right-4 top-48 z-[5600] w-[min(25rem,calc(100vw-2rem))]"
            >
              <div class="pointer-events-auto max-h-[72vh] overflow-auto rounded-[26px] border border-slate-200 bg-white p-3.5 shadow-[0_22px_64px_rgba(15,23,42,0.18)]">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-[9px] font-semibold uppercase tracking-[0.26em] text-slate-500">Nuevo punto</p>
                    <h3 class="truncate text-base font-semibold text-slate-950">Alta sobre el mapa</h3>
                    <p class="text-[11px] text-slate-500">
                      Marcá puntos con click en el mapa y completá los datos en esta ficha flotante.
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {{ draftPointCount }} marcados
                    </span>
                    <UButton size="xs" variant="ghost" color="gray" @click="stopCreateMode">
                      Cerrar
                    </UButton>
                  </div>
                </div>

                <div class="mt-4 grid gap-2 sm:grid-cols-2">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Código</p>
                    <p class="mt-1 text-lg font-semibold text-slate-950">{{ newPointName }}</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Marcados</p>
                    <p class="mt-1 text-lg font-semibold text-slate-950">{{ draftPointCount }}</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:col-span-2">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Cómo cargar</p>
                    <p class="mt-1 text-sm text-slate-600">
                      Hacé click varias veces sobre el mapa para marcar puntos. Cada click agrega un registro al lote.
                    </p>
                  </div>
                </div>

                <div class="mt-4 grid gap-2 sm:grid-cols-3">
                  <select v-model="newPointTechnology" class="fme-select fme-select--compact w-full">
                    <option value="">Tecnología</option>
                    <option v-for="item in options?.technologies ?? []" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <select v-model="newPointPowerW" class="fme-select fme-select--compact w-full">
                    <option value="">Potencia</option>
                    <option v-for="item in options?.powerValues ?? []" :key="item" :value="item">{{ item }} W</option>
                  </select>
                  <select v-model="newPointEncendido" class="fme-select fme-select--compact w-full">
                    <option value="">Encendido</option>
                    <option v-for="item in options?.encendidos ?? []" :key="item" :value="item">{{ item }}</option>
                  </select>
                </div>

                <div class="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div class="space-y-1.5">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Localidad</p>
                    <select v-model="newPointLocality" class="fme-select fme-select--compact w-full">
                      <option value="">Elegí una localidad</option>
                      <optgroup v-if="newPointLocalitySuggestedOptions.length" label="Sugeridas por cercanía">
                        <option v-for="item in newPointLocalitySuggestedOptions" :key="`suggested-${item}`" :value="item">
                          {{ item }}
                        </option>
                      </optgroup>
                      <optgroup v-if="newPointLocalityOtherOptions.length" label="Otras localidades">
                        <option v-for="item in newPointLocalityOtherOptions" :key="`other-${item}`" :value="item">
                          {{ item }}
                        </option>
                      </optgroup>
                    </select>
                    <p class="text-[10px] text-slate-500">Se ordena por puntos cercanos al pin marcado.</p>
                  </div>
                  <div class="space-y-1.5">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Dirección / sector</p>
                    <select v-model="newPointAddressPreset" class="fme-select fme-select--compact w-full">
                      <option value="">Elegí una sugerencia</option>
                      <optgroup v-if="newPointAddressSuggestedOptions.length" label="Sugeridas por cercanía">
                        <option v-for="item in newPointAddressSuggestedOptions" :key="`address-${item}`" :value="item">
                          {{ item }}
                        </option>
                      </optgroup>
                      <option value="__manual__">Escribir manualmente</option>
                    </select>
                    <UInput
                      v-if="newPointAddressMode === 'manual'"
                      v-model="newPointAddress"
                      placeholder="Nueva dirección / sector"
                    />
                    <p v-else class="text-[10px] text-slate-500">Seleccioná una sugerencia o pasá a carga manual.</p>
                  </div>

                  <div class="grid gap-2 sm:grid-cols-2">
                    <UInput v-model="newPointSupply" placeholder="Suministro" />
                    <UInput v-model="newPointQuantity" type="number" min="1" placeholder="Cantidad" />
                  </div>
                </div>

                <UInput class="mt-4" v-model="newPointObservations" placeholder="Observaciones" />

                <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Pines marcados</p>
                      <p class="text-xs text-slate-500">
                        {{ draftLocations.length }} ubicación{{ draftLocations.length === 1 ? '' : 'es' }} marcada{{ draftLocations.length === 1 ? '' : 's' }}
                      </p>
                    </div>
                    <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      Lote {{ draftPointCount }}
                    </span>
                  </div>
                  <div v-if="draftLocations.length" class="mt-3 max-h-32 space-y-2 overflow-auto pr-1">
                    <div
                      v-for="(location, index) in draftLocations"
                      :key="`${location.lat}-${location.lng}-${index}`"
                      class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-[11px] font-semibold text-slate-800">Punto {{ index + 1 }}</p>
                        <p class="truncate text-[10px] text-slate-500">
                          {{ location.lat.toFixed(5) }}, {{ location.lng.toFixed(5) }}
                        </p>
                      </div>
                      <UButton size="xs" color="gray" variant="ghost" @click="removeDraftLocation(index)">Quitar</UButton>
                    </div>
                  </div>
                  <p v-else class="mt-3 text-xs text-slate-500">Todavía no marcaste puntos en el mapa.</p>
                </div>

                <div class="mt-4 flex flex-wrap items-center gap-2">
                  <UButton size="xs" color="gray" variant="solid" @click="removeLastDraftLocation">Borrar último</UButton>
                  <UButton size="xs" color="gray" variant="solid" @click="clearDraftLocations">Limpiar todo</UButton>
                </div>

                <div class="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div>
                    <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Guardar lote</p>
                    <p class="text-xs text-slate-500">Cada click en el mapa se guarda como un punto consecutivo.</p>
                  </div>
                  <UButton color="primary" :loading="isSavingNewPoint" :disabled="isSavingNewPoint" @click="saveNewPoint">
                    Guardar punto(s)
                  </UButton>
                </div>

                <p v-if="createPointError" class="mt-3 text-xs font-medium text-rose-600">{{ createPointError }}</p>
                <p v-else-if="createPointMessage" class="mt-3 text-xs font-medium text-emerald-700">{{ createPointMessage }}</p>
              </div>
            </div>

            <div :class="isMapFullscreen ? 'h-screen min-h-0' : 'h-[68vh] min-h-[560px]'">
              <ClientOnly>
                <LightingMap
                  :points="filteredRecords"
                  :selected-keys="selectedPointIds"
                  :fit-bounds-key="mapFitBoundsKey"
                  :map-layer="mapLayer"
                  :draft-locations="draftLocations"
                  :draft-location="draftLocation"
                  @select="togglePointSelection"
                  @map-click="handleMapClick($event)"
                />
              </ClientOnly>
            </div>

            <div v-if="selectedPoint" class="pointer-events-none absolute inset-0 z-[3000]">
              <div class="absolute right-4 top-40 pointer-events-auto">
                <UButton
                  size="xs"
                  color="primary"
                  variant="solid"
                  class="shadow-lg"
                  @click="isFloatingFormOpen = !isFloatingFormOpen"
                >
                  {{ isFloatingFormOpen ? 'Ocultar ficha' : 'Ver ficha' }} · {{ selectedPointCount }}
                </UButton>
              </div>
              <div
                v-if="isFloatingFormOpen"
                class="pointer-events-auto absolute right-4 top-60 w-[min(23rem,calc(100%-2rem))] max-h-[66vh] overflow-auto rounded-[22px] border border-slate-200 bg-white p-3 text-[11px] shadow-2xl"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-500">Luminaria</p>
                    <h3 class="truncate text-sm font-semibold text-slate-950">
                      {{ selectedPoint.point || 'Punto sin nombre' }}
                    </h3>
                    <p class="truncate text-[10px] text-slate-500">
                      {{ selectedPoint.address || 'Sin dirección' }} · {{ selectedEditableCount }}/{{ selectedPointCount }} editables
                    </p>
                  </div>
                  <UButton variant="ghost" color="gray" size="xs" class="shrink-0 px-2" @click="clearSelection">
                    Limpiar
                  </UButton>
                </div>

                <div class="mt-3 grid gap-2">
                  <select v-model="editTechnology" class="fme-select fme-select--compact w-full">
                    <option value="">Tecnología</option>
                    <option v-for="item in options?.technologies ?? []" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <select v-model="editPowerW" class="fme-select fme-select--compact w-full">
                    <option value="">Potencia</option>
                    <option v-for="item in options?.powerValues ?? []" :key="item" :value="item">{{ item }} W</option>
                  </select>
                  <select v-model="editEncendido" class="fme-select fme-select--compact w-full">
                    <option value="">Encendido</option>
                    <option v-for="item in options?.encendidos ?? []" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <UButton size="xs" color="primary" variant="solid" class="justify-center" :loading="isSavingPoint" :disabled="isSavingPoint" @click="saveSelectedPoint">
                    Guardar cambios
                  </UButton>
                  <p v-if="savePointError" class="text-[10px] text-rose-600">{{ savePointError }}</p>
                  <p v-else-if="savePointMessage" class="text-[10px] text-emerald-700">{{ savePointMessage }}</p>
                </div>

              </div>
            </div>
            </div>
          </section>

          <div class="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div class="rounded-[24px] border border-slate-200 bg-white p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-slate-900">Buscador de domicilios / sectores</p>
                  <p class="text-xs text-slate-500">Se agrupan variantes del mismo texto.</p>
                </div>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {{ sectors.length }} sectores
                </span>
              </div>
              <UInput v-model="sectorSearch" class="mt-3" placeholder="Ej: B° Hipolito Irigoyen, San Cayetano..." />

              <div class="mt-3 max-h-[22rem] space-y-2 overflow-auto pr-1">
                <button
                  v-for="sector in filteredSectors"
                  :key="sector.key"
                  type="button"
                  class="fme-sector-item"
                  :class="selectedSector === sector.label ? 'fme-sector-item-active' : ''"
                  @click="applySector(sector.label)"
                >
                  <div class="min-w-0 text-left">
                    <p class="truncate text-sm font-medium text-slate-900">{{ sector.displayLabel ?? sector.label }}</p>
                    <p class="text-xs text-slate-500">{{ sector.count }} puntos georreferenciados</p>
                  </div>
                  <div class="flex items-center gap-3 text-sm font-semibold">
                    <span class="text-slate-500">{{ sector.ledPercentage }}% LED</span>
                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{{ sector.count }}</span>
                  </div>
                </button>
              </div>
            </div>

            <div class="rounded-[24px] border border-slate-200 bg-white p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-slate-900">Sectores más presentes</p>
                  <p class="text-xs text-slate-500">Top por cantidad de puntos</p>
                </div>
                <span class="text-xs text-slate-500">Mapa + informe</span>
              </div>
              <div class="mt-3 grid gap-2">
                <div
                  v-for="sector in sectors.slice(0, 6)"
                  :key="sector.key"
                  class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <button type="button" class="min-w-0 text-left" @click="applySector(sector.label)">
                      <p class="truncate text-sm font-semibold text-slate-900">{{ sector.displayLabel ?? sector.label }}</p>
                      <p class="text-xs text-slate-500">{{ sector.count }} puntos · {{ sector.ledPercentage }}% LED</p>
                    </button>
                    <span class="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {{ sector.count }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {{
                  selectedPoint
                    ? `Punto seleccionado: ${selectedPoint.point} · ${selectedPoint.address || 'Sin dirección'} · ${selectedPoint.technology}. Seleccionadas: ${selectedPointCount}.`
                    : 'Hacé clic sobre un punto del mapa para ver el detalle operativo.'
                }}
              </div>
            </div>
          </div>

          <div class="grid gap-5 xl:grid-cols-2" data-pdf-exclude>
            <UCard class="glass">
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold text-slate-900">Cobertura LED por localidad</p>
                    <p class="text-xs text-slate-500">Todas las localidades del padrón</p>
                  </div>
                  <span class="text-xs text-slate-500">{{ localities.length }} localidades</span>
                </div>
              </template>

              <div class="space-y-2">
                <div
                  v-for="item in localities"
                  :key="item.name"
                  class="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div class="flex items-center justify-between gap-4">
                    <button type="button" class="min-w-0 text-left" @click="locality = item.name">
                      <p class="truncate text-sm font-medium text-slate-900">{{ item.name }}</p>
                      <p class="text-xs text-slate-500">{{ item.count }} puntos</p>
                    </button>
                    <div class="text-right">
                      <p class="text-sm font-semibold text-slate-800">{{ item.ledPercentage }}% LED</p>
                      <p class="text-xs text-slate-500">{{ item.ledCount }} LED</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard class="glass" data-pdf-exclude>
              <template #header>
                <div>
                  <p class="text-sm font-semibold text-slate-900">Puntos no LED</p>
                  <p class="text-xs text-slate-500">Tecnologías no convertidas</p>
                </div>
              </template>

              <div class="space-y-2">
                <div
                  v-for="record in filteredRecords.filter((item) => item.isLuminaire && !item.isLed).slice(0, 10)"
                  :key="`${record.point}-${record.address}`"
                  class="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <p class="text-sm font-medium text-slate-900">{{ record.point }}</p>
                  <p class="text-xs text-slate-500">
                    {{ record.address || 'Sin dirección' }} · {{ record.locality || 'Sin localidad' }} ·
                    {{ record.technology || 'Sin tecnología' }}
                  </p>
                </div>
              </div>
            </UCard>
          </div>
        </main>
      </div>
    </div>

    <div v-if="pending" class="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Cargando alumbrado...
    </div>
    <div v-if="error" class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      No se pudo cargar el alumbrado.
    </div>
  </div>
</template>
