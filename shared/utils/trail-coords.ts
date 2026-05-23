import type { GpxPoint } from "../types";
import type { TerrainCropRegion } from "../types/terrain";

export interface TrailPointMm {
  x: number;
  y: number;
}

/**
 * 将经纬度映射到与 Terrain_Main 一致的模型平面坐标 (mm)。
 * 规则：与 DEM 网格相同，按 crop 外接经纬度矩形线性插值；Z 由主进程高度场采样。
 */
export function geoToModelMm(
  point: GpxPoint,
  crop: TerrainCropRegion,
): TrailPointMm | null {
  const lonSpan = crop.maxLon - crop.minLon;
  const latSpan = crop.maxLat - crop.minLat;
  if (lonSpan < 1e-12 || latSpan < 1e-12) return null;

  const s = (point.lon - crop.minLon) / lonSpan;
  const t = (point.lat - crop.minLat) / latSpan;
  if (s < -0.02 || s > 1.02 || t < -0.02 || t > 1.02) return null;

  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  return {
    x: -hw + crop.widthMm * s,
    y: -hh + crop.heightMm * t,
  };
}

export function projectTrailToModelMm(
  points: GpxPoint[],
  crop: TerrainCropRegion,
): TrailPointMm[] {
  const out: TrailPointMm[] = [];
  for (const p of points) {
    const mm = geoToModelMm(p, crop);
    if (mm) out.push(mm);
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
  return out;
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
