import type { TerrainCropRegion, TerrainMeshPayload } from "../types/terrain";
import { sampleHeightBilinearMm } from "./heightfield-mesh";
import { analyzeMesh, weldMeshVertices } from "./mesh-manifold";
import { resamplePolyline, type TrailPointMm } from "./trail-coords";

export interface BuildTrailLineOptions {
  polylineMm: TrailPointMm[];
  widthMm: number;
  depthMm: number;
  heightMm: Float64Array;
  cols: number;
  rows: number;
  crop: TerrainCropRegion;
  /** 路径重采样步长 (mm)，未指定时按宽度自动 */
  sampleStepMm?: number;
  /** 顶面相对 heightMm 采样的抬升 (mm)；平底模式下顶面贴合地表并叠加此抬升 */
  zTopOffsetMm?: number;
  /** 平底轨迹/凹槽共用底面 Z (mm)；导出时与主模型槽底一致 */
  flatFloorZMm?: number;
}

const MIN_SEGMENT_MM = 0.35;

/** 过短路径挤出会退化；保证首尾间距至少 minLen */
function expandShortPath(path: TrailPointMm[], minLen: number): TrailPointMm[] {
  if (path.length < 2) return path;
  const start = path[0]!;
  const end = path[path.length - 1]!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len >= minLen) return path;

  if (len < 1e-9) {
    const half = minLen / 2;
    return [
      { x: start.x - half, y: start.y },
      { x: start.x + half, y: start.y },
    ];
  }

  const pad = (minLen - len) / 2;
  const ux = dx / len;
  const uy = dy / len;
  const out = path.map((p, i) => {
    if (i === 0) return { x: p.x - ux * pad, y: p.y - uy * pad };
    if (i === path.length - 1) return { x: p.x + ux * pad, y: p.y + uy * pad };
    return p;
  });
  return out;
}

