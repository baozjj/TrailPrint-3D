<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import TerrainMeshPreview from "@/components/preview/TerrainMeshPreview.vue";
import { useSpraySegmentation } from "@/composables/useSpraySegmentation";
import { useSprayMaskPreview } from "@/composables/useSprayMaskPreview";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";
import type {
  TerrainGenerateProgress,
  TerrainGenerateResponse,
  TerrainSceneProgress,
} from "@shared/types/terrain";
import type { SprayMaskViewMode } from "@shared/types/spray-paint";
import type { TrayMeshPayload } from "@shared/types/tray";

const PREVIEW_STEPS = [
  { key: "prepare", label: "准备参数" },
  { key: "crop", label: "计算裁剪范围" },
  { key: "dem", label: "获取高程数据" },
  { key: "process", label: "处理地形" },
  { key: "trail", label: "计算轨迹" },
  { key: "scene", label: "构建 3D 场景" },
] as const;

type PreviewStepKey = (typeof PREVIEW_STEPS)[number]["key"];

function terrainPhaseToStep(
  phase: TerrainGenerateProgress["phase"] | undefined,
): PreviewStepKey {
  switch (phase) {
    case "prepare":
      return "prepare";
    case "crop":
      return "crop";
    case "dem":
      return "dem";
    case "process":
      return "process";
    case "trail":
    case "mesh":
      return "trail";
    case "done":
      return "scene";
    default:
      return "prepare";
  }
}

const open = defineModel<boolean>({ required: true });
const viewport = defineModel<{ w: number; h: number }>("viewport", {
  required: true,
});

const props = defineProps<{
  result: TerrainGenerateResponse | null;
  trayMesh: TrayMeshPayload | null;
  generating: boolean;
  terrainProgress: TerrainGenerateProgress | null;
  downloading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  opened: [];
  download: [];
}>();

const configStore = useConfigStore();
const ui = useUiStore();
const { config } = storeToRefs(configStore);

const sprayPanelOpen = ref(true);
const {
  plan: sprayPlan,
  masks: sprayMasks,
  maskWarnings,
  segmenting,
  generatingMasks,
  progress: sprayProgress,
  error: sprayError,
  maskError,
  runSegmentation,
  runMaskGeneration,
  updateColorHex,
  paintMode,
  paintRegionId,
  paintBrushRadius,
  selectPaintBrush,
  setPaintMode,
  startManualPaint,
  addColorSlot,
  removeColorSlot,
  resetPlan,
  SPRAY_COLOR_COUNT_MAX,
  SPRAY_COLOR_COUNT_MIN,
} = useSpraySegmentation();

const previewRef = ref<InstanceType<typeof TerrainMeshPreview> | null>(null);

const {
  uiState: sprayUiState,
  activeMaskIndex,
  selectColorSlot,
  toggleFitMask,
  setViewMode,
  hideAllMasks,
  showAllMasksToggle,
  reset: resetMaskPreview,
  onMasksGenerated,
} = useSprayMaskPreview();

const MASK_VIEW_MODES: { value: SprayMaskViewMode; label: string }[] = [
  { value: "terrain-colors", label: "山体分色" },
  { value: "terrain-plus-mask", label: "山体+罩" },
  { value: "mask-only", label: "仅罩" },
];

const sprayEnabled = computed(() => config.value.sprayPaint.enabled);

const canSegment = computed(
  () =>
    !props.generating &&
    !segmenting.value &&
    !generatingMasks.value &&
    props.result?.heightPreview != null &&
    !props.error,
);

const canGenerateMasks = computed(
  () =>
    canSegment.value &&
    sprayPlan.value != null &&
    !generatingMasks.value,
);

const sprayStatusMessage = computed(() => {
  if (segmenting.value) {
    return sprayProgress.value?.message ?? "正在分色…";
  }
  if (generatingMasks.value) {
    return sprayProgress.value?.message ?? "正在生成遮挡罩…";
  }
  if (sprayError.value) return sprayError.value;
  if (maskError.value) return maskError.value;
  if (sprayPlan.value?.warning) return sprayPlan.value.warning;
  if (sprayMasks.value.length > 0) return "遮挡罩已生成，点击列表项套合预览";
  if (sprayPlan.value) {
    if (paintMode.value) return "涂色模式：在 3D 山体上按住拖动涂抹";
    return "可手涂分色，或规则分色后生成遮挡罩";
  }
  return "点击「手涂分色」或「规则分色」开始";
});

