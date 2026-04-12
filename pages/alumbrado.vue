<script setup lang="ts">
import type { LightingRecord } from '~/types/municipal';

const { data, pending, error, refresh } = await useAsyncData('alumbrado-dataset', () => $fetch('/api/alumbrado'));
const mapCaptureRef = ref<HTMLElement | null>(null);
const isExporting = ref(false);

const locality = ref('');
const technology = ref('');
const encendido = ref('');
const powerValue = ref('');
const sectorSearch = ref('');
const selectedSector = ref('');
const selectedPoint = ref<LightingRecord | null>(null);

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
const printTimestamp = new Date().toLocaleString('es-AR');

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
  selectedPoint.value = null;
}

function applySector(label: string) {
  selectedSector.value = label;
  sectorSearch.value = label;
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
          <UButton variant="outline" color="gray" class="px-5" @click="refresh">
            Actualizar datos
          </UButton>
        </div>
      </header>

      <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside class="space-y-4 xl:sticky xl:top-24 xl:h-fit">
          <UCard class="glass">
            <template #header>
              <p class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Cobertura</p>
            </template>

            <div class="grid gap-3">
              <div
                v-for="item in [
                  { label: 'Puntos visibles', value: visibleCounts.points },
                  { label: 'Luminarias visibles', value: visibleCounts.luminaries },
                  { label: 'LED por puntos', value: `${visibleCounts.ledPoints}%` },
                  { label: 'Potencia total', value: `${metrics?.totalPowerW?.toLocaleString('es-AR') ?? 0} W` },
                  { label: 'Potencia LED', value: `${metrics?.ledPowerW?.toLocaleString('es-AR') ?? 0} W` }
                ]"
                :key="item.label"
                class="rounded-3xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
              >
                <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {{ item.label }}
                </p>
                <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {{ item.value }}
                </p>
              </div>
            </div>
          </UCard>

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
          <UCard class="glass">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Filtros operativos</p>
          <p class="text-sm text-slate-500">Filtrá arriba y trabajá sobre el corte exacto.</p>
                </div>
                <UButton variant="ghost" color="gray" @click="clearFilters">
                  Limpiar filtros
                </UButton>
              </div>
            </template>

            <div class="grid gap-3 xl:grid-cols-4">
              <select v-model="locality" class="fme-select">
                <option value="">Todas las localidades</option>
                <option v-for="item in localities" :key="item.name" :value="item.name">{{ item.name }}</option>
              </select>
              <select v-model="technology" class="fme-select">
                <option value="">Todas las tecnologías</option>
                <option v-for="item in options?.technologies ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="encendido" class="fme-select">
                <option value="">Todos los encendidos</option>
                <option v-for="item in options?.encendidos ?? []" :key="item" :value="item">{{ item }}</option>
              </select>
              <select v-model="powerValue" class="fme-select">
                <option value="">Todas las potencias</option>
                <option v-for="item in options?.powerValues ?? []" :key="item" :value="item">{{ item }} W</option>
              </select>
            </div>

            <div class="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                {{ filteredRecords.length.toLocaleString('es-AR') }} puntos filtrados de
                {{ allRecords.length.toLocaleString('es-AR') }} totales
              </span>
              <span>Sector activo: {{ selectedSector || 'sin selección' }}</span>
            </div>

            <div class="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
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
                      ? `Punto seleccionado: ${selectedPoint.point} · ${selectedPoint.address || 'Sin dirección'} · ${selectedPoint.technology}`
                      : 'Hacé clic sobre un punto del mapa para ver el detalle operativo.'
                  }}
                </div>
                <div v-if="selectedPoint" class="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <div class="min-w-0">
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">GPS</p>
                    <p class="text-slate-700">{{ gpsLabel(selectedPoint) }}</p>
                  </div>
                  <a
                    :href="googleMapsUrl(selectedPoint)"
                    target="_blank"
                    rel="noreferrer"
                    class="ml-auto rounded-full bg-sky-50 px-3 py-1.5 font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Abrir en Google Maps
                  </a>
                </div>
              </div>
            </div>
          </UCard>

          <section ref="mapCaptureRef" class="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
            <div class="absolute left-4 top-4 z-10 rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500 shadow-sm">
              Puntos georreferenciados
            </div>
            <div class="absolute right-4 top-4 z-10 rounded-2xl bg-white/92 px-3 py-2 text-xs text-slate-600 shadow-sm">
              {{ filteredRecords.length }} visibles · {{ selectedSector || 'todos los sectores' }}
            </div>
            <div class="h-[68vh] min-h-[560px]">
              <ClientOnly>
                <LightingMap
                  :points="filteredRecords"
                  :selected-key="selectedPoint?.point ?? null"
                  @select="selectedPoint = $event"
                />
              </ClientOnly>
            </div>
          </section>

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
