import assert from "node:assert/strict";
import { buildTrailLineMesh } from "./trail-line-mesh";
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

function makeSlopedField(cols: number, rows: number): Float64Array {
  const field = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      field[row * cols + col] = 8 + (col / (cols - 1)) * 4;
    }
  }
  return field;
}

/** 平底导出：底面贴 floorZ，顶面 = 地表 + 高出量 */
function testFlatFloorTrailHeight(): void {
  const cols = 32;
  const rows = 32;
  const surface = makeSlopedField(cols, rows);
  const trailDepthMm = 1.5;
  const heightAboveMm = 0.12;
  const flatFloorZ = 6.5;

  const mesh = buildTrailLineMesh({
    polylineMm: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ],
    widthMm: 4,
    depthMm: trailDepthMm,
    heightMm: surface,
    cols,
    rows,
    crop,
    flatFloorZMm: flatFloorZ,
    zTopOffsetMm: heightAboveMm,
    sampleStepMm: 2,
  });

  assert.ok(mesh, "应生成轨迹网格");

  const pos = mesh.positions;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 2; i < pos.length; i += 3) {
    const z = pos[i]!;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  assert.ok(
    Math.abs(minZ - flatFloorZ) < 0.02,
    `底面应贴合 floorZ=${flatFloorZ}，实际 minZ=${minZ}`,
  );
  assert.ok(
    maxZ >= flatFloorZ + trailDepthMm + heightAboveMm - 0.05,
    `顶面至少为 floorZ + 槽深 + 高出量，实际 maxZ=${maxZ}`,
  );
}

/** 无平底：顶面 = 地表 + 高出量，底面 = 地表 - 槽深 */
function testSlopedTrailHeight(): void {
  const cols = 32;
  const rows = 32;
  const surface = new Float64Array(cols * rows).fill(10);
  const trailDepthMm = 1.5;
  const heightAboveMm = 0.12;

  const mesh = buildTrailLineMesh({
    polylineMm: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    widthMm: 4,
    depthMm: trailDepthMm,
    heightMm: surface,
    cols,
    rows,
    crop,
    zTopOffsetMm: heightAboveMm,
    sampleStepMm: 2,
  });

  assert.ok(mesh, "应生成轨迹网格");

  const pos = mesh.positions;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 2; i < pos.length; i += 3) {
    const z = pos[i]!;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  assert.ok(
    Math.abs(maxZ - (10 + heightAboveMm)) < 0.05,
    `顶面应约为地表+高出量，实际 maxZ=${maxZ}`,
  );
  assert.ok(
    Math.abs(minZ - (10 - trailDepthMm)) < 0.05,
    `底面应约为地表-槽深，实际 minZ=${minZ}`,
  );
}

testFlatFloorTrailHeight();
testSlopedTrailHeight();
console.log("trail-line-mesh-height: ok");
