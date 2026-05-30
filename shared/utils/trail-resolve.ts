import type { AppConfig, GpxPoint } from "../types";
import { simplifyGpxTrack } from "./gpx-simplify";

export function resolveTrailPoints(config: AppConfig): GpxPoint[] {
  const { gpx, trail } = config;
  if (!gpx.imported) return [];
  const raw = gpx.rawPoints.length > 0 ? gpx.rawPoints : gpx.points;
  const base = gpx.points.length >= 2 ? gpx.points : raw;
  if (!trail.gpxSimplify) return base;
  const simplified = simplifyGpxTrack(raw);
  return simplified.length >= 2 ? simplified : base;
}
