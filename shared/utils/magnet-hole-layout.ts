import type { AppConfig, MagnetConfig } from "../types/config";
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

/** 圆形磁铁孔数量（默认 3，范围 2～12） */
export function resolveCircleMagnetCount(magnet: MagnetConfig): number {
  const n = magnet.circleCount ?? 3;
  return Math.max(2, Math.min(12, Math.round(n)));
}

/** 沿角方向内缩，孔位靠近多边形/矩形顶点 */
const CORNER_INSET = 0.88;
const CIRCLE_SNAP_RADIUS_RATIO = 0.55;
const FRIDGE_OUTER_RADIUS_RATIO = 0.72;

function regularPolygonVertices(n: number, radius: number): MagnetHole2D[] {
  const verts: MagnetHole2D[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    verts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return verts;
}

function insetFromCorners(
  verts: MagnetHole2D[],
  inset = CORNER_INSET,
): MagnetHole2D[] {
  return verts.map((v) => ({ x: v.x * inset, y: v.y * inset }));
}

function positionsOnCircle(
  radiusMm: number,
  count: number,
  phaseOffset = -Math.PI / 2,
): MagnetHole2D[] {
  const holes: MagnetHole2D[] = [];
  for (let i = 0; i < count; i++) {
    const a = phaseOffset + (i / count) * Math.PI * 2;
    holes.push({ x: radiusMm * Math.cos(a), y: radiusMm * Math.sin(a) });
  }
  return holes;
}

function snapFitPositionsCircle(
  radiusMm: number,
  count: number,
): MagnetHole2D[] {
  return positionsOnCircle(radiusMm * CIRCLE_SNAP_RADIUS_RATIO, count);
}

function snapFitPositionsRect(hw: number, hh: number): MagnetHole2D[] {
  const ix = hw * CORNER_INSET;
  const iy = hh * CORNER_INSET;
  return [
    { x: -ix, y: -iy },
    { x: ix, y: -iy },
    { x: ix, y: iy },
    { x: -ix, y: iy },
  ];
}

function snapFitPositionsPolygon(
  sides: number,
  terrainR: number,
): MagnetHole2D[] {
  const n = Math.max(3, Math.min(8, Math.round(sides)));
  return insetFromCorners(regularPolygonVertices(n, terrainR));
}

function fridgePositionsCircle(
  outerRadiusMm: number,
  count: number,
): MagnetHole2D[] {
  return positionsOnCircle(
    outerRadiusMm * FRIDGE_OUTER_RADIUS_RATIO,
    count,
    -Math.PI / 2 + Math.PI / count,
  );
}

function fridgePositionsRect(outerHw: number, outerHh: number): MagnetHole2D[] {
  const ix = outerHw * FRIDGE_OUTER_RADIUS_RATIO;
  const iy = outerHh * FRIDGE_OUTER_RADIUS_RATIO;
  return [
    { x: -ix, y: -iy },
    { x: ix, y: -iy },
    { x: ix, y: iy },
    { x: -ix, y: iy },
  ];
}

function fridgePositionsPolygon(sides: number, outerR: number): MagnetHole2D[] {
  const n = Math.max(3, Math.min(8, Math.round(sides)));
  return insetFromCorners(
    regularPolygonVertices(n, outerR),
    FRIDGE_OUTER_RADIUS_RATIO,
  );
}

/**
 * 根据装配配置计算磁铁孔 XY；未启用或对应复选框未勾选时返回空数组。
 * - 圆形：沿圆周均匀分布，数量由 circleCount 配置（默认 3）
 * - 矩形：四角各一
 * - 正多边形：每个顶点方向各一（边数 = 孔数）
 */
export function computeMagnetHoleLayout(config: AppConfig): MagnetHoleLayout {
  const { magnet } = config.assembly;
  if (!magnet.enabled) {
    return { snapFit: [], fridge: [] };
  }

  const foot = physicalFootprintMm(config.mapCrop);
  const terrainR = foot.radiusMm ?? foot.widthMm / 2;
  const terrainHw = foot.widthMm / 2;
  const terrainHh = foot.heightMm / 2;
  const circleCount = resolveCircleMagnetCount(magnet);

  let snapFit: MagnetHole2D[] = [];
  if (magnet.snapFitHole) {
    if (config.mapCrop.shape === "rectangle") {
      snapFit = snapFitPositionsRect(terrainHw, terrainHh);
    } else if (config.mapCrop.shape === "polygon") {
      snapFit = snapFitPositionsPolygon(config.mapCrop.polygonSides, terrainR);
    } else {
      snapFit = snapFitPositionsCircle(terrainR, circleCount);
    }
  }

  let fridge: MagnetHole2D[] = [];
  if (magnet.fridgeMagnetHole) {
    const { tray, assembly } = config;
    const tol = assembly.trayToleranceMm;
    const rim = tray.rimWidthMm;
    if (config.mapCrop.shape === "rectangle") {
      const outerHw = terrainHw + tol + rim;
      const outerHh = terrainHh + tol + rim;
      fridge = fridgePositionsRect(outerHw, outerHh);
    } else if (config.mapCrop.shape === "polygon") {
      const outerR = terrainR + tol + rim;
      fridge = fridgePositionsPolygon(config.mapCrop.polygonSides, outerR);
    } else {
      const outerR = terrainR + tol + rim;
      fridge = fridgePositionsCircle(outerR, circleCount);
    }
  }

  return { snapFit, fridge };
}
