import type { AppConfig, BaseShape } from "../types/config";
import type { TrayFootprint, Vec2 } from "./tray-footprint";
import { physicalFootprintMm } from "./crop-region";
import { computeTerrainCropRegion } from "./crop-region";
import { regularPolygonVertexAngleRad } from "./footprint";
import { projectTrailToModelMm } from "./trail-coords";
import { resolveTrailPoints } from "./trail-resolve";

/** 0805 贴片 LED 封装参考尺寸 (mm) */
export const LED_0805_LENGTH_MM = 2.0;
export const LED_0805_WIDTH_MM = 1.25;

export const LED_POCKET_DEFAULT_LENGTH_MM = 4;
export const LED_POCKET_DEFAULT_WIDTH_MM = 2.5;

export interface Rect2D {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  angleRad?: number;
}

export interface LedPocketSpec {
  cx: number;
  cy: number;
  angleRad: number;
}

/** NFC 顶面凹陷区：与打印轮廓同形、同圆心、距打印内壁 wallClearanceMm */
export interface NfcCavityPolygon {
  shape: BaseShape;
  /** 顶视多边形顶点 (CCW) */
  verts: Vec2[];
}

export interface TrayNfcLayout {
  cavity: NfcCavityPolygon | null;
  ledPockets: LedPocketSpec[];
}

function regularPolygonVertices(n: number, radius: number): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = regularPolygonVertexAngleRad(i, n);
    verts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return verts;
}

function meanVertexRadius(verts: Vec2[]): number {
  if (!verts.length) return 0;
  let sum = 0;
  for (const v of verts) sum += Math.hypot(v.x, v.y);
  return sum / verts.length;
}

function scaleVerts(verts: Vec2[], scale: number): Vec2[] {
  return verts.map((v) => ({ x: v.x * scale, y: v.y * scale }));
}

/** 地图裁剪对应的打印外轮廓（不含托盘公差 / 边框） */
export function computeTerrainPrintPolygon(config: AppConfig): {
  shape: BaseShape;
  verts: Vec2[];
} {
  const { mapCrop } = config;
  const foot = physicalFootprintMm(mapCrop);

  if (mapCrop.shape === "circle") {
    const r = foot.radiusMm ?? foot.widthMm / 2;
    return { shape: "circle", verts: regularPolygonVertices(48, r) };
  }

  if (mapCrop.shape === "rectangle") {
    const hw = mapCrop.lengthMm / 2;
    const hh = mapCrop.widthMm / 2;
    return {
      shape: "rectangle",
      verts: [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ],
    };
  }

  const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)));
  const r = foot.radiusMm ?? foot.widthMm / 2;
  return { shape: "polygon", verts: regularPolygonVertices(n, r) };
}

/**
 * 将打印轮廓沿圆心内缩 wallClearanceMm（与打印轮廓同形）。
 * 正多边形 / 圆：边到边垂直距离 ≈ wallClearanceMm。
 */
export function insetTerrainPrintPolygon(
  print: { shape: BaseShape; verts: Vec2[] },
  wallClearanceMm: number,
): Vec2[] | null {
  const d = Math.max(0, wallClearanceMm);
  const verts = print.verts;
  if (verts.length < 3) return null;

  if (print.shape === "rectangle") {
    const hw = Math.abs(verts[0]!.x) - d;
    const hh = Math.abs(verts[2]!.y) - d;
    if (hw <= 0.5 || hh <= 0.5) return null;
    return [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
  }

  const n = verts.length;
  const R = meanVertexRadius(verts);
  if (R <= d + 0.5) return null;

  if (print.shape === "circle") {
    return scaleVerts(verts, (R - d) / R);
  }

  const apothem = R * Math.cos(Math.PI / n);
  const newApothem = apothem - d;
  if (newApothem <= 0.5) return null;
  const newR = newApothem / Math.cos(Math.PI / n);
  return scaleVerts(verts, newR / R);
}

/** 盖片外轮廓：打印区同形内缩 coverInsetMm，同圆心 */
export function computeTrayCoverPolygon(
  config: AppConfig,
  coverInsetMm: number,
): Vec2[] | null {
  const print = computeTerrainPrintPolygon(config);
  if (coverInsetMm <= 0) return print.verts;
  return insetTerrainPrintPolygon(print, coverInsetMm);
}

export function computeTrayNfcCavityPolygon(
  config: AppConfig,
  _footprint: TrayFootprint,
  wallClearanceMm: number,
): NfcCavityPolygon | null {
  const print = computeTerrainPrintPolygon(config);
  const inset = insetTerrainPrintPolygon(print, wallClearanceMm);
  if (!inset || inset.length < 3) return null;
  return { shape: print.shape, verts: inset };
}

function angleFromPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function averageAngleRad(a: number, b: number): number {
  return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
}

/**
 * 环线或起终点重合时合并为单孔，避免重复铣槽导致网格开放边。
 */
export function dedupeOverlappingLedPockets(
  pockets: LedPocketSpec[],
  lengthMm: number,
  widthMm: number,
): LedPocketSpec[] {
  if (pockets.length < 2) return pockets;
  const a = pockets[0]!;
  const b = pockets[1]!;
  const mergeDistMm = Math.max(lengthMm, widthMm);
  if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > mergeDistMm) {
    return pockets;
  }
  return [
    {
      cx: (a.cx + b.cx) / 2,
      cy: (a.cy + b.cy) / 2,
      angleRad: averageAngleRad(a.angleRad, b.angleRad),
    },
  ];
}

