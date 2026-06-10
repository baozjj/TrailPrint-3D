import type { MagnetConfig } from "../types/config";

/** 磁铁孔平面几何：内切圆容纳圆形磁铁的正六边形 */

export interface Vec2 {
  x: number;
  y: number;
}

const HEX_SIDES = 6;
/** 首顶点在 +Y，上下为平边，便于打印与取放 */
const TOP_VERTEX_PHASE = -Math.PI / 2;

export interface MagnetCutDimensions {
  /** 含公差的孔内切圆半径 (mm) */
  radiusMm: number;
  /** 含公差的孔深 (mm) */
  depthMm: number;
  /** 磁铁标称半径 (mm) */
  nominalRadiusMm: number;
  /** 磁铁标称厚度 (mm) */
  nominalDepthMm: number;
}

/** STL/CSG 挖孔尺寸：公差仅扩大孔径与孔深，不改变孔位 */
export function magnetCutDimensionsMm(magnet: MagnetConfig): MagnetCutDimensions {
  const tol = Math.max(0, magnet.toleranceMm ?? 0);
  const nominalRadiusMm = Math.max(0.5, magnet.diameterMm / 2);
  const nominalDepthMm = Math.max(0.5, magnet.thicknessMm);
  return {
    nominalRadiusMm,
    nominalDepthMm,
    radiusMm: nominalRadiusMm + tol,
    depthMm: nominalDepthMm + tol,
  };
}

/**
 * 正六边形孔轮廓：内切圆半径 = magnetRadiusMm（= 磁铁半径）。
 * 圆磁铁贴平边放入，六角空隙便于手指取出。
 */
export function magnetHexagonVertsMm(
  cx: number,
  cy: number,
  magnetRadiusMm: number,
): Vec2[] {
  const apothem = Math.max(0.5, magnetRadiusMm);
  const circumR = apothem / Math.cos(Math.PI / HEX_SIDES);
  return Array.from({ length: HEX_SIDES }, (_, i) => {
    const a = TOP_VERTEX_PHASE + (i / HEX_SIDES) * Math.PI * 2;
    return { x: cx + circumR * Math.cos(a), y: cy + circumR * Math.sin(a) };
  });
}

export function pointInMagnetHexagon(
  px: number,
  py: number,
  cx: number,
  cy: number,
  magnetRadiusMm: number,
): boolean {
  const verts = magnetHexagonVertsMm(cx, cy, magnetRadiusMm);
  for (let i = 0; i < HEX_SIDES; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % HEX_SIDES]!;
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cross < -1e-9) return false;
  }
  return true;
}

/** 孔内采样点（内切圆内侧），用于检测底面是否遮挡孔口 */
export function magnetHoleInteriorSample(
  cx: number,
  cy: number,
  magnetRadiusMm: number,
): Vec2 {
  return { x: cx, y: cy + magnetRadiusMm * 0.35 };
}
