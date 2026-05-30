import type { MapCropConfig } from "../types/config";
import { physicalFootprintMm } from "./crop-region";

/**
 * 默认打印半径 80mm 时，遮罩约占视窗短边的比例。
 * 与 `physicalFootprintMm` 联动后，侧栏 mm 尺寸与地图遮罩、STL 一致。
 */
export const MASK_FILL_RATIO = 0.34;

const REF_CHARACTERISTIC_MM = 80;
const MASK_MAX_FILL = 0.48;
const MASK_MIN_FILL = 0.14;

export interface MaskScreenGeometry {
  kind: "circle" | "rect" | "polygon";
  cx: number;
  cy: number;
  r?: number;
  hw?: number;
  hh?: number;
  vertices?: Array<{ x: number; y: number }>;
}

function characteristicMm(
  mapCrop: MapCropConfig,
  foot: ReturnType<typeof physicalFootprintMm>,
): number {
  if (mapCrop.shape === "circle") {
    return foot.radiusMm ?? foot.widthMm / 2;
  }
  if (mapCrop.shape === "rectangle") {
    return Math.max(foot.widthMm, foot.heightMm) / 2;
  }
  return foot.radiusMm ?? foot.widthMm / 2;
}

export function buildMaskGeometry(
  mapCrop: MapCropConfig,
  canvasW: number,
  canvasH: number,
): MaskScreenGeometry {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const shortSide = Math.min(canvasW, canvasH);
  const foot = physicalFootprintMm(mapCrop);
  const scale = characteristicMm(mapCrop, foot) / REF_CHARACTERISTIC_MM;
  let baseR = shortSide * MASK_FILL_RATIO * scale;
  baseR = Math.min(baseR, shortSide * MASK_MAX_FILL);
  baseR = Math.max(baseR, shortSide * MASK_MIN_FILL);

  if (mapCrop.shape === "circle") {
    return { kind: "circle", cx, cy, r: baseR };
  }

  if (mapCrop.shape === "rectangle") {
    const ratio = foot.widthMm / Math.max(foot.heightMm, 1);
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
    return { kind: "rect", cx, cy, hw, hh };
  }

  const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)));
  const vertices: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    vertices.push({
      x: cx + baseR * Math.cos(a),
      y: cy + baseR * Math.sin(a),
    });
  }
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
    const x1 = m.cx - m.hw;
    const y1 = m.cy - m.hh;
    const x2 = m.cx + m.hw;
    const y2 = m.cy + m.hh;
    hole = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
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
