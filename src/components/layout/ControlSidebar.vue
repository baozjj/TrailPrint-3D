<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useConfigStore } from '@/stores/config'
import { formatIpcError, ipcEnqueueTask } from '@/ipc/client'
import MapSizeSection from '@/components/sections/MapSizeSection.vue'
import TerrainSection from '@/components/sections/TerrainSection.vue'
import TrailSection from '@/components/sections/TrailSection.vue'
import TraySection from '@/components/sections/TraySection.vue'
import AssemblySection from '@/components/sections/AssemblySection.vue'

const ui = useUiStore()
const configStore = useConfigStore()
const { generating, statusMessage } = storeToRefs(ui)

const fileInput = ref<HTMLInputElement | null>(null)

function openGpxPicker(): void {
  fileInput.value?.click()
}

function onGpxSelected(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  configStore.config.gpx.imported = true
  configStore.config.gpx.trackName = file.name.replace(/\.gpx$/i, '')
  statusMessage.value = `已选择 ${file.name}（解析逻辑待任务-01 接入）`
  ;(e.target as HTMLInputElement).value = ''
}

async function handleGenerate(): Promise<void> {
  if (configStore.config.tray.recessDepthMm >= configStore.config.tray.totalThicknessMm) {
    statusMessage.value = '请修正托盘参数：下陷深度必须小于总厚度'
    return
  }
  generating.value = true
  statusMessage.value = null
  try {
    await ipcEnqueueTask({
      kind: 'zip-pack',
      payload: configStore.toSnapshot() as unknown as Record<string, unknown>
    })
    statusMessage.value = '生成任务已提交（STL/ZIP 逻辑待任务-07 接入）'
  } catch (err) {
    statusMessage.value = formatIpcError(err)
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <aside class="sidebar">
    <header class="sidebar__header">
      <div class="sidebar__brand">
        <h1 class="sidebar__title">迹印</h1>
        <p class="sidebar__subtitle">TrailPrint 3D</p>
      </div>
      <button type="button" class="sidebar__import" @click="openGpxPicker">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        导入 GPX
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".gpx"
        class="sr-only"
        @change="onGpxSelected"
      />
    </header>

    <div class="sidebar__divider" role="separator" />

    <div class="sidebar__scroll">
      <MapSizeSection />
      <TerrainSection />
      <TrailSection />
      <TraySection />
      <AssemblySection />
    </div>

    <footer class="sidebar__footer">
      <p v-if="statusMessage" class="sidebar__status">{{ statusMessage }}</p>
      <button
        type="button"
        class="sidebar__cta"
        :disabled="generating"
        @click="handleGenerate"
      >
        {{ generating ? '生成中…' : '生成并下载 STL' }}
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 400px;
  flex-shrink: 0;
  align-self: stretch;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 0;
  background: var(--tp-bg-panel);
  border-radius: var(--tp-radius-panel);
  border: 1px solid var(--tp-border);
  box-shadow: var(--tp-shadow-panel);
  overflow: hidden;
}

.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 12px;
  background: var(--tp-bg-panel);
}

.sidebar__brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sidebar__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.sidebar__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--tp-text-secondary);
}

.sidebar__import {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  background: var(--tp-bg-input);
  color: var(--tp-text-accent);
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.sidebar__divider {
  height: 1px;
  margin: 0 20px;
  background: var(--tp-border);
}

.sidebar__scroll {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 16px 16px;
  -webkit-overflow-scrolling: touch;
}

.sidebar__scroll > :deep(*) {
  margin-bottom: 12px;
}

.sidebar__scroll > :deep(*:last-child) {
  margin-bottom: 0;
}

.sidebar__footer {
  padding: 12px 20px 20px;
  background: var(--tp-bg-footer);
  border-top: 1px solid var(--tp-border);
}

.sidebar__status {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--tp-text-secondary);
  line-height: 1.4;
}

.sidebar__cta {
  width: 100%;
  height: 52px;
  border-radius: var(--tp-radius-pill);
  background: var(--tp-cta);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  box-shadow: var(--tp-shadow-cta);
  transition: opacity 0.15s;
}

.sidebar__cta:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
