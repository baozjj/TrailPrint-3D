<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import TerrainMeshPreview from "@/components/preview/TerrainMeshPreview.vue";
import type {
  TerrainGenerateProgress,
  TerrainGenerateResponse,
  TerrainSceneProgress,
} from "@shared/types/terrain";
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
              class="terrain-modal__preview"
              :class="{
                'terrain-modal__preview--hidden':
                  showLoadingOverlay || Boolean(error),
              }"
              :result="result"
              :tray-mesh="trayMesh"
              :generating="generating"
              :error="error"
              overlay-loading
              @scene-loading-change="onSceneLoadingChange"
              @scene-progress="onSceneProgress"
            />
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
  width: min(960px, 100%);
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
