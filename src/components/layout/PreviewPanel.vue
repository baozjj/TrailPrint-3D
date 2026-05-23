<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import type { PreviewMode } from '@/stores/ui'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'

const ui = useUiStore()
const { previewMode } = storeToRefs(ui)

const viewOptions: { value: PreviewMode; label: string }[] = [
  { value: '2d', label: '2D 地图视图' },
  { value: '3d', label: '3D 模型预览' }
]
</script>

<template>
  <section class="preview">
    <div class="preview__gradient">
      <div class="preview__placeholder">
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
        <p class="preview__title">地图与 3D 预览区</p>
        <p class="preview__hint">拖动地图取景 · 缩放查看轨迹</p>
        <p v-if="previewMode === '3d'" class="preview__mode-tag">3D 预览占位（任务后续接入）</p>
      </div>

      <div class="preview__topbar">
        <SegmentedControl v-model="previewMode" :options="viewOptions" dark-active />
      </div>
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

.preview__gradient {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: linear-gradient(180deg, #e8f4fc 0%, #d4e8d4 50%, #c8dcc8 100%);
  position: relative;
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
}

.preview__icon {
  color: rgba(134, 134, 139, 0.35);
}

.preview__title {
  margin: 0;
  font-size: 18px;
  color: var(--tp-text-secondary);
}

.preview__hint {
  margin: 0;
  font-size: 13px;
  color: var(--tp-text-secondary);
}

.preview__mode-tag {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tp-text-accent);
}

.preview__topbar {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: min(400px, calc(100% - 48px));
  padding: 4px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
</style>
