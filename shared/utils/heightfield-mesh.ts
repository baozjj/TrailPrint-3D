import type {
  TerrainCropRegion,
  TerrainHeightPreview,
  TerrainMeshPayload,
} from "../types/terrain";
import { buildFootprintPolygonMm, isInsidePrintFootprintMm } from "./footprint";
import { heightfieldCellMm } from "./map-mm-projection";

function sampleSurfaceZ(
  x: number,
  y: number,
  surfaceZ: number[],
  inside: boolean[],
  crop: TerrainCropRegion,
  rows: number,
  cols: number,
  fallback: number,
): number {
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  const s = ((x + hw) / crop.widthMm) * (cols - 1);
  const t = ((y + hh) / crop.heightMm) * (rows - 1);
  const col = Math.max(0, Math.min(cols - 1, Math.round(s)));
  const row = Math.max(0, Math.min(rows - 1, Math.round(t)));
  const i = row * cols + col;
  if (!inside[i]) return fallback;
  return surfaceZ[i]!;
}

function addFootprintSkirt(
  crop: TerrainCropRegion,
  surfaceZ: number[],
  inside: boolean[],
  rows: number,
  cols: number,
  bottomZ: number,
  minSurface: number,
  addVertex: (x: number, y: number, z: number) => number,
  indices: number[],
): void {
  const segments = 96;
  const pts: Array<{ x: number; y: number }> = [];
  const polygon = buildFootprintPolygonMm(crop);

  if (polygon && polygon.length >= 3) {
    for (const p of polygon) pts.push(p);
  } else if (crop.shape === "circle") {
    const r = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
  } else {
    const hw = crop.widthMm / 2;
    const hh = crop.heightMm / 2;
    pts.push(
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    );
  }

  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i]!;
    const p1 = pts[(i + 1) % n]!;
    const z0 = sampleSurfaceZ(
      p0.x,
      p0.y,
      surfaceZ,
      inside,
      crop,
      rows,
      cols,
      minSurface,
    );
    const z1 = sampleSurfaceZ(
      p1.x,
      p1.y,
      surfaceZ,
      inside,
      crop,
      rows,
      cols,
      minSurface,
    );
    const b0 = addVertex(p0.x, p0.y, bottomZ);
    const b1 = addVertex(p1.x, p1.y, bottomZ);
    const t0 = addVertex(p0.x, p0.y, z0);
    const t1 = addVertex(p1.x, p1.y, z1);
    indices.push(b0, b1, t0, b1, t1, t0);
  }
}

/** 由 DEM 高度场生成封闭山体网格（顶面 + 底面 + 轮廓侧壁） */
export function buildHeightfieldTerrainMesh(
  crop: TerrainCropRegion,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  baseThicknessMm: number,
): TerrainMeshPayload {
  let minSurface = Infinity;
  for (let i = 0; i < cols * rows; i++) {
    const h = heightMm[i]!;
    if (Number.isFinite(h) && h < minSurface) minSurface = h;
  }
  if (!Number.isFinite(minSurface)) minSurface = 0;

  const bottomZ = -baseThicknessMm;
  const indices: number[] = [];
  const positions: number[] = [];
  const vertexMap = new Map<string, number>();

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
  const inside: boolean[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const { x, y } = heightfieldCellMm(crop, row, col, rows, cols);
      const inFoot = isInsidePrintFootprintMm(x, y, crop);
      inside[i] = inFoot;
      surfaceZ[i] =
        inFoot && Number.isFinite(heightMm[i]) ? heightMm[i]! : minSurface;
    }
  }

  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;

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

      if (!isInsidePrintFootprintMm((x0 + x1) / 2, (y0 + y1) / 2, crop)) {
        continue;
      }

      const i00 = row * cols + col;
      const i10 = row * cols + col + 1;
      const i01 = (row + 1) * cols + col;
      const i11 = (row + 1) * cols + col + 1;

      const a = addVertex(x0, y0, surfaceZ[i00]!);
      const b = addVertex(x1, y0, surfaceZ[i10]!);
      const c = addVertex(x0, y1, surfaceZ[i01]!);
      const d = addVertex(x1, y1, surfaceZ[i11]!);
      indices.push(a, b, c, a, c, d);
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

      if (
        !isInsidePrintFootprintMm(x0, y0, crop) ||
        !isInsidePrintFootprintMm(x1, y0, crop) ||
        !isInsidePrintFootprintMm(x0, y1, crop) ||
        !isInsidePrintFootprintMm(x1, y1, crop)
      ) {
        continue;
      }

      const a = addVertex(x0, y0, bottomZ);
      const b = addVertex(x1, y0, bottomZ);
      const c = addVertex(x0, y1, bottomZ);
      const d = addVertex(x1, y1, bottomZ);
      indices.push(a, c, b, b, c, d);
    }
  }

  addFootprintSkirt(
    crop,
    surfaceZ,
    inside,
    rows,
    cols,
    bottomZ,
    minSurface,
    addVertex,
    indices,
  );

  return {
    positions,
    indices,
    minSurfaceZ: minSurface,
    bottomZ,
    gridCols: cols,
    gridRows: rows,
  };
}

export function heightPreviewFromField(
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  baseThicknessMm: number,
  minSurfaceZ: number,
): TerrainHeightPreview {
  return {
    cols,
    rows,
    heights: Array.from(heightMm),
    minSurfaceZ,
    bottomZ: -baseThicknessMm,
    baseThicknessMm,
  };
}
