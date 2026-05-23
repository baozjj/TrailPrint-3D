import type { TerrainMeshPayload } from "@shared/types/terrain";

export function mergeMeshPayloads(
  parts: TerrainMeshPayload[],
): TerrainMeshPayload {
  const positions: number[] = [];
  const indices: number[] = [];
  let minSurfaceZ = Infinity;
  let bottomZ = Infinity;

  for (const part of parts) {
    if (!part.positions.length) continue;
    const offset = positions.length / 3;
    positions.push(...part.positions);
    for (const idx of part.indices) {
      indices.push(idx + offset);
    }
    minSurfaceZ = Math.min(minSurfaceZ, part.minSurfaceZ);
    bottomZ = Math.min(bottomZ, part.bottomZ);
  }

  return {
    positions,
    indices,
    minSurfaceZ: Number.isFinite(minSurfaceZ) ? minSurfaceZ : 0,
    bottomZ: Number.isFinite(bottomZ) ? bottomZ : 0,
    gridCols: 0,
    gridRows: 0,
  };
}
