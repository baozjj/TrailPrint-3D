import { defineStore } from "pinia";
import { ref, watch } from "vue";
import {
  createDefaultConfig,
  type AppConfig,
  type GpxPoint,
  type TrailConfig,
} from "@shared/types";
import type { GpxImportResult } from "@shared/types/gpx";
import { zoomToFitBoundsInMask } from "@shared/utils/map-projection";
import { useUiStore } from "@/stores/ui";

const OPENTOPO_API_KEY_STORAGE = "trailprint.openTopographyApiKey";

function envOpenTopoApiKey(): string {
  return import.meta.env.VITE_OPENTOPOGRAPHY_API_KEY?.trim() ?? "";
}

function loadPersistedApiKey(): string {
  try {
    return localStorage.getItem(OPENTOPO_API_KEY_STORAGE)?.trim() ?? "";
  } catch {
    return "";
  }
}

function resolveOpenTopoApiKeyForUi(): string {
  return loadPersistedApiKey() || envOpenTopoApiKey();
}

function applyOpenTopoApiKey(cfg: AppConfig): void {
  cfg.terrain.openTopographyApiKey = resolveOpenTopoApiKeyForUi();
}

function ensureTrailConfigDefaults(cfg: AppConfig): void {
  const trail = cfg.trail as TrailConfig & { heightAboveMainMm?: number };
  if (trail.heightAboveMainMm == null) {
    const legacy = (cfg.assembly as { trailProtrusionMm?: number })
      .trailProtrusionMm;
    trail.heightAboveMainMm = legacy ?? 0.12;
  }
}

function ensureMagnetConfigDefaults(cfg: AppConfig): void {
  const magnet = cfg.assembly.magnet as AppConfig["assembly"]["magnet"] & {
    circleCount?: number;
    toleranceMm?: number;
  };
  if (magnet.circleCount == null) {
    magnet.circleCount = 3;
  }
  if (magnet.toleranceMm == null) {
    magnet.toleranceMm = 0.1;
  }
}

function ensureTrayNfcDefaults(cfg: AppConfig): void {
  const tray = cfg.tray as AppConfig["tray"] & { nfc?: AppConfig["tray"]["nfc"] };
  if (!tray.nfc) {
    tray.nfc = createDefaultConfig().tray.nfc;
    return;
  }
  const defaults = createDefaultConfig().tray.nfc;
  if (tray.nfc.ledPocketLengthMm == null) {
    tray.nfc.ledPocketLengthMm = defaults.ledPocketLengthMm;
  }
  if (tray.nfc.ledPocketWidthMm == null) {
    tray.nfc.ledPocketWidthMm = defaults.ledPocketWidthMm;
  }
}

function ensureSprayPaintDefaults(cfg: AppConfig): void {
  if (!cfg.sprayPaint) {
    cfg.sprayPaint = createDefaultConfig().sprayPaint;
  }
}

export const useConfigStore = defineStore("config", () => {
  const config = ref<AppConfig>(createDefaultConfig());
  applyOpenTopoApiKey(config.value);
  ensureTrailConfigDefaults(config.value);
  ensureMagnetConfigDefaults(config.value);
  ensureTrayNfcDefaults(config.value);
  ensureSprayPaintDefaults(config.value);

  watch(
    () => config.value.terrain.openTopographyApiKey,
    (key) => {
      try {
        const v = key.trim();
        if (v) localStorage.setItem(OPENTOPO_API_KEY_STORAGE, v);
        else localStorage.removeItem(OPENTOPO_API_KEY_STORAGE);
      } catch {
        /* 隐私模式等环境可能禁用 localStorage */
      }
    },
  );

  function resetConfig(): void {
    config.value = createDefaultConfig();
    applyOpenTopoApiKey(config.value);
    ensureTrailConfigDefaults(config.value);
    ensureMagnetConfigDefaults(config.value);
    ensureTrayNfcDefaults(config.value);
    ensureSprayPaintDefaults(config.value);
  }

  function patchConfig(partial: Partial<AppConfig>): void {
    config.value = { ...config.value, ...partial };
  }

  /** 写入 GPX 解析结果并更新建议地图中心 */
  function applyGpxImport(
    result: GpxImportResult,
    fileName?: string,
    filePath?: string,
  ): void {
    const raw = clonePoints(result.points);
    config.value.gpx = {
      imported: true,
      fileName,
      filePath,
      trackName: result.trackName,
      points: raw,
      rawPoints: raw,
      bounds: result.bounds,
      pointCount: result.pointCount,
      distanceKm: result.distanceKm,
      lastImportError: undefined,
    };
    if (result.bounds) {
      config.value.mapCrop.mapCenterLat =
        (result.bounds.minLat + result.bounds.maxLat) / 2;
      config.value.mapCrop.mapCenterLon =
        (result.bounds.minLon + result.bounds.maxLon) / 2;
      const ui = useUiStore();
      const w = Math.max(ui.previewViewport.w, 64);
      const h = Math.max(ui.previewViewport.h, 64);
      config.value.mapCrop.mapZoom = zoomToFitBoundsInMask(
        result.bounds,
        w,
        h,
        config.value.mapCrop,
      );
    } else {
      config.value.mapCrop.mapCenterLat = result.suggestedCenter.lat;
      config.value.mapCrop.mapCenterLon = result.suggestedCenter.lon;
    }
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
