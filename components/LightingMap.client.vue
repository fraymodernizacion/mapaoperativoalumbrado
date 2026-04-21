<script setup lang="ts">
import type { LightingRecord } from '~/types/municipal';

const props = defineProps<{
  points: LightingRecord[];
  selectedKey?: string | null;
  selectedKeys?: string[];
  fitBoundsKey?: string | null;
  mapLayer?: 'street' | 'satellite';
  draftLocations?: { lat: number; lng: number }[] | null;
  draftLocation?: { lat: number; lng: number } | null;
}>();

const emit = defineEmits<{
  select: [point: LightingRecord, additive: boolean];
  'center-change': [center: { lat: number; lng: number }];
  'map-click': [location: { lat: number; lng: number }];
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: import('leaflet').Map | null = null;
let layerGroup: import('leaflet').LayerGroup | null = null;
let draftLayerGroup: import('leaflet').LayerGroup | null = null;
let streetLayer: import('leaflet').TileLayer | null = null;
let satelliteLayer: import('leaflet').TileLayer | null = null;
let activeBaseLayer: 'street' | 'satellite' = 'street';
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

function colorForPower(powerW: number | null) {
  switch (powerW) {
    case 40:
      return '#0f4c81';
    case 50:
      return '#6d28d9';
    case 100:
      return '#0f766e';
    case 150:
      return '#b45309';
    case 200:
      return '#be123c';
    default:
      return null;
  }
}

function googleMapsHref(point: LightingRecord) {
  if (point.lat !== null && point.lng !== null) {
    return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  }

  const query = [point.address, point.locality, point.point].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function draftPinIcon() {
  if (!leaflet) return undefined;

  return leaflet.divIcon({
    className: '',
    html: `
      <div class="draft-pin-marker">
        <div class="draft-pin-marker__ring"></div>
        <div class="draft-pin-marker__core"></div>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function markerForPoint(point: LightingRecord) {
  if (!leaflet) return;
  const selectedSet = new Set(props.selectedKeys ?? (props.selectedKey ? [props.selectedKey] : []));
  const isSelected = selectedSet.has(point.recordId);
  const radius = isSelected ? 19 : point.isLed ? 8 : 6.5;
  const powerColor = colorForPower(point.powerW);
  const marker = leaflet.circleMarker([point.lat as number, point.lng as number], {
    radius,
    color: '#ffffff',
    weight: isSelected ? 5 : point.isLed ? 2.4 : 1.8,
    fillColor: powerColor ?? colorForGroup(point.technologyGroup),
    fillOpacity: isSelected ? 1 : 0.96,
    opacity: 0.98
  });

  marker.bindTooltip(
    `
      <strong>${point.point || 'Punto sin nombre'}</strong><br/>
      ${point.address || 'Sin dirección'}<br/>
      ${point.technology || 'Sin tecnología'} · ${point.powerW ?? '-'} W<br/>
      ${point.encendido || 'Sin encendido'}
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
          ${point.encendido || 'Sin encendido'}<br/>
          <a href="${href}" target="_blank" rel="noreferrer" style="color:#0f4c81;text-decoration:underline;font-weight:600">
            Abrir en Google Maps
          </a>
        </div>
      `,
      { closeButton: true, autoPan: true }
    );
  }

  marker.on('click', (event) => {
    const original = event.originalEvent as MouseEvent | undefined;
    const additive = Boolean(original?.ctrlKey || original?.metaKey || original?.shiftKey);
    emit('select', point, additive);
  });
  return marker;
}

function renderMarkers(options: { fitToBounds?: boolean } = {}) {
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

  if (options.fitToBounds !== false && validPoints.length) {
    currentMap.fitBounds(bounds.pad(0.12), { animate: false });
  }
}

function renderDraftMarker() {
  const currentMap = map;
  const currentDraftLayerGroup = draftLayerGroup;
  const L = leaflet;
  if (!currentMap || !currentDraftLayerGroup || !L) return;

  currentDraftLayerGroup.clearLayers();

  const locations = props.draftLocations?.length
    ? props.draftLocations
    : props.draftLocation
      ? [props.draftLocation]
      : [];

  locations.forEach((location, index) => {
    const marker = L.marker([location.lat, location.lng], {
      draggable: false,
      icon: draftPinIcon()
    });

    marker.bindTooltip(`Pin de alta ${index + 1}`, { direction: 'top', sticky: true, opacity: 0.96 });
    marker.addTo(currentDraftLayerGroup);
  });
}

function handleMapClick(event: import('leaflet').LeafletMouseEvent) {
  emit('map-click', { lat: event.latlng.lat, lng: event.latlng.lng });
}

function applyBaseLayer(layer: 'street' | 'satellite') {
  const currentMap = map;
  if (!currentMap || !leaflet) return;

  if (activeBaseLayer === layer) return;

  if (streetLayer && currentMap.hasLayer(streetLayer)) {
    currentMap.removeLayer(streetLayer);
  }
  if (satelliteLayer && currentMap.hasLayer(satelliteLayer)) {
    currentMap.removeLayer(satelliteLayer);
  }

  if (layer === 'street' && streetLayer) {
    streetLayer.addTo(currentMap);
    currentMap.setMaxZoom(19);
  }

  if (layer === 'satellite' && satelliteLayer) {
    satelliteLayer.addTo(currentMap);
    currentMap.setMaxZoom(18);
    if (currentMap.getZoom() > 18) {
      currentMap.setZoom(18);
    }
  }

  activeBaseLayer = layer;
}

function emitCenterChange() {
  if (!map) return;
  const center = map.getCenter();
  emit('center-change', { lat: center.lat, lng: center.lng });
}

onMounted(async () => {
  leaflet = await import('leaflet');
  map = leaflet.map(mapEl.value as HTMLDivElement, {
    zoomControl: true,
    preferCanvas: true,
    scrollWheelZoom: true
  }).setView([-28.42, -65.72], 12);

  streetLayer = leaflet
    .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true
    });

  satelliteLayer = leaflet
    .tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 18,
        maxNativeZoom: 18,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        crossOrigin: true
      }
    );

  (props.mapLayer === 'satellite' ? satelliteLayer : streetLayer).addTo(map);
  activeBaseLayer = props.mapLayer === 'satellite' ? 'satellite' : 'street';

  layerGroup = leaflet.layerGroup().addTo(map);
  draftLayerGroup = leaflet.layerGroup().addTo(map);

  map.whenReady(() => {
    nextTick(() => {
      map?.invalidateSize();
      renderMarkers();
      renderDraftMarker();
      setTimeout(() => renderMarkers(), 120);
      emitCenterChange();
    });
  });

  map.on('moveend', emitCenterChange);
  map.on('zoomend', emitCenterChange);
  map.on('click', handleMapClick);
});

watch(
  () => props.points,
  () => {
    renderMarkers({ fitToBounds: false });
  },
  { deep: true }
);

watch(
  () => props.selectedKeys,
  () => {
    renderMarkers({ fitToBounds: false });
  }
);

watch(
  () => props.selectedKey,
  () => {
    renderMarkers({ fitToBounds: false });
  }
);

watch(
  () => props.fitBoundsKey,
  () => {
    renderMarkers({ fitToBounds: true });
    nextTick(() => {
      emitCenterChange();
    });
  }
);

watch(
  () => props.draftLocation,
  () => {
    renderDraftMarker();
  },
  { deep: true }
);

watch(
  () => props.draftLocations,
  () => {
    renderDraftMarker();
  },
  { deep: true }
);

watch(
  () => props.mapLayer,
  (layer) => {
    applyBaseLayer(layer ?? 'street');
  }
);

onBeforeUnmount(() => {
  map?.off('moveend', emitCenterChange);
  map?.off('zoomend', emitCenterChange);
  map?.off('click', handleMapClick);
  map?.remove();
  map = null;
  layerGroup = null;
  draftLayerGroup = null;
  streetLayer = null;
  satelliteLayer = null;
  leaflet = null;
});
</script>

<template>
  <div ref="mapEl" class="h-full w-full rounded-[24px]" />
</template>