const colorCount = computed(() => config.value.sprayPaint.colorCount);

const canAddColor = computed(
  () => colorCount.value < SPRAY_COLOR_COUNT_MAX && Boolean(sprayPlan.value),
);

const canRemoveColor = computed(
  () => colorCount.value > SPRAY_COLOR_COUNT_MIN && Boolean(sprayPlan.value),
);

function onSelectColorSlot(slot: { index: number; regionId: number }): void {
  selectPaintBrush(slot.regionId);
}

const colorInputRefs = new Map<number, HTMLInputElement>();

function setColorInputRef(regionId: number, el: unknown): void {
  if (el instanceof HTMLInputElement) {
    colorInputRefs.set(regionId, el);
  } else {
    colorInputRefs.delete(regionId);
  }
}

function openColorPicker(regionId: number): void {
  colorInputRefs.get(regionId)?.click();
}

function onStartManualPaint(): void {
  if (!props.result) return;
  config.value.sprayPaint.enabled = true;
  resetMaskPreview();
  hideAllMasks();
  if (!startManualPaint(config.value, props.result, 0)) return;
  void nextTick(() => previewRef.value?.refreshSprayColors());
}

async function onRunSegmentation(): Promise<void> {
  if (!props.result) return;
  config.value.sprayPaint.enabled = true;
  resetMaskPreview();
  setPaintMode(false);
  await runSegmentation(
    configStore.toSnapshot(),
    props.result,
    ui.previewViewport.w,
    ui.previewViewport.h,
  );
}

async function onGenerateMasks(): Promise<void> {
  if (!props.result) return;
  const res = await runMaskGeneration(configStore.toSnapshot(), props.result);
  if (!res) return;
  onMasksGenerated(res.masks);
}

function onSprayToggle(enabled: boolean): void {
  config.value.sprayPaint.enabled = enabled;
  if (!enabled) {
    resetPlan();
    resetMaskPreview();
  }
}

watch(
  () => props.result?.generationMs,
  () => {
    resetPlan();
    resetMaskPreview();
  },
);

const canDownload = computed(
  () =>
    !props.generating &&
    !props.downloading &&
    !sceneLoading.value &&
    props.result != null &&
    !props.error,
);

const bodyRef = ref<HTMLDivElement | null>(null);
const sceneLoading = ref(false);
const sceneProgress = ref<TerrainSceneProgress | null>(null);

const showLoadingOverlay = computed(
  () => props.generating || sceneLoading.value,
);

const activeStepKey = computed<PreviewStepKey>(() => {
  if (sceneLoading.value) return "scene";
  if (props.generating) return terrainPhaseToStep(props.terrainProgress?.phase);
  return "prepare";
});

const activeStepIndex = computed(() =>
  PREVIEW_STEPS.findIndex((step) => step.key === activeStepKey.value),
);

function stepStatus(index: number): "done" | "active" | "pending" {
  if (index < activeStepIndex.value) return "done";
  if (index === activeStepIndex.value) return "active";
  return "pending";
}

const loadingPercent = computed(() => {
  if (sceneLoading.value) {
    const p = sceneProgress.value?.progress ?? 0.2;
    return Math.min(100, Math.round(88 + p * 12));
  }
  if (props.generating) {
    const p = props.terrainProgress?.progress ?? 0.05;
    return Math.min(88, Math.max(4, Math.round(p * 88)));
  }
  return 0;
});

const loadingTitle = computed(() =>
  props.generating ? "正在生成 3D 模型" : "正在加载 3D 预览",
);

const loadingHint = computed(() => {
  if (sceneLoading.value) {
    return sceneProgress.value?.message ?? "正在构建 3D 场景…";
  }
  if (props.generating) {
    return props.terrainProgress?.message ?? "正在连接主进程…";
  }
  return "请稍候…";
});

function onSceneLoadingChange(loading: boolean): void {
  sceneLoading.value = loading;
  if (!loading) sceneProgress.value = null;
}

function onSceneProgress(progress: TerrainSceneProgress): void {
  sceneProgress.value = progress;
}

let resizeObserver: ResizeObserver | null = null;

function syncViewport(): void {
  const el = bodyRef.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w >= 64 && h >= 64) {
    viewport.value = { w, h };
  }
}

watch(open, async (isOpen) => {
  if (!isOpen) {
    sceneLoading.value = false;
    sceneProgress.value = null;
    return;
  }
  await Promise.resolve();
  syncViewport();
  emit("opened");
});

