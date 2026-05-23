<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useTrailPoints } from "@/composables/useTrailPoints";
import { buildMaskGeometry, traceMaskPath } from "@/utils/map-mask-geometry";
import {
  metersPerPixel,
  projectPoint,
  zoomToFitBounds,
} from "@/utils/map-projection";

const configStore = useConfigStore();
const { config } = storeToRefs(configStore);
const { effectivePoints } = useTrailPoints();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const dragging = ref(false);
const lastPointer = ref<{ x: number; y: number } | null>(null);

const hasTrack = computed(
  () => config.value.gpx.imported && effectivePoints.value.length > 0,
);

function fitTrackInView(): void {
  const bounds = config.value.gpx.bounds;
  const canvas = canvasRef.value;
  if (!bounds || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  config.value.mapCrop.mapCenterLat = (bounds.minLat + bounds.maxLat) / 2;
  config.value.mapCrop.mapCenterLon = (bounds.minLon + bounds.maxLon) / 2;
  config.value.mapCrop.mapZoom = zoomToFitBounds(
    bounds,
    rect.width,
    rect.height,
  );
  draw();
}

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  const { mapCenterLat, mapCenterLon, mapZoom } = config.value.mapCrop;

  drawTerrainBackground(ctx, w, h);
  drawGrid(ctx, w, h);

  if (hasTrack.value) {
    drawCropMask(ctx, w, h);
    drawTrack(ctx, w, h, mapCenterLat, mapCenterLon, mapZoom);
  }
}

function drawTerrainBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#e8f4fc");
  g.addColorStop(0.5, "#d4e8d4");
  g.addColorStop(1, "#c8dcc8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;
  const step = 48;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  centerLat: number,
  centerLon: number,
  zoom: number,
): void {
  const points = effectivePoints.value;
  const center = { lat: centerLat, lon: centerLon };
  const screen = points.map((p) => projectPoint(p, center, zoom, w, h));

  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#007aff";
  ctx.shadowColor = "rgba(0,122,255,0.35)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  screen.forEach((s, i) => {
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  const start = screen[0];
  const end = screen[screen.length - 1];
  for (const pt of [start, end]) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#007aff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** 遮罩固定在屏幕中心，仅随形状/长宽比/边数变化，与 mm 打印尺寸无关 */
function drawCropMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const mask = buildMaskGeometry(config.value.mapCrop, w, h);

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.beginPath();
  traceMaskPath(ctx, mask);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  traceMaskPath(ctx, mask);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function onWheel(e: WheelEvent): void {
  if (!hasTrack.value) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.4 : 0.4;
  config.value.mapCrop.mapZoom = Math.min(
    18,
    Math.max(6, config.value.mapCrop.mapZoom + delta),
  );
  draw();
}

function onPointerDown(e: PointerEvent): void {
  if (!hasTrack.value) return;
  dragging.value = true;
  lastPointer.value = { x: e.clientX, y: e.clientY };
  (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value || !lastPointer.value) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dx = e.clientX - lastPointer.value.x;
  const dy = e.clientY - lastPointer.value.y;
  lastPointer.value = { x: e.clientX, y: e.clientY };

  const { mapCenterLat, mapCenterLon, mapZoom } = config.value.mapCrop;
  const mpp = metersPerPixel(mapCenterLat, mapZoom);
  config.value.mapCrop.mapCenterLon -=
    (dx * mpp) / (111320 * Math.cos(mapCenterLat * (Math.PI / 180)));
  config.value.mapCrop.mapCenterLat += (dy * mpp) / 110540;
  draw();
}

function onPointerUp(e: PointerEvent): void {
  dragging.value = false;
  lastPointer.value = null;
  (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  resizeObserver = new ResizeObserver(() => draw());
  resizeObserver.observe(canvas);
  if (hasTrack.value) fitTrackInView();
  else draw();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

watch(
  () => [
    effectivePoints.value.length,
    config.value.mapCrop.shape,
    config.value.mapCrop.lengthMm,
    config.value.mapCrop.widthMm,
    config.value.mapCrop.polygonSides,
    config.value.trail.gpxSimplify,
    config.value.mapCrop.mapCenterLat,
    config.value.mapCrop.mapCenterLon,
    config.value.mapCrop.mapZoom,
  ],
  () => {
    draw();
  },
);

watch(
  () => config.value.gpx.imported,
  (imported) => {
    if (imported) {
      requestAnimationFrame(() => fitTrackInView());
    } else {
      draw();
    }
  },
);

defineExpose({ fitTrackInView, redraw: draw });
</script>

<template>
  <canvas
    ref="canvasRef"
    class="map-canvas"
    :class="{ 'map-canvas--dragging': dragging }"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  />
</template>

<style scoped>
.map-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  touch-action: none;
  z-index: 0;
}

.map-canvas--dragging {
  cursor: grabbing;
}
</style>
