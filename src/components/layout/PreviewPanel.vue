<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from "vue";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { useConfigStore } from "@/stores/config";
import { useGpxImport } from "@/composables/useGpxImport";
import { useTerrainGeneration } from "@/composables/useTerrainGeneration";
import MapLeafletView from "@/components/map/MapLeafletView.vue";
import TerrainPreviewModal from "@/components/preview/TerrainPreviewModal.vue";

const ui = useUiStore();
const configStore = useConfigStore();
const { config } = storeToRefs(configStore);
const { importing, importFromFile } = useGpxImport();

const dragOver = ref(false);
const mapRef = ref<InstanceType<typeof MapLeafletView> | null>(null);
const surfaceRef = ref<HTMLElement | null>(null);
const viewport = ref({ w: 800, h: 600 });

const terrainPreviewOpen = ref(false);
const modalViewport = ref({ w: 960, h: 640 });

function syncViewportToStore(): void {
  ui.previewViewport = { ...viewport.value };
}

const terrainGen = useTerrainGeneration(modalViewport, {
  enabled: terrainPreviewOpen,
});

const { regenerate: regenerateTerrain } = terrainGen;
const terrainResult = toRef(terrainGen, "lastResult");
const terrainGenerating = toRef(terrainGen, "generating");
const terrainError = toRef(terrainGen, "error");

let resizeObserver: ResizeObserver | null = null;

function syncPreviewViewport(): void {
  const el = surfaceRef.value;
  if (!el) return;
  viewport.value = {
    w: el.clientWidth,
    h: el.clientHeight,
  };
  syncViewportToStore();
}

let unregisterPrepareExport: (() => void) | null = null;

onMounted(() => {
  const el = surfaceRef.value;
  if (!el) return;
  syncPreviewViewport();
  resizeObserver = new ResizeObserver(syncPreviewViewport);
  resizeObserver.observe(el);
  unregisterPrepareExport = ui.registerPrepareExportHook(syncPreviewViewport);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  unregisterPrepareExport?.();
  unregisterPrepareExport = null;
});

function scheduleMapFit(): void {
  requestAnimationFrame(() => {
    mapRef.value?.fitTrackInView();
    setTimeout(() => mapRef.value?.fitTrackInView(), 120);
  });
}

watch(
  () => ui.gpxMapFitNonce,
  async () => {
    if (!config.value.gpx.imported) return;
    await nextTick();
    scheduleMapFit();
  },
);

function resetMapView(): void {
  mapRef.value?.resetMapView();
}

async function openTerrainPreview(): Promise<void> {
  if (!config.value.gpx.imported) {
    ui.statusMessage = "请先导入 GPX 轨迹文件";
    return;
  }
  ui.runPrepareExport();
  terrainPreviewOpen.value = true;
}

function onTerrainModalOpened(): void {
  void regenerateTerrain();
}

async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    const ok = await importFromFile(file);
    if (ok) {
      await nextTick();
      scheduleMapFit();
    }
  }
}

function onDragOver(e: DragEvent): void {
  e.preventDefault();
  dragOver.value = true;
}

function onDragLeave(): void {
  dragOver.value = false;
}

const canOpen3d = computed(() => config.value.gpx.imported);
</script>

<template>
  <section
    class="preview"
    :class="{ 'preview--drag': dragOver }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div ref="surfaceRef" class="preview__surface">
      <MapLeafletView ref="mapRef" />

      <div v-if="!config.gpx.imported" class="preview__placeholder">
        <svg
          class="preview__icon"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
          <path d="M8 2v16" />
          <path d="M16 6v16" />
        </svg>
        <p class="preview__title">
          {{ dragOver ? "松开以导入 GPX" : "导入 GPX 显示卫星地图与轨迹" }}
        </p>
        <p class="preview__hint">
          {{
            importing
              ? "正在解析轨迹…"
              : "拖动 GPX 到此处 · 或点击左侧「导入 GPX」"
          }}
        </p>
      </div>

      <div v-if="config.gpx.imported" class="preview__hint-bar">
        <span
          >拖动平移 · 滚轮缩放 · 白框=山体 · 黄框=托盘外缘 ·
          刻字显示在黄框边带上 · 右上角可重置视图或打开 3D 预览</span
        >
      </div>

      <div v-if="config.gpx.imported" class="preview__top-actions">
        <button
          type="button"
          class="preview__reset-btn"
          aria-label="重置地图位置"
          title="重置地图位置"
          @click="resetMapView"
        >
          <svg
            class="preview__reset-btn-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
        <button
          type="button"
          class="preview__3d-btn"
          :disabled="!canOpen3d"
          title="预览 3D 山体模型"
          @click="openTerrainPreview"
        >
          <svg
            class="preview__3d-btn-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 3L2 9l10 6 10-6-10-6z"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linejoin="round"
            />
            <path
              d="M2 15l10 6 10-6M2 11l10 6 10-6"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linejoin="round"
            />
          </svg>
          3D 预览
        </button>
      </div>

      <div v-if="dragOver" class="preview__drop-overlay" />
    </div>

    <TerrainPreviewModal
      v-model="terrainPreviewOpen"
      v-model:viewport="modalViewport"
      :result="terrainResult"
      :generating="terrainGenerating"
      :error="terrainError"
      @opened="onTerrainModalOpened"
    />
  </section>
</template>

<style scoped>
.preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  border-radius: var(--tp-radius-panel);
  border: 1px solid var(--tp-border);
  box-shadow: var(--tp-shadow-panel);
  overflow: hidden;
}

.preview--drag {
  border-color: var(--tp-text-accent);
}

.preview__surface {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  background: #1a1a2e;
}

.preview__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
  z-index: 1;
}

.preview__icon {
  color: rgba(255, 255, 255, 0.5);
}

.preview__title {
  margin: 0;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.85);
}

.preview__hint {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  text-align: center;
  max-width: 320px;
}

.preview__hint-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  font-size: 12px;
  color: var(--tp-text-secondary);
  z-index: 4;
  pointer-events: none;
  white-space: nowrap;
  max-width: 90%;
  text-align: center;
}

.preview__top-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview__reset-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  color: var(--tp-text-primary);
  cursor: pointer;
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

.preview__reset-btn:hover {
  background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
}

.preview__reset-btn-icon {
  flex-shrink: 0;
}

.preview__3d-btn {
  position: static;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-primary);
  cursor: pointer;
  transition:
    background 0.15s,
    box-shadow 0.15s,
    opacity 0.15s;
}

.preview__3d-btn:hover:not(:disabled) {
  background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
}

.preview__3d-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preview__3d-btn-icon {
  flex-shrink: 0;
  color: var(--tp-text-accent);
}

.preview__drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 122, 255, 0.2);
  border: 2px dashed var(--tp-text-accent);
  border-radius: inherit;
  z-index: 6;
  pointer-events: none;
}
</style>
