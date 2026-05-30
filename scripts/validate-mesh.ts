/**
 * 统计网格边界边（只被 1 个三角面使用）与非流形边（>2），用于定位镂空。
 */
import type { TerrainMeshPayload } from "../shared/types/terrain.ts";

export function analyzeMesh(mesh: TerrainMeshPayload): {
  triangles: number;
  vertices: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  openBoundaryEdgeSample: Array<[number, number, number, number, number, number]>;
} {
  const edgeCount = new Map<string, number>();
  const edgeVerts = new Map<string, [number, number]>();

  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t]!;
    const i1 = mesh.indices[t + 1]!;
    const i2 = mesh.indices[t + 2]!;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ] as const) {
      const k = key(a, b);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      edgeVerts.set(k, [a, b]);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  const openBoundaryEdgeSample: Array<
    [number, number, number, number, number, number]
  > = [];
  const pos = mesh.positions;

  for (const [k, count] of edgeCount) {
    if (count === 1) {
      boundaryEdges++;
      if (openBoundaryEdgeSample.length < 5) {
        const [a, b] = edgeVerts.get(k)!;
        openBoundaryEdgeSample.push([
          pos[a * 3]!,
          pos[a * 3 + 1]!,
          pos[a * 3 + 2]!,
          pos[b * 3]!,
          pos[b * 3 + 1]!,
          pos[b * 3 + 2]!,
        ]);
      }
    } else if (count > 2) nonManifoldEdges++;
  }

  return {
    triangles: mesh.indices.length / 3,
    vertices: mesh.positions.length / 3,
    boundaryEdges,
    nonManifoldEdges,
    openBoundaryEdgeSample,
  };
}

export function weldMeshVertices(
  mesh: TerrainMeshPayload,
  toleranceMm = 0.05,
): TerrainMeshPayload {
  const positions = mesh.positions;
  const vertCount = positions.length / 3;
  const map = new Int32Array(vertCount);
  map.fill(-1);
  const newPos: number[] = [];
  const tol2 = toleranceMm * toleranceMm;

  function findOrAdd(x: number, y: number, z: number): number {
    for (let i = 0; i < newPos.length / 3; i++) {
      const dx = newPos[i * 3]! - x;
      const dy = newPos[i * 3 + 1]! - y;
      const dz = newPos[i * 3 + 2]! - z;
      if (dx * dx + dy * dy + dz * dz <= tol2) return i;
    }
    const idx = newPos.length / 3;
    newPos.push(x, y, z);
    return idx;
  }

  for (let v = 0; v < vertCount; v++) {
    map[v] = findOrAdd(
      positions[v * 3]!,
      positions[v * 3 + 1]!,
      positions[v * 3 + 2]!,
    );
  }

  const indices = mesh.indices.map((i) => map[i]!);
  return { ...mesh, positions: newPos, indices };
}
