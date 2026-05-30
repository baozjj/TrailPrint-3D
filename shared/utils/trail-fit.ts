import type { AppConfig } from "../types/config";
import type { MapCropConfig } from "../types/config";
import { computeTerrainCropRegion } from "./crop-region";
import { zoomToFitBoundsInMask } from "./map-projection";
import { projectTrailToModelMm } from "./trail-coords";
import { resolveTrailPoints } from "./trail-resolve";

function trailPointCount(
  config: AppConfig,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);
  const crop = computeTerrainCropRegion(mapCrop, w, h);
  return projectTrailToModelMm(resolveTrailPoints(config), crop, {
    mapCrop,
    viewportWidth: w,
    viewportHeight: h,
  }).length;
}

/**
 * 若当前地图缩放导致轨迹无法投影进打印区，自动调整中心与缩放使轨迹落入遮罩。
 */
export function ensureMapZoomFitsTrail(
  config: AppConfig,
  viewportWidth: number,
  viewportHeight: number,
): AppConfig {
  if (!config.gpx.imported || !config.gpx.bounds) return config;
  if (resolveTrailPoints(config).length < 2) return config;

  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);

  if (trailPointCount(config, config.mapCrop, w, h) >= 2) return config;

  const bounds = config.gpx.bounds;
  const adjusted: AppConfig = {
    ...config,
    mapCrop: {
      ...config.mapCrop,
      mapCenterLat: (bounds.minLat + bounds.maxLat) / 2,
      mapCenterLon: (bounds.minLon + bounds.maxLon) / 2,
      mapZoom: zoomToFitBoundsInMask(bounds, w, h, config.mapCrop),
    },
  };

  return adjusted;
}
