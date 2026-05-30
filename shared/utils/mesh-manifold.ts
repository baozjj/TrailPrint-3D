import type { TerrainMeshPayload } from "../types/terrain";

export interface MeshAnalysis {
  triangles: number;
  vertices: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  degenerateTriangles: number;
}

/** 统计开放边界边（应为 0 才是可打印封闭体） */
export function analyzeMesh(mesh: TerrainMeshPayload): MeshAnalysis {
  const edgeCount = new Map<string, number>();
  let degenerateTriangles = 0;
  const pos = mesh.positions;

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t]!;
    const i1 = mesh.indices[t + 1]!;
    const i2 = mesh.indices[t + 2]!;
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      degenerateTriangles++;
      continue;
    }
    const ax = pos[i0 * 3]!;
    const ay = pos[i0 * 3 + 1]!;
    const az = pos[i0 * 3 + 2]!;
    const bx = pos[i1 * 3]!;
    const by = pos[i1 * 3 + 1]!;
    const bz = pos[i1 * 3 + 2]!;
    const cx = pos[i2 * 3]!;
    const cy = pos[i2 * 3 + 1]!;
    const cz = pos[i2 * 3 + 2]!;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    if (nx * nx + ny * ny + nz * nz < 1e-16) degenerateTriangles++;

    const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ] as const) {
      const k = key(a, b);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const c of edgeCount.values()) {
    if (c === 1) boundaryEdges++;
    else if (c > 2) nonManifoldEdges++;
  }

  return {
    triangles: mesh.indices.length / 3,
    vertices: mesh.positions.length / 3,
    boundaryEdges,
    nonManifoldEdges,
    degenerateTriangles,
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

export function assertWatertightMesh(
  mesh: TerrainMeshPayload,
  label: string,
): void {
  const a = analyzeMesh(mesh);
  if (a.boundaryEdges > 0 || a.nonManifoldEdges > 0) {
    throw new Error(
      `${label} 不是封闭水密网格（开放边 ${a.boundaryEdges}，非流形边 ${a.nonManifoldEdges}）`,
    );
  }
}
