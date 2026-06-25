import type { MapCropConfig } from "../types/config";
import {
  computeRotatePanePos,
  containerPointToLayerPoint,
  layerPointToContainerPoint,
  rotateAroundOrigin,
  rotateFrom,
  type MapPaneState,
} from "./map-rotate-projection";

const EARTH_RADIUS = 6378137;
const MAX_MERCATOR_LAT = 85.0511287798;
const CRS_SCALE_FACTOR = 0.5 / (Math.PI * EARTH_RADIUS);

function mercatorProject(lat: number, lon: number): { x: number; y: number } {
  const d = Math.PI / 180;
  const clampedLat = Math.max(
    Math.min(MAX_MERCATOR_LAT, lat),
    -MAX_MERCATOR_LAT,
  );
  const sin = Math.sin(clampedLat * d);
  return {
    x: EARTH_RADIUS * lon * d,
    y: (EARTH_RADIUS * Math.log((1 + sin) / (1 - sin))) / 2,
  };
}

function mercatorUnproject(x: number, y: number): { lat: number; lon: number } {
  const d = 180 / Math.PI;
  return {
    lat: (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * d,
    lon: (x * d) / EARTH_RADIUS,
  };
}

function crsScale(zoom: number): number {
  return 256 * 2 ** zoom;
}

/** Leaflet CRS.EPSG3857 latLngToPoint */
export function latLngToCrsPoint(
  lat: number,
  lon: number,
  zoom: number,
): { x: number; y: number } {
  const p = mercatorProject(lat, lon);
  const scale = crsScale(zoom);
  return {
    x: scale * (CRS_SCALE_FACTOR * p.x + 0.5),
    y: scale * (-CRS_SCALE_FACTOR * p.y + 0.5),
  };
}

/** Leaflet CRS.EPSG3857 pointToLatLng */
export function crsPointToLatLng(
  x: number,
  y: number,
  zoom: number,
): { lat: number; lon: number } {
  const scale = crsScale(zoom);
  const mx = (x / scale - 0.5) / CRS_SCALE_FACTOR;
  const my = (y / scale - 0.5) / -CRS_SCALE_FACTOR;
  return mercatorUnproject(mx, my);
}

export function mapPaneFromConfig(mapCrop: MapCropConfig): MapPaneState {
  return {
    mapPaneX: mapCrop.mapPaneX ?? 0,
    mapPaneY: mapCrop.mapPaneY ?? 0,
  };
}

/**
 * Leaflet-rotate 的 pixelOrigin（_getNewPixelOrigin）。
 */
export function computePixelOrigin(
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
  pane: MapPaneState = mapPaneFromConfig(mapCrop),
): { x: number; y: number } {
  const w = Math.max(viewportWidth, 64);
  const h = Math.max(viewportHeight, 64);
  const bearingRad = ((mapCrop.mapBearingDeg ?? 0) * Math.PI) / 180;
  const mpx = pane.mapPaneX ?? 0;
  const mpy = pane.mapPaneY ?? 0;
  const rp = computeRotatePanePos(
    mapCrop.mapBearingDeg ?? 0,
    w,
    h,
    pane,
  );

  let p = latLngToCrsPoint(
    mapCrop.mapCenterLat,
    mapCrop.mapCenterLon,
    mapCrop.mapZoom,
  );
  p = rotateAroundOrigin(p.x, p.y, bearingRad);
  p = {
    x: p.x - w / 2 + mpx + rp.x,
    y: p.y - h / 2 + mpy + rp.y,
  };
  p = rotateAroundOrigin(p.x, p.y, -bearingRad);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** 与 map.latLngToContainerPoint 一致（EPSG3857 + leaflet-rotate） */
export function latLngToContainerPoint(
  lat: number,
  lon: number,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
  pane: MapPaneState = mapPaneFromConfig(mapCrop),
): { x: number; y: number } {
  const proj = latLngToCrsPoint(lat, lon, mapCrop.mapZoom);
  const origin = computePixelOrigin(
    mapCrop,
    viewportWidth,
    viewportHeight,
    pane,
  );
  const layerX = Math.round(proj.x) - origin.x;
  const layerY = Math.round(proj.y) - origin.y;
  return layerPointToContainerPoint(
    layerX,
    layerY,
    mapCrop.mapBearingDeg ?? 0,
    viewportWidth,
    viewportHeight,
    pane,
  );
}

/** 与 map.containerPointToLatLng 一致 */
export function containerPointToLatLng(
  x: number,
  y: number,
  mapCrop: MapCropConfig,
  viewportWidth: number,
  viewportHeight: number,
  pane: MapPaneState = mapPaneFromConfig(mapCrop),
): { lat: number; lon: number } {
  const layer = containerPointToLayerPoint(
    x,
    y,
    mapCrop.mapBearingDeg ?? 0,
    viewportWidth,
    viewportHeight,
    pane,
  );
  const origin = computePixelOrigin(
    mapCrop,
    viewportWidth,
    viewportHeight,
    pane,
  );
  return crsPointToLatLng(
    layer.x + origin.x,
    layer.y + origin.y,
    mapCrop.mapZoom,
  );
}
