import type { GpxBounds, GpxPoint } from './config'

/** 主进程 GPX 解析结果（任务-01 数据契约） */
export interface GpxImportResult {
  points: GpxPoint[]
  bounds: GpxBounds
  trackName?: string
  pointCount: number
  distanceKm: number
  /** 建议地图中心（边界框中心） */
  suggestedCenter: { lat: number; lon: number }
}

export interface GpxParseRequest {
  /** Electron 桌面端文件绝对路径 */
  filePath?: string
  /** 无 path 时传入 UTF-8 文本（拖拽/浏览器场景） */
  content?: string
  fileName?: string
}

export interface GpxParseResponse {
  result: GpxImportResult
}
