import type { AppConfig, BaseShape, MagnetConfig } from "../types/config";
import { physicalFootprintMm } from "./crop-region";

/** 磁铁孔中心 (mm)，与 Terrain_Main / Tray_Base 共用模型平面原点 */
export interface MagnetHole2D {
  x: number;
  y: number;
}

export interface MagnetHoleLayout {
  /** 拼接定位孔：主模型底面 + 托盘凹槽底面配对 */
  snapFit: MagnetHole2D[];
  /** 冰箱贴孔：托盘最底面 */
  fridge: MagnetHole2D[];
}

/** 与托盘外轮廓对齐的形状提示（导出时由 computeTrayFootprint 提供） */
export interface MagnetLayoutOptions {
  footprintShape?: BaseShape;
  /** 正多边形外轮廓顶点数（六边形 = 6） */
  polygonVertexCount?: number;
}

const POLYGON_SIDES_MIN = 3;
const POLYGON_SIDES_MAX = 8;
const CIRCLE_COUNT_MIN = 2;
const CIRCLE_COUNT_MAX = 12;
const CIRCLE_COUNT_DEFAULT = 3;

/** 顶点对齐相位：第一个孔位于 +Y（模型平面「上方」） */
const TOP_VERTEX_PHASE = -Math.PI / 2;

/** 沿顶点径向内缩，避免孔心过于贴近外轮廓（Bambu Studio 布尔后薄壁/破面） */
const SNAP_FIT_INSET = {
  circle: 0.55,
  polygon: 0.88,
  rectangle: 0.88,
} as const;

const FRIDGE_INSET = {
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

/** 按底座形状解析磁铁孔数量（矩形恒为 4） */
export function resolveMagnetHoleCount(
  shape: BaseShape,
  magnet: MagnetConfig,
  polygonSides: number,
): number {
  if (shape === "rectangle") return 4;
  if (shape === "polygon") return resolvePolygonMagnetCount(polygonSides);
  return resolveCircleMagnetCount(magnet);
}

function resolveLayoutShape(
  mapCrop: AppConfig["mapCrop"],
  options?: MagnetLayoutOptions,
): BaseShape {
  return options?.footprintShape ?? resolveFootprintShape(mapCrop);
}

function resolveLayoutPolygonSides(
  mapCrop: AppConfig["mapCrop"],
  options?: MagnetLayoutOptions,
): number {
  if (options?.polygonVertexCount != null) {
    return resolvePolygonMagnetCount(options.polygonVertexCount);
  }
  return resolvePolygonMagnetCount(mapCrop.polygonSides);
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

function layoutOnPolygon(
  sides: number,
  circumRadiusMm: number,
  radialInset: number,
): MagnetHole2D[] {
  const n = resolvePolygonMagnetCount(sides);
  return polarPositions(
    circumRadiusMm * radialInset,
    evenlySpacedAngles(n),
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

function snapFitHoles(
  shape: BaseShape,
  terrainR: number,
  terrainHw: number,
  terrainHh: number,
  polygonSides: number,
  circleCount: number,
): MagnetHole2D[] {
  switch (shape) {
    case "circle":
      return layoutOnCircle(circleCount, terrainR, SNAP_FIT_INSET.circle);
    case "polygon":
      return layoutOnPolygon(
        polygonSides,
        terrainR,
        SNAP_FIT_INSET.polygon,
      );
    default:
      return layoutOnRectangle(terrainHw, terrainHh, SNAP_FIT_INSET.rectangle);
  }
}

function fridgeHoles(
  shape: BaseShape,
  outerR: number,
  outerHw: number,
  outerHh: number,
  polygonSides: number,
  circleCount: number,
): MagnetHole2D[] {
  switch (shape) {
    case "circle":
      return layoutOnCircle(
        circleCount,
        outerR,
        FRIDGE_INSET.circle,
        TOP_VERTEX_PHASE + Math.PI / circleCount,
      );
    case "polygon":
      return layoutOnPolygon(
        polygonSides,
        outerR,
        FRIDGE_INSET.polygon,
      );
    default:
      return layoutOnRectangle(outerHw, outerHh, FRIDGE_INSET.rectangle);
  }
}

/**
 * 根据装配配置计算磁铁孔 XY；未启用或对应复选框未勾选时返回空数组。
 *
 * - 圆形：沿圆周均匀分布，`circleCount` 默认 3（2～12）
 * - 矩形：四角各一（4 孔）
 * - 正多边形：孔数 = 边数，孔位沿各顶点方向内缩
 *
 * 传入 `options.footprintShape` / `polygonVertexCount` 时与托盘外轮廓严格对齐。
 */
export function computeMagnetHoleLayout(
  config: AppConfig,
  options?: MagnetLayoutOptions,
): MagnetHoleLayout {
  const { magnet } = config.assembly;
  if (!magnet.enabled) {
    return { snapFit: [], fridge: [] };
  }

  const { mapCrop } = config;
  const shape = resolveLayoutShape(mapCrop, options);
  const polygonSides = resolveLayoutPolygonSides(mapCrop, options);
  const foot = physicalFootprintMm(mapCrop);
  const terrainR = foot.radiusMm ?? foot.widthMm / 2;
  const terrainHw = foot.widthMm / 2;
  const terrainHh = foot.heightMm / 2;
  const circleCount = resolveCircleMagnetCount(magnet);

  const snapFit = magnet.snapFitHole
    ? snapFitHoles(
        shape,
        terrainR,
        terrainHw,
        terrainHh,
        polygonSides,
        circleCount,
      )
    : [];

  let fridge: MagnetHole2D[] = [];
  if (magnet.fridgeMagnetHole) {
    const { tray, assembly } = config;
    const tol = assembly.trayToleranceMm;
    const rim = tray.rimWidthMm;
    const outerR = terrainR + tol + rim;
    const outerHw = terrainHw + tol + rim;
    const outerHh = terrainHh + tol + rim;
    fridge = fridgeHoles(
      shape,
      outerR,
      outerHw,
      outerHh,
      polygonSides,
      circleCount,
    );
  }

  return { snapFit, fridge };
}