onMounted(() => {
  resizeObserver = new ResizeObserver(syncViewport);
});

watch(bodyRef, (el, prev) => {
  if (prev) resizeObserver?.unobserve(prev);
  if (el) resizeObserver?.observe(el);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && open.value) open.value = false;
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

</script>

<template>
  <Teleport to="body">
    <Transition name="terrain-modal">
      <div
        v-if="open"
        class="terrain-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terrain-modal-title"
        @click.self="open = false"
      >
        <div class="terrain-modal__panel">
          <header class="terrain-modal__header">
            <h2 id="terrain-modal-title" class="terrain-modal__title">
              3D 模型预览
            </h2>
            <div class="terrain-modal__actions">
              <button
                type="button"
                class="terrain-modal__spray-toggle"
                :class="{ 'terrain-modal__spray-toggle--active': sprayPanelOpen }"
                aria-label="喷漆分色面板"
                title="喷漆分色"
                @click="sprayPanelOpen = !sprayPanelOpen"
              >
                喷漆分色
              </button>
              <button
                type="button"
                class="terrain-modal__download"
                :disabled="!canDownload"
                @click="emit('download')"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <polyline
                    points="7 10 12 15 17 10"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <line
                    x1="12"
                    y1="15"
                    x2="12"
                    y2="3"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
                {{ downloading ? "生成中…" : "下载" }}
              </button>
              <button
                type="button"
                class="terrain-modal__close"
                aria-label="关闭"
                @click="open = false"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>

          <div ref="bodyRef" class="terrain-modal__body">
            <div class="terrain-modal__main">
              <div v-if="showLoadingOverlay" class="terrain-modal__loading">
              <div class="terrain-modal__spinner" aria-hidden="true" />
              <p class="terrain-modal__loading-title">{{ loadingTitle }}</p>
              <p class="terrain-modal__loading-hint">{{ loadingHint }}</p>
              <div class="terrain-modal__progress" aria-hidden="true">
                <div
                  class="terrain-modal__progress-bar"
                  :style="{ width: `${loadingPercent}%` }"
                />
              </div>
              <p class="terrain-modal__progress-text">{{ loadingPercent }}%</p>
              <ol class="terrain-modal__steps">
                <li
                  v-for="(step, index) in PREVIEW_STEPS"
                  :key="step.key"
                  class="terrain-modal__step"
                  :class="`terrain-modal__step--${stepStatus(index)}`"
                >
                  <span class="terrain-modal__step-index">{{ index + 1 }}</span>
                  <span class="terrain-modal__step-label">{{ step.label }}</span>
                </li>
              </ol>
            </div>

            <div v-else-if="error" class="terrain-modal__error">
              <svg
                class="terrain-modal__error-icon"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <path
                  d="M12 8v5M12 16h.01"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <p class="terrain-modal__error-title">3D 模型生成失败</p>
              <p class="terrain-modal__error-message">{{ error }}</p>
            </div>

            <TerrainMeshPreview
              ref="previewRef"
              class="terrain-modal__preview"
              :class="{
                'terrain-modal__preview--hidden':
                  showLoadingOverlay || Boolean(error),
              }"
              :result="result"
              :tray-mesh="trayMesh"
              :generating="generating"
              :error="error"
              :spray-enabled="sprayEnabled && sprayPlan != null"
              :spray-plan="sprayPlan"
              :spray-masks="sprayMasks"
              :spray-ui-state="sprayUiState"
              :spray-paint-mode="paintMode"
              :spray-paint-region-id="paintRegionId"
              overlay-loading
              @scene-loading-change="onSceneLoadingChange"
              @scene-progress="onSceneProgress"
            />
            </div>

            <aside
              v-if="sprayPanelOpen"
              class="terrain-modal__spray-panel"
              aria-label="喷漆分色"
            >
              <div class="spray-panel__section">
                <label class="spray-panel__toggle">
                  <input
                    type="checkbox"
                    :checked="sprayEnabled"
                    @change="
                      onSprayToggle(
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  <span>启用喷漆分色</span>
                </label>
              </div>

              <div class="spray-panel__section spray-panel__actions">
                <button
                  type="button"
                  class="spray-panel__btn spray-panel__btn--primary"
                  :disabled="!canSegment"
                  @click="onStartManualPaint"
                >
                  手涂分色
                </button>
                <button
                  type="button"
                  class="spray-panel__btn"
                  :disabled="!canSegment"
                  @click="onRunSegmentation"
                >
                  {{ segmenting ? "分色中…" : "规则分色（离线）" }}
                </button>
                <button
                  type="button"
                  class="spray-panel__btn"
                  :disabled="!canSegment || !sprayPlan"
                  @click="onRunSegmentation"
                >
                  重新分区
                </button>
                <button
                  type="button"
                  class="spray-panel__btn spray-panel__btn--primary"
                  :disabled="!canGenerateMasks"
                  @click="onGenerateMasks"
                >
                  {{ generatingMasks ? "生成中…" : "生成遮挡罩" }}
                </button>
              </div>

              <p
                class="spray-panel__status"
                :class="{
                  'spray-panel__status--err': Boolean(sprayError || maskError),
                }"
              >
                {{ sprayStatusMessage }}
              </p>

              <div
                v-if="maskWarnings.length"
                class="spray-panel__warnings"
                role="status"
              >
                <p
                  v-for="(warn, i) in maskWarnings"
                  :key="i"
                  class="spray-panel__warning-item"
                >
                  {{ warn }}
                </p>
              </div>

              <div v-if="sprayPlan" class="spray-panel__colors">
                <div class="spray-panel__colors-header">
                  <p class="spray-panel__colors-title">
                    色板（{{ sprayPlan.colors.length }} 色）
                  </p>
                  <div class="spray-panel__color-actions">
                    <button
                      type="button"
                      class="spray-panel__icon-btn"
                      :disabled="!canRemoveColor || !sprayEnabled"
                      title="减少颜色"
                      @click="removeColorSlot(config)"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      class="spray-panel__icon-btn"
                      :disabled="!canAddColor || !sprayEnabled"
                      title="添加颜色"
                      @click="addColorSlot(config)"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div class="spray-panel__paint-toolbar">
                  <button
                    type="button"
                    class="spray-panel__btn spray-panel__btn--toggle"
                    :class="{ 'spray-panel__btn--toggle-active': paintMode }"
                    :disabled="!sprayEnabled"
                    @click="setPaintMode(!paintMode)"
                  >
                    {{ paintMode ? "涂色中…" : "涂抹工具" }}
                  </button>
                  <label v-if="paintMode" class="spray-panel__brush">
                    <span>笔刷</span>
                    <input
                      v-model.number="paintBrushRadius"
                      type="range"
                      min="1"
                      max="8"
                      step="1"
                    />
                    <span>{{ paintBrushRadius }}</span>
                  </label>
                </div>

                <p v-if="paintMode" class="spray-panel__paint-hint">
                  选中色块后在 3D 山体上按住拖动涂抹；双击色块可改色
                </p>
                <div class="spray-panel__swatches">
                  <button
                    v-for="slot in sprayPlan.colors"
                    :key="slot.regionId"
                    type="button"
                    class="spray-panel__swatch"
                    :class="{
                      'spray-panel__swatch--active':
                        paintRegionId === slot.regionId && paintMode,
                    }"
                    :style="{ backgroundColor: slot.hex }"
                    :disabled="!sprayEnabled"
                    :title="`颜色 ${String(slot.index).padStart(2, '0')} · 双击改色`"
                    @click="onSelectColorSlot(slot)"
                    @dblclick.prevent="openColorPicker(slot.regionId)"
                  >
                    <input
                      :ref="(el) => setColorInputRef(slot.regionId, el)"
                      type="color"
                      class="spray-panel__swatch-input"
                      :value="slot.hex"
                      :disabled="!sprayEnabled"
                      tabindex="-1"
                      @click.stop
                      @input="
                        updateColorHex(
                          slot.regionId,
                          ($event.target as HTMLInputElement).value,
                        )
                      "
                    />
                  </button>
                </div>
              </div>

              <div v-if="sprayMasks.length" class="spray-panel__masks">
                <div class="spray-panel__masks-header">
                  <p class="spray-panel__colors-title">遮挡罩套合</p>
                  <div class="spray-panel__masks-actions">
                    <button
                      type="button"
                      class="spray-panel__link-btn"
                      @click="showAllMasksToggle"
                    >
                      显示全部
                    </button>
                    <button
                      type="button"
                      class="spray-panel__link-btn"
                      @click="hideAllMasks"
                    >
                      隐藏全部
                    </button>
                  </div>
                </div>

                <div
                  class="spray-panel__view-modes"
                  role="tablist"
                  aria-label="预览视图模式"
                >
                  <button
                    v-for="mode in MASK_VIEW_MODES"
                    :key="mode.value"
                    type="button"
                    role="tab"
                    class="spray-panel__view-mode"
                    :class="{
                      'spray-panel__view-mode--active':
                        sprayUiState.viewMode === mode.value,
                    }"
                    :aria-selected="sprayUiState.viewMode === mode.value"
                    @click="setViewMode(mode.value)"
                  >
                    {{ mode.label }}
                  </button>
                </div>

                <button
                  v-for="mask in sprayMasks"
                  :key="mask.fileName"
                  type="button"
                  class="spray-panel__mask-row"
                  :class="{
                    'spray-panel__mask-row--active':
                      activeMaskIndex === mask.colorIndex,
                    'spray-panel__mask-row--fit':
                      sprayUiState.fitMaskIndex === mask.colorIndex,
                  }"
                  @click="toggleFitMask(mask.colorIndex)"
                >
                  <span class="spray-panel__mask-fit-dot" aria-hidden="true" />
                  <span class="spray-panel__mask-name">{{ mask.fileName }}</span>
                  <span
                    v-if="sprayUiState.fitMaskIndex === mask.colorIndex"
                    class="spray-panel__mask-badge"
                  >
                    套合中
                  </span>
                </button>
              </div>

              <p
                v-else-if="sprayPlan && !generatingMasks"
                class="spray-panel__empty"
              >
                生成遮挡罩后，可套合检查：本区开窗漏出，其他区遮挡（每次只用一块罩喷漆）
              </p>
            </aside>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.terrain-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.terrain-modal__panel {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  height: min(720px, calc(100vh - 48px));
  border-radius: var(--tp-radius-panel);
  background: #1a1c2e;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.terrain-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid var(--tp-border-strong);
}

