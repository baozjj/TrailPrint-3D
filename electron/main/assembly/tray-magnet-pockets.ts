import type { TerrainMeshPayload } from "@shared/types/terrain";
import * as THREE from "three";
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

function pointInConvexPolygon(p: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross < -1e-9) return false;
  }
  return true;
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

/**
 * 外轮廓 + 六边形孔底面（ShapeGeometry 约束三角剖分，与外轮廓顶点对齐）。
 */
function buildBottomPlateShape(
  outer: Vec2[],
  z: number,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
  cache: VertexCache,
  indices: number[],
): void {
  if (outer.length < 3) return;

  const shape = new THREE.Shape();
  shape.moveTo(outer[0]!.x, outer[0]!.y);
  for (let i = 1; i < outer.length; i++) {
    shape.lineTo(outer[i]!.x, outer[i]!.y);
  }
  shape.closePath();

  for (const h of holes) {
    const hex = magnetHexagonVertsMm(h.x, h.y, holeRadius);
    const holePath = new THREE.Path();
    holePath.moveTo(hex[0]!.x, hex[0]!.y);
    for (let i = hex.length - 1; i >= 1; i--) {
      holePath.lineTo(hex[i]!.x, hex[i]!.y);
    }
    holePath.closePath();
    shape.holes.push(holePath);
  }

  const geometry = new THREE.ShapeGeometry(shape);
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const indexAttr = geometry.getIndex();
  if (!indexAttr) {
    geometry.dispose();
    return;
  }

  const vertMap = new Map<number, number>();
  for (let i = 0; i < posAttr.count; i++) {
    vertMap.set(
      i,
      cache.getOrCreate(posAttr.getX(i), posAttr.getY(i), z),
    );
  }

  for (let t = 0; t < indexAttr.count; t += 3) {
    const a = vertMap.get(indexAttr.getX(t))!;
    const b = vertMap.get(indexAttr.getX(t + 1))!;
    const c = vertMap.get(indexAttr.getX(t + 2))!;
    // ShapeGeometry 法线 +Z，底面需朝 -Z
    indices.push(a, c, b);
  }

  geometry.dispose();
}

/** 单个磁铁盲孔：六边形侧壁 + 孔底面；z=0 顶环与底面网格共享顶点 */
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

/** 底面某点是否被底板三角面覆盖（用于诊断镂空） */
export function bottomPlateCoversPoint(
  mesh: TerrainMeshPayload,
  px: number,
  py: number,
): boolean {
  const pos = mesh.positions;
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
    if (pointInTri2D(px, py, i0, i1, i2, pos)) return true;
  }
  return false;
}

/** 底面 z=0 上是否存在覆盖孔口的三角面（应接近 0） */
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

/**
 * 重建托盘底面与磁铁盲孔（watertight，兼容切片软件）。
 */
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

/** 统计每个孔在 z=0 是否有完整开口环（诊断用） */
export function countBottomHoleOpenings(
  mesh: TerrainMeshPayload,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
): number {
  let count = 0;
  for (const h of holes) {
    const corners = magnetHexagonVertsMm(h.x, h.y, holeRadius);
    let matched = 0;
    for (const c of corners) {
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = mesh.positions[i]!;
        const y = mesh.positions[i + 1]!;
        const z = mesh.positions[i + 2]!;
        if (Math.abs(z - mesh.bottomZ) > 1e-3) continue;
        if (Math.hypot(x - c.x, y - c.y) < 0.45) {
          matched++;
          break;
        }
      }
    }
    if (matched >= 4) count++;
  }
  return count;
}
