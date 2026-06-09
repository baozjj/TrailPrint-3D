import type { TrayConfig } from "@shared/types";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import type { TrayFootprint, Vec2 } from "@shared/utils/tray-footprint";

function triangulateFan(verts: Vec2[], reverse = false): number[] {
  const indices: number[] = [];
  for (let i = 1; i < verts.length - 1; i++) {
    if (reverse) indices.push(0, i + 1, i);
    else indices.push(0, i, i + 1);
  }
  return indices;
}

function capPolygon(
  verts: Vec2[],
  z: number,
  normalUp: boolean,
  positions: number[],
  indices: number[],
): void {
  const base = positions.length / 3;
  for (const v of verts) {
    positions.push(v.x, v.y, z);
  }
  const tris = triangulateFan(verts, !normalUp);
  for (const t of tris) indices.push(base + t);
}

function extrudeWall(
  verts: Vec2[],
  z0: number,
  z1: number,
  positions: number[],
  indices: number[],
): void {
  const n = verts.length;
  const base = positions.length / 3;
  for (let i = 0; i < n; i++) {
    positions.push(verts[i]!.x, verts[i]!.y, z0);
    positions.push(verts[i]!.x, verts[i]!.y, z1);
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const a = base + i * 2;
    const b = base + next * 2;
    const at = a + 1;
    const bt = b + 1;
    indices.push(a, b, at, b, bt, at);
  }
}

/**
 * 环形盖面：outer 与 inner 之间的环形面，法线朝上（+Z）。
 * 用于生成边框顶面（rim top）。
 */
function capRingUp(
  outer: Vec2[],
  inner: Vec2[],
  z: number,
  positions: number[],
  indices: number[],
): void {
  const n = Math.min(outer.length, inner.length);
  if (n < 3) return;

  const base = positions.length / 3;
  for (let i = 0; i < n; i++) {
    positions.push(outer[i]!.x, outer[i]!.y, z);
  }
  for (let i = 0; i < n; i++) {
    positions.push(inner[i]!.x, inner[i]!.y, z);
  }

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const o0 = base + i;
    const o1 = base + next;
    const i0 = base + n + i;
    const i1 = base + n + next;
    indices.push(o0, o1, i1);
    indices.push(o0, i1, i0);
  }
}

/**
 * 托盘实体：底板 + 边框环 + 凹槽内壁；顶面 Z = totalThickness，底面 Z = 0。
 *
 * 5 个边界曲面：
 * 1. 底面 — outer Z=0，法线朝下
 * 2. 凹槽底面 — inner Z=floorZ，法线朝上
 * 3. 外侧壁 — outer Z=0→topZ，法线朝外
 * 4. 凹槽内壁 — inner Z=floorZ→topZ，法线朝内
 * 5. 边框顶面 — outer 与 inner 环形面 Z=topZ，法线朝上
 */
export function buildTrayBaseMesh(
  footprint: TrayFootprint,
  tray: TrayConfig,
): TerrainMeshPayload {
  const { totalThicknessMm, recessDepthMm } = tray;
  const floorZ = totalThicknessMm - recessDepthMm;
  const topZ = totalThicknessMm;

  const positions: number[] = [];
  const indices: number[] = [];

  // 1. 底面：outer 边界 Z=0，法线朝下
  capPolygon(footprint.outer, 0, false, positions, indices);

  // 2. 凹槽底面：inner 边界 Z=floorZ，法线朝上
  capPolygon(footprint.recessInner, floorZ, true, positions, indices);

  // 3. 外侧壁：outer 边界 Z=0→topZ，法线朝外
  extrudeWall(footprint.outer, 0, topZ, positions, indices);

  // 4. 凹槽内壁：inner 边界 Z=floorZ→topZ，法线朝内
  //    翻转多边形绕向使 extrudeWall 产生朝内的法线
  extrudeWall(
    [...footprint.recessInner].reverse(),
    floorZ,
    topZ,
    positions,
    indices,
  );

  // 5. 边框顶面：outer 与 inner 环形面 Z=topZ，法线朝上
  capRingUp(footprint.outer, footprint.recessInner, topZ, positions, indices);

  return {
    positions,
    indices,
    minSurfaceZ: topZ,
    bottomZ: 0,
    gridCols: 0,
    gridRows: 0,
  };
}
