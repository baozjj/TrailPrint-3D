import type { AppConfig } from "../types/config";
import type { TerrainCropRegion } from "../types/terrain";
import type { TrailPointMm } from "./trail-coords";

function pointInPolygon(
  x: number,
  y: number,
  verts: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i]!.x;
    const yi = verts[i]!.y;
    const xj = verts[j]!.x;
    const yj = verts[j]!.y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function buildFootprintPolygonMm(
  crop: TerrainCropRegion,
): Array<{ x: number; y: number }> | null {
  if (crop.shape === "polygon" && crop.polygonSides) {
    const n = crop.polygonSides;
    const r = crop.radiusMm ?? crop.widthMm / 2;
    const verts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return verts;
  }
  return null;
}

/** 将模型平面点投影到打印外轮廓边界（用于封闭顶面、消除边缘镂空） */
export function projectToFootprintMm(
  xMm: number,
  yMm: number,
  crop: TerrainCropRegion,
): { x: number; y: number } {
  if (isInsidePrintFootprintMm(xMm, yMm, crop)) {
    return { x: xMm, y: yMm };
  }
  if (crop.shape === "circle") {
    const r = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
    const d = Math.hypot(xMm, yMm);
    if (d <= 1e-9) return { x: 0, y: 0 };
    return { x: (xMm * r) / d, y: (yMm * r) / d };
  }
  if (crop.shape === "rectangle") {
    const hw = crop.widthMm / 2;
    const hh = crop.heightMm / 2;
    return {
      x: Math.max(-hw, Math.min(hw, xMm)),
      y: Math.max(-hh, Math.min(hh, yMm)),
    };
  }
  const polygon = buildFootprintPolygonMm(crop);
  if (polygon && polygon.length >= 3) {
    let bestX = polygon[0]!.x;
    let bestY = polygon[0]!.y;
    let bestD = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 < 1e-12
          ? 0
          : Math.max(
              0,
              Math.min(1, ((xMm - a.x) * dx + (yMm - a.y) * dy) / len2),
            );
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const d = (xMm - px) ** 2 + (yMm - py) ** 2;
      if (d < bestD) {
        bestD = d;
        bestX = px;
        bestY = py;
      }
    }
    return { x: bestX, y: bestY };
  }
  return { x: xMm, y: yMm };
}

/** 模型平面 (mm) 内是否落在打印外轮廓内 */
export function isInsidePrintFootprintMm(
  xMm: number,
  yMm: number,
  crop: TerrainCropRegion,
): boolean {
  const polygon = buildFootprintPolygonMm(crop);
  if (crop.shape === "circle") {
    const r = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
    return xMm * xMm + yMm * yMm <= r * r + 1e-6;
  }
  if (crop.shape === "rectangle") {
    const hw = crop.widthMm / 2;
    const hh = crop.heightMm / 2;
    return Math.abs(xMm) <= hw + 1e-6 && Math.abs(yMm) <= hh + 1e-6;
  }
  if (polygon) return pointInPolygon(xMm, yMm, polygon);
  return true;
}

function lerpPoint(
  a: TrailPointMm,
  b: TrailPointMm,
  t: number,
): TrailPointMm {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/** 线段与圆的交点参数 t∈[0,1]（按升序，0～2 个） */
function segmentCircleTs(
  a: TrailPointMm,
  b: TrailPointMm,
  r: number,
): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const A = dx * dx + dy * dy;
  if (A < 1e-12) return [];
  const B = 2 * (a.x * dx + a.y * dy);
  const C = a.x * a.x + a.y * a.y - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const sqrtD = Math.sqrt(disc);
  const t0 = (-B - sqrtD) / (2 * A);
  const t1 = (-B + sqrtD) / (2 * A);
  const ts: number[] = [];
  for (const t of [t0, t1]) {
    if (t >= -1e-6 && t <= 1 + 1e-6) ts.push(Math.max(0, Math.min(1, t)));
  }
  ts.sort((x, y) => x - y);
  if (ts.length === 2 && Math.abs(ts[0]! - ts[1]!) < 1e-6) return [ts[0]!];
  return ts;
}

function clipSegmentToCircle(
  a: TrailPointMm,
  b: TrailPointMm,
  r: number,
): TrailPointMm[] {
  const r2 = r * r;
  const inA = a.x * a.x + a.y * a.y <= r2 + 1e-6;
  const inB = b.x * b.x + b.y * b.y <= r2 + 1e-6;
  if (inA && inB) return [a, b];
  const ts = segmentCircleTs(a, b, r);
  if (inA && !inB && ts.length > 0) {
    return [a, lerpPoint(a, b, ts[0]!)];
  }
  if (!inA && inB && ts.length > 0) {
    return [lerpPoint(a, b, ts[ts.length - 1]!), b];
  }
  if (!inA && !inB && ts.length >= 2) {
    return [lerpPoint(a, b, ts[0]!), lerpPoint(a, b, ts[ts.length - 1]!)];
  }
  return [];
}

function clipSegmentToRect(
  a: TrailPointMm,
  b: TrailPointMm,
  hw: number,
  hh: number,
): TrailPointMm[] {
  let x0 = a.x;
  let y0 = a.y;
  let x1 = b.x;
  let y1 = b.y;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 + hw, hw - x0, y0 + hh, hh - y0];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]!) < 1e-12) {
      if (q[i]! < 0) return [];
    } else {
      const t = q[i]! / p[i]!;
      if (p[i]! < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1 + 1e-6) return [];
  return [lerpPoint(a, b, t0), lerpPoint(a, b, t1)];
}

function clipSegmentToPolygon(
  a: TrailPointMm,
  b: TrailPointMm,
  verts: Array<{ x: number; y: number }>,
): TrailPointMm[] {
  const inA = pointInPolygon(a.x, a.y, verts);
  const inB = pointInPolygon(b.x, b.y, verts);
  if (inA && inB) return [a, b];

  const inside: TrailPointMm[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const p = lerpPoint(a, b, i / steps);
    if (pointInPolygon(p.x, p.y, verts)) inside.push(p);
  }
  if (inside.length < 2) return [];
  return [inside[0]!, inside[inside.length - 1]!];
}

/** 将折线裁剪到打印外轮廓内（保留穿过区域内部的线段） */
export function clipPolylineToFootprint(
  polyline: TrailPointMm[],
  crop: TerrainCropRegion,
): TrailPointMm[] {
  if (polyline.length < 2) return polyline.slice();

  const polygon = buildFootprintPolygonMm(crop);
  const out: TrailPointMm[] = [];

  const push = (p: TrailPointMm) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.05) {
      out.push(p);
    }
  };

  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]!;
    const b = polyline[i]!;
    let seg: TrailPointMm[] = [];
    if (crop.shape === "circle") {
      const r = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
      seg = clipSegmentToCircle(a, b, r);
    } else if (crop.shape === "rectangle") {
      seg = clipSegmentToRect(a, b, crop.widthMm / 2, crop.heightMm / 2);
    } else if (polygon) {
      seg = clipSegmentToPolygon(a, b, polygon);
    } else {
      seg = [a, b];
    }
    for (const p of seg) push(p);
  }

  return out;
}

/** STL 用 Trail_Line 宽度：标称宽度减去两侧装配公差 */
export function trailLineWidthMmForPrint(config: AppConfig): number {
  const shrunk =
    config.trail.trailWidthMm - 2 * config.assembly.trailToleranceMm;
  return Math.max(0.2, shrunk);
}
