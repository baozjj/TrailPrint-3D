<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import TerrainMeshPreview from "@/components/preview/TerrainMeshPreview.vue";
import type { TerrainGenerateResponse } from "@shared/types/terrain";

const open = defineModel<boolean>({ required: true });
const viewport = defineModel<{ w: number; h: number }>("viewport", {
  required: true,
});

defineProps<{
  result: TerrainGenerateResponse | null;
  generating: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  opened: [];
}>();

const bodyRef = ref<HTMLDivElement | null>(null);

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
  if (!isOpen) return;
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
          </header>

          <div ref="bodyRef" class="terrain-modal__body">
            <div v-if="generating" class="terrain-modal__loading">
              <div class="terrain-modal__spinner" aria-hidden="true" />
              <p class="terrain-modal__loading-title">正在生成 3D 模型</p>
              <p class="terrain-modal__loading-hint">
                正在获取 DEM 高程、拼接卫星影像并构建 3D 网格，请稍候…
              </p>
            </div>

            <TerrainMeshPreview
              class="terrain-modal__preview"
              :class="{ 'terrain-modal__preview--dim': generating }"
              :result="result"
              :generating="generating"
              :error="error"
              overlay-loading
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
  max-width: 280px;
}

.terrain-modal__preview {
  position: absolute;
  inset: 0;
}

.terrain-modal__preview--dim {
  opacity: 0.35;
  pointer-events: none;
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