.terrain-modal__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--tp-text-primary);
}

.terrain-modal__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.terrain-modal__spray-toggle {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--tp-border-strong);
  border-radius: 8px;
  background: #fff;
  color: var(--tp-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.terrain-modal__spray-toggle--active {
  border-color: var(--tp-text-accent);
  color: var(--tp-text-accent);
  background: rgba(0, 122, 255, 0.06);
}

.terrain-modal__download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: var(--tp-cta);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.terrain-modal__download:hover:not(:disabled) {
  opacity: 0.92;
}

.terrain-modal__download:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.terrain-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--tp-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.terrain-modal__close:hover {
  background: var(--tp-bg-input);
  color: var(--tp-text-primary);
}

.terrain-modal__body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  min-width: 0;
}

.terrain-modal__main {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.terrain-modal__spray-panel {
  flex-shrink: 0;
  width: 280px;
  padding: 14px 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.96);
  overflow-y: auto;
}

.spray-panel__section {
  margin-bottom: 12px;
}

.spray-panel__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--tp-text-primary);
  cursor: pointer;
}

.spray-panel__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spray-panel__btn {
  height: 34px;
  border: 1px solid var(--tp-border-strong);
  border-radius: 8px;
  background: #fff;
  color: var(--tp-text-primary);
  font-size: 13px;
  cursor: pointer;
}

