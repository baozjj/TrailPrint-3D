import type { MapCropConfig } from "../types/config";
import type { TerrainCropRegion } from "../types/terrain";
import { containerPointToLatLng } from "./leaflet-projection";
import { buildMaskGeometry } from "./mask-geometry";

export interface MaskMmScale {
  scaleX: number;
  scaleY: number;
  cx: number;
  cy: number;
}

/** 与 2D 遮罩一致：屏幕像素 ↔ 模型平面 mm 比例 */
export function maskMmScale(
  mapCrop: MapCropConfig,
  crop: TerrainCropRegion,
  viewportWidth: number,
  viewportHeight: number,
): MaskMmScale {
  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);
  const mask = buildMaskGeometry(mapCrop, w, h);
  const cx = w / 2;
  const cy = h / 2;

  let scaleX = 1;
  let scaleY = 1;
  if (mask.kind === "circle" && mask.r && mask.r > 1e-6) {
    const rMm = crop.radiusMm ?? crop.widthMm / 2;
    scaleX = rMm / mask.r;
    scaleY = rMm / mask.r;
  } else if (mask.kind === "rect" && mask.hw && mask.hh) {
    scaleX = crop.widthMm / 2 / Math.max(mask.hw, 1e-6);
    scaleY = crop.heightMm / 2 / Math.max(mask.hh, 1e-6);
  } else if (mask.vertices?.length) {
    const rMm = crop.radiusMm ?? crop.widthMm / 2;
    let maxR = 0;
    for (const v of mask.vertices) {
      maxR = Math.max(maxR, Math.hypot(v.x - cx, v.y - cy));
    }
    if (maxR > 1e-6) {
      scaleX = rMm / maxR;
      scaleY = rMm / maxR;
    }
  }

  return { scaleX, scaleY, cx, cy };
}

export function modelMmToScreen(
  xMm: number,
  yMm: number,
  scale: MaskMmScale,
): { x: number; y: number } {
  return {
    x: xMm / scale.scaleX + scale.cx,
    y: scale.cy - yMm / scale.scaleY,
  };
}

/** 模型 mm → 经纬度（与 Leaflet 地图、GPX 轨迹同一套投影） */
export function modelMmToLatLon(
  xMm: number,
  yMm: number,
  mapCrop: MapCropConfig,
  crop: TerrainCropRegion,
  viewportWidth: number,
  viewportHeight: number,
): { lat: number; lon: number } {
  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);
  const scale = maskMmScale(mapCrop, crop, w, h);
  const scr = modelMmToScreen(xMm, yMm, scale);
  return containerPointToLatLng(scr.x, scr.y, mapCrop, w, h);
}

export function heightfieldCellMm(
  crop: TerrainCropRegion,
  row: number,
  col: number,
  rows: number,
  cols: number,
): { x: number; y: number } {
  const s = cols <= 1 ? 0.5 : col / (cols - 1);
  const t = rows <= 1 ? 0.5 : row / (rows - 1);
  return {
    x: -crop.widthMm / 2 + crop.widthMm * s,
    y: -crop.heightMm / 2 + crop.heightMm * t,
  };
}

/** DEM 采样点：与山体网格、轨迹投影共用 mm 坐标系 */
export function heightfieldSampleGeo(
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
): { lats: number[]; lons: number[] } {
  const lats: number[] = [];
  const lons: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const { x, y } = heightfieldCellMm(crop, row, col, rows, cols);
      const geo = modelMmToLatLon(
        x,
        y,
        mapCrop,
        crop,
        viewportWidth,
        viewportHeight,
      );
      lats.push(geo.lat);
      lons.push(geo.lon);
    }
  }
  return { lats, lons };
}

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** 高度场全部采样点的地理外接框（与 DEM / 卫星贴图 UV 对齐） */
export function heightfieldGeoBounds(
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
  padDeg = 0.00015,
): GeoBounds {
  const { lats, lons } = heightfieldSampleGeo(
    crop,
    cols,
    rows,
    mapCrop,
    viewportWidth,
    viewportHeight,
  );
  let minLat = crop.minLat;
  let maxLat = crop.maxLat;
  let minLon = crop.minLon;
  let maxLon = crop.maxLon;
  for (let i = 0; i < lats.length; i++) {
    minLat = Math.min(minLat, lats[i]!);
    maxLat = Math.max(maxLat, lats[i]!);
    minLon = Math.min(minLon, lons[i]!);
    maxLon = Math.max(maxLon, lons[i]!);
  }
  return {
    minLat: minLat - padDeg,
    maxLat: maxLat + padDeg,
    minLon: minLon - padDeg,
    maxLon: maxLon + padDeg,
  };
}

/** 经纬度 → 北向上卫星贴图 UV（v=0 为北缘） */
export function geoToNormalizedUv(
  lat: number,
  lon: number,
  bounds: GeoBounds,
): { u: number; v: number } {
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 1e-12);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1e-12);
  return {
    u: (lon - bounds.minLon) / lonSpan,
    v: (bounds.maxLat - lat) / latSpan,
  };
}
