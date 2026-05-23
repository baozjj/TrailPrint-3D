import type { GpxBounds, GpxPoint } from "../types";

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

export function zoomToFitBounds(
  bounds: GpxBounds,
  canvasW: number,
  canvasH: number,
  padding = 0.12,
): number {
  const { widthM, heightM } = boundsSpanMeters(bounds);
  const availW = canvasW * (1 - padding * 2);
  const availH = canvasH * (1 - padding * 2);
  const mppW = widthM / availW;
  const mppH = heightM / availH;
  const mpp = Math.max(mppW, mppH, 0.5);
  const zoom = Math.log2(156543.03 / mpp) - 8;
  return Math.min(18, Math.max(8, zoom));
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03 * Math.cos(lat * DEG_TO_RAD)) / Math.pow(2, zoom + 8);
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
