import type { TrayConfig } from "@shared/types";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import type { TrayFootprint, Vec2 } from "./tray-footprint";

function triangulateFan(verts: Vec2[], reverse = false): number[] {
  const indices: number[] = [];
  for (let i = 1; i < verts.length - 1; i++) {
    if (reverse) indices.push(0, i + 1, i);
    else indices.push(0, i, i + 1);
  }
  return indices;
}

function extrudeRing(
  outer: Vec2[],
  inner: Vec2[],
  z0: number,
  z1: number,
  positions: number[],
  indices: number[],
): void {
  const n = Math.min(outer.length, inner.length);
  if (n < 3) return;

  const base = positions.length / 3;
  for (let i = 0; i < n; i++) {
    positions.push(outer[i]!.x, outer[i]!.y, z0);
    positions.push(inner[i]!.x, inner[i]!.y, z0);
    positions.push(outer[i]!.x, outer[i]!.y, z1);
    positions.push(inner[i]!.x, inner[i]!.y, z1);
  }

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const o0 = base + i * 4;
    const i0 = o0 + 1;
    const o1 = base + next * 4;
    const i1 = o1 + 1;
    const o0t = o0 + 2;
    const i0t = i0 + 2;
    const o1t = o1 + 2;
    const i1t = i1 + 2;

    indices.push(o0, i0, o1, o1, i0, i1);
    indices.push(o0t, o1t, i0t, i1t, i0t, o1t);
    indices.push(o0, o1, o0t, o1, o0t, o1t);
    indices.push(i0, i0t, i1, i1, i0t, i1t);
  }
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
 * 托盘实体：底板 + 边框环 + 凹槽内壁；顶面 Z = totalThickness，底面 Z = 0。
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

  capPolygon(footprint.outer, 0, false, positions, indices);
  capPolygon(footprint.recessInner, floorZ, true, positions, indices);

  extrudeWall(footprint.outer, 0, floorZ, positions, indices);
  extrudeWall(footprint.recessInner, floorZ, topZ, positions, indices);
  extrudeRing(footprint.outer, footprint.recessInner, floorZ, topZ, positions, indices);

  capPolygon(footprint.outer, topZ, true, positions, indices);

  return {
    positions,
    indices,
    minSurfaceZ: topZ,
    bottomZ: 0,
    gridCols: 0,
    gridRows: 0,
  };
}
