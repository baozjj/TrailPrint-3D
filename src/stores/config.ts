import { defineStore } from "pinia";
import { ref } from "vue";
import {
  createDefaultConfig,
  type AppConfig,
  type GpxPoint,
} from "@shared/types";
import type { GpxImportResult } from "@shared/types/gpx";

export const useConfigStore = defineStore("config", () => {
  const config = ref<AppConfig>(createDefaultConfig());

  function resetConfig(): void {
    config.value = createDefaultConfig();
  }

  function patchConfig(partial: Partial<AppConfig>): void {
    config.value = { ...config.value, ...partial };
  }

  /** 写入 GPX 解析结果并更新建议地图中心 */
  function applyGpxImport(result: GpxImportResult, fileName?: string): void {
    const raw = clonePoints(result.points);
    config.value.gpx = {
      imported: true,
      fileName,
      trackName: result.trackName,
      points: raw,
      rawPoints: raw,
      bounds: result.bounds,
      pointCount: result.pointCount,
      distanceKm: result.distanceKm,
      lastImportError: undefined,
    };
    config.value.mapCrop.mapCenterLat = result.suggestedCenter.lat;
    config.value.mapCrop.mapCenterLon = result.suggestedCenter.lon;
  }

  function setGpxImportError(message: string): void {
    config.value.gpx.lastImportError = message;
    config.value.gpx.imported = false;
  }

  function clearGpx(): void {
    config.value.gpx = createDefaultConfig().gpx;
  }

  /** 供主进程读取的快照（后续任务通过 IPC 传递） */
  function toSnapshot(): AppConfig {
    return JSON.parse(JSON.stringify(config.value)) as AppConfig;
  }

  return {
    config,
    resetConfig,
    patchConfig,
    applyGpxImport,
    setGpxImportError,
    clearGpx,
    toSnapshot,
  };
});

function clonePoints(points: GpxPoint[]): GpxPoint[] {
  return points.map((p) => ({ ...p }));
}
