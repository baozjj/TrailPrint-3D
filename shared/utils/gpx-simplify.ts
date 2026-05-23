import type { GpxPoint } from "../types";

function haversineM(a: GpxPoint, b: GpxPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function perpendicularDistanceM(
  p: GpxPoint,
  a: GpxPoint,
  b: GpxPoint,
): number {
  const ab = haversineM(a, b);
  if (ab < 1e-6) return haversineM(p, a);
  const ap = haversineM(a, p);
  const bp = haversineM(b, p);
  const s = (ap + bp + ab) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - ap) * (s - bp) * (s - ab)));
  return (2 * area) / ab;
}

function douglasPeucker(points: GpxPoint[], epsilonM: number): GpxPoint[] {
  if (points.length <= 2) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistanceM(
      points[i]!,
      points[0]!,
      points[end]!,
    );
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilonM) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilonM);
    const right = douglasPeucker(points.slice(index), epsilonM);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0]!, points[end]!];
}

/** 剔除与相邻点距离异常远的漂移点 */
function removeOutliers(points: GpxPoint[], factor = 4): GpxPoint[] {
  if (points.length < 3) return points.slice();
  const segLens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    segLens.push(haversineM(points[i - 1]!, points[i]!));
  }
  const sorted = [...segLens].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const limit = Math.max(median * factor, 80);

  const out: GpxPoint[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const d = haversineM(out[out.length - 1]!, points[i]!);
    if (d <= limit) out.push(points[i]!);
  }
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]!);
  }
  return out;
}

function movingAverage(points: GpxPoint[], window = 3): GpxPoint[] {
  if (points.length < window) return points.slice();
  const half = Math.floor(window / 2);
  const out: GpxPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    let lat = 0;
    let lon = 0;
    let eleSum = 0;
    let eleN = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
      lat += points[j]!.lat;
      lon += points[j]!.lon;
      if (points[j]!.ele !== undefined) {
        eleSum += points[j]!.ele!;
        eleN++;
      }
      n++;
    }
    const p: GpxPoint = { lat: lat / n, lon: lon / n };
    if (eleN > 0) p.ele = eleSum / eleN;
    out.push(p);
  }
  return out;
}

/**
 * GPX 轨迹优化（任务-04 / 3.1）：漂移点过滤 + Douglas-Peucker + 轻度平滑。
 */
export function simplifyGpxTrack(
  points: GpxPoint[],
  options?: { epsilonM?: number },
): GpxPoint[] {
  if (points.length < 2) return points.slice();
  const epsilonM = options?.epsilonM ?? 6;
  let out = removeOutliers(points);
  out = douglasPeucker(out, epsilonM);
  out = movingAverage(out, 3);
  return out;
}