/** 轨迹起点与终点处的 0805 LED 安装位（模型平面 mm） */
export function computeTrayNfcLedPockets(
  config: AppConfig,
  viewportWidth: number,
  viewportHeight: number,
): LedPocketSpec[] {
  const points = resolveTrailPoints(config);
  if (points.length < 2) return [];

  const crop = computeTerrainCropRegion(
    config.mapCrop,
    viewportWidth,
    viewportHeight,
  );
  const polyline = projectTrailToModelMm(points, crop, {
    mapCrop: config.mapCrop,
    viewportWidth,
    viewportHeight,
  });
  if (polyline.length < 2) return [];

  const start = polyline[0]!;
  const end = polyline[polyline.length - 1]!;
  const pockets: LedPocketSpec[] = [
    {
      cx: start.x,
      cy: start.y,
      angleRad: angleFromPoints(start, polyline[1]!),
    },
    {
      cx: end.x,
      cy: end.y,
      angleRad: angleFromPoints(polyline[polyline.length - 2]!, end),
    },
  ];
  return dedupeOverlappingLedPockets(
    pockets,
    config.tray.nfc.ledPocketLengthMm,
    config.tray.nfc.ledPocketWidthMm,
  );
}

export function computeTrayNfcLayout(
  config: AppConfig,
  footprint: TrayFootprint,
  viewportWidth: number,
  viewportHeight: number,
): TrayNfcLayout {
  if (!config.tray.nfc.enabled) {
    return { cavity: null, ledPockets: [] };
  }
  return {
    cavity: computeTrayNfcCavityPolygon(
      config,
      footprint,
      config.tray.nfc.wallClearanceMm,
    ),
    ledPockets: computeTrayNfcLedPockets(
      config,
      viewportWidth,
      viewportHeight,
    ),
  };
}

export function rectCorners(rect: Rect2D): Array<{ x: number; y: number }> {
  const angle = rect.angleRad ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = [
    { x: -rect.halfW, y: -rect.halfH },
    { x: rect.halfW, y: -rect.halfH },
    { x: rect.halfW, y: rect.halfH },
    { x: -rect.halfW, y: rect.halfH },
  ];
  return local.map((c) => ({
    x: rect.cx + c.x * cos - c.y * sin,
    y: rect.cy + c.x * sin + c.y * cos,
  }));
}

export function pointInPolygon(
  px: number,
  py: number,
  verts: ReadonlyArray<Vec2>,
): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i]!.x;
    const yi = verts[i]!.y;
    const xj = verts[j]!.x;
    const yj = verts[j]!.y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ledRect(
  led: LedPocketSpec,
  lengthMm: number,
  widthMm: number,
): Rect2D {
  return {
    cx: led.cx,
    cy: led.cy,
    halfW: lengthMm / 2,
    halfH: widthMm / 2,
    angleRad: led.angleRad,
  };
}

export function ledPocketRect(
  led: LedPocketSpec,
  lengthMm: number,
  widthMm: number,
): Rect2D {
  return ledRect(led, lengthMm, widthMm);
}
