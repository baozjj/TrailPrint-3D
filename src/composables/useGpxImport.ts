import { ref } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { formatIpcError, ipcParseGpx } from '@/ipc/client'
import type { GpxParseRequest } from '@shared/types/gpx'

type ElectronFile = File & { path?: string }

export function useGpxImport() {
  const configStore = useConfigStore()
  const ui = useUiStore()
  const importing = ref(false)

  async function importFromFile(file: File): Promise<boolean> {
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      configStore.setGpxImportError('请选择 .gpx 格式的文件')
      ui.statusMessage = '请选择 .gpx 格式的文件'
      return false
    }

    importing.value = true
    ui.statusMessage = '正在解析 GPX…'
    configStore.config.gpx.lastImportError = undefined

    try {
      const req = await buildParseRequest(file)
      const { result } = await ipcParseGpx(req)
      configStore.applyGpxImport(result, file.name, (file as ElectronFile).path)
      ui.requestGpxMapFit()
      ui.statusMessage = `${formatImportSummary(result.trackName, result.pointCount, result.distanceKm)} · 已在卫星地图上显示红色轨迹`
      return true
    } catch (err) {
      const msg = formatIpcError(err)
      configStore.setGpxImportError(msg)
      ui.statusMessage = msg
      return false
    } finally {
      importing.value = false
    }
  }

  async function importFromPath(filePath: string, fileName?: string): Promise<boolean> {
    importing.value = true
    ui.statusMessage = '正在解析 GPX…'
    try {
      const { result } = await ipcParseGpx({ filePath, fileName })
      configStore.applyGpxImport(result, fileName, filePath)
      ui.requestGpxMapFit()
      ui.statusMessage = `${formatImportSummary(result.trackName, result.pointCount, result.distanceKm)} · 已在卫星地图上显示红色轨迹`
      return true
    } catch (err) {
      const msg = formatIpcError(err)
      configStore.setGpxImportError(msg)
      ui.statusMessage = msg
      return false
    } finally {
      importing.value = false
    }
  }

  return { importing, importFromFile, importFromPath }
}

async function buildParseRequest(file: File): Promise<GpxParseRequest> {
  const electronFile = file as ElectronFile
  if (electronFile.path) {
    return { filePath: electronFile.path, fileName: file.name }
  }
  const content = await file.text()
  return { content, fileName: file.name }
}

function formatImportSummary(
  trackName: string | undefined,
  pointCount: number,
  distanceKm: number
): string {
  const name = trackName ? `「${trackName}」` : '轨迹'
  return `已导入 ${name}：${pointCount} 个点，约 ${distanceKm.toFixed(2)} km`
}
