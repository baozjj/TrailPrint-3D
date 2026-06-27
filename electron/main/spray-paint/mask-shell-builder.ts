import type { TerrainCropRegion, TerrainMeshPayload } from "@shared/types/terrain";
import { buildFootprintPolygonMm } from "@shared/utils/footprint";
import {
  sampleHeightBilinearMm,
  minHeightFieldMm,
} from "@shared/utils/heightfield-mesh";
import { pointInConvexPolygon } from "@shared/utils/mesh-clip";

export interface MaskShellParams {
  maskFitToleranceMm: number;
  maskShellThicknessMm: number;
  bleedMarginMm: number;
  bottomZ: number;
}

function gridCornerMm(
  crop: TerrainCropRegion,
  row: number,
  col: number,
  rows: number,
  cols: number,
): { x: number; y: number } {
  const s = cols <= 1 ? 0.5 : col / (cols - 1);
  const t = rows <= 1 ? 0.5 : row / (rows - 1);
  return {
    x: -crop.widthMm / 2 + crop.widthMm * s,
    y: -crop.heightMm / 2 + crop.heightMm * t,
  };
}

function cellCenterMm(
  crop: TerrainCropRegion,
  row: number,
  col: number,
  rows: number,
  cols: number,
): { x: number; y: number } {
  const c00 = gridCornerMm(crop, row, col, rows, cols);
  const c11 = gridCornerMm(crop, row + 1, col + 1, rows, cols);
  return { x: (c00.x + c11.x) / 2, y: (c00.y + c11.y) / 2 };
}

function cellInsideFootprint(
  crop: TerrainCropRegion,
  row: number,
  col: number,
  rows: number,
  cols: number,
  footprintPoly?: Array<{ x: number; y: number }> | null,
): boolean {
  const { x, y } = cellCenterMm(crop, row, col, rows, cols);
  if (crop.shape === "circle") {
    const r = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
    return x * x + y * y <= r * r + 1e-6;
  }
  const poly = footprintPoly ?? buildFootprintPolygonMm(crop);
  if (poly && poly.length >= 3) {
    return pointInConvexPolygon({ x, y }, poly);
  }
  return true;
}

function erodeOpenMask(
  open: Uint8Array,
  cols: number,
  rows: number,
  radiusCells: number,
): Uint8Array {
  if (radiusCells <= 0) return open;
  let cur = open;
  for (let pass = 0; pass < radiusCells; pass++) {
    const next = new Uint8Array(cur.length);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (!cur[idx]) continue;
        let keep = true;
        for (let dr = -1; dr <= 1 && keep; dr++) {
          for (let dc = -1; dc <= 1 && keep; dc++) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
              keep = false;
              continue;
            }
            if (!cur[nr * cols + nc]) keep = false;
          }
        }
        next[idx] = keep ? 1 : 0;
      }
    }
    cur = next;
  }
  return cur;
}

function cornerHeights(
  crop: TerrainCropRegion,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  clearance: number,
  thickness: number,
  fallback: number,
): { inner: Float64Array; shell: Float64Array } {
  const inner = new Float64Array((rows + 1) * (cols + 1));
  const shell = new Float64Array((rows + 1) * (cols + 1));
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const { x, y } = gridCornerMm(crop, row, col, rows + 1, cols + 1);
      const z = sampleHeightBilinearMm(
        x,
        y,
        heightMm,
        cols,
        rows,
        crop,
        fallback,
      );
      const i = row * (cols + 1) + col;
      inner[i] = z + clearance;
      shell[i] = z + clearance + thickness;
    }
  }
  return { inner, shell };
}

/**
 * 负向遮罩薄壳：本颜色格点顶面开窗（漏出待喷区域），其余颜色区域封闭遮挡。
 * 各罩分次套合使用，预览「显示全部」时封闭区会视觉重叠，属正常现象。
 */
