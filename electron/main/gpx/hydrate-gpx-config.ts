import type { AppConfig } from "@shared/types";
import type { GpxImportResult } from "@shared/types/gpx";
import { resolveTrailPoints } from "@shared/utils/trail-resolve";
import { getGpxSessionCache, setGpxSessionCache } from "./gpx-session-cache";
import { parseGpxFile } from "./parse-gpx";

function applyGpxResult(
  config: AppConfig,
  result: GpxImportResult,
): AppConfig {
  return {
    ...config,
    gpx: {
      ...config.gpx,
      imported: true,
      points: result.points,
      rawPoints: result.points,
      bounds: result.bounds,
      pointCount: result.pointCount,
      distanceKm: result.distanceKm,
      trackName: result.trackName ?? config.gpx.trackName,
    },
    mapCrop: {
      ...config.mapCrop,
      mapCenterLat: result.suggestedCenter.lat,
      mapCenterLon: result.suggestedCenter.lon,
    },
  };
}

/**
 * 确保主进程能拿到完整 GPX 轨迹：优先用 IPC config，否则会话缓存或本机路径重读。
 */
export async function hydrateGpxConfig(
  config: AppConfig,
): Promise<AppConfig> {
  if (!config.gpx.imported) return config;
  if (resolveTrailPoints(config).length >= 2) return config;

  const cached = getGpxSessionCache();
  if (cached && cached.points.length >= 2) {
    return applyGpxResult(config, cached);
  }

  const filePath = config.gpx.filePath?.trim();
  if (filePath) {
    const result = await parseGpxFile({
      filePath,
      fileName: config.gpx.fileName,
    });
    setGpxSessionCache(result);
    return applyGpxResult(config, result);
  }

  return config;
}
