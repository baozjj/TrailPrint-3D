<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import L from "leaflet";
import "leaflet-rotate";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useTrailPoints } from "@/composables/useTrailPoints";
import {
  buildMaskGeometry,
  maskEvenOddPath,
  maskPolygonPoints,
  type MaskScreenGeometry,
} from "@/utils/map-mask-geometry";
import {
  buildTrayMaskOverlay,
  trayOuterPolygonPoints,
} from "@/utils/tray-mask-geometry";
import { useUiStore } from "@/stores/ui";
import { maskFitPadding } from "@shared/utils/map-projection";

const configStore = useConfigStore();
const ui = useUiStore();
const { config } = storeToRefs(configStore);
const { gpxMapFitNonce } = storeToRefs(ui);
const { effectivePoints } = useTrailPoints();

const mapWrap = ref<HTMLDivElement | null>(null);
const mapRoot = ref<HTMLDivElement | null>(null);
const maskGeom = ref<MaskScreenGeometry | null>(null);
const maskW = ref(1);
const maskH = ref(1);
const mapInstance = shallowRef<L.Map | null>(null);
const trackLayer = shallowRef<L.Polyline | null>(null);
const tileLayer = shallowRef<L.TileLayer | null>(null);

/** 滚轮每变化一级缩放所需像素；Leaflet 默认 60，越大单次缩放越平缓 */
const WHEEL_PX_PER_ZOOM_LEVEL = 5;
/** 允许小数缩放，避免每次滚轮跳一整级 */
const ZOOM_SNAP = 0.01;

const TRACK_STYLE: L.PolylineOptions = {
  color: "#e53935",
  weight: 5,
  opacity: 0.95,
  lineCap: "round",
  lineJoin: "round",
};

function updateMaskLayout(): void {
  const wrap = mapWrap.value;
  if (!wrap) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w < 1 || h < 1) return;
  maskW.value = w;
  maskH.value = h;
  maskGeom.value = buildMaskGeometry(config.value.mapCrop, w, h);
}

const maskHoleStyle = computed(() => {
  const m = maskGeom.value;
  if (!m || m.kind === "polygon") return undefined;
  const base: Record<string, string> = {
    left: `${m.cx}px`,
    top: `${m.cy}px`,
    transform: "translate(-50%, -50%)",
  };
  if (m.kind === "circle" && m.r) {
    return {
      ...base,
      width: `${m.r * 2}px`,
      height: `${m.r * 2}px`,
      borderRadius: "50%",
    };
  }
  if (m.kind === "rect" && m.hw && m.hh) {
    return {
      ...base,
      width: `${m.hw * 2}px`,
      height: `${m.hh * 2}px`,
    };
  }
  return undefined;
});

const polygonDimPath = computed(() => {
  if (maskGeom.value?.kind !== "polygon") return "";
  return maskEvenOddPath(config.value.mapCrop, maskW.value, maskH.value);
});

const polygonOutlinePoints = computed(() => {
  const verts = maskGeom.value?.vertices;
  if (!verts?.length) return "";
  return maskPolygonPoints(verts);
});

const trayOverlay = computed(() => {
  if (maskW.value < 1 || maskH.value < 1) return null;
  return buildTrayMaskOverlay(
    config.value.mapCrop,
    config.value.tray,
    maskW.value,
    maskH.value,
  );
});

const trayOuterStyle = computed(() => {
  const t = trayOverlay.value;
  const m = t?.outer;
  if (!m || m.kind === "polygon") return undefined;
  const base: Record<string, string> = {
    left: `${m.cx}px`,
    top: `${m.cy}px`,
    transform: "translate(-50%, -50%)",
  };
  if (m.kind === "circle" && m.r) {
    return {
      ...base,
      width: `${m.r * 2}px`,
      height: `${m.r * 2}px`,
      borderRadius: "50%",
    };
  }
  if (m.kind === "rect" && m.hw && m.hh) {
    return {
      ...base,
      width: `${m.hw * 2}px`,
      height: `${m.hh * 2}px`,
    };
  }
  return undefined;
});

const trayPolygonOutline = computed(() => {
  const t = trayOverlay.value;
  if (!t || t.outer.kind !== "polygon") return "";
  return trayOuterPolygonPoints(t);
});

function syncStoreFromMap(): void {
  const map = mapInstance.value;
  if (!map) return;
  const c = map.getCenter();
  config.value.mapCrop.mapCenterLat = c.lat;
  config.value.mapCrop.mapCenterLon = c.lng;
  config.value.mapCrop.mapZoom = map.getZoom();
  if (typeof map.getBearing === "function") {
    config.value.mapCrop.mapBearingDeg = map.getBearing();
  }
}

function updateTrackLayer(): void {
  const map = mapInstance.value;
  if (!map) return;

  if (trackLayer.value) {
    map.removeLayer(trackLayer.value);
    trackLayer.value = null;
  }

  const points = effectivePoints.value;
  if (!points.length) return;

  const latlngs = points.map((p) => L.latLng(p.lat, p.lon));
  trackLayer.value = L.polyline(latlngs, TRACK_STYLE).addTo(map);
}

