import type { GpxBounds, GpxPoint } from "../types";
import type { MapCropConfig } from "../types/config";
import { buildMaskGeometry, MASK_FILL_RATIO } from "./mask-geometry";

const DEG_TO_RAD = Math.PI / 180;

export function metersPerDegreeLon(lat: number): number {
  return 111320 * Math.cos(lat * DEG_TO_RAD);
}

export function metersPerDegreeLat(): number {
  return 110540;
}

export function boundsSpanMeters(bounds: GpxBounds): {
  widthM: number;
  heightM: number;
} {
  const latMid = (bounds.minLat + bounds.maxLat) / 2;
  const widthM = (bounds.maxLon - bounds.minLon) * metersPerDegreeLon(latMid);
  const heightM = (bounds.maxLat - bounds.minLat) * metersPerDegreeLat();
  return { widthM: Math.max(widthM, 1), heightM: Math.max(heightM, 1) };
}

/** Web Mercator 缩放级别，与 Leaflet `getZoom` / `setZoom` 一致 */
export function zoomToFitBounds(
  bounds: GpxBounds,
  canvasW: number,
  canvasH: number,
  padding = 0.12,
): number {
  const { widthM, heightM } = boundsSpanMeters(bounds);
  const latMid = (bounds.minLat + bounds.maxLat) / 2;
  const cosLat = Math.cos(latMid * DEG_TO_RAD);
  const availW = canvasW * (1 - padding * 2);
  const availH = canvasH * (1 - padding * 2);
  const mppW = widthM / availW;
  const mppH = heightM / availH;
  const mpp = Math.max(mppW, mppH, 0.5);
  const zoom = Math.log2((156543.03 * cosLat) / mpp);
  return Math.min(19, Math.max(1, zoom));
}

/** Leaflet fitBounds 用：使轨迹落在中心遮罩内的像素 padding [top, right, bottom, left] */
export function maskFitPadding(
  mapCrop: MapCropConfig,
  canvasW: number,
  canvasH: number,
  insetRatio = 0.06,
): [number, number, number, number] {
  const geom = buildMaskGeometry(mapCrop, canvasW, canvasH);
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  let inset = 12;

  if (geom.kind === "circle" && geom.r) {
    top = geom.cy - geom.r;
    bottom = canvasH - geom.cy - geom.r;
    left = geom.cx - geom.r;
    right = canvasW - geom.cx - geom.r;
    inset = geom.r * insetRatio;
  } else if (geom.kind === "rect" && geom.hw && geom.hh) {
    top = geom.cy - geom.hh;
    bottom = canvasH - geom.cy - geom.hh;
    left = geom.cx - geom.hw;
    right = canvasW - geom.cx - geom.hw;
    inset = Math.min(geom.hw, geom.hh) * insetRatio;
  } else if (geom.vertices?.length) {
    const xs = geom.vertices.map((v) => v.x);
    const ys = geom.vertices.map((v) => v.y);
    left = Math.min(...xs);
    right = canvasW - Math.max(...xs);
    top = Math.min(...ys);
    bottom = canvasH - Math.max(...ys);
    inset =
      (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) *
      0.25 *
      insetRatio;
  } else {
    return [40, 40, 40, 40];
  }

  return [
    Math.max(top + inset, 8),
    Math.max(right + inset, 8),
    Math.max(bottom + inset, 8),
    Math.max(left + inset, 8),
  ];
}

function maskFitPixels(
  mapCrop: MapCropConfig,
  canvasW: number,
  canvasH: number,
): { w: number; h: number } {
  const geom = buildMaskGeometry(mapCrop, canvasW, canvasH);
  if (geom.kind === "circle" && geom.r) {
    const d = geom.r * 2;
    return { w: d, h: d };
  }
  if (geom.kind === "rect" && geom.hw && geom.hh) {
    return { w: geom.hw * 2, h: geom.hh * 2 };
  }
  if (geom.vertices?.length) {
    const xs = geom.vertices.map((v) => v.x);
    const ys = geom.vertices.map((v) => v.y);
    return {
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  const maskDiameterPx = Math.min(canvasW, canvasH) * MASK_FILL_RATIO * 2;
  return { w: maskDiameterPx, h: maskDiameterPx };
}

/** 使 GPX 外接框落入地图中心遮罩（圆形/矩形/多边形）内，与 STL 打印区域一致 */
export function zoomToFitBoundsInMask(
  bounds: GpxBounds,
  canvasW: number,
  canvasH: number,
  mapCrop?: MapCropConfig,
  padding = 0.08,
): number {
  const { w, h } = mapCrop
    ? maskFitPixels(mapCrop, canvasW, canvasH)
    : {
        w: Math.min(canvasW, canvasH) * MASK_FILL_RATIO * 2,
        h: Math.min(canvasW, canvasH) * MASK_FILL_RATIO * 2,
      };
  return zoomToFitBounds(bounds, w, h, padding);
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03 * Math.cos(lat * DEG_TO_RAD)) / Math.pow(2, zoom);
}

export function projectPoint(
  point: GpxPoint,
  center: { lat: number; lon: number },
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const mpp = metersPerPixel(center.lat, zoom);
  const dx = (point.lon - center.lon) * metersPerDegreeLon(center.lat);
  const dy = (point.lat - center.lat) * metersPerDegreeLat();
  return {
    x: width / 2 + dx / mpp,
    y: height / 2 - dy / mpp,
  };
}

export function unprojectPoint(
  x: number,
  y: number,
  center: { lat: number; lon: number },
  zoom: number,
  width: number,
  height: number,
): { lat: number; lon: number } {
  const mpp = metersPerPixel(center.lat, zoom);
  const dx = (x - width / 2) * mpp;
  const dy = (height / 2 - y) * mpp;
  return {
    lat: center.lat + dy / metersPerDegreeLat(),
    lon: center.lon + dx / metersPerDegreeLon(center.lat),
  };
}
