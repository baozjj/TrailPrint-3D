import type { TerrainMeshPayload } from "../types/terrain";
import type { TrailGrooveSpec } from "../types/terrain";
import { computeGrooveFloorZMm } from "./trail-groove-floor";
import { distanceToPolylineMm, type TrailPointMm } from "./trail-coords";

/**
 * 极坐标等地形网格在轨迹走廊外会做双线性插值，窄槽会被抹平。
 * 导出后对顶面顶点沿轨迹压印平底槽（Z = floorZMm）。
 */
export function imprintGrooveOnTerrainMesh(
  mesh: TerrainMeshPayload,
  groove: TrailGrooveSpec | undefined,
): TerrainMeshPayload {
  if (!groove?.polylineMm?.length || groove.depthMm <= 0) {
    return mesh;
  }

  const floorZ =
    groove.floorZMm ?? computeGrooveFloorZMm(groove.depthMm);
  const halfW = groove.widthMm / 2;
  const polyline = groove.polylineMm as TrailPointMm[];
  const bottomZ = mesh.bottomZ;
  const positions = mesh.positions.slice();

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (z <= bottomZ + 1e-4) continue;
    if (distanceToPolylineMm(x, y, polyline) <= halfW) {
      positions[i + 2] = Math.min(z, floorZ);
    }
  }

  let minSurfaceZ = mesh.minSurfaceZ;
  for (let i = 2; i < positions.length; i += 3) {
    const z = positions[i]!;
    if (z > bottomZ + 1e-4 && z < minSurfaceZ) minSurfaceZ = z;
  }

  return { ...mesh, positions, minSurfaceZ };
}