.spray-panel__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spray-panel__btn--primary {
  border: none;
  background: var(--tp-cta);
  color: #fff;
  font-weight: 600;
}

.spray-panel__status {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tp-text-secondary);
}

.spray-panel__status--err {
  color: #c62828;
}

.spray-panel__colors-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tp-text-secondary);
}

.spray-panel__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.spray-panel__swatch {
  position: relative;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 2px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
}

.spray-panel__swatch:hover:not(:disabled) {
  transform: scale(1.05);
}

.spray-panel__swatch--active {
  border-color: var(--tp-text-accent);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.28);
}

.spray-panel__swatch:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spray-panel__swatch-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.spray-panel__paint-hint {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--tp-text-accent);
}

.spray-panel__colors-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.spray-panel__colors-header .spray-panel__colors-title {
  margin: 0;
}

.spray-panel__color-actions {
  display: flex;
  gap: 4px;
}

.spray-panel__icon-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--tp-border-strong);
  border-radius: 6px;
  background: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.spray-panel__icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.spray-panel__paint-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.spray-panel__btn--toggle {
  height: 32px;
  font-size: 12px;
}

.spray-panel__btn--toggle-active {
  border-color: var(--tp-text-accent);
  color: var(--tp-text-accent);
  background: rgba(0, 122, 255, 0.08);
}

