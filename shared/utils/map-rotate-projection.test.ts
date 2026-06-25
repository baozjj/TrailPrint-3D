import assert from "node:assert/strict";
import {
  containerPointToLayerPoint,
  layerPointToContainerPoint,
} from "./map-rotate-projection.js";
import { computeTerrainCropRegion } from "./crop-region.js";
import { maskMmScale, modelMmToLatLon } from "./map-mm-projection.js";
import { latLngToContainerPoint } from "./leaflet-projection.js";
import { projectTrailToModelMm } from "./trail-coords.js";
import { createDefaultConfig } from "../types/config.js";
import type { GpxPoint } from "../types/index.js";

const W = 900;
const H = 700;

function assertLayerContainerRoundTrip(bearingDeg: number): void {
  const layer = { x: 520, y: 280 };
  const container = layerPointToContainerPoint(
    layer.x,
    layer.y,
    bearingDeg,
    W,
    H,
  );
  const back = containerPointToLayerPoint(
    container.x,
    container.y,
    bearingDeg,
    W,
    H,
  );
  assert.ok(
    Math.hypot(back.x - layer.x, back.y - layer.y) < 0.02,
    `bearing=${bearingDeg} layer↔container 误差过大`,
  );
}

function assertTrailMatchesLeafletChain(
  bearingDeg: number,
  points: GpxPoint[],
): void {
  const config = createDefaultConfig();
  config.mapCrop.mapCenterLat = 30.25;
  config.mapCrop.mapCenterLon = 120.15;
  config.mapCrop.mapZoom = 14;
  config.mapCrop.mapBearingDeg = bearingDeg;
  config.mapCrop.radiusMm = 80;

  const crop = computeTerrainCropRegion(config.mapCrop, W, H);
  const polyline = projectTrailToModelMm(points, crop, {
    mapCrop: config.mapCrop,
    viewportWidth: W,
    viewportHeight: H,
  });
  assert.ok(polyline.length >= 2);

  const scale = maskMmScale(config.mapCrop, crop, W, H);

  for (let i = 0; i < Math.min(3, polyline.length); i++) {
    const mm = polyline[i]!;
    const point = points[Math.min(i, points.length - 1)]!;
    const container = latLngToContainerPoint(
      point.lat,
      point.lon,
      config.mapCrop,
      W,
      H,
    );
    const expectedX = (container.x - scale.cx) * scale.scaleX;
    const expectedY = (scale.cy - container.y) * scale.scaleY;
    assert.ok(
      Math.hypot(mm.x - expectedX, mm.y - expectedY) < 0.5,
      `bearing=${bearingDeg} 点 ${i} 轨迹 mm 与 leaflet 链路不一致`,
    );
  }
}

function assertGeoRoundTrip(bearingDeg: number, points: GpxPoint[]): void {
  const config = createDefaultConfig();
  config.mapCrop.mapCenterLat = 30.25;
  config.mapCrop.mapCenterLon = 120.15;
  config.mapCrop.mapZoom = 14;
  config.mapCrop.mapBearingDeg = bearingDeg;
  config.mapCrop.radiusMm = 80;

  const crop = computeTerrainCropRegion(config.mapCrop, W, H);
  const polyline = projectTrailToModelMm(points, crop, {
    mapCrop: config.mapCrop,
    viewportWidth: W,
    viewportHeight: H,
  });

  for (let i = 0; i < polyline.length; i++) {
    const p = polyline[i]!;
    const geo = modelMmToLatLon(
      p.x,
      p.y,
      config.mapCrop,
      crop,
      W,
      H,
    );
    const src = points[Math.min(i, points.length - 1)]!;
    const errM = Math.hypot(
      (geo.lat - src.lat) * 110540,
      (geo.lon - src.lon) *
        111320 *
        Math.cos((src.lat * Math.PI) / 180),
    );
    assert.ok(errM < 8, `bearing=${bearingDeg} 点 ${i} 误差 ${errM.toFixed(1)}m`);
  }
}

const trail: GpxPoint[] = [
  { lat: 30.24, lon: 120.14, ele: 100 },
  { lat: 30.245, lon: 120.145, ele: 110 },
  { lat: 30.25, lon: 120.15, ele: 120 },
  { lat: 30.255, lon: 120.155, ele: 115 },
  { lat: 30.26, lon: 120.16, ele: 105 },
];

for (const bearing of [0, 30, -45, 90, 135]) {
  assertLayerContainerRoundTrip(bearing);
  assertGeoRoundTrip(bearing, trail);
  assertTrailMatchesLeafletChain(bearing, trail);
}

console.log("map-rotate-projection: ok");
