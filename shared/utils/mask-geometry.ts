import type { MapCropConfig } from "../types/config";
import {
  clampCornerRadiusMm,
  roundedRectanglePolygon,
  roundedRegularPolygon,
} from "./rounded-footprint";

/**
 * 地图中心遮罩约占视窗短边的比例（屏幕像素，与打印 mm 无关）。
 * mm 尺寸见 `physicalFootprintMm`，仅用于 STL / DEM 导出比例。
 */
export const MASK_FILL_RATIO = 0.34;

const MASK_MAX_FILL = 0.48;
const MASK_MIN_FILL = 0.14;

export interface MaskScreenGeometry {
  kind: "circle" | "rect" | "polygon";
  cx: number;
  cy: number;
  r?: number;
  hw?: number;
  hh?: number;
  cornerR?: number;
  vertices?: Array<{ x: number; y: number }>;
}

/** 固定屏幕尺寸的选区蒙版；矩形仅取长宽比，不随 mm 绝对值缩放 */
export function buildMaskGeometry(
  mapCrop: MapCropConfig,
  canvasW: number,
  canvasH: number,
): MaskScreenGeometry {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const shortSide = Math.min(canvasW, canvasH);
  let baseR = shortSide * MASK_FILL_RATIO;
  baseR = Math.min(baseR, shortSide * MASK_MAX_FILL);
  baseR = Math.max(baseR, shortSide * MASK_MIN_FILL);

  if (mapCrop.shape === "circle") {
    return { kind: "circle", cx, cy, r: baseR };
  }

  if (mapCrop.shape === "rectangle") {
    const ratio = mapCrop.lengthMm / Math.max(mapCrop.widthMm, 1);
    let hw: number;
    let hh: number;
    if (ratio >= 1) {
      hw = baseR * Math.min(ratio, 2);
      hh = baseR;
    } else {
      hw = baseR;
      hh = baseR / ratio;
      hh = Math.min(hh, baseR * 2);
    }
    const fit = baseR / Math.max(hw, hh);
    hw *= fit;
    hh *= fit;
    const cornerR =
      (clampCornerRadiusMm(mapCrop.cornerRadiusMm, mapCrop) /
        Math.min(mapCrop.lengthMm, mapCrop.widthMm)) *
      Math.min(hw * 2, hh * 2);
    return { kind: "rect", cx, cy, hw, hh, cornerR };
  }

  const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)));
  const sideMm = mapCrop.polygonSideLengthMm;
  const circumMm =
    sideMm / (2 * Math.sin(Math.PI / n));
  const cornerR =
    (clampCornerRadiusMm(mapCrop.cornerRadiusMm, mapCrop) / circumMm) * baseR;
  const localVerts = roundedRegularPolygon(n, baseR, cornerR, 5);
  const vertices = localVerts.map((v) => ({ x: cx + v.x, y: cy + v.y }));
  return { kind: "polygon", cx, cy, vertices };
}

export function maskPolygonPoints(
  vertices: Array<{ x: number; y: number }>,
): string {
  return vertices.map((v) => `${v.x},${v.y}`).join(" ");
}

export function maskEvenOddPath(
  mapCrop: MapCropConfig,
  width: number,
  height: number,
): string {
  const m = buildMaskGeometry(mapCrop, width, height);
  const outer = `M 0 0 H ${width} V ${height} H 0 Z`;
  let hole = "";
  if (m.kind === "circle" && m.r) {
    const r = m.r;
    hole = `M ${m.cx} ${m.cy} m -${r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`;
  } else if (m.kind === "rect" && m.hw && m.hh) {
    const cornerR = m.cornerR ?? 0;
    if (cornerR > 0.5) {
      const verts = roundedRectanglePolygon(m.hw, m.hh, cornerR, 6).map((v) => ({
        x: m.cx + v.x,
        y: m.cy + v.y,
      }));
      hole =
        verts
          .map((v, i) => (i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`))
          .join(" ") + " Z";
    } else {
      const x1 = m.cx - m.hw;
      const y1 = m.cy - m.hh;
      const x2 = m.cx + m.hw;
      const y2 = m.cy + m.hh;
      hole = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
    }
  } else if (m.vertices?.length) {
    hole =
      m.vertices
        .map((v, i) => (i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`))
        .join(" ") + " Z";
  }
  return `${outer} ${hole}`;
}

export function maskHoleOutlinePath(
  mapCrop: MapCropConfig,
  width: number,
  height: number,
): string {
  const m = buildMaskGeometry(mapCrop, width, height);
  if (m.kind === "circle" && m.r) {
    const r = m.r;
    return `M ${m.cx} ${m.cy} m -${r},0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`;
  }
  if (m.kind === "rect" && m.hw && m.hh) {
    const cornerR = m.cornerR ?? 0;
    if (cornerR > 0.5) {
      const verts = roundedRectanglePolygon(m.hw, m.hh, cornerR, 6).map((v) => ({
        x: m.cx + v.x,
        y: m.cy + v.y,
      }));
      return (
        verts
          .map((v, i) => (i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`))
          .join(" ") + " Z"
      );
    }
    const x1 = m.cx - m.hw;
    const y1 = m.cy - m.hh;
    const x2 = m.cx + m.hw;
    const y2 = m.cy + m.hh;
    return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
  }
  if (m.vertices?.length) {
    return (
      m.vertices
        .map((v, i) => (i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`))
        .join(" ") + " Z"
    );
  }
  return "";
}

export function traceMaskPath(
  ctx: CanvasRenderingContext2D,
  mask: MaskScreenGeometry,
): void {
  if (mask.kind === "circle" && mask.r) {
    ctx.arc(mask.cx, mask.cy, mask.r, 0, Math.PI * 2);
    return;
  }
  if (mask.kind === "rect" && mask.hw && mask.hh) {
    const cornerR = mask.cornerR ?? 0;
    if (cornerR > 0.5) {
      const verts = roundedRectanglePolygon(mask.hw, mask.hh, cornerR, 6);
      verts.forEach((v, i) => {
        const x = mask.cx + v.x;
        const y = mask.cy + v.y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      return;
    }
    ctx.rect(mask.cx - mask.hw, mask.cy - mask.hh, mask.hw * 2, mask.hh * 2);
    return;
  }
  if (mask.kind === "polygon" && mask.vertices?.length) {
    mask.vertices.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
  }
}
