import type {
  BorderTextEdge,
  MapCropConfig,
  TextFacing,
  TrayConfig,
} from "../types/config";
import {
  buildMaskGeometry,
  maskPolygonPoints,
  type MaskScreenGeometry,
} from "./mask-geometry";
import {
  alongOffsetMm,
  edgeLengthMm,
  facingSign,
  normalOffsetMm,
} from "./border-text-layout";
import { DEFAULT_BORDER_FONT_SIZE_MM } from "../tray/border-text-defaults";

export interface RimTextOverlay {
  text: string;
  x: number;
  y: number;
  transform: string;
  fontSizePx: number;
}

export interface TrayMaskOverlay {
  /** 托盘最外缘（屏幕像素） */
  outer: MaskScreenGeometry;
  /** 刻字预览（仅矩形/多边形且启用时） */
  rimTexts: RimTextOverlay[];
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
    return {
      kind: "rect",
      cx: inner.cx,
      cy: inner.cy,
      hw: inner.hw * scaleX,
      hh: inner.hh * scaleY,
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

function rimMidScale(rimMm: number, mapCrop: MapCropConfig): {
  scaleX: number;
  scaleY: number;
} {
  const tR = Math.max(terrainRadiusMm(mapCrop), 1);
  if (mapCrop.shape === "rectangle") {
    const terrainHw = mapCrop.lengthMm / 2;
    const terrainHh = mapCrop.widthMm / 2;
    return {
      scaleX: (terrainHw + rimMm / 2) / terrainHw,
      scaleY: (terrainHh + rimMm / 2) / terrainHh,
    };
  }
  const s = (tR + rimMm / 2) / tR;
  return { scaleX: s, scaleY: s };
}

function facingSignLocal(facing: TextFacing): number {
  return facingSign(facing);
}

/** 锚点默认在边框带厚度中线；切向由 align，法向由 centerOffsetMm */
function pushRimText(
  out: RimTextOverlay[],
  edge: BorderTextEdge,
  content: string,
  cx: number,
  cy: number,
  tangentX: number,
  tangentY: number,
  outwardX: number,
  outwardY: number,
  rotate: number,
  edgeLenPx: number,
  edgeLenMm: number,
): void {
  const sign = facingSignLocal(edge.facing ?? "outward");
  const fontSizeMm = edge.fontSizeMm || DEFAULT_BORDER_FONT_SIZE_MM;
  const pxPerMm = edgeLenMm > 0 ? edgeLenPx / edgeLenMm : 1;
  const alongPx = alongOffsetMm(edge, edgeLenMm, content) * pxPerMm;
  const normalPx = normalOffsetMm(edge) * pxPerMm;
  const fontSizePx = Math.max(10, Math.min(22, fontSizeMm * pxPerMm * 0.85));
  out.push({
    text: content,
    x: cx + tangentX * alongPx + outwardX * normalPx,
    y: cy + tangentY * alongPx + outwardY * normalPx,
    transform: `translate(-50%, -50%) rotate(${rotate + (sign < 0 ? 180 : 0)}deg)`,
    fontSizePx,
  });
}

function buildRimTexts(
  inner: MaskScreenGeometry,
  mapCrop: MapCropConfig,
  tray: TrayConfig,
  edges: BorderTextEdge[],
  enabled: boolean,
): RimTextOverlay[] {
  if (!enabled || mapCrop.shape === "circle") return [];
  const { scaleX, scaleY } = rimMidScale(tray.rimWidthMm, mapCrop);
  const rim = scaleMaskGeometry(inner, scaleX, scaleY);
  const out: RimTextOverlay[] = [];

  if (rim.kind === "rect" && rim.hw && rim.hh) {
    const bases = [
      { cx: rim.cx, cy: rim.cy - rim.hh, tx: 1, ty: 0, ox: 0, oy: -1, rot: 0 },
      { cx: rim.cx, cy: rim.cy + rim.hh, tx: 1, ty: 0, ox: 0, oy: 1, rot: 0 },
      { cx: rim.cx - rim.hw, cy: rim.cy, tx: 0, ty: 1, ox: -1, oy: 0, rot: -90 },
      { cx: rim.cx + rim.hw, cy: rim.cy, tx: 0, ty: 1, ox: 1, oy: 0, rot: 90 },
    ];
    for (let i = 0; i < bases.length; i++) {
      const edge = edges[i];
      const content = edge?.content?.trim();
      if (!content || !edge) continue;
      const b = bases[i]!;
      const edgeLenPx = i % 2 === 0 ? rim.hw * 2 : rim.hh * 2;
      const edgeLenMmVal = edgeLengthMm(mapCrop, i);
      pushRimText(
        out,
        edge,
        content,
        b.cx - (b.tx * edgeLenPx) / 2,
        b.cy - (b.ty * edgeLenPx) / 2,
        b.tx,
        b.ty,
        b.ox,
        b.oy,
        b.rot,
        edgeLenPx,
        edgeLenMmVal,
      );
    }
    return out;
  }

  if (rim.vertices?.length) {
    const n = rim.vertices.length;
    for (let i = 0; i < n; i++) {
      const edge = edges[i];
      const content = edge?.content?.trim();
      if (!content || !edge) continue;
      const a = rim.vertices[i]!;
      const b = rim.vertices[(i + 1) % n]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const edgeLenPx = Math.hypot(dx, dy) || 1;
      const tx = dx / edgeLenPx;
      const ty = dy / edgeLenPx;
      let ox = -ty;
      let oy = tx;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dot = (mx - rim.cx) * ox + (my - rim.cy) * oy;
      if (dot < 0) {
        ox = -ox;
        oy = -oy;
      }
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const rotate = Math.abs(angle) > 90 ? angle + 180 : angle;
      pushRimText(
        out,
        edge,
        content,
        a.x,
        a.y,
        tx,
        ty,
        ox,
        oy,
        rotate,
        edgeLenPx,
        edgeLengthMm(mapCrop, i),
      );
    }
  }
  return out;
}

export function buildTrayMaskOverlay(
  mapCrop: MapCropConfig,
  tray: TrayConfig,
  canvasW: number,
  canvasH: number,
  borderTextEnabled: boolean,
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
  const rimTexts = buildRimTexts(
    inner,
    mapCrop,
    tray,
    tray.borderTextByEdge,
    borderTextEnabled,
  );

  return {
    outer,
    rimTexts,
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
