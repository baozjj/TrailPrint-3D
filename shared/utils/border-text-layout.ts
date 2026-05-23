import type { BorderTextEdge, MapCropConfig, TextFacing } from "../types/config";
import {
  DEFAULT_BORDER_FONT_SIZE_MM,
} from "../tray/border-text-defaults";

/** 估算单条边的物理长度 (mm) */
export function edgeLengthMm(
  mapCrop: MapCropConfig,
  edgeIndex: number,
): number {
  if (mapCrop.shape === "rectangle") {
    return edgeIndex % 2 === 0
      ? mapCrop.lengthMm
      : mapCrop.widthMm;
  }
  if (mapCrop.shape === "polygon") {
    return mapCrop.polygonSideLengthMm;
  }
  return 0;
}

export function estimateTextWidthMm(
  text: string,
  fontSizeMm: number,
): number {
  return (
    fontSizeMm * 0.55 * text.length +
    fontSizeMm * 0.12 * Math.max(0, text.length - 1)
  );
}

/** 沿边起点偏移 (mm)，仅由 align 决定切向位置 */
export function alongOffsetMm(
  edge: BorderTextEdge,
  segLenMm: number,
  text: string,
): number {
  const fontSize = edge.fontSizeMm || DEFAULT_BORDER_FONT_SIZE_MM;
  const textW = estimateTextWidthMm(text, fontSize);
  if (edge.align === "left") return 0;
  if (edge.align === "right") return Math.max(0, segLenMm - textW);
  return Math.max(0, (segLenMm - textW) / 2);
}

/** 相对边框带厚度中线的法向偏移 (mm)，正=朝外 */
export function normalOffsetMm(edge: BorderTextEdge): number {
  return edge.centerOffsetMm;
}

export function facingSign(facing: TextFacing): number {
  return facing === "outward" ? 1 : -1;
}
