import type { GpxPoint } from "../types";
import type { MapCropConfig } from "../types/config";
import type { TerrainCropRegion } from "../types/terrain";
import { clipPolylineToFootprint } from "./footprint";
import { maskMmScale } from "./map-mm-projection";
import { projectPoint } from "./map-projection";

export interface TrailPointMm {
  x: number;
  y: number;
}

export interface ProjectTrailOptions {
  mapCrop: MapCropConfig;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * 与 2D 地图一致：GPX → 屏幕像素 → 模型平面 mm（以遮罩中心为原点）。
 * 保证「地图上看见的轨迹」与 STL 轨迹一致。
 */
export function projectTrailToModelMm(
  points: GpxPoint[],
  crop: TerrainCropRegion,
  options: ProjectTrailOptions,
): TrailPointMm[] {
  const { mapCrop, viewportWidth, viewportHeight } = options;
  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);
  const scale = maskMmScale(mapCrop, crop, w, h);
  const center = { lat: mapCrop.mapCenterLat, lon: mapCrop.mapCenterLon };
  const zoom = mapCrop.mapZoom;

  const mapped: TrailPointMm[] = [];
  for (const p of points) {
    const scr = projectPoint(p, center, zoom, w, h);
    mapped.push({
      x: (scr.x - scale.cx) * scale.scaleX,
      y: (scale.cy - scr.y) * scale.scaleY,
    });
  }

  if (mapped.length < 2) return [];

  const clipped = clipPolylineToFootprint(mapped, crop);
  return dedupeAdjacentMm(clipped);
}

function dedupeAdjacentMm(points: TrailPointMm[]): TrailPointMm[] {
  if (points.length === 0) return points;
  const out: TrailPointMm[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const prev = out[out.length - 1]!;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0.05) out.push(p);
  }
  return out;
}

/** 折线重采样（约每 stepMm 一个点） */
export function resamplePolyline(
  polyline: TrailPointMm[],
  stepMm = 1,
): TrailPointMm[] {
  if (polyline.length < 2) return polyline.slice();
  const out: TrailPointMm[] = [polyline[0]!];
  let carry = 0;

  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]!;
    const b = polyline[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;

    let dist = stepMm - carry;
    while (dist < len) {
      const t = dist / len;
      out.push({ x: a.x + dx * t, y: a.y + dy * t });
      dist += stepMm;
    }
    carry = len - (dist - stepMm);
    out.push(b);
  }
  return out.length >= 2 ? out : polyline.slice();
}

export function distanceToPolylineMm(
  x: number,
  y: number,
  polyline: TrailPointMm[],
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return Math.hypot(x - polyline[0]!.x, y - polyline[0]!.y);
  }

  let min = Infinity;
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]!;
    const b = polyline[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-12) {
      t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    }
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    min = Math.min(min, Math.hypot(x - px, y - py));
  }
  return min;
}
