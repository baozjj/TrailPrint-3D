<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from "vue";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { useConfigStore } from "@/stores/config";
import { useGpxImport } from "@/composables/useGpxImport";
import { useTerrainGeneration } from "@/composables/useTerrainGeneration";
import { useTrayGeneration } from "@/composables/useTrayGeneration";
import type { PreviewMode } from "@/stores/ui";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import MapLeafletView from "@/components/map/MapLeafletView.vue";
import TerrainMeshPreview from "@/components/preview/TerrainMeshPreview.vue";

const ui = useUiStore();
const configStore = useConfigStore();
const { previewMode } = storeToRefs(ui);
const { config } = storeToRefs(configStore);
const { importing, importFromFile } = useGpxImport();

const dragOver = ref(false);
const mapRef = ref<InstanceType<typeof MapLeafletView> | null>(null);
const surfaceRef = ref<HTMLElement | null>(null);
const viewport = ref({ w: 800, h: 600 });

function syncViewportToStore(): void {
  ui.previewViewport = { ...viewport.value };
}

const terrainGen = useTerrainGeneration(viewport);
const trayGen = useTrayGeneration();

const generating = computed(() =>
  previewMode.value === "3d"
    ? terrainGen.generating.value
    : terrainGen.generating.value || trayGen.generating.value,
);
const previewError = computed(() =>
  previewMode.value === "3d"
    ? terrainGen.error.value
    : terrainGen.error.value || trayGen.error.value,
);
const { regenerate: regenerateTerrain } = terrainGen;
const { regenerate: regenerateTray } = trayGen;

/** 顶层 Ref，模板才能自动解包 */
const terrainResult = toRef(terrainGen, "lastResult");

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

const viewOptions: { value: PreviewMode; label: string }[] = [
  { value: "2d", label: "2D 地图视图" },
  { value: "3d", label: "3D 模型预览" },
];

const show2dMap = computed(() => previewMode.value === "2d");

function scheduleMapFit(): void {
  requestAnimationFrame(() => {
    mapRef.value?.fitTrackInView();
    setTimeout(() => mapRef.value?.fitTrackInView(), 120);
  });
}

watch(show2dMap, async (show) => {
  if (!show) return;
  syncPreviewViewport();
  await nextTick();
  syncPreviewViewport();
  if (config.value.gpx.imported) scheduleMapFit();
});

watch(
  () => ui.gpxMapFitNonce,
  async () => {
    if (!show2dMap.value || !config.value.gpx.imported) return;
    await nextTick();
    scheduleMapFit();
  },
);

watch(previewMode, async (mode) => {
  if (mode !== "3d") return;
  syncPreviewViewport();
  await nextTick();
  syncPreviewViewport();
  void regenerateTerrain();
});

function onDragOver(e: DragEvent): void {
  e.preventDefault();
  dragOver.value = true;
}

function onDragLeave(): void {
  dragOver.value = false;
}

async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    const ok = await importFromFile(file);
    if (ok) {
      previewMode.value = "2d";
      await nextTick();
      scheduleMapFit();
    }
  }
}
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
      <MapLeafletView v-if="show2dMap" ref="mapRef" />

      <TerrainMeshPreview
        v-if="previewMode === '3d'"
        class="preview__terrain-3d"
        :result="terrainResult"
        :generating="generating"
        :error="previewError"
      />

      <div
        v-if="
          (show2dMap && !config.gpx.imported) ||
          (previewMode === '3d' &&
            !terrainResult &&
            !generating &&
            !previewError)
        "
        class="preview__placeholder"
      >
        <svg
          v-if="show2dMap && !config.gpx.imported"
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
          {{
            dragOver
              ? "松开以导入 GPX"
              : previewMode === "3d"
                ? "3D 模型预览"
                : "导入 GPX 显示卫星地图与轨迹"
          }}
        </p>
        <p class="preview__hint">
          {{
            importing
              ? "正在解析轨迹…"
              : previewMode === "3d"
                ? "将显示 2D 白框内的山体 3D 模型（不含托盘底座）"
                : "拖动 GPX 到此处 · 或点击左侧「导入 GPX」"
          }}
        </p>
      </div>

      <div v-if="show2dMap && config.gpx.imported" class="preview__hint-bar">
        <span
          >拖动平移 · 滚轮缩放 · 白框=山体 · 黄框=托盘外缘 ·
          刻字显示在黄框边带上 · 3D 视图可看立体效果</span
        >
      </div>

      <div class="preview__topbar">
        <SegmentedControl
          v-model="previewMode"
          :options="viewOptions"
          dark-active
        />
      </div>

      <div v-if="dragOver" class="preview__drop-overlay" />
    </div>
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

.preview__terrain-3d {
  position: absolute;
  inset: 0;
  z-index: 2;
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

.preview__topbar {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: min(400px, calc(100% - 48px));
  padding: 4px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 5;
  pointer-events: auto;
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
