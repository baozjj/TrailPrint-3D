import assert from "node:assert/strict";
import { applyGrooveToHeightField } from "../../electron/main/terrain/trail-groove";
import { computeGrooveFloorZMm } from "./trail-groove-floor";
import { distanceToPolylineMm } from "./trail-coords";
import type { TerrainCropRegion } from "../types/terrain";

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

const cols = 64;
const rows = 64;
const polyline = [
  { x: -20, y: 0 },
  { x: 20, y: 0 },
];
const widthMm = 4;

/** 深度 3 mm 时可挖穿 2 mm 基础（槽底 -3） */
function testPierceBaseLayer(): void {
  const depthMm = 3;
  const floorZ = computeGrooveFloorZMm(depthMm);
  const surface = new Float64Array(cols * rows).fill(0);
  const grooved = new Float64Array(surface);
  applyGrooveToHeightField(grooved, cols, rows, crop, {
    polylineMm: polyline,
    widthMm,
    depthMm,
    floorZMm: floorZ,
  });

  const halfW = widthMm / 2;
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  let inCorridor = false;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const s = col / (cols - 1);
      const t = row / (rows - 1);
      const xMm = -hw + crop.widthMm * s;
      const yMm = -hh + crop.heightMm * t;
      if (distanceToPolylineMm(xMm, yMm, polyline) <= halfW) {
        inCorridor = true;
        assert.equal(grooved[row * cols + col], -3);
      }
    }
  }
  assert.ok(inCorridor);
}

testPierceBaseLayer();
console.log("trail-groove: ok");
