import type { AppConfig } from "@shared/types";
import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TrailGrooveSpec } from "@shared/types/terrain";
import { projectTrailToModelMm } from "@shared/utils/trail-coords";
import { resolveTrailPoints } from "@shared/utils/trail-resolve";

export { resolveTrailPoints } from "@shared/utils/trail-resolve";

export function buildTrailGrooveSpec(
  config: AppConfig,
  crop: TerrainCropRegion,
  viewportWidth: number,
  viewportHeight: number,
): TrailGrooveSpec | undefined {
  const points = resolveTrailPoints(config);
  if (points.length < 2) return undefined;

  const polylineMm = projectTrailToModelMm(points, crop, {
    mapCrop: config.mapCrop,
    viewportWidth,
    viewportHeight,
  });
  if (polylineMm.length < 2) return undefined;

  const tolerance = config.assembly.trailToleranceMm;
  const grooveWidth = config.trail.trailWidthMm + 2 * tolerance;

  return {
    polylineMm,
    widthMm: grooveWidth,
    depthMm: config.trail.trailDepthMm,
  };
}

export function buildTrailLinePolyline(
  config: AppConfig,
  crop: TerrainCropRegion,
  viewportWidth: number,
  viewportHeight: number,
) {
  const points = resolveTrailPoints(config);
  return projectTrailToModelMm(points, crop, {
    mapCrop: config.mapCrop,
    viewportWidth,
    viewportHeight,
  });
}
