<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { useConfigStore } from "@/stores/config";
import { useGpxImport } from "@/composables/useGpxImport";
import { useTerrainGeneration } from "@/composables/useTerrainGeneration";
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

const { generating, error, mesh, trailMesh, lastResult } =
  useTerrainGeneration(viewport);

const demLabel = computed(() => {
  if (!lastResult.value) return "";
  const src =
    lastResult.value.demSource === "open-meteo" ? "Open-Meteo" : "合成";
  return `${src} · ${lastResult.value.generationMs}ms`;
});

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const el = surfaceRef.value;
  if (!el) return;
  const sync = () => {
    viewport.value = {
      w: el.clientWidth,
      h: el.clientHeight,
    };
  };
  sync();
  resizeObserver = new ResizeObserver(sync);
  resizeObserver.observe(el);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

const viewOptions: { value: PreviewMode; label: string }[] = [
  { value: "2d", label: "2D 地图视图" },
  { value: "3d", label: "3D 模型预览" },
];

const show2dMap = computed(() => previewMode.value === "2d");

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
      setTimeout(() => mapRef.value?.fitTrackInView(), 100);
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
        :mesh="mesh"
        :trail-mesh="trailMesh"
        :generating="generating"
        :error="error"
        :dem-label="mesh ? demLabel : undefined"
      />

      <div
        v-if="
          (show2dMap && !config.gpx.imported) ||
          (previewMode === '3d' && !mesh && !generating && !error)
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
                ? "调整左侧地形参数后将自动生成 3D 预览"
                : "拖动 GPX 到此处 · 或点击左侧「导入 GPX」"
          }}
        </p>
      </div>

      <div
        v-if="show2dMap && config.gpx.imported"
        class="preview__hint-bar"
      >
        <span
          >拖动平移 · 滚轮缩放 · Option/Alt+拖动或 Shift+滚轮旋转 ·
          白框为固定构图范围</span
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
