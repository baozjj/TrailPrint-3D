import type { TerrainMeshPayload } from "@shared/types/terrain";
import * as THREE from "three";
import { ShapeUtils } from "three";
import type { LedPocketSpec, Rect2D } from "../../../shared/utils/tray-nfc-layout";
import {
  ledPocketRect,
  pointInPolygon,
  rectCorners,
} from "../../../shared/utils/tray-nfc-layout";
import type { Vec2 } from "@shared/utils/tray-footprint";

export interface TrayNfcMeshSpec {
  cavityVerts: Vec2[];
  recessDepthMm: number;
  ledPockets: LedPocketSpec[];
  ledExtraRecessDepthMm: number;
  ledPocketLengthMm: number;
  ledPocketWidthMm: number;
  floorZ: number;
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

function appendPolyPocketWalls(
  cache: VertexCache,
  indices: number[],
  verts: Vec2[],
  zHigh: number,
  zLow: number,
): void {
  const topRing = verts.map((v) => cache.getOrCreate(v.x, v.y, zHigh));
  const bottomRing = verts.map((v) => cache.getOrCreate(v.x, v.y, zLow));
  for (let s = 0; s < verts.length; s++) {
    const sn = (s + 1) % verts.length;
    const t0 = topRing[s]!;
    const t1 = topRing[sn]!;
    const b0 = bottomRing[s]!;
    const b1 = bottomRing[sn]!;
    indices.push(t0, b1, t1);
    indices.push(t0, b0, b1);
  }
}

function appendRectPocketWalls(
  cache: VertexCache,
  indices: number[],
  rect: Rect2D,
  zHigh: number,
  zLow: number,
): void {
  appendPolyPocketWalls(cache, indices, rectCorners(rect), zHigh, zLow);
}

function appendRectCap(
  rect: Rect2D,
  holeRects: Rect2D[],
  z: number,
  cache: VertexCache,
  indices: number[],
): void {
  appendPolyCap(
    rectCorners(rect),
    holeRects.map((h) => rectCorners(h)),
    z,
    cache,
    indices,
    true,
  );
}

function stripFloorCapTriangles(mesh: TerrainMeshPayload, floorZ: number): number[] {
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
      Math.abs(z0 - floorZ) < 1e-4 &&
      Math.abs(z1 - floorZ) < 1e-4 &&
      Math.abs(z2 - floorZ) < 1e-4
    ) {
      continue;
    }
    kept.push(i0, i1, i2);
  }
  return kept;
}

/**
 * 在凹槽顶面 (floorZ) 雕刻 NFC 凹陷与 LED 深腔；磁铁孔仍在底面，互不影响。
 */
export function applyTrayTopNfcFeatures(
  mesh: TerrainMeshPayload,
  recessInner: Vec2[],
  nfc: TrayNfcMeshSpec,
): TerrainMeshPayload {
  const positions = [...mesh.positions];
  const indices = stripFloorCapTriangles(mesh, nfc.floorZ);
  const cache = new VertexCache(positions);

  const topZ = nfc.floorZ;
  const nfcBottomZ = topZ - nfc.recessDepthMm;
  const ledBottomZ = nfcBottomZ - nfc.ledExtraRecessDepthMm;

  const ledInsideNfc: Rect2D[] = [];
  const ledOutsideNfc: Rect2D[] = [];
  const floorHoles: Vec2[][] = [nfc.cavityVerts];
  const seenOutsideHole = new Set<string>();

  for (const led of nfc.ledPockets) {
    const rect = ledPocketRect(
      led,
      nfc.ledPocketLengthMm,
      nfc.ledPocketWidthMm,
    );
    if (pointInPolygon(led.cx, led.cy, nfc.cavityVerts)) {
      ledInsideNfc.push(rect);
    } else {
      ledOutsideNfc.push(rect);
      const key = `${Math.round(rect.cx * 100)},${Math.round(rect.cy * 100)}`;
      if (!seenOutsideHole.has(key)) {
        seenOutsideHole.add(key);
        floorHoles.push(rectCorners(rect));
      }
    }
  }

  appendPolyCap(recessInner, floorHoles, topZ, cache, indices, true);

  appendPolyPocketWalls(cache, indices, nfc.cavityVerts, topZ, nfcBottomZ);
  appendPolyCap(
    nfc.cavityVerts,
    ledInsideNfc.map((r) => rectCorners(r)),
    nfcBottomZ,
    cache,
    indices,
    true,
  );

  for (const rect of ledInsideNfc) {
    appendRectPocketWalls(cache, indices, rect, nfcBottomZ, ledBottomZ);
    appendRectCap(rect, [], ledBottomZ, cache, indices);
  }

  for (const rect of ledOutsideNfc) {
    appendRectPocketWalls(cache, indices, rect, topZ, ledBottomZ);
    appendRectCap(rect, [], ledBottomZ, cache, indices);
  }

  return {
    ...mesh,
    positions,
    indices,
  };
}
