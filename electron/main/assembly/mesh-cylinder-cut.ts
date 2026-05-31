import type { TerrainMeshPayload } from "@shared/types/terrain";

/** 竖直圆柱切割体（模型坐标 mm） */
export interface CylinderCut {
  x: number;
  y: number;
  radius: number;
  zBottom: number;
  zTop: number;
}

const WALL_SEGMENTS = 24;
const EPS = 1e-5;

function vertexAt(
  positions: number[],
  index: number,
): { x: number; y: number; z: number } {
  const i = index * 3;
  return {
    x: positions[i]!,
    y: positions[i + 1]!,
    z: positions[i + 2]!,
  };
}

function isInsideCut(
  x: number,
  y: number,
  z: number,
  cut: CylinderCut,
): boolean {
  const dx = x - cut.x;
  const dy = y - cut.y;
  if (dx * dx + dy * dy > cut.radius * cut.radius + EPS) return false;
  return z >= cut.zBottom - EPS && z <= cut.zTop + EPS;
}

/** 三角面是否与圆柱切割体相交（用于打孔，避免仅删除完全体内三角面导致孔打不穿） */
function triangleIntersectsCut(
  positions: number[],
  i0: number,
  i1: number,
  i2: number,
  cut: CylinderCut,
): boolean {
  const v0 = vertexAt(positions, i0);
  const v1 = vertexAt(positions, i1);
  const v2 = vertexAt(positions, i2);
  if (
    isInsideCut(v0.x, v0.y, v0.z, cut) ||
    isInsideCut(v1.x, v1.y, v1.z, cut) ||
    isInsideCut(v2.x, v2.y, v2.z, cut)
  ) {
    return true;
  }
  const cx = (v0.x + v1.x + v2.x) / 3;
  const cy = (v0.y + v1.y + v2.y) / 3;
  const cz = (v0.z + v1.z + v2.z) / 3;
  return isInsideCut(cx, cy, cz, cut);
}

function appendCylinderCap(
  positions: number[],
  indices: number[],
  cut: CylinderCut,
  z: number,
  outwardNormalUp: boolean,
): void {
  const center = pushVertex(positions, cut.x, cut.y, z);
  const ring: number[] = [];
  for (let s = 0; s < WALL_SEGMENTS; s++) {
    const a = (s / WALL_SEGMENTS) * Math.PI * 2;
    ring.push(
      pushVertex(
        positions,
        cut.x + cut.radius * Math.cos(a),
        cut.y + cut.radius * Math.sin(a),
        z,
      ),
    );
  }
  for (let s = 0; s < WALL_SEGMENTS; s++) {
    const a = ring[s]!;
    const b = ring[(s + 1) % WALL_SEGMENTS]!;
    if (outwardNormalUp) indices.push(center, a, b);
    else indices.push(center, b, a);
  }
}

function pushVertex(
  positions: number[],
  x: number,
  y: number,
  z: number,
): number {
  const idx = positions.length / 3;
  positions.push(x, y, z);
  return idx;
}

function appendCylinderWall(
  positions: number[],
  indices: number[],
  cut: CylinderCut,
): void {
  const base = positions.length / 3;
  for (let s = 0; s < WALL_SEGMENTS; s++) {
    const a0 = (s / WALL_SEGMENTS) * Math.PI * 2;
    const a1 = ((s + 1) / WALL_SEGMENTS) * Math.PI * 2;
    const x0 = cut.x + cut.radius * Math.cos(a0);
    const y0 = cut.y + cut.radius * Math.sin(a0);
    const x1 = cut.x + cut.radius * Math.cos(a1);
    const y1 = cut.y + cut.radius * Math.sin(a1);
    positions.push(x0, y0, cut.zBottom, x1, y1, cut.zBottom);
    positions.push(x0, y0, cut.zTop, x1, y1, cut.zTop);
  }

  for (let s = 0; s < WALL_SEGMENTS; s++) {
    const i = s * 4;
    const b0 = base + i;
    const b1 = base + i + 1;
    const t0 = base + i + 2;
    const t1 = base + i + 3;
    const next = base + ((s + 1) % WALL_SEGMENTS) * 4;
    const nb0 = next;
    const nb1 = next + 1;
    const nt0 = next + 2;
    const nt1 = next + 3;
    indices.push(b0, b1, nb0, b1, nb1, nb0);
    indices.push(t0, nt0, t1, t1, nt0, nt1);
    indices.push(b0, t0, b1, b1, t0, t1);
  }
}

/**
 * 从封闭网格中减去竖直圆柱（移除体内三角面并补内壁）。
 */
export function applyCylinderCuts(
  mesh: TerrainMeshPayload,
  cuts: CylinderCut[],
): TerrainMeshPayload {
  if (!cuts.length || !mesh.indices.length) return mesh;

  const positions = [...mesh.positions];
  const kept: number[] = [];

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t]!;
    const i1 = mesh.indices[t + 1]!;
    const i2 = mesh.indices[t + 2]!;
    const remove = cuts.some((cut) =>
      triangleIntersectsCut(mesh.positions, i0, i1, i2, cut),
    );
    if (!remove) {
      kept.push(i0, i1, i2);
    }
  }

  const indices = kept;
  for (const cut of cuts) {
    appendCylinderWall(positions, indices, cut);
    appendCylinderCap(positions, indices, cut, cut.zTop, true);
    if (cut.zBottom > mesh.bottomZ + EPS) {
      appendCylinderCap(positions, indices, cut, cut.zBottom, false);
    }
  }

  return {
    ...mesh,
    positions,
    indices,
  };
}
