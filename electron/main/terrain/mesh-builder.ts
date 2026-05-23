import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TerrainMeshPayload } from "@shared/types/terrain";

function pointInPolygon(
  x: number,
  y: number,
  verts: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i]!.x;
    const yi = verts[i]!.y;
    const xj = verts[j]!.x;
    const yj = verts[j]!.y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function buildFootprintPolygon(
  crop: TerrainCropRegion,
  cols: number,
  rows: number,
): Array<{ x: number; y: number }> | null {
  if (crop.shape === "polygon" && crop.polygonSides) {
    const n = crop.polygonSides;
    const r = crop.radiusMm ?? crop.widthMm / 2;
    const verts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return verts;
  }
  return null;
}

function isInsideFootprint(
  xMm: number,
  yMm: number,
  crop: TerrainCropRegion,
  polygon: Array<{ x: number; y: number }> | null,
): boolean {
  if (crop.shape === "circle") {
    const r = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
    return xMm * xMm + yMm * yMm <= r * r + 1e-6;
  }
  if (crop.shape === "rectangle") {
    const hw = crop.widthMm / 2;
    const hh = crop.heightMm / 2;
    return Math.abs(xMm) <= hw + 1e-6 && Math.abs(yMm) <= hh + 1e-6;
  }
  if (polygon) return pointInPolygon(xMm, yMm, polygon);
  return true;
}

export interface BuildTerrainMeshOptions {
  crop: TerrainCropRegion;
  /** 行优先高度 (mm)，已含 Z 夸张 */
  heightMm: Float64Array;
  cols: number;
  rows: number;
  baseThicknessMm: number;
}

/**
 * 生成封闭 Terrain_Main 网格：顶面起伏 + 纯平底 + 侧壁。
 */
export function buildTerrainMainMesh(
  opts: BuildTerrainMeshOptions,
): TerrainMeshPayload {
  const { crop, heightMm, cols, rows, baseThicknessMm } = opts;
  const polygon = buildFootprintPolygon(crop, cols, rows);

  let minSurface = Infinity;
  for (let i = 0; i < heightMm.length; i++) {
    const h = heightMm[i]!;
    if (Number.isFinite(h) && h < minSurface) minSurface = h;
  }
  if (!Number.isFinite(minSurface)) minSurface = 0;

  const bottomZ = -baseThicknessMm;
  const topIndices: number[] = [];
  const positions: number[] = [];
  const vertexMap = new Map<string, number>();

  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;

  function addVertex(x: number, y: number, z: number): number {
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const idx = positions.length / 3;
    positions.push(x, y, z);
    vertexMap.set(key, idx);
    return idx;
  }

  const surfaceZ: number[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const t = rows <= 1 ? 0.5 : row / (rows - 1);
      const s = cols <= 1 ? 0.5 : col / (cols - 1);
      const xMm = -hw + crop.widthMm * s;
      const yMm = -hh + crop.heightMm * t;
      const inside = isInsideFootprint(xMm, yMm, crop, polygon);
      const zTop = inside && Number.isFinite(heightMm[i])
        ? heightMm[i]!
        : minSurface;
      surfaceZ[i] = zTop;
    }
  }

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const i00 = row * cols + col;
      const i10 = row * cols + col + 1;
      const i01 = (row + 1) * cols + col;
      const i11 = (row + 1) * cols + col + 1;
      const t = rows <= 1 ? 0.5 : row / (rows - 1);
      const s = cols <= 1 ? 0.5 : col / (cols - 1);
      const x0 = -hw + crop.widthMm * s;
      const y0 = -hh + crop.heightMm * t;
      const x1 = -hw + (crop.widthMm * (col + 1)) / (cols - 1 || 1);
      const y1 = -hh + (crop.heightMm * (row + 1)) / (rows - 1 || 1);

      const corners = [
        { x: x0, y: y0, z: surfaceZ[i00]!, idx: i00 },
        { x: x1, y: y0, z: surfaceZ[i10]!, idx: i10 },
        { x: x0, y: y1, z: surfaceZ[i01]!, idx: i01 },
        { x: x1, y: y1, z: surfaceZ[i11]!, idx: i11 },
      ];
      const active = corners.filter((c) => {
        const rowC = Math.floor(c.idx / cols);
        const colC = c.idx % cols;
        const tC = rows <= 1 ? 0.5 : rowC / (rows - 1);
        const sC = cols <= 1 ? 0.5 : colC / (cols - 1);
        const xm = -hw + crop.widthMm * sC;
        const ym = -hh + crop.heightMm * tC;
        return isInsideFootprint(xm, ym, crop, polygon);
      });
      if (active.length < 3) continue;

      const a = addVertex(corners[0]!.x, corners[0]!.y, corners[0]!.z);
      const b = addVertex(corners[1]!.x, corners[1]!.y, corners[1]!.z);
      const c = addVertex(corners[2]!.x, corners[2]!.y, corners[2]!.z);
      const d = addVertex(corners[3]!.x, corners[3]!.y, corners[3]!.z);

      const midInside =
        isInsideFootprint((x0 + x1) / 2, (y0 + y1) / 2, crop, polygon) ||
        active.length === 4;
      if (!midInside) continue;

      topIndices.push(a, b, c, a, c, d);
    }
  }

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const s0 = cols <= 1 ? 0.5 : col / (cols - 1);
      const t0 = rows <= 1 ? 0.5 : row / (rows - 1);
      const s1 = cols <= 1 ? 0.5 : (col + 1) / (cols - 1);
      const t1 = rows <= 1 ? 0.5 : (row + 1) / (rows - 1);
      const x0 = -hw + crop.widthMm * s0;
      const y0 = -hh + crop.heightMm * t0;
      const x1 = -hw + crop.widthMm * s1;
      const y1 = -hh + crop.heightMm * t1;
      const corners = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x0, y: y1 },
        { x: x1, y: y1 },
      ];
      if (!corners.every((c) => isInsideFootprint(c.x, c.y, crop, polygon))) {
        continue;
      }
      const a = addVertex(x0, y0, bottomZ);
      const b = addVertex(x1, y0, bottomZ);
      const c = addVertex(x0, y1, bottomZ);
      const d = addVertex(x1, y1, bottomZ);
      topIndices.push(a, c, b, b, c, d);
    }
  }

  const indices = topIndices;

  return {
    positions,
    indices,
    minSurfaceZ: minSurface,
    bottomZ,
    gridCols: cols,
    gridRows: rows,
  };
}
