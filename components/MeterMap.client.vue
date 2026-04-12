<script setup lang="ts">
import type { MeterRecord } from '~/types/municipal';

const props = defineProps<{
  points: MeterRecord[];
}>();

const emit = defineEmits<{
  select: [point: MeterRecord];
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: import('leaflet').Map | null = null;
let layerGroup: import('leaflet').LayerGroup | null = null;
let leaflet: typeof import('leaflet') | null = null;

function colorForPoint(point: MeterRecord) {
  const text = `${point.consumptionType} ${point.userType}`.toUpperCase();
  if (text.includes('ALUMBRADO')) return '#0f4c81';
  if (text.includes('OFICIAL')) return '#0891b2';
  if (text.includes('MUNICIPAL')) return '#2563eb';
  if (text.includes('SEMAFORO')) return '#d9480f';
  return '#64748b';
}

function renderMarkers(points: MeterRecord[]) {
  const currentMap = map;
  const currentLayerGroup = layerGroup;
  const L = leaflet;
  if (!currentMap || !currentLayerGroup || !L) return;
  currentLayerGroup.clearLayers();
  const bounds = L.latLngBounds([]);
  points
    .filter((point) => point.lat !== null && point.lng !== null)
    .forEach((point) => {
      const marker = L.circleMarker([point.lat as number, point.lng as number], {
        radius: 6,
        color: '#ffffff',
        weight: 1.5,
        fillColor: colorForPoint(point),
        fillOpacity: 0.92
      });
      marker.bindTooltip(
        `
          <strong>${point.meter || 'Medidor'}</strong><br/>
          ${point.address || 'Sin domicilio'}<br/>
          ${point.user || 'Sin usuario'}
        `,
        { direction: 'top', sticky: true, opacity: 0.96 }
      );
      marker.on('click', () => emit('select', point));
      marker.addTo(currentLayerGroup);
      bounds.extend([point.lat as number, point.lng as number]);
    });

  if (bounds.isValid()) {
    currentMap.fitBounds(bounds.pad(0.12), { animate: false });
  }
}

onMounted(async () => {
  leaflet = await import('leaflet');
  map = leaflet.map(mapEl.value as HTMLDivElement, { preferCanvas: true, zoomControl: true }).setView([-28.42, -65.72], 12);
  leaflet
    .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true
    })
    .addTo(map);
  layerGroup = leaflet.layerGroup().addTo(map);
  nextTick(() => {
    map?.invalidateSize();
    renderMarkers(props.points);
  });
});

watch(
  () => props.points,
  (points) => renderMarkers(points ?? []),
  { deep: true }
);

onBeforeUnmount(() => {
  map?.remove();
  map = null;
  layerGroup = null;
  leaflet = null;
});
</script>

<template>
  <div ref="mapEl" class="h-full w-full rounded-[24px]" />
</template>
