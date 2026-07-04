import type { MapCropConfig, TrayConfig } from "../types/config";
import {
  buildMaskGeometry,
  maskPolygonPoints,
  type MaskScreenGeometry,
} from "./mask-geometry";
import { roundedRectanglePolygon } from "./rounded-footprint";

export interface TrayMaskOverlay {
  /** 托盘最外缘（屏幕像素） */
  outer: MaskScreenGeometry;
  /** 外廓相对山体遮罩的缩放比（用于标注） */
  outerScale: number;
}

function terrainRadiusMm(mapCrop: MapCropConfig): number {
  if (mapCrop.shape === "circle") {
    return mapCrop.radiusMm;
  }
  if (mapCrop.shape === "rectangle") {
    return Math.max(mapCrop.lengthMm, mapCrop.widthMm) / 2;
  }
  const n = Math.max(3, Math.min(8, Math.round(mapCrop.polygonSides)));
  const side = mapCrop.polygonSideLengthMm;
  return side / (2 * Math.sin(Math.PI / n));
}

function scaleMaskGeometry(
  inner: MaskScreenGeometry,
  scaleX: number,
  scaleY: number,
): MaskScreenGeometry {
  if (inner.kind === "circle" && inner.r) {
    const s = (scaleX + scaleY) / 2;
    return {
      kind: "circle",
      cx: inner.cx,
      cy: inner.cy,
      r: inner.r * s,
    };
  }
  if (inner.kind === "rect" && inner.hw && inner.hh) {
    const cornerScale = Math.min(scaleX, scaleY);
    return {
      kind: "rect",
      cx: inner.cx,
      cy: inner.cy,
      hw: inner.hw * scaleX,
      hh: inner.hh * scaleY,
      cornerR: inner.cornerR ? inner.cornerR * cornerScale : 0,
    };
  }
  if (inner.vertices?.length) {
    return {
      kind: "polygon",
      cx: inner.cx,
      cy: inner.cy,
      vertices: inner.vertices.map((v) => ({
        x: inner.cx + (v.x - inner.cx) * scaleX,
        y: inner.cy + (v.y - inner.cy) * scaleY,
      })),
    };
  }
  return inner;
}

export function buildTrayMaskOverlay(
  mapCrop: MapCropConfig,
  tray: TrayConfig,
  canvasW: number,
  canvasH: number,
): TrayMaskOverlay | null {
  const inner = buildMaskGeometry(mapCrop, canvasW, canvasH);
  const tR = Math.max(terrainRadiusMm(mapCrop), 1);
  const rim = tray.rimWidthMm;

  let scaleX = 1;
  let scaleY = 1;
  if (mapCrop.shape === "rectangle") {
    const terrainHw = mapCrop.lengthMm / 2;
    const terrainHh = mapCrop.widthMm / 2;
    scaleX = (terrainHw + rim) / terrainHw;
    scaleY = (terrainHh + rim) / terrainHh;
  } else {
    const s = (tR + rim) / tR;
    scaleX = s;
    scaleY = s;
  }

  const outer = scaleMaskGeometry(inner, scaleX, scaleY);

  return {
    outer,
    outerScale: (scaleX + scaleY) / 2,
  };
}

export function trayOuterOutlinePath(
  overlay: TrayMaskOverlay,
  width: number,
  height: number,
): string {
  const m = overlay.outer;
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

export function trayOuterPolygonPoints(overlay: TrayMaskOverlay): string {
  const verts = overlay.outer.vertices;
  if (!verts?.length) return "";
  return maskPolygonPoints(verts);
}
