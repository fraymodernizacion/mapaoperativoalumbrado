<script setup lang="ts">
import type { LightingRecord } from '~/types/municipal';

const props = defineProps<{
  points: LightingRecord[];
  selectedKey?: string | null;
}>();

const emit = defineEmits<{
  select: [point: LightingRecord];
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: import('leaflet').Map | null = null;
let layerGroup: import('leaflet').LayerGroup | null = null;
let leaflet: typeof import('leaflet') | null = null;

function colorForGroup(group: LightingRecord['technologyGroup']) {
  switch (group) {
    case 'led':
      return '#0f4c81';
    case 'sodio':
      return '#d9480f';
    case 'bajo_consumo':
      return '#e67700';
    case 'gabinete':
      return '#64748b';
    default:
      return '#0ea5e9';
  }
}

function googleMapsHref(point: LightingRecord) {
  if (point.lat !== null && point.lng !== null) {
    return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  }

  const query = [point.address, point.locality, point.point].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function markerForPoint(point: LightingRecord) {
  if (!leaflet) return;
  const isSelected = props.selectedKey && props.selectedKey === point.point;
  const radius = isSelected ? 11 : point.isLed ? 8 : 6.5;
  const marker = leaflet.circleMarker([point.lat as number, point.lng as number], {
    radius,
    color: '#ffffff',
    weight: isSelected ? 3.2 : point.isLed ? 2.4 : 1.8,
    fillColor: colorForGroup(point.technologyGroup),
    fillOpacity: isSelected ? 1 : 0.96,
    opacity: 0.98
  });

  marker.bindTooltip(
    `
      <strong>${point.point || 'Punto sin nombre'}</strong><br/>
      ${point.address || 'Sin dirección'}<br/>
      ${point.technology || 'Sin tecnología'} · ${point.powerW ?? '-'} W
    `,
    { direction: 'top', sticky: true, opacity: 0.96 }
  );

  const href = googleMapsHref(point);
  if (href) {
    marker.bindPopup(
      `
        <div style="min-width: 190px">
          <strong>${point.point || 'Punto sin nombre'}</strong><br/>
          ${point.address || 'Sin dirección'}<br/>
          ${point.locality || 'Sin localidad'}<br/>
          ${point.technology || 'Sin tecnología'} · ${point.powerW ?? '-'} W<br/>
          <a href="${href}" target="_blank" rel="noreferrer" style="color:#0f4c81;text-decoration:underline;font-weight:600">
            Abrir en Google Maps
          </a>
        </div>
      `,
      { closeButton: true, autoPan: true }
    );
  }

  marker.on('click', () => emit('select', point));
  return marker;
}

function renderMarkers() {
  const currentMap = map;
  const currentLayerGroup = layerGroup;
  const L = leaflet;
  if (!currentMap || !currentLayerGroup || !L) return;

  currentLayerGroup.clearLayers();
  const bounds = L.latLngBounds([]);
  const validPoints = props.points.filter((point) => point.lat !== null && point.lng !== null);

  validPoints.forEach((point) => {
    const marker = markerForPoint(point);
    if (!marker) return;
    marker.addTo(currentLayerGroup);
    bounds.extend([point.lat as number, point.lng as number]);
  });

  if (validPoints.length) {
    currentMap.fitBounds(bounds.pad(0.12), { animate: false });
  }
}

onMounted(async () => {
  leaflet = await import('leaflet');
  map = leaflet.map(mapEl.value as HTMLDivElement, {
    zoomControl: true,
    preferCanvas: true,
    scrollWheelZoom: true
  }).setView([-28.42, -65.72], 12);

  leaflet
    .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true
    })
    .addTo(map);

  layerGroup = leaflet.layerGroup().addTo(map);

  map.whenReady(() => {
    nextTick(() => {
      map?.invalidateSize();
      renderMarkers();
      setTimeout(() => renderMarkers(), 120);
    });
  });
});

watch(
  () => [props.points, props.selectedKey],
  () => {
    renderMarkers();
  },
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
