import type { TerrainMeshPayload } from "@shared/types/terrain";
import type { Vec2 } from "@shared/utils/tray-footprint";

const BOTTOM_EDGE_STEPS = 12;
const HOLE_WALL_SEGMENTS = 24;
const HOLE_PLATE_MARGIN_MM = 0.25;

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

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function polygonCentroid(outer: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  for (const v of outer) {
    cx += v.x;
    cy += v.y;
  }
  const n = outer.length || 1;
  return { x: cx / n, y: cy / n };
}

function edgeInwardNormal(va: Vec2, vb: Vec2, centroid: Vec2): Vec2 {
  const dx = vb.x - va.x;
  const dy = vb.y - va.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 0, y: 0 };
  let nx = -dy / len;
  let ny = dx / len;
  const mid = { x: (va.x + vb.x) * 0.5, y: (va.y + vb.y) * 0.5 };
  const toCenter = { x: centroid.x - mid.x, y: centroid.y - mid.y };
  if (nx * toCenter.x + ny * toCenter.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function insideAnyHole(
  x: number,
  y: number,
  holes: ReadonlyArray<{ x: number; y: number }>,
  radius: number,
): boolean {
  const limit = radius + HOLE_PLATE_MARGIN_MM;
  const limitSq = limit * limit;
  for (const h of holes) {
    const dx = x - h.x;
    const dy = y - h.y;
    if (dx * dx + dy * dy <= limitSq) return true;
  }
  return false;
}

/** 沿边内法线向内推进，停在磁铁孔保护区外沿 */
function inwardPointStopAtHoles(
  ex: number,
  ey: number,
  nx: number,
  ny: number,
  maxDist: number,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
): { x: number; y: number } | null {
  if (insideAnyHole(ex, ey, holes, holeRadius)) return null;

  let tLo = 0;
  let tHi = maxDist;
  for (let i = 0; i < 28; i++) {
    const mid = (tLo + tHi) * 0.5;
    const px = ex + nx * mid;
    const py = ey + ny * mid;
    if (insideAnyHole(px, py, holes, holeRadius)) {
      tHi = mid;
    } else {
      tLo = mid;
    }
  }

  const t = tLo * 0.998;
  if (t < 0.15) return null;
  return { x: ex + nx * t, y: ey + ny * t };
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

/** 外边缘条带底面（法线朝下），孔区留空 */
function buildBottomPlateStrips(
  outer: Vec2[],
  z: number,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
  positions: number[],
  indices: number[],
): void {
  const centroid = polygonCentroid(outer);
  let maxRadius = 0;
  for (const v of outer) {
    maxRadius = Math.max(maxRadius, Math.hypot(v.x, v.y));
  }
  const maxInward = maxRadius * 1.05;

  for (let i = 0; i < outer.length; i++) {
    const va = outer[i]!;
    const vb = outer[(i + 1) % outer.length]!;
    const inward = edgeInwardNormal(va, vb, centroid);
    if (Math.hypot(inward.x, inward.y) < 1e-9) continue;

    for (let s = 0; s < BOTTOM_EDGE_STEPS; s++) {
      const ta = s / BOTTOM_EDGE_STEPS;
      const tb = (s + 1) / BOTTOM_EDGE_STEPS;
      const ea = lerp2(va, vb, ta);
      const eb = lerp2(va, vb, tb);
      const ia = inwardPointStopAtHoles(
        ea.x,
        ea.y,
        inward.x,
        inward.y,
        maxInward,
        holes,
        holeRadius,
      );
      const ib = inwardPointStopAtHoles(
        eb.x,
        eb.y,
        inward.x,
        inward.y,
        maxInward,
        holes,
        holeRadius,
      );
      if (!ia || !ib) continue;

      const iEa = pushVertex(positions, ea.x, ea.y, z);
      const iEb = pushVertex(positions, eb.x, eb.y, z);
      const iIa = pushVertex(positions, ia.x, ia.y, z);
      const iIb = pushVertex(positions, ib.x, ib.y, z);
      pushBottomTriangle(positions, indices, iEa, iIb, iEb, holes, holeRadius);
      pushBottomTriangle(positions, indices, iEa, iIa, iIb, holes, holeRadius);
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

/** 底面 z=0 上是否存在覆盖孔口的三角面（应接近 0） */
export function countBottomPlateOverHole(
  mesh: TerrainMeshPayload,
  holes: ReadonlyArray<{ x: number; y: number }>,
  holeRadius: number,
): number {
  let covered = 0;
  const pos = mesh.positions;
  for (const h of holes) {
    const testR = holeRadius * 0.55;
    const samples = 8;
    let hits = 0;
    for (let k = 0; k < samples; k++) {
      const a = (k / samples) * Math.PI * 2;
      const px = h.x + testR * Math.cos(a);
      const py = h.y + testR * Math.sin(a);
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

  buildBottomPlateStrips(
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
    let ringVerts = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      const y = mesh.positions[i + 1]!;
      const z = mesh.positions[i + 2]!;
      if (Math.abs(z - mesh.bottomZ) > 1e-3) continue;
      const dist = Math.hypot(x - h.x, y - h.y);
      if (Math.abs(dist - holeRadius) < 0.35) ringVerts++;
    }
    if (ringVerts >= HOLE_WALL_SEGMENTS / 2) count++;
  }
  return count;
}
