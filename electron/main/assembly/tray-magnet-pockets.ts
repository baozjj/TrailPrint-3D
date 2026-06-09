import type { TerrainMeshPayload } from "@shared/types/terrain";
import {
  magnetHexagonVertsMm,
  magnetHoleInteriorSample,
} from "../../../shared/utils/magnet-hole-geometry";
import type { Vec2 } from "@shared/utils/tray-footprint";

const HOLE_WALL_SEGMENTS = 24;
const BOTTOM_PLATE_CELL_MIN_MM = 1.2;
const BOTTOM_PLATE_CELL_MAX_MM = 2.8;
const BOTTOM_GRID_SUBDIVIDE_MAX = 4;

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

function insideHoleOpening(
  x: number,
  y: number,
  holes: ReadonlyArray<{ x: number; y: number }>,
  radius: number,
): boolean {
  const limitSq = radius * radius;
  for (const h of holes) {
    const dx = x - h.x;
    const dy = y - h.y;
    if (dx * dx + dy * dy < limitSq) return true;
  }
  return false;
}

function bottomPlateCellSize(holeRadius: number): number {
  return Math.max(
    BOTTOM_PLATE_CELL_MIN_MM,
    Math.min(BOTTOM_PLATE_CELL_MAX_MM, holeRadius * 0.42),
  );
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

function triangleCoversHoleOpening(
  i0: number,
  i1: number,
  i2: number,
  pos: number[],
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
): boolean {
  const samples = 8;
  const testR = holeRadius * 0.55;
  for (const h of holes) {
    for (let k = 0; k < samples; k++) {
      const a = (k / samples) * Math.PI * 2;
      const px = h.x + testR * Math.cos(a);
      const py = h.y + testR * Math.sin(a);
      if (pointInTri2D(px, py, i0, i1, i2, pos)) return true;
    }
  }
  return false;
}

function pushBottomTriangle(
  positions: number[],
  indices: number[],
  i0: number,
  i1: number,
  i2: number,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
): void {
  if (triangleCoversHoleOpening(i0, i1, i2, positions, holes, holeRadius)) {
    return;
  }
  indices.push(i0, i1, i2);
}

/**
 * 铺满托盘底面（外轮廓内自适应网格），仅在磁铁孔圆域留空。
 */
function buildBottomPlateGrid(
  outer: Vec2[],
  z: number,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
  positions: number[],
  indices: number[],
): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of outer) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  const cell = bottomPlateCellSize(holeRadius);
  const minCell = cell * 0.45;

  function emitQuad(x0: number, y0: number, x1: number, y1: number): void {
    const i00 = pushVertex(positions, x0, y0, z);
    const i10 = pushVertex(positions, x1, y0, z);
    const i11 = pushVertex(positions, x1, y1, z);
    const i01 = pushVertex(positions, x0, y1, z);
    // 法线朝下（-Z）
    pushBottomTriangle(positions, indices, i00, i10, i11, holes, holeRadius);
    pushBottomTriangle(positions, indices, i00, i11, i01, holes, holeRadius);
  }

  function fillRect(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    depth: number,
  ): void {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    if (!pointInConvexPolygon({ x: cx, y: cy }, outer)) return;
    if (insideHoleOpening(cx, cy, holes, holeRadius)) return;
    if (x1 - x0 < minCell || y1 - y0 < minCell) return;

    const corners: Vec2[] = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
    const allInside = corners.every(
      (c) =>
        pointInConvexPolygon(c, outer) &&
        !insideHoleOpening(c.x, c.y, holes, holeRadius),
    );
    if (allInside) {
      emitQuad(x0, y0, x1, y1);
      return;
    }
    if (depth >= BOTTOM_GRID_SUBDIVIDE_MAX) return;

    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    fillRect(x0, y0, mx, my, depth + 1);
    fillRect(mx, y0, x1, my, depth + 1);
    fillRect(mx, my, x1, y1, depth + 1);
    fillRect(x0, my, mx, y1, depth + 1);
  }

  for (let y = minY; y < maxY - 1e-6; y += cell) {
    const y1 = Math.min(y + cell, maxY);
    for (let x = minX; x < maxX - 1e-6; x += cell) {
      const x1 = Math.min(x + cell, maxX);
      fillRect(x, y, x1, y1, 0);
    }
  }
}

/** 单个磁铁盲孔：侧壁 + 孔底面（z=0 保持敞开） */
function appendMagnetPocket(
  positions: number[],
  indices: number[],
  cx: number,
  cy: number,
  radius: number,
  zBottom: number,
  zTop: number,
): void {
  const floorCenter = pushVertex(positions, cx, cy, zTop);
  const bottomRing: number[] = [];
  const topRing: number[] = [];

  for (let s = 0; s < HOLE_WALL_SEGMENTS; s++) {
    const a = (s / HOLE_WALL_SEGMENTS) * Math.PI * 2;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    bottomRing.push(pushVertex(positions, x, y, zBottom));
    topRing.push(pushVertex(positions, x, y, zTop));
  }

  for (let s = 0; s < HOLE_WALL_SEGMENTS; s++) {
    const sn = (s + 1) % HOLE_WALL_SEGMENTS;
    const b0 = bottomRing[s]!;
    const b1 = bottomRing[sn]!;
    const t0 = topRing[s]!;
    const t1 = topRing[sn]!;
    indices.push(b0, t1, b1);
    indices.push(b0, t0, t1);
  }

  for (let s = 0; s < HOLE_WALL_SEGMENTS; s++) {
    const sn = (s + 1) % HOLE_WALL_SEGMENTS;
    indices.push(floorCenter, topRing[s]!, topRing[sn]!);
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

  buildBottomPlateGrid(
    outer,
    mesh.bottomZ,
    holes,
    holeRadius,
    positions,
    indices,
  );

  for (const h of holes) {
    appendMagnetPocket(
      positions,
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
