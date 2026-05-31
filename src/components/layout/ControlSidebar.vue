<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useConfigStore } from '@/stores/config'
import { useGpxImport } from '@/composables/useGpxImport'
import { formatIpcError, ipcGenerateExport, ipcOnExportProgress, ipcRevealExport } from '@/ipc/client'
import { validateTrayFromAppConfig } from '@shared/utils/tray-validation'
import { physicalFootprintMm } from '@shared/utils/crop-region'
import GpxImportSummary from '@/components/gpx/GpxImportSummary.vue'
import MapSizeSection from '@/components/sections/MapSizeSection.vue'
import TerrainSection from '@/components/sections/TerrainSection.vue'
import TrailSection from '@/components/sections/TrailSection.vue'
import TraySection from '@/components/sections/TraySection.vue'
import AssemblySection from '@/components/sections/AssemblySection.vue'

const ui = useUiStore()
const configStore = useConfigStore()
const { generating, statusMessage, exportProgress, lastExportZipPath } = storeToRefs(ui)

function exportFileName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] ?? path
}

async function revealLastExport(): Promise<void> {
  const path = lastExportZipPath.value
  if (!path) return
  try {
    await ipcRevealExport(path)
  } catch (err) {
    statusMessage.value = formatIpcError(err)
  }
}

let unsubscribeExportProgress: (() => void) | null = null

onMounted(() => {
  unsubscribeExportProgress = ipcOnExportProgress((progress) => {
    ui.exportProgress = progress.progress
    statusMessage.value = progress.message
  })
})

onUnmounted(() => {
  unsubscribeExportProgress?.()
  unsubscribeExportProgress = null
})
const { importing, importFromFile } = useGpxImport()

const fileInput = ref<HTMLInputElement | null>(null)
/** 上次导出详情默认收起，减少底部占用 */
const exportDoneOpen = ref(false)

function openGpxPicker(): void {
  if (!importing.value) fileInput.value?.click()
}

async function onGpxSelected(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  await importFromFile(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function handleGenerate(): Promise<void> {
  if (!configStore.config.gpx.imported) {
    statusMessage.value = '请先导入 GPX 轨迹文件'
    return
  }
  const trayCheck = validateTrayFromAppConfig(configStore.config)
  if (!trayCheck.valid) {
    statusMessage.value = trayCheck.message ?? '请修正托盘参数'
    return
  }
  generating.value = true
  ui.exportProgress = 0
  statusMessage.value = '准备生成…'
  ui.runPrepareExport()
  const { w, h } = ui.previewViewport
  try {
    const res = await ipcGenerateExport({
      config: configStore.toSnapshot(),
      viewportWidth: Math.round(w),
      viewportHeight: Math.round(h),
    })
    if (res.cancelled) {
      statusMessage.value =
        '未生成文件：已在保存对话框中取消。再次点击按钮并选择保存位置即可。'
    } else if (res.savedPath) {
      ui.lastExportZipPath = res.savedPath
      const name = exportFileName(res.savedPath)
      const foot = physicalFootprintMm(configStore.config.mapCrop)
      const sizeHint =
        configStore.config.mapCrop.shape === 'circle'
          ? `直径 ${(foot.radiusMm ?? 0) * 2}mm`
          : `${foot.widthMm}×${foot.heightMm}mm`
      statusMessage.value = `已保存 ${name}（打印区域 ${sizeHint}，${Math.round(res.generationMs / 1000)} 秒）`
    }
  } catch (err) {
    statusMessage.value = formatIpcError(err)
  } finally {
    generating.value = false
    ui.exportProgress = 0
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
      <button
        type="button"
        class="sidebar__import"
        :disabled="importing"
        @click="openGpxPicker"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {{ importing ? '解析中…' : '导入 GPX' }}
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".gpx,application/gpx+xml"
        class="sr-only"
        @change="onGpxSelected"
      />
    </header>

    <GpxImportSummary />

    <div class="sidebar__divider" role="separator" />

    <div class="sidebar__scroll">
      <MapSizeSection />
      <TerrainSection />
      <TrailSection />
      <TraySection />
      <AssemblySection />
    </div>

    <footer class="sidebar__footer">
      <div
        v-if="lastExportZipPath && !generating"
        class="sidebar__export-done"
      >
        <button
          type="button"
          class="sidebar__export-toggle"
          :aria-expanded="exportDoneOpen"
          @click="exportDoneOpen = !exportDoneOpen"
        >
          <span class="sidebar__export-label">上次导出</span>
          <span class="sidebar__export-path" :title="lastExportZipPath">
            {{ exportFileName(lastExportZipPath) }}
          </span>
          <svg
            class="sidebar__export-chevron"
            :class="{ 'sidebar__export-chevron--open': exportDoneOpen }"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div v-show="exportDoneOpen" class="sidebar__export-details">
          <p class="sidebar__export-hint">{{ lastExportZipPath }}</p>
          <button
            type="button"
            class="sidebar__reveal"
            @click="revealLastExport"
          >
            在 Finder 中显示
          </button>
        </div>
      </div>
      <p v-if="statusMessage" class="sidebar__status">
        <template v-if="generating && exportProgress > 0">
          {{ Math.round(exportProgress * 100) }}% ·
        </template>
        {{ statusMessage }}
      </p>
      <button
        type="button"
        class="sidebar__cta"
        :disabled="generating || importing"
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
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
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
  padding: 20px 20px 4px;
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

.sidebar__import:disabled {
  opacity: 0.6;
  cursor: wait;
}

.sidebar__divider {
  height: 1px;
  margin: 8px 20px 0;
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

.sidebar__export-done {
  margin-bottom: 10px;
  border-radius: 10px;
  background: var(--tp-bg-input);
  border: 1px solid var(--tp-border);
  overflow: hidden;
}

.sidebar__export-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
}

.sidebar__export-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--tp-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sidebar__export-path {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__export-chevron {
  flex-shrink: 0;
  color: var(--tp-text-secondary);
  transition: transform 0.15s ease;
}

.sidebar__export-chevron--open {
  transform: rotate(180deg);
}

.sidebar__export-details {
  padding: 0 12px 10px;
}

.sidebar__export-hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--tp-text-secondary);
  line-height: 1.35;
  word-break: break-all;
}

.sidebar__reveal {
  width: 100%;
  height: 36px;
  border-radius: 8px;
  background: var(--tp-bg-panel);
  border: 1px solid var(--tp-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-accent);
}

.sidebar__reveal:hover {
  background: var(--tp-bg-footer);
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
