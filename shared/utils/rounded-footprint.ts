import type { MapCropConfig } from "../types/config";
import type { TerrainCropRegion } from "../types/terrain";
import { regularPolygonCircumradiusMm, regularPolygonVertexAngleRad } from "./footprint";
import type { Vec2 } from "./mesh-clip";

/** 矩形 / 正多边形允许的最大 R 角 (mm) */
export function maxCornerRadiusMm(mapCrop: MapCropConfig): number {
  if (mapCrop.shape === "rectangle") {
    return Math.min(mapCrop.lengthMm, mapCrop.widthMm) / 2;
  }
  if (mapCrop.shape === "polygon") {
    const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)));
    const sideLen = mapCrop.polygonSideLengthMm;
    const halfInterior = ((n - 2) * Math.PI) / (2 * n);
    return (sideLen / 2) * Math.tan(halfInterior);
  }
  return 0;
}

export function clampCornerRadiusMm(
  cornerRadiusMm: number,
  mapCrop: MapCropConfig,
): number {
  return Math.min(Math.max(0, cornerRadiusMm), maxCornerRadiusMm(mapCrop));
}

export function cornerRadiusFromCrop(crop: TerrainCropRegion): number {
  return Math.max(0, crop.cornerRadiusMm ?? 0);
}

/** 圆角矩形轮廓 (CCW)，原点在中心；hw/hh 为半长半宽 */
export function roundedRectanglePolygon(
  hw: number,
  hh: number,
  radiusMm: number,
  segmentsPerCorner = 8,
): Vec2[] {
  const r = Math.min(Math.max(0, radiusMm), hw, hh);
  if (r < 1e-6) {
    return [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
  }

  const pts: Vec2[] = [];
  const corners = [
    { cx: hw - r, cy: -hh + r, a0: -Math.PI / 2, a1: 0 },
    { cx: hw - r, cy: hh - r, a0: 0, a1: Math.PI / 2 },
    { cx: -hw + r, cy: hh - r, a0: Math.PI / 2, a1: Math.PI },
    { cx: -hw + r, cy: -hh + r, a0: Math.PI, a1: (3 * Math.PI) / 2 },
  ];

  for (const c of corners) {
    for (let i = 0; i < segmentsPerCorner; i++) {
      const a = c.a0 + ((c.a1 - c.a0) * i) / segmentsPerCorner;
      pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) });
    }
  }
  return pts;
}

/** 正多边形顶点圆角 (CCW) */
export function roundedRegularPolygon(
  sides: number,
  circumRadiusMm: number,
  filletRadiusMm: number,
  segmentsPerCorner = 6,
): Vec2[] {
  const n = Math.max(3, Math.min(8, Math.round(sides)));
  const R = Math.max(circumRadiusMm, 1e-6);
  const sideLen = 2 * R * Math.sin(Math.PI / n);
  const halfInterior = ((n - 2) * Math.PI) / (2 * n);
  const maxFillet = (sideLen / 2) * Math.tan(halfInterior);
  const filletR = Math.min(Math.max(0, filletRadiusMm), maxFillet);

  const sharpVerts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = regularPolygonVertexAngleRad(i, n);
    sharpVerts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }

  if (filletR < 1e-6) return sharpVerts;

  const tangentDist = filletR / Math.tan(halfInterior);
  const distToCenter = filletR / Math.sin(halfInterior);
  const pts: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const curr = sharpVerts[i]!;
    const prev = sharpVerts[(i + n - 1) % n]!;
    const next = sharpVerts[(i + 1) % n]!;

    const e1x = prev.x - curr.x;
    const e1y = prev.y - curr.y;
    const l1 = Math.hypot(e1x, e1y);
    const u1x = e1x / l1;
    const u1y = e1y / l1;

    const e2x = next.x - curr.x;
    const e2y = next.y - curr.y;
    const l2 = Math.hypot(e2x, e2y);
    const u2x = e2x / l2;
    const u2y = e2y / l2;

    const bisX = u1x + u2x;
    const bisY = u1y + u2y;
    const bisLen = Math.hypot(bisX, bisY);
    const cx = curr.x + (bisX / bisLen) * distToCenter;
    const cy = curr.y + (bisY / bisLen) * distToCenter;

    const p1 = {
      x: curr.x + u1x * tangentDist,
      y: curr.y + u1y * tangentDist,
    };
    const p2 = {
      x: curr.x + u2x * tangentDist,
      y: curr.y + u2y * tangentDist,
    };

    const a1 = Math.atan2(p1.y - cy, p1.x - cx);
    const a2 = Math.atan2(p2.y - cy, p2.x - cx);
    let delta = a2 - a1;
    while (delta <= 0) delta += Math.PI * 2;

    for (let s = 0; s < segmentsPerCorner; s++) {
      const t = s / segmentsPerCorner;
      const a = a1 + delta * t;
      pts.push({ x: cx + filletR * Math.cos(a), y: cy + filletR * Math.sin(a) });
    }
  }

  return pts;
}

export function pointInRoundedRectangle(
  x: number,
  y: number,
  hw: number,
  hh: number,
  radiusMm: number,
): boolean {
  const r = Math.min(Math.max(0, radiusMm), hw, hh);
  if (r < 1e-6) {
    return Math.abs(x) <= hw + 1e-6 && Math.abs(y) <= hh + 1e-6;
  }
  const dx = Math.max(0, Math.abs(x) - (hw - r));
  const dy = Math.max(0, Math.abs(y) - (hh - r));
  return dx * dx + dy * dy <= r * r + 1e-6;
}
