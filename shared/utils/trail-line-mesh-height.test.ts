import assert from "node:assert/strict";
import { buildTrailLineMesh } from "./trail-line-mesh";
import { computeGrooveFloorZMm } from "./trail-groove-floor";
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

/** 平底槽：底面统一 floorZ，顶面贴地表 + 高出 */
function testFlatGrooveTrailLine(): void {
  const cols = 32;
  const rows = 32;
  const surface = new Float64Array(cols * rows).fill(10);
  const trailDepthMm = 1.5;
  const heightAboveMm = 0.12;
  const floorZ = computeGrooveFloorZMm(trailDepthMm);

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
    grooveFloorZMm: floorZ,
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
    Math.abs(minZ - floorZ) < 0.05,
    `底面应贴合 floorZ=${floorZ}，实际 minZ=${minZ}`,
  );
  assert.ok(
    Math.abs(maxZ - (10 + heightAboveMm)) < 0.05,
    `顶面应约为地表+高出量，实际 maxZ=${maxZ}`,
  );
}

testFlatGrooveTrailLine();
console.log("trail-line-mesh-height: ok");