function pathLengthMm(path: TrailPointMm[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

function closedPerimeterMm(path: TrailPointMm[]): number {
  if (path.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

function scaleClosedPath(path: TrailPointMm[], scale: number): TrailPointMm[] {
  if (path.length < 2 || Math.abs(scale - 1) < 1e-6) return path;
  let cx = 0;
  let cy = 0;
  for (const p of path) {
    cx += p.x;
    cy += p.y;
  }
  cx /= path.length;
  cy /= path.length;
  return path.map((p) => ({
    x: cx + (p.x - cx) * scale,
    y: cy + (p.y - cy) * scale,
  }));
}

function isClosedLoop(path: TrailPointMm[], tol: number): boolean {
  if (path.length < 3) return false;
  const a = path[0]!;
  const b = path[path.length - 1]!;
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

function dedupePath(path: TrailPointMm[], minDist: number): TrailPointMm[] {
  if (path.length < 2) return path;
  const out: TrailPointMm[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const p = path[i]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  const end = path[path.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(end.x - tail.x, end.y - tail.y) >= minDist * 0.5) {
    out.push(end);
  } else if (out.length === 1) {
    out.push(end);
  }
  return out.length >= 2 ? out : path;
}

function triArea2(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return Math.hypot(nx, ny, nz);
}

/**
 * 沿轨迹挤出封闭带状实体（顶面贴 DEM，向下 depthMm），用于 Trail_Line.stl。
 */
export function buildTrailLineMesh(
  opts: BuildTrailLineOptions,
): TerrainMeshPayload | null {
  const { polylineMm, widthMm, depthMm, heightMm, cols, rows, crop } = opts;
  if (polylineMm.length < 2 || widthMm <= 0 || depthMm <= 0) return null;

  const step = Math.max(
    MIN_SEGMENT_MM,
    opts.sampleStepMm ?? widthMm / 3,
  );
  const dedupeDist = Math.min(MIN_SEGMENT_MM, step * 0.85);
  let path = resamplePolyline(polylineMm, step);
  path = dedupePath(path, dedupeDist);
  if (path.length < 2 && polylineMm.length >= 2) {
    path = dedupePath(polylineMm, dedupeDist);
  }
  if (path.length < 2) return null;

  const minPathLen = Math.max(widthMm * 1.25, step * 2, MIN_SEGMENT_MM * 3);
  let closed = isClosedLoop(path, step * 0.75);
  if (closed && path.length > 2) {
    path = path.slice(0, -1);
  }

  if (closed) {
    const perim = closedPerimeterMm(path);
    const minPerim = minPathLen * 2;
    if (perim > 1e-6 && perim < minPerim) {
      path = scaleClosedPath(path, minPerim / perim);
    }
  } else {
    path = expandShortPath(path, minPathLen);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const halfW = widthMm / 2;
  const minDist2 = MIN_SEGMENT_MM * MIN_SEGMENT_MM;

  function addVertex(x: number, y: number, z: number): number {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    return idx;
  }

  function addTri(i0: number, i1: number, i2: number): void {
    const ax = positions[i0 * 3]!;
    const ay = positions[i0 * 3 + 1]!;
    const az = positions[i0 * 3 + 2]!;
    const bx = positions[i1 * 3]!;
    const by = positions[i1 * 3 + 1]!;
    const bz = positions[i1 * 3 + 2]!;
    const cx = positions[i2 * 3]!;
    const cy = positions[i2 * 3 + 1]!;
    const cz = positions[i2 * 3 + 2]!;
    if (triArea2(ax, ay, az, bx, by, bz, cx, cy, cz) < 1e-8) return;
    indices.push(i0, i1, i2);
  }

  const samples: Array<{ x: number; y: number; zTop: number; zBot: number }> =
    [];
  const flatFloor = opts.flatFloorZMm;
  const useFlatFloor =
    flatFloor != null && Number.isFinite(flatFloor) && depthMm > 0;

  for (const p of path) {
    if (useFlatFloor) {
      const zBot = flatFloor!;
      const zSurface = sampleHeightBilinearMm(
        p.x,
        p.y,
        heightMm,
        cols,
        rows,
        crop,
        zBot,
      );
      const zTop = zSurface + (opts.zTopOffsetMm ?? 0);
      if (zTop <= zBot + 1e-4) continue;
      samples.push({ x: p.x, y: p.y, zTop, zBot });
      continue;
    }
    const zBase = sampleHeightBilinearMm(
      p.x,
      p.y,
      heightMm,
      cols,
      rows,
      crop,
      0,
    );
    const zTop = zBase + (opts.zTopOffsetMm ?? 0);
    samples.push({ x: p.x, y: p.y, zTop, zBot: zTop - depthMm });
  }

  const topLeft: number[] = [];
  const topRight: number[] = [];
  const botLeft: number[] = [];
  const botRight: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i]!;
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    if (dx * dx + dy * dy < minDist2) {
      dx = next.x - cur.x;
      dy = next.y - cur.y;
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;

    topLeft.push(addVertex(cur.x + nx * halfW, cur.y + ny * halfW, cur.zTop));
    topRight.push(addVertex(cur.x - nx * halfW, cur.y - ny * halfW, cur.zTop));
    botLeft.push(addVertex(cur.x + nx * halfW, cur.y + ny * halfW, cur.zBot));
    botRight.push(addVertex(cur.x - nx * halfW, cur.y - ny * halfW, cur.zBot));
  }

  const ringCount = closed ? samples.length : samples.length - 1;
  for (let i = 0; i < ringCount; i++) {
    const j = (i + 1) % samples.length;
    const tl0 = topLeft[i]!;
    const tr0 = topRight[i]!;
    const tl1 = topLeft[j]!;
    const tr1 = topRight[j]!;
    const bl0 = botLeft[i]!;
    const br0 = botRight[i]!;
    const bl1 = botLeft[j]!;
    const br1 = botRight[j]!;

    addTri(tl0, tr0, tl1);
    addTri(tr0, tr1, tl1);
    addTri(bl0, bl1, br0);
    addTri(br0, bl1, br1);
    addTri(tl0, tl1, bl1);
    addTri(tl0, bl1, bl0);
    addTri(tr0, br1, tr1);
    addTri(tr0, br0, br1);
  }

  if (!closed) {
    addPlanarCap(
      addVertex,
      addTri,
      positions,
      topLeft[0]!,
      topRight[0]!,
      botRight[0]!,
      botLeft[0]!,
      true,
    );
    const end = samples.length - 1;
    addPlanarCap(
      addVertex,
      addTri,
      positions,
      topLeft[end]!,
      topRight[end]!,
      botRight[end]!,
      botLeft[end]!,
      false,
    );
  }

  const zTopMin = Math.min(...samples.map((s) => s.zTop));
  const zBotMin = Math.min(...samples.map((s) => s.zBot));

  if (indices.length < 12) {
    return null;
  }

  return finalizeTrailMesh(
    { positions, indices, minSurfaceZ: zTopMin, bottomZ: zBotMin, gridCols: 0, gridRows: 0 },
    samples,
    halfW,
  );
}

type AddVertexFn = (x: number, y: number, z: number) => number;
type AddTriFn = (i0: number, i1: number, i2: number) => void;

/** 四边形端盖：绕中心扇形三角化，避免共面四点双三角退化 */
function addPlanarCap(
  addVertex: AddVertexFn,
  addTri: AddTriFn,
  positions: number[],
  i0: number,
  i1: number,
  i2: number,
  i3: number,
  normalUp: boolean,
): void {
  const x =
    (positions[i0 * 3]! +
      positions[i1 * 3]! +
      positions[i2 * 3]! +
      positions[i3 * 3]!) /
    4;
  const y =
    (positions[i0 * 3 + 1]! +
      positions[i1 * 3 + 1]! +
      positions[i2 * 3 + 1]! +
      positions[i3 * 3 + 1]!) /
    4;
  const z =
    (positions[i0 * 3 + 2]! +
      positions[i1 * 3 + 2]! +
      positions[i2 * 3 + 2]! +
      positions[i3 * 3 + 2]!) /
    4;
  const c = addVertex(x, y, z);
  const ring = [i0, i1, i2, i3];
  for (let k = 0; k < 4; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % 4]!;
    if (normalUp) addTri(c, a, b);
    else addTri(c, b, a);
  }
}

function buildTrailBoxMesh(
  start: { x: number; y: number; zTop: number; zBot: number },
  end: { x: number; y: number; zTop: number; zBot: number },
  halfW: number,
): TerrainMeshPayload {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * halfW;
  const ny = (dx / len) * halfW;

  const positions: number[] = [];
  const indices: number[] = [];
  const corners = [
    [start.x + nx, start.y + ny, start.zTop],
    [start.x - nx, start.y - ny, start.zTop],
    [end.x - nx, end.y - ny, end.zTop],
    [end.x + nx, end.y + ny, end.zTop],
    [start.x + nx, start.y + ny, start.zBot],
    [start.x - nx, start.y - ny, start.zBot],
    [end.x - nx, end.y - ny, end.zBot],
    [end.x + nx, end.y + ny, end.zBot],
  ];
  for (const c of corners) positions.push(c[0]!, c[1]!, c[2]!);

  const t = [0, 1, 2, 0, 2, 3];
  const b = [4, 6, 5, 4, 7, 6];
  const s0 = [0, 4, 5, 0, 5, 1];
  const s1 = [1, 5, 6, 1, 6, 2];
  const s2 = [2, 6, 7, 2, 7, 3];
  const s3 = [3, 7, 4, 3, 4, 0];
  for (const face of [t, b, s0, s1, s2, s3]) {
    indices.push(face[0]!, face[1]!, face[2]!, face[3]!, face[4]!, face[5]!);
  }

  return {
    positions,
    indices,
    minSurfaceZ: Math.min(start.zTop, end.zTop, start.zBot, end.zBot),
    bottomZ: Math.min(start.zBot, end.zBot),
    gridCols: 0,
    gridRows: 0,
  };
}

function finalizeTrailMesh(
  mesh: TerrainMeshPayload,
  samples: Array<{ x: number; y: number; zTop: number; zBot: number }>,
  halfW: number,
): TerrainMeshPayload | null {
  let out = weldMeshVertices(mesh, 0.03);
  let check = analyzeMesh(out);
  if (check.boundaryEdges === 0 && check.nonManifoldEdges === 0) return out;

  if (samples.length >= 2) {
    const box = buildTrailBoxMesh(
      samples[0]!,
      samples[samples.length - 1]!,
      halfW,
    );
    out = weldMeshVertices(box, 0.03);
    check = analyzeMesh(out);
    if (check.boundaryEdges === 0 && check.nonManifoldEdges === 0) return out;
  }

  if (check.boundaryEdges === 0 && check.nonManifoldEdges === 0) return out;
  return null;
}

export function trailPathLengthMm(polylineMm: TrailPointMm[]): number {
  return pathLengthMm(polylineMm);
}
