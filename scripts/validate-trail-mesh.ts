import { buildTrailLineMesh } from "../shared/utils/trail-line-mesh.ts";
import { analyzeMesh } from "../shared/utils/mesh-manifold.ts";
import type { TerrainCropRegion } from "../shared/types/terrain.ts";

const crop: TerrainCropRegion = {
  shape: "circle",
  centerLat: 30.56,
  centerLon: 104.28,
  bearingDeg: 0,
  minLat: 30.55,
  maxLat: 30.57,
  minLon: 104.27,
  maxLon: 104.29,
  widthMm: 160,
  heightMm: 160,
  radiusMm: 80,
};

const heightMm = new Float64Array(64 * 64).fill(10);

function test(name: string, widthMm: number, polyline: Array<{ x: number; y: number }>) {
  const mesh = buildTrailLineMesh({
    polylineMm: polyline,
    widthMm,
    depthMm: 1.5,
    heightMm,
    cols: 64,
    rows: 64,
    crop,
    sampleStepMm: Math.max(0.18, widthMm / 8),
  });
  console.log(name, widthMm, mesh ? analyzeMesh(mesh) : null);
}

test("narrow 2pt", 0.2, [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
]);

test("narrow short", 0.2, [
  { x: 0, y: 0 },
  { x: 0.2, y: 0 },
]);

test("print width", 3.7, [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
]);

test("closed tiny loop", 0.2, [
  { x: 0, y: 0 },
  { x: 0.15, y: 0 },
  { x: 0.15, y: 0.15 },
  { x: 0, y: 0.15 },
  { x: 0, y: 0 },
]);

test("closed square", 3.7, [
  { x: -20, y: -20 },
  { x: 20, y: -20 },
  { x: 20, y: 20 },
  { x: -20, y: 20 },
  { x: -20, y: -20 },
]);