let fitRetryTimer: ReturnType<typeof setTimeout> | null = null;

function fitTrackInView(attempt = 0): void {
  const map = mapInstance.value;
  const bounds = config.value.gpx.bounds;
  if (!map || !bounds || !config.value.gpx.imported) return;

  updateMaskLayout();
  map.invalidateSize({ animate: false });

  const wrap = mapWrap.value;
  const w = wrap?.clientWidth ?? 0;
  const h = wrap?.clientHeight ?? 0;
  if (w < 32 || h < 32) {
    if (attempt < 8) {
      fitRetryTimer = setTimeout(() => fitTrackInView(attempt + 1), 50);
    }
    return;
  }

  const latLngBounds = L.latLngBounds(
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon],
  );
  map.fitBounds(latLngBounds, {
    padding: maskFitPadding(config.value.mapCrop, w, h),
    maxZoom: 19,
    animate: false,
  });
  syncStoreFromMap();
  updateTrackLayer();
}

function scheduleFitTrackInView(): void {
  if (fitRetryTimer) {
    clearTimeout(fitRetryTimer);
    fitRetryTimer = null;
  }
  requestAnimationFrame(() => {
    fitTrackInView();
    requestAnimationFrame(() => fitTrackInView());
  });
}

function resetMapView(): void {
  const map = mapInstance.value;
  if (!map) return;

  if (typeof map.setBearing === "function") {
    map.setBearing(0);
    config.value.mapCrop.mapBearingDeg = 0;
  }

  if (config.value.gpx.imported && config.value.gpx.bounds) {
    scheduleFitTrackInView();
  } else {
    syncStoreFromMap();
  }
}

/** Alt/Option + 拖拽：绕视窗中心旋转地图（遮罩保持固定） */
function setupAltDragRotate(map: L.Map, container: HTMLElement): () => void {
  let rotating = false;
  let startBearing = 0;
  let startAngle = 0;
  let pivotX = 0;
  let pivotY = 0;

  const angleFromPointer = (clientX: number, clientY: number) =>
    (Math.atan2(clientY - pivotY, clientX - pivotX) * 180) / Math.PI;

  const onPointerDown = (e: PointerEvent) => {
    if (!e.altKey || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".leaflet-control")) return;

    const rect = container.getBoundingClientRect();
    pivotX = rect.left + rect.width / 2;
    pivotY = rect.top + rect.height / 2;
    startBearing = map.getBearing();
    startAngle = angleFromPointer(e.clientX, e.clientY);
    rotating = true;
    map.dragging.disable();
    container.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!rotating) return;
    const delta = angleFromPointer(e.clientX, e.clientY) - startAngle;
    map.setBearing(startBearing + delta);
  };

  const onPointerEnd = (e: PointerEvent) => {
    if (!rotating) return;
    rotating = false;
    map.dragging.enable();
    if (container.hasPointerCapture(e.pointerId)) {
      container.releasePointerCapture(e.pointerId);
    }
    syncStoreFromMap();
  };

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerEnd);
  container.addEventListener("pointercancel", onPointerEnd);

  return () => {
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerup", onPointerEnd);
    container.removeEventListener("pointercancel", onPointerEnd);
  };
}

let teardownAltRotate: (() => void) | null = null;

function initMap(): void {
  const el = mapRoot.value;
  if (!el || mapInstance.value) return;

  const { mapCenterLat, mapCenterLon, mapZoom, mapBearingDeg } =
    config.value.mapCrop;
  const map = L.map(el, {
    center: [mapCenterLat || 30, mapCenterLon || 105],
    zoom: mapZoom || 10,
    zoomControl: false,
    attributionControl: true,
    zoomSnap: ZOOM_SNAP,
    zoomDelta: ZOOM_SNAP,
    wheelPxPerZoomLevel: WHEEL_PX_PER_ZOOM_LEVEL,
    wheelDebounceTime: 60,
    rotate: true,
    bearing: mapBearingDeg ?? 0,
    touchRotate: true,
    shiftKeyRotate: true,
    rotateControl: false,
  });

  tileLayer.value = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
      maxZoom: 19,
    },
  ).addTo(map);

  map.on("moveend", syncStoreFromMap);
  map.on("zoomend", syncStoreFromMap);
  map.on("rotate", syncStoreFromMap);
  map.on("rotateend", syncStoreFromMap);

  teardownAltRotate = setupAltDragRotate(map, el);

  mapInstance.value = map;
  updateMaskLayout();
  updateTrackLayer();

  if (config.value.gpx.imported && config.value.gpx.bounds) {
    scheduleFitTrackInView();
  }
}

let resizeObserver: ResizeObserver | null = null;

let unregisterPrepareExport: (() => void) | null = null;

