import type { TerrainMeshPayload } from "@shared/types/terrain";
import * as THREE from "three";
import { ShapeUtils } from "three";
import type { LedPocketSpec } from "../../../shared/utils/tray-nfc-layout";
import { ledPocketRect, rectCorners } from "../../../shared/utils/tray-nfc-layout";
import type { Vec2 } from "@shared/utils/tray-footprint";
import { weldMeshVertices } from "../../../shared/utils/mesh-manifold";

export interface TrayCoverMeshSpec {
  /** 与山体打印轮廓一致的外轮廓 */
  outerVerts: Vec2[];
  ledPockets: LedPocketSpec[];
  ledPocketLengthMm: number;
  ledPocketWidthMm: number;
  thicknessMm: number;
}

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

function toVector2Loop(verts: Vec2[]): THREE.Vector2[] {
  return verts.map((v) => new THREE.Vector2(v.x, v.y));
}

function appendPolyCap(
  contour: Vec2[],
  holeLoops: Vec2[][],
  z: number,
  cache: VertexCache,
  indices: number[],
  normalUp: boolean,
): void {
  if (contour.length < 3) return;
  const outer = toVector2Loop(contour);
  const holes = holeLoops.map(toVector2Loop);
  const allVerts = [...outer, ...holes.flat()];
  const faces = ShapeUtils.triangulateShape(outer, holes);
  for (const face of faces) {
    const v0 = allVerts[face[0]!]!;
    const v1 = allVerts[face[1]!]!;
    const v2 = allVerts[face[2]!]!;
    const i0 = cache.getOrCreate(v0.x, v0.y, z);
    const i1 = cache.getOrCreate(v1.x, v1.y, z);
    const i2 = cache.getOrCreate(v2.x, v2.y, z);
    if (normalUp) indices.push(i0, i1, i2);
    else indices.push(i0, i2, i1);
  }
}

/** 侧壁：外轮廓法线朝外，孔洞轮廓法线朝内 */
function appendWallLoop(
  cache: VertexCache,
  indices: number[],
  verts: Vec2[],
  zTop: number,
  zBottom: number,
  outward: boolean,
): void {
  const topRing = verts.map((v) => cache.getOrCreate(v.x, v.y, zTop));
  const bottomRing = verts.map((v) => cache.getOrCreate(v.x, v.y, zBottom));
  for (let s = 0; s < verts.length; s++) {
    const sn = (s + 1) % verts.length;
    const t0 = topRing[s]!;
    const t1 = topRing[sn]!;
    const b0 = bottomRing[s]!;
    const b1 = bottomRing[sn]!;
    if (outward) {
      indices.push(t0, b1, t1);
      indices.push(t0, b0, b1);
    } else {
      indices.push(t0, t1, b1);
      indices.push(t0, b1, b0);
    }
  }
}

function reverseLoop<T>(verts: T[]): T[] {
  if (verts.length <= 1) return verts.slice();
  const first = verts[0]!;
  return [first, ...verts.slice(1).reverse()];
}

/**
 * NFC/LED 装配盖片：外轮廓 = 山体打印区，LED 位通孔漏光，NFC 区由盖板遮盖。
 * 底面 Z=0，顶面 Z=thicknessMm（平放打印）。
 */
export function buildTrayCoverMesh(spec: TrayCoverMeshSpec): TerrainMeshPayload {
  const positions: number[] = [];
  const indices: number[] = [];
  const cache = new VertexCache(positions);
  const z0 = 0;
  const z1 = spec.thicknessMm;

  const ledHoleLoops: Vec2[][] = spec.ledPockets.map((led) => {
    const corners = rectCorners(
      ledPocketRect(led, spec.ledPocketLengthMm, spec.ledPocketWidthMm),
    );
    return reverseLoop(corners);
  });

  appendPolyCap(spec.outerVerts, ledHoleLoops, z1, cache, indices, true);
  appendPolyCap(spec.outerVerts, ledHoleLoops, z0, cache, indices, false);
  appendWallLoop(cache, indices, spec.outerVerts, z1, z0, true);
  for (const hole of ledHoleLoops) {
    appendWallLoop(cache, indices, hole, z1, z0, false);
  }

  const mesh: TerrainMeshPayload = {
    positions,
    indices,
    minSurfaceZ: z1,
    bottomZ: z0,
    gridCols: 0,
    gridRows: 0,
  };
  return weldMeshVertices(mesh, 0.05);
}
