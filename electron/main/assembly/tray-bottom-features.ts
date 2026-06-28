import type { TerrainMeshPayload } from "@shared/types/terrain";
import * as THREE from "three";
import { ShapeUtils } from "three";
import {
  magnetHexagonVertsMm,
  magnetHoleInteriorSample,
} from "../../../shared/utils/magnet-hole-geometry";
import type { Vec2 } from "@shared/utils/tray-footprint";

const VERTEX_SNAP_MM = 1e-4;

class VertexCache {
  private readonly map = new Map<string, number>();

  constructor(private readonly positions: number[]) {}

  getOrCreate(x: number, y: number, z: number): number {
    const key = `${Math.round(x / VERTEX_SNAP_MM)},${Math.round(y / VERTEX_SNAP_MM)},${Math.round(z / VERTEX_SNAP_MM)}`;
    const hit = this.map.get(key);
    if (hit != null) return hit;
    const idx = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.map.set(key, idx);
    return idx;
  }
}

function pointInTri2D(
  px: number,
  py: number,
  i0: number,
  i1: number,
  i2: number,
  pos: number[],
): boolean {
  const ax = pos[i0 * 3]!;
  const ay = pos[i0 * 3 + 1]!;
  const bx = pos[i1 * 3]!;
  const by = pos[i1 * 3 + 1]!;
  const cx = pos[i2 * 3]!;
  const cy = pos[i2 * 3 + 1]!;
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
  const hasPos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
  return !(hasNeg && hasPos);
}

function buildBottomPlateShape(
  outer: Vec2[],
  z: number,
  magnetHoles: ReadonlyArray<{ x: number; y: number }>,
  magnetRadius: number,
  cache: VertexCache,
  indices: number[],
): void {
  if (outer.length < 3) return;

  const contour = outer.map((v) => new THREE.Vector2(v.x, v.y));
  const holes: THREE.Vector2[][] = [];

  for (const h of magnetHoles) {
    const hex = magnetHexagonVertsMm(h.x, h.y, magnetRadius);
    holes.push(hex.map((v) => new THREE.Vector2(v.x, v.y)));
  }

  const allVerts = [...contour, ...holes.flat()];
  const faces = ShapeUtils.triangulateShape(contour, holes);
  for (const face of faces) {
    const v0 = allVerts[face[0]!]!;
    const v1 = allVerts[face[1]!]!;
    const v2 = allVerts[face[2]!]!;
    const i0 = cache.getOrCreate(v0.x, v0.y, z);
    const i1 = cache.getOrCreate(v1.x, v1.y, z);
    const i2 = cache.getOrCreate(v2.x, v2.y, z);
    indices.push(i0, i2, i1);
  }
}

function appendMagnetPocket(
  cache: VertexCache,
  indices: number[],
  cx: number,
  cy: number,
  radius: number,
  zBottom: number,
  zTop: number,
): void {
  const hexVerts = magnetHexagonVertsMm(cx, cy, radius);
  const bottomRing = hexVerts.map((v) => cache.getOrCreate(v.x, v.y, zBottom));
  const topRing = hexVerts.map((v) => cache.getOrCreate(v.x, v.y, zTop));
  const floorCenter = cache.getOrCreate(cx, cy, zTop);

  for (let s = 0; s < hexVerts.length; s++) {
    const sn = (s + 1) % hexVerts.length;
    const b0 = bottomRing[s]!;
    const b1 = bottomRing[sn]!;
    const t0 = topRing[s]!;
    const t1 = topRing[sn]!;
    indices.push(b0, t1, b1);
    indices.push(b0, t0, t1);
  }

  for (let s = 0; s < hexVerts.length; s++) {
    const sn = (s + 1) % hexVerts.length;
    indices.push(floorCenter, topRing[sn]!, topRing[s]!);
  }
}

function stripBottomCapTriangles(mesh: TerrainMeshPayload): number[] {
  const kept: number[] = [];
  const pos = mesh.positions;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t]!;
    const i1 = mesh.indices[t + 1]!;
    const i2 = mesh.indices[t + 2]!;
    const z0 = pos[i0 * 3 + 2]!;
    const z1 = pos[i1 * 3 + 2]!;
    const z2 = pos[i2 * 3 + 2]!;
    if (
      Math.abs(z0 - mesh.bottomZ) < 1e-4 &&
      Math.abs(z1 - mesh.bottomZ) < 1e-4 &&
      Math.abs(z2 - mesh.bottomZ) < 1e-4
    ) {
      continue;
    }
    kept.push(i0, i1, i2);
  }
  return kept;
}

/** 重建托盘底面与磁铁盲孔（watertight，兼容切片软件）。 */
export function applyTrayMagnetPockets(
  mesh: TerrainMeshPayload,
  outer: Vec2[],
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
  holeDepth: number,
): TerrainMeshPayload {
  const positions = [...mesh.positions];
  const indices = stripBottomCapTriangles(mesh);
  const cache = new VertexCache(positions);

  buildBottomPlateShape(
    outer,
    mesh.bottomZ,
    holes,
    holeRadius,
    cache,
    indices,
  );

  for (const h of holes) {
    appendMagnetPocket(
      cache,
      indices,
      h.x,
      h.y,
      holeRadius,
      mesh.bottomZ,
      mesh.bottomZ + holeDepth,
    );
  }

  return {
    ...mesh,
    positions,
    indices,
  };
}

/** 底面 z=0 上是否存在覆盖孔口的三角面（磁铁诊断） */
export function countBottomPlateOverHole(
  mesh: TerrainMeshPayload,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
): number {
  let covered = 0;
  const pos = mesh.positions;
  for (const h of holes) {
    const sample = magnetHoleInteriorSample(h.x, h.y, holeRadius);
    const px = sample.x;
    const py = sample.y;
    let hits = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const i0 = mesh.indices[t]!;
      const i1 = mesh.indices[t + 1]!;
      const i2 = mesh.indices[t + 2]!;
      const z0 = pos[i0 * 3 + 2]!;
      const z1 = pos[i1 * 3 + 2]!;
      const z2 = pos[i2 * 3 + 2]!;
      if (
        Math.abs(z0 - mesh.bottomZ) > 1e-3 ||
        Math.abs(z1 - mesh.bottomZ) > 1e-3 ||
        Math.abs(z2 - mesh.bottomZ) > 1e-3
      ) {
        continue;
      }
      if (pointInTri2D(px, py, i0, i1, i2, pos)) {
        hits++;
        break;
      }
    }
    if (hits > 0) covered++;
  }
  return covered;
}