export function buildMaskShellForRegion(
  crop: TerrainCropRegion,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  cellRegions: ArrayLike<number>,
  targetRegionId: number,
  params: MaskShellParams,
): TerrainMeshPayload {
  const minSurface = minHeightFieldMm(heightMm);
  const { inner, shell } = cornerHeights(
    crop,
    heightMm,
    cols,
    rows,
    params.maskFitToleranceMm,
    params.maskShellThicknessMm,
    minSurface,
  );

  const avgCellMm = Math.min(
    crop.widthMm / Math.max(cols - 1, 1),
    crop.heightMm / Math.max(rows - 1, 1),
  );
  const bleedCells = Math.max(
    0,
    Math.round(params.bleedMarginMm / Math.max(avgCellMm, 0.1)),
  );

  const openRaw = new Uint8Array(cols * rows);
  const active = new Uint8Array(cols * rows);
  const footprintPoly =
    crop.shape === "circle" ? null : buildFootprintPolygonMm(crop);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (!cellInsideFootprint(crop, row, col, rows, cols, footprintPoly)) {
        continue;
      }
      active[idx] = 1;
      if (cellRegions[idx] === targetRegionId) openRaw[idx] = 1;
    }
  }
  const open = erodeOpenMask(openRaw, cols, rows, bleedCells);

  const positions: number[] = [];
  const indices: number[] = [];
  const vertexKey = new Map<string, number>();

  function pushVertex(x: number, y: number, z: number): number {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    const existing = vertexKey.get(k);
    if (existing !== undefined) return existing;
    const i = positions.length / 3;
    positions.push(x, y, z);
    vertexKey.set(k, i);
    return i;
  }

  function addQuad(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    flip = false,
    faceSet?: Set<string>,
  ): void {
    const ia = pushVertex(ax, ay, az);
    const ib = pushVertex(bx, by, bz);
    const ic = pushVertex(cx, cy, cz);
    const id = pushVertex(dx, dy, dz);
    if (faceSet) {
      const key = [ia, ib, ic, id].sort((a, b) => a - b).join(",");
      if (faceSet.has(key)) return;
      faceSet.add(key);
    }
    if (flip) indices.push(ia, id, ic, ia, ic, ib);
    else indices.push(ia, ib, ic, ia, ic, id);
  }

  function isClosed(row: number, col: number): boolean {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
    const idx = row * cols + col;
    return active[idx] === 1 && open[idx] === 0;
  }

  function cornerPos(
    row: number,
    col: number,
    layer: "inner" | "shell" | "bottom",
  ): { x: number; y: number; z: number } {
    const { x, y } = gridCornerMm(crop, row, col, rows + 1, cols + 1);
    const ci = row * (cols + 1) + col;
    const z =
      layer === "bottom"
        ? params.bottomZ
        : layer === "inner"
          ? inner[ci]!
          : shell[ci]!;
    return { x, y, z };
  }

  const topFaces = new Set<string>();
  const bottomFaces = new Set<string>();
  const wallEdges = new Set<string>();

  function wallKey(cA: [number, number], cB: [number, number]): string {
    const a = `${cA[0]}:${cA[1]}`;
    const b = `${cB[0]}:${cB[1]}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function addSideWall(cA: [number, number], cB: [number, number]): void {
    const key = wallKey(cA, cB);
    if (wallEdges.has(key)) return;
    wallEdges.add(key);

    const i0 = cornerPos(cA[0], cA[1], "inner");
    const i1 = cornerPos(cB[0], cB[1], "inner");
    const s0 = cornerPos(cA[0], cA[1], "shell");
    const s1 = cornerPos(cB[0], cB[1], "shell");

    addQuad(
      i0.x,
      i0.y,
      i0.z,
      i1.x,
      i1.y,
      i1.z,
      s1.x,
      s1.y,
      s1.z,
      s0.x,
      s0.y,
      s0.z,
    );
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isClosed(row, col)) continue;

      const c00 = cornerPos(row, col, "shell");
      const c10 = cornerPos(row, col + 1, "shell");
      const c11 = cornerPos(row + 1, col + 1, "shell");
      const c01 = cornerPos(row + 1, col, "shell");
      addQuad(
        c00.x,
        c00.y,
        c00.z,
        c10.x,
        c10.y,
        c10.z,
        c11.x,
        c11.y,
        c11.z,
        c01.x,
        c01.y,
        c01.z,
        false,
        topFaces,
      );

      const b00 = cornerPos(row, col, "inner");
      const b10 = cornerPos(row, col + 1, "inner");
      const b11 = cornerPos(row + 1, col + 1, "inner");
      const b01 = cornerPos(row + 1, col, "inner");
      addQuad(
        b00.x,
        b00.y,
        b00.z,
        b01.x,
        b01.y,
        b01.z,
        b11.x,
        b11.y,
        b11.z,
        b10.x,
        b10.y,
        b10.z,
        false,
        bottomFaces,
      );

      const edgeChecks: Array<{
        nRow: number;
        nCol: number;
        cA: [number, number];
        cB: [number, number];
      }> = [
        { nRow: row, nCol: col + 1, cA: [row, col + 1], cB: [row + 1, col + 1] },
        { nRow: row + 1, nCol: col, cA: [row + 1, col], cB: [row + 1, col + 1] },
        { nRow: row, nCol: col - 1, cA: [row, col], cB: [row + 1, col] },
        { nRow: row - 1, nCol: col, cA: [row, col], cB: [row, col + 1] },
      ];

      for (const { nRow, nCol, cA, cB } of edgeChecks) {
        if (isClosed(nRow, nCol)) continue;
        addSideWall(cA, cB);
      }
    }
  }

  return {
    positions,
    indices,
    minSurfaceZ: minSurface + params.maskFitToleranceMm,
    bottomZ: params.bottomZ,
    gridCols: cols,
    gridRows: rows,
  };
}

export function computeSteepBoundaryWarning(
  crop: TerrainCropRegion,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  cellRegions: ArrayLike<number>,
): boolean {
  const cellDx = crop.widthMm / Math.max(cols - 1, 1);
  const cellDy = crop.heightMm / Math.max(rows - 1, 1);
  const steepThreshold = Math.tan((70 * Math.PI) / 180);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const z = heightMm[idx] ?? 0;
      const zR = col < cols - 1 ? (heightMm[idx + 1] ?? z) : z;
      const zD = row < rows - 1 ? (heightMm[idx + cols] ?? z) : z;
      const slope = Math.hypot((zR - z) / cellDx, (zD - z) / cellDy);
      if (slope <= steepThreshold) continue;

      const region = cellRegions[idx]!;
      const neighbors = [
        [row, col - 1],
        [row, col + 1],
        [row - 1, col],
        [row + 1, col],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (cellRegions[nr * cols + nc] !== region) return true;
      }
    }
  }
  return false;
}