onMounted(() => {
  initMap();
  unregisterPrepareExport = ui.registerPrepareExportHook(syncStoreFromMap);
  const wrap = mapWrap.value;
  if (wrap) {
    resizeObserver = new ResizeObserver(() => {
      updateMaskLayout();
      mapInstance.value?.invalidateSize();
    });
    resizeObserver.observe(wrap);
  }
});

onUnmounted(() => {
  if (fitRetryTimer) clearTimeout(fitRetryTimer);
  resizeObserver?.disconnect();
  unregisterPrepareExport?.();
  unregisterPrepareExport = null;
  teardownAltRotate?.();
  teardownAltRotate = null;
  mapInstance.value?.remove();
  mapInstance.value = null;
  trackLayer.value = null;
  tileLayer.value = null;
});

watch(
  () => effectivePoints.value,
  () => updateTrackLayer(),
  { deep: true },
);

watch(
  () => config.value.gpx.imported,
  (v) => {
    if (v) scheduleFitTrackInView();
    else updateTrackLayer();
  },
);

watch(gpxMapFitNonce, () => {
  if (config.value.gpx.imported && config.value.gpx.bounds) {
    scheduleFitTrackInView();
  }
});

watch(
  () => config.value.gpx.bounds,
  (bounds) => {
    if (config.value.gpx.imported && bounds) scheduleFitTrackInView();
  },
);

watch(
  () => [
    config.value.mapCrop.shape,
    config.value.mapCrop.polygonSides,
    config.value.tray.rimWidthMm,
  ],
  () => {
    updateMaskLayout();
  },
);

watch(
  () => config.value.mapCrop.mapBearingDeg,
  (deg) => {
    const map = mapInstance.value;
    if (!map || typeof map.getBearing !== "function") return;
    const current = map.getBearing();
    if (Math.abs(current - deg) > 0.05) {
      map.setBearing(deg);
    }
  },
);

defineExpose({
  fitTrackInView: scheduleFitTrackInView,
  syncStoreFromMap,
  resetMapView,
});
</script>

<template>
  <div ref="mapWrap" class="map-wrap">
    <div ref="mapRoot" class="leaflet-map" />
    <!-- 遮罩固定于屏幕；圆形/矩形用 CSS 避免 SVG 非等比拉伸导致虚线变形 -->
    <div v-if="maskGeom" class="map-mask">
      <div v-if="maskHoleStyle" class="mask-hole" :style="maskHoleStyle" />
      <div
        v-if="trayOuterStyle"
        class="mask-tray-outline"
        :style="trayOuterStyle"
      />
      <svg
        v-else-if="polygonDimPath"
        class="map-mask__svg"
        :viewBox="`0 0 ${maskW} ${maskH}`"
      >
        <path :d="polygonDimPath" fill="rgba(0,0,0,0.45)" fill-rule="evenodd" />
        <polygon
          v-if="polygonOutlinePoints"
          :points="polygonOutlinePoints"
          fill="none"
          stroke="rgba(255,255,255,0.95)"
          stroke-width="2.5"
          stroke-dasharray="10 6"
        />
        <polygon
          v-if="trayPolygonOutline"
          :points="trayPolygonOutline"
          fill="none"
          class="mask-tray-stroke"
          stroke-width="2.5"
          stroke-dasharray="8 5"
        />
      </svg>
      <div class="mask-legend">
        <span class="mask-legend__item mask-legend__item--terrain">白框 · 山体范围</span>
        <span class="mask-legend__item mask-legend__item--tray">黄框 · 托盘外缘</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-wrap {
  position: absolute;
  inset: 0;
  isolation: isolate;
}

.leaflet-map {
  position: relative;
  z-index: 0;
  width: 100%;
  height: 100%;
  background: #1a1a2e;
}

.map-mask {
  position: absolute;
  inset: 0;
  z-index: 1000;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.mask-hole {
  position: absolute;
  box-sizing: border-box;
  border: 2.5px dashed rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  z-index: 2;
}

.mask-tray-outline {
  position: absolute;
  box-sizing: border-box;
  border: 2.5px dashed rgba(255, 193, 7, 0.95);
  pointer-events: none;
  z-index: 1;
}

:deep(.mask-tray-stroke) {
  stroke: rgba(255, 193, 7, 0.95);
}

.mask-legend {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.mask-legend__item {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.mask-legend__item--terrain::before {
  content: "";
  display: inline-block;
  width: 10px;
  height: 0;
  margin-right: 6px;
  border-top: 2px dashed rgba(255, 255, 255, 0.95);
  vertical-align: middle;
}

.mask-legend__item--tray::before {
  content: "";
  display: inline-block;
  width: 10px;
  height: 0;
  margin-right: 6px;
  border-top: 2px dashed rgba(255, 193, 7, 0.95);
  vertical-align: middle;
}

.map-mask__svg {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

:deep(.leaflet-control-attribution) {
  z-index: 1001;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 4px 0 0 0;
  margin: 0 !important;
}
</style>
