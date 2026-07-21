<template>
  <section class="merchant-heatmap-view">
    <!-- Header area -->
    <header class="heatmap-header">
      <div class="heatmap-header-left">
        <h2>合作商家热点图</h2>
        <span class="heatmap-subtitle">基于区域聚合显示当前合作商家的地理分布</span>
      </div>
      <div class="heatmap-header-right">
        <div class="stat-badge">
          <span class="stat-label">总商家</span>
          <strong>{{ totalMerchants }}</strong>
        </div>
        <div class="stat-badge mapped">
          <span class="stat-label">已定位</span>
          <strong>{{ mappedMerchants }}</strong>
        </div>
        <div v-if="unmappedMerchants > 0" class="stat-badge unmapped">
          <span class="stat-label">未定位</span>
          <strong>{{ unmappedMerchants }}</strong>
        </div>
      </div>
    </header>

    <!-- Error state -->
    <ErrorAlert v-if="error" :message="error" />

    <!-- Loading state -->
    <div v-if="loading && !data" class="heatmap-loading">
      <el-skeleton :rows="3" animated />
    </div>

    <!-- Empty state -->
    <div v-else-if="!data && !loading" class="heatmap-empty">
      <p>暂无商家数据，请确认数据库有内容。</p>
      <el-button type="primary" @click="load">重新加载</el-button>
    </div>

    <!-- Map area -->
    <div v-else class="heatmap-body">
      <div ref="mapContainer" class="heatmap-map"></div>

      <!-- Controls overlay -->
      <div class="heatmap-controls">
        <div class="control-group">
          <span class="control-label">热力权重</span>
          <el-radio-group
            :model-value="intensityMode"
            size="small"
            @update:model-value="toggleMode"
          >
            <el-radio-button value="count">商家数量</el-radio-button>
            <el-radio-button value="gmv">GMV</el-radio-button>
          </el-radio-group>
        </div>

        <div class="control-group legend">
          <span class="control-label">密集度</span>
          <div class="legend-bar">
            <span>低</span>
            <div class="legend-gradient"></div>
            <span>高</span>
          </div>
        </div>

        <div class="control-group hint">
          <span class="hint-icon">💡</span>
          <span class="hint-text">滚轮缩放 · 拖拽平移</span>
        </div>
      </div>

      <!-- Area detail panel (shown when hovering a heat point) -->
      <transition name="fade">
        <div v-if="hoveredArea" class="heatmap-tooltip" :style="tooltipStyle">
          <h4>{{ hoveredArea.areaName }}</h4>
          <div class="tooltip-row">
            <span>商家数</span>
            <strong>{{ hoveredArea.merchantCount }}</strong>
          </div>
          <div class="tooltip-row">
            <span>30d GMV</span>
            <strong>¥{{ formatGmv(hoveredArea.totalGmv) }}</strong>
          </div>
          <div v-if="hoveredArea.merchants.length" class="tooltip-merchants">
            <span class="tooltip-label">商家：</span>
            <span class="tooltip-names">{{ hoveredArea.merchants.join('、') }}</span>
          </div>
        </div>
      </transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useMerchantHeatmap } from '../features/merchant-heatmap/composables/useMerchantHeatmap';
import type { MerchantHeatmapPoint } from '../services/api/merchant.api';

const {
  loading,
  error,
  data,
  points,
  heatmapLayerData,
  totalMerchants,
  mappedMerchants,
  unmappedMerchants,
  center,
  intensityMode,
  load,
  toggleMode
} = useMerchantHeatmap();

const mapContainer = ref<HTMLDivElement | null>(null);
const hoveredArea = ref<MerchantHeatmapPoint | null>(null);
const tooltipStyle = ref({ top: '0px', left: '0px' });

let map: L.Map | null = null;
let markers: L.CircleMarker[] = [];

function formatGmv(val: number): string {
  if (val >= 10000) return (val / 10000).toFixed(1) + '万';
  if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
  return val.toLocaleString();
}

function initMap() {
  if (!mapContainer.value) return;

  map = L.map(mapContainer.value, {
    center: [center.value.lat, center.value.lng],
    zoom: 11,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Fit bounds to data
  if (points.value.length > 0) {
    const bounds = L.latLngBounds(points.value.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }

  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
    renderHeatCircles();
    renderInteractionMarkers();
  }, 300);
}

const HEAT_COLORS = ['#313695', '#4575b4', '#74add1', '#fee090', '#f46d43', '#a50026'];

function getColor(intensity: number): string {
  if (intensity >= 1) return HEAT_COLORS[5];
  const idx = Math.floor(intensity * (HEAT_COLORS.length - 1));
  return HEAT_COLORS[Math.min(idx, HEAT_COLORS.length - 1)];
}

let heatCircles: L.CircleMarker[] = [];

function renderHeatCircles() {
  // Clear previous
  heatCircles.forEach((c) => map?.removeLayer(c));
  heatCircles = [];
  if (!map || heatmapLayerData.value.length === 0) return;

  // Aggregate nearby points to reduce visual clutter
  const radius = 0.005; // ~500m aggregation radius
  const grid = new Map<
    string,
    { lat: number; lng: number; count: number; totalIntensity: number }
  >();

  for (const p of points.value) {
    const key = `${Math.round(p.lat / radius)},${Math.round(p.lng / radius)}`;
    const cell = grid.get(key) ?? { lat: p.lat, lng: p.lng, count: 0, totalIntensity: 0 };
    cell.count += 1;
    cell.totalIntensity += p.intensity;
    cell.lat = p.lat;
    cell.lng = p.lng;
    grid.set(key, cell);
  }

  for (const [, cell] of grid) {
    const avgIntensity = Math.min(cell.totalIntensity / cell.count, 1);
    const circleRadius = 8 + avgIntensity * 22;
    const opacity = 0.25 + avgIntensity * 0.45;
    const color = getColor(avgIntensity);
    const circle = L.circleMarker([cell.lat, cell.lng], {
      radius: circleRadius,
      fillColor: color,
      color: color,
      weight: 0,
      fillOpacity: opacity,
      interactive: false
    });
    circle.addTo(map);
    heatCircles.push(circle);
  }
}

function renderInteractionMarkers() {
  if (!map) return;
  markers.forEach((m) => map?.removeLayer(m));
  markers = [];

  // Place invisible hit areas at each merchant cluster for hover tooltips
  const seen = new Set<string>();
  for (const p of points.value) {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 16,
      fillColor: '#4575b4',
      color: '#fff',
      weight: 0,
      opacity: 0,
      fillOpacity: 0,
      interactive: true
    });
    marker.bindTooltip(p.areaName, { direction: 'top', offset: L.point(0, -8) });

    marker.on('mouseover', (e: L.LeafletMouseEvent) => {
      hoveredArea.value = p;
      tooltipStyle.value = {
        top: `${e.containerPoint.y + 10}px`,
        left: `${e.containerPoint.x + 10}px`
      };
    });
    marker.on('mousemove', (e: L.LeafletMouseEvent) => {
      tooltipStyle.value = {
        top: `${e.containerPoint.y + 10}px`,
        left: `${e.containerPoint.x + 10}px`
      };
    });
    marker.on('mouseout', () => {
      hoveredArea.value = null;
    });

    marker.addTo(map);
    markers.push(marker);
  }
}

watch(intensityMode, () => {
  if (map) {
    renderHeatCircles();
  }
});

onMounted(async () => {
  await load();
  await nextTick();
  initMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<style scoped>
@import '../styles/views/merchant-heatmap.css';
</style>
