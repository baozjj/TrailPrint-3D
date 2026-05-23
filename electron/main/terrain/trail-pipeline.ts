import type { AppConfig } from "@shared/types";
import type { GpxPoint } from "@shared/types";
import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TrailGrooveSpec } from "@shared/types/terrain";
import { simplifyGpxTrack } from "@shared/utils/gpx-simplify";
import { projectTrailToModelMm } from "@shared/utils/trail-coords";

export function resolveTrailPoints(config: AppConfig): GpxPoint[] {
  const { gpx, trail } = config;
  if (!gpx.imported) return [];
  const raw = gpx.rawPoints.length > 0 ? gpx.rawPoints : gpx.points;
  if (!trail.gpxSimplify) return gpx.points.length > 0 ? gpx.points : raw;
  return simplifyGpxTrack(raw);
}

export function buildTrailGrooveSpec(
  config: AppConfig,
  crop: TerrainCropRegion,
): TrailGrooveSpec | undefined {
  const points = resolveTrailPoints(config);
  if (points.length < 2) return undefined;

  const polylineMm = projectTrailToModelMm(points, crop);
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
) {
  const points = resolveTrailPoints(config);
  return projectTrailToModelMm(points, crop);
}