.spray-panel__brush {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--tp-text-secondary);
}

.spray-panel__brush input[type="range"] {
  flex: 1;
  min-width: 0;
}

.spray-panel__label-input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--tp-border-strong);
  border-radius: 6px;
  font-size: 12px;
  color: var(--tp-text-primary);
  background: #fff;
}

.spray-panel__masks {
  margin-top: 4px;
}

.spray-panel__masks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.spray-panel__masks-header .spray-panel__colors-title {
  margin: 0;
}

.spray-panel__masks-actions {
  display: flex;
  gap: 6px;
}

.spray-panel__link-btn {
  padding: 0;
  border: none;
  background: none;
  font-size: 11px;
  color: var(--tp-text-accent);
  cursor: pointer;
}

.spray-panel__link-btn:hover {
  text-decoration: underline;
}

.spray-panel__view-modes {
  display: flex;
  margin-bottom: 10px;
  padding: 2px;
  border-radius: 8px;
  background: var(--tp-bg-input);
}

.spray-panel__view-mode {
  flex: 1;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 11px;
  color: var(--tp-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.spray-panel__view-mode--active {
  background: #fff;
  color: var(--tp-text-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.spray-panel__mask-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 6px;
  padding: 6px 8px;
  border: 1px solid var(--tp-border-strong);
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  color: var(--tp-text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.spray-panel__mask-row:hover {
  border-color: rgba(0, 122, 255, 0.35);
}

.spray-panel__mask-row--active {
  border-color: var(--tp-text-accent);
}

.spray-panel__mask-row--fit {
  background: rgba(0, 122, 255, 0.06);
}

.spray-panel__mask-fit-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tp-border-strong);
}

.spray-panel__mask-row--fit .spray-panel__mask-fit-dot {
  background: var(--tp-text-accent);
}

.spray-panel__mask-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.spray-panel__mask-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: var(--tp-text-accent);
  background: rgba(0, 122, 255, 0.1);
}

.spray-panel__warnings {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.35);
}

.spray-panel__warning-item {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #e65100;
}

.spray-panel__warning-item + .spray-panel__warning-item {
  margin-top: 4px;
}

.spray-panel__empty {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--tp-text-secondary);
}

.terrain-modal__loading {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(26, 28, 46, 0.88);
  pointer-events: none;
}

.terrain-modal__spinner {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--tp-text-accent);
  border-radius: 50%;
  animation: terrain-modal-spin 0.75s linear infinite;
}

@keyframes terrain-modal-spin {
  to {
    transform: rotate(360deg);
  }
}

.terrain-modal__loading-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.terrain-modal__loading-hint {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  text-align: center;
  max-width: 320px;
}

.terrain-modal__progress {
  width: min(360px, 80vw);
  height: 6px;
  margin-top: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.terrain-modal__progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6ea8ff, #8fd3ff);
  transition: width 0.25s ease;
}

.terrain-modal__progress-text {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.terrain-modal__steps {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  width: min(360px, 80vw);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.terrain-modal__step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.38);
}

.terrain-modal__step--active {
  color: rgba(255, 255, 255, 0.92);
}

.terrain-modal__step--done {
  color: rgba(255, 255, 255, 0.58);
}

.terrain-modal__step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.08);
}

.terrain-modal__step--active .terrain-modal__step-index {
  background: rgba(110, 168, 255, 0.35);
}

.terrain-modal__step--done .terrain-modal__step-index {
  background: rgba(255, 255, 255, 0.16);
}

.terrain-modal__preview {
  position: absolute;
  inset: 0;
}

.terrain-modal__preview--hidden {
  visibility: hidden;
  pointer-events: none;
}

.terrain-modal__error {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  background: #1a1c2e;
}

.terrain-modal__error-icon {
  color: #e57373;
}

.terrain-modal__error-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.terrain-modal__error-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.65);
  text-align: center;
  max-width: 420px;
  word-break: break-word;
}

.terrain-modal-enter-active,
.terrain-modal-leave-active {
  transition: opacity 0.2s ease;
}

.terrain-modal-enter-active .terrain-modal__panel,
.terrain-modal-leave-active .terrain-modal__panel {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.terrain-modal-enter-from,
.terrain-modal-leave-to {
  opacity: 0;
}

.terrain-modal-enter-from .terrain-modal__panel,
.terrain-modal-leave-to .terrain-modal__panel {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
</style>
