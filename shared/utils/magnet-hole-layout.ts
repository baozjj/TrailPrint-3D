import type { AppConfig, BaseShape, MagnetConfig } from "../types/config";
import type { TrayFootprint } from "./tray-footprint";

/** 磁铁孔中心 (mm)，与 Tray_Base 共用模型平面原点 */
export interface MagnetHole2D {
  x: number;
  y: number;
}

const POLYGON_SIDES_MIN = 3;
const POLYGON_SIDES_MAX = 8;
const CIRCLE_COUNT_MIN = 2;
const CIRCLE_COUNT_MAX = 12;
const CIRCLE_COUNT_DEFAULT = 3;

/** 顶点对齐相位：第一个孔位于 +Y（模型平面「上方」） */
const TOP_VERTEX_PHASE = -Math.PI / 2;

/** 孔心沿托盘外轮廓径向内缩，避免贴边过薄 */
const BOTTOM_INSET = {
  circle: 0.72,
  polygon: 0.72,
  rectangle: 0.72,
} as const;

/**
 * 与 tray-footprint / mask-geometry 一致：
 * 仅 circle、rectangle 为特例，其余一律按正多边形处理。
 */
export function resolveFootprintShape(mapCrop: AppConfig["mapCrop"]): BaseShape {
  if (mapCrop.shape === "circle" || mapCrop.shape === "rectangle") {
    return mapCrop.shape;
  }
  return "polygon";
}

/** 正多边形：磁铁孔数量恒等于边数 */
export function resolvePolygonMagnetCount(polygonSides: number): number {
  return Math.max(
    POLYGON_SIDES_MIN,
    Math.min(POLYGON_SIDES_MAX, Math.round(polygonSides)),
  );
}

/** 圆形底座：默认 3 孔，可在 2～12 之间配置 */
export function resolveCircleMagnetCount(magnet: MagnetConfig): number {
  const n = magnet.circleCount ?? CIRCLE_COUNT_DEFAULT;
  return Math.max(
    CIRCLE_COUNT_MIN,
    Math.min(CIRCLE_COUNT_MAX, Math.round(n)),
  );
}

function evenlySpacedAngles(count: number, phase = TOP_VERTEX_PHASE): number[] {
  return Array.from(
    { length: count },
    (_, i) => phase + (i / count) * Math.PI * 2,
  );
}

function polarPositions(radiusMm: number, angles: number[]): MagnetHole2D[] {
  return angles.map((a) => ({
    x: radiusMm * Math.cos(a),
    y: radiusMm * Math.sin(a),
  }));
}

function layoutOnCircle(
  count: number,
  radiusMm: number,
  radialInset: number,
  phase = TOP_VERTEX_PHASE,
): MagnetHole2D[] {
  return polarPositions(
    radiusMm * radialInset,
    evenlySpacedAngles(count, phase),
  );
}

function layoutOnRectangle(
  halfWidthMm: number,
  halfHeightMm: number,
  inset: number,
): MagnetHole2D[] {
  const ix = halfWidthMm * inset;
  const iy = halfHeightMm * inset;
  return [
    { x: -ix, y: -iy },
    { x: ix, y: -iy },
    { x: ix, y: iy },
    { x: -ix, y: iy },
  ];
}

function layoutOnOuterVerts(
  verts: ReadonlyArray<{ x: number; y: number }>,
  inset: number,
): MagnetHole2D[] {
  return verts.map((v) => ({ x: v.x * inset, y: v.y * inset }));
}

function meanRadius(outer: ReadonlyArray<{ x: number; y: number }>): number {
  if (!outer.length) return 0;
  let sum = 0;
  for (const v of outer) {
    sum += Math.hypot(v.x, v.y);
  }
  return sum / outer.length;
}

/**
 * 托盘底面磁铁孔 XY。
 * 孔位与孔数**只**由 `footprint`（托盘真实外轮廓）决定，不再读取 mapCrop。
 *
 * - 圆形：沿外圆周均匀分布，`circleCount` 默认 3（2～12）
 * - 矩形：四角各一（4 孔）
 * - 正多边形：外轮廓每个顶点各 1 孔（六边形 = 6 孔）
 */
export function computeTrayBottomMagnetHoles(
  config: AppConfig,
  footprint: TrayFootprint,
): MagnetHole2D[] {
  if (!config.assembly.magnet.enabled) {
    return [];
  }

  let holes: MagnetHole2D[] = [];
  switch (footprint.shape) {
    case "circle": {
      const count = resolveCircleMagnetCount(config.assembly.magnet);
      const radius = footprint.outerRadius ?? meanRadius(footprint.outer);
      holes = layoutOnCircle(
        count,
        radius,
        BOTTOM_INSET.circle,
        TOP_VERTEX_PHASE + Math.PI / count,
      );
      break;
    }
    case "rectangle":
      holes = layoutOnRectangle(
        footprint.outerHw ?? 0,
        footprint.outerHh ?? 0,
        BOTTOM_INSET.rectangle,
      );
      break;
    case "polygon":
      if (footprint.outer.length < 3) {
        holes = [];
      } else {
        holes = layoutOnOuterVerts(footprint.outer, BOTTOM_INSET.polygon);
      }
      break;
    default:
      holes = [];
  }

  return holes;
}

/** UI 提示用：未启用磁铁时返回 0 */
export function trayMagnetHoleCount(
  config: AppConfig,
  footprint: TrayFootprint,
): number {
  return computeTrayBottomMagnetHoles(config, footprint).length;
}
