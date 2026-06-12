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
/** 轨迹挤出采样上限，避免超长 GPX 生成过多三角面 */
const MAX_TRAIL_EXTRUSION_SAMPLES = 6000;

type AddVertexFn = (x: number, y: number, z: number) => number;
type AddTriFn = (i0: number, i1: number, i2: number) => void;
type TrailSample = { x: number; y: number; zTop: number; zBot: number };

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
 * 与主模型凹槽共用折线；失败时自动加大采样步长重试。
 */
export function buildTrailLineMesh(
  opts: BuildTrailLineOptions,
): TerrainMeshPayload | null {
  if (opts.polylineMm.length < 2 || opts.widthMm <= 0 || opts.depthMm <= 0) {
    return null;
  }

  const baseStep = Math.max(
    MIN_SEGMENT_MM,
    opts.sampleStepMm ?? opts.widthMm / 3,
  );
  let step = baseStep;
  for (let attempt = 0; attempt < 8; attempt++) {
    const mesh = buildTrailLineMeshOnce({ ...opts, sampleStepMm: step });
    if (mesh) return mesh;
    step *= 1.45;
    if (step > 6) break;
  }
  return null;
}

function buildTrailLineMeshOnce(
  opts: BuildTrailLineOptions,
): TerrainMeshPayload | null {
  const { polylineMm, widthMm, depthMm, heightMm, cols, rows, crop } = opts;
  const requestedStep = Math.max(
    MIN_SEGMENT_MM,
    opts.sampleStepMm ?? widthMm / 3,
  );
  let path = prepareExtrusionPath(polylineMm, requestedStep);
  const dedupeDist = Math.min(MIN_SEGMENT_MM, requestedStep * 0.85);
  path = dedupePath(path, dedupeDist);
  if (path.length < 2) return null;

  const minPathLen = Math.max(widthMm * 1.25, requestedStep * 2, MIN_SEGMENT_MM * 3);
  let closed = isClosedLoop(path, requestedStep * 0.75);
  if (closed && path.length > 2) {
    path = path.slice(0, -1);
  }

  if (!closed && path.length === 2 && pathLengthMm(path) < minPathLen) {
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

  const samples = collectTrailSamples(path, opts, heightMm, cols, rows, crop, depthMm);
  if (samples.length < 2) return null;

  let zTopMin = Infinity;
  let zBotMin = Infinity;
  extrudeTrailRun({
    run: samples,
    closed,
    halfW,
    minDist2,
    addVertex,
    addTri,
    positions,
    indices,
  });
  for (const s of samples) {
    if (s.zTop < zTopMin) zTopMin = s.zTop;
    if (s.zBot < zBotMin) zBotMin = s.zBot;
  }

  if (indices.length < 12) return null;

  return finalizeTrailMesh({
    positions,
    indices,
    minSurfaceZ: zTopMin,
    bottomZ: zBotMin,
    gridCols: 0,
    gridRows: 0,
  });
}

function collectTrailSamples(
  path: TrailPointMm[],
  opts: BuildTrailLineOptions,
  heightMm: Float64Array,
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  depthMm: number,
): TrailSample[] {
  const samples: TrailSample[] = [];
  const flatFloor = opts.flatFloorZMm;
  const useFlatFloor =
    flatFloor != null && Number.isFinite(flatFloor) && depthMm > 0;
  const zOffset = opts.zTopOffsetMm ?? 0;
  const grooveDepthMm = Math.max(0.05, depthMm);

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
      // 顶面贴挖槽前地表 + 高出量；至少填满凹槽深度（floorZ + trailDepth + 高出量）
      const zTop = Math.max(
        zSurface + zOffset,
        zBot + grooveDepthMm + zOffset,
      );
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
    const zTop = zBase + zOffset;
    samples.push({ x: p.x, y: p.y, zTop, zBot: zBase - grooveDepthMm });
  }
  return samples;
}

function extrudeTrailRun(params: {
  run: TrailSample[];
  closed: boolean;
  halfW: number;
  minDist2: number;
  addVertex: AddVertexFn;
  addTri: AddTriFn;
  positions: number[];
  indices: number[];
}): void {
  const { run, closed, halfW, minDist2, addVertex, addTri, positions, indices } =
    params;
  const topLeft: number[] = [];
  const topRight: number[] = [];
  const botLeft: number[] = [];
  const botRight: number[] = [];

  for (let i = 0; i < run.length; i++) {
    const cur = run[i]!;
    const prev = run[Math.max(0, i - 1)]!;
    const next = run[Math.min(run.length - 1, i + 1)]!;
    let dx: number;
    let dy: number;
    if (i === 0) {
      dx = next.x - cur.x;
      dy = next.y - cur.y;
    } else if (i === run.length - 1) {
      dx = cur.x - prev.x;
      dy = cur.y - prev.y;
    } else {
      dx = next.x - prev.x;
      dy = next.y - prev.y;
    }
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

  const ringCount = closed ? run.length : run.length - 1;
  for (let i = 0; i < ringCount; i++) {
    const j = (i + 1) % run.length;
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
    const end = run.length - 1;
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
}

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

function prepareExtrusionPath(
  polylineMm: TrailPointMm[],
  requestedStepMm: number,
): TrailPointMm[] {
  if (polylineMm.length < 2) return polylineMm.slice();

  let step = requestedStepMm;
  let path = resamplePolyline(polylineMm, step);
  while (path.length > MAX_TRAIL_EXTRUSION_SAMPLES && step < 6) {
    step *= 1.35;
    path = resamplePolyline(polylineMm, step);
  }
  return path.length >= 2 ? path : polylineMm.slice();
}

function finalizeTrailMesh(mesh: TerrainMeshPayload): TerrainMeshPayload {
  const rawCheck = analyzeMesh(mesh);
  if (rawCheck.boundaryEdges === 0 && rawCheck.nonManifoldEdges === 0) {
    return mesh;
  }
  if (rawCheck.nonManifoldEdges === 0) {
    return mesh;
  }
  for (const toleranceMm of [0.03, 0.08, 0.15]) {
    const welded = weldMeshVertices(mesh, toleranceMm);
    const check = analyzeMesh(welded);
    if (check.nonManifoldEdges === 0) return welded;
  }
  return mesh;
}

export function trailPathLengthMm(polylineMm: TrailPointMm[]): number {
  return pathLengthMm(polylineMm);
}
