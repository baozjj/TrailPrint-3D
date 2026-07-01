import assert from "node:assert/strict";
import { computeGrooveFloorZMm } from "./trail-groove-floor";
import { applyGrooveToHeightField } from "../../electron/main/terrain/trail-groove";
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

function testFloorAtNegativeDepth(): void {
  assert.equal(computeGrooveFloorZMm(1.5), -1.5);
  assert.equal(computeGrooveFloorZMm(3), -3);
}

function testFlatGrooveInCorridor(): void {
  const cols = 64;
  const rows = 64;
  const depthMm = 1.5;
  const floorZ = computeGrooveFloorZMm(depthMm);
  const polyline = [
    { x: -20, y: 0 },
    { x: 20, y: 0 },
  ];
  const surface = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      surface[row * cols + col] = (col / (cols - 1)) * 12;
    }
  }

  const grooved = new Float64Array(surface);
  applyGrooveToHeightField(grooved, cols, rows, crop, {
    polylineMm: polyline,
    widthMm: 4,
    depthMm,
    floorZMm: floorZ,
  });

  const halfW = 2;
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const s = col / (cols - 1);
      const t = row / (rows - 1);
      const xMm = -hw + crop.widthMm * s;
      const yMm = -hh + crop.heightMm * t;
      if (distanceToPolylineMm(xMm, yMm, polyline) <= halfW) {
        assert.equal(
          grooved[row * cols + col],
          floorZ,
          "走廊内应统一挖到 floorZ",
        );
      }
    }
  }
}

testFloorAtNegativeDepth();
testFlatGrooveInCorridor();
console.log("trail-groove-floor: ok");
