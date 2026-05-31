import type {
  TerrainCropRegion,
  TerrainHeightPreview,
  TerrainMeshPayload,
} from "../types/terrain";
import { buildFootprintPolygonMm } from "./footprint";
import {
  clipPolygonConvex,
  rectangleClipPolygon,
  type Vec2,
} from "./mesh-clip";

/** 模型平面 (mm) 双线性采样高度场 */
export function sampleHeightBilinearMm(
  xMm: number,
  yMm: number,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  fallback = 0,
): number {
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  const s = ((xMm + hw) / Math.max(crop.widthMm, 1e-6)) * (cols - 1);
  const t = ((yMm + hh) / Math.max(crop.heightMm, 1e-6)) * (rows - 1);
  const colF = Math.max(0, Math.min(cols - 1, s));
  const rowF = Math.max(0, Math.min(rows - 1, t));
  const c0 = Math.floor(colF);
  const r0 = Math.floor(rowF);
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);
  const fc = colF - c0;
  const fr = rowF - r0;
  const read = (row: number, col: number): number => {
    const v = heightMm[row * cols + col]!;
    return Number.isFinite(v) ? v : fallback;
  };
  const z00 = read(r0, c0);
  const z10 = read(r0, c1);
  const z01 = read(r1, c0);
  const z11 = read(r1, c1);
  const z0 = z00 * (1 - fc) + z10 * fc;
  const z1 = z01 * (1 - fc) + z11 * fc;
  return z0 * (1 - fr) + z1 * fr;
}

function gridCornerMm(
  crop: TerrainCropRegion,
  row: number,
  col: number,
  rows: number,
  cols: number,
): Vec2 {
  const s = cols <= 1 ? 0.5 : col / (cols - 1);
  const t = rows <= 1 ? 0.5 : row / (rows - 1);
  return {
    x: -crop.widthMm / 2 + crop.widthMm * s,
    y: -crop.heightMm / 2 + crop.heightMm * t,
  };
}

function surfaceZ(
  x: number,
  y: number,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  minSurface: number,
): number {
  return sampleHeightBilinearMm(x, y, heightMm, cols, rows, crop, minSurface);
}

/**
 * 圆盘：极坐标网格，外圈精确落在半径上 → 顶/底/侧壁共享顶点，水密实心。
 */
function buildPolarCircleMesh(
  crop: TerrainCropRegion,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  baseThicknessMm: number,
  minSurface: number,
): TerrainMeshPayload {
  const R = crop.radiusMm ?? Math.min(crop.widthMm, crop.heightMm) / 2;
  const bottomZ = -baseThicknessMm;
  const nAngles = Math.max(3, cols);
  const nRings = Math.max(2, rows);

  const positions: number[] = [];
  const indices: number[] = [];
  const topIdx: number[][] = [];
  const botIdx: number[][] = [];

  function push(x: number, y: number, z: number): number {
    const i = positions.length / 3;
    positions.push(x, y, z);
    return i;
  }

  for (let ring = 0; ring < nRings; ring++) {
    const r = ring === 0 ? 0 : (ring / (nRings - 1)) * R;
    topIdx[ring] = [];
    botIdx[ring] = [];
    const count = ring === 0 ? 1 : nAngles;
    for (let a = 0; a < count; a++) {
      const ang =
        ring === 0 ? 0 : (a / nAngles) * Math.PI * 2 - Math.PI / 2;
      const x = r * Math.cos(ang);
      const y = r * Math.sin(ang);
      const z = surfaceZ(x, y, heightMm, cols, rows, crop, minSurface);
      topIdx[ring]![a] = push(x, y, z);
      botIdx[ring]![a] = push(x, y, bottomZ);
    }
  }

  const tCenter = topIdx[0]![0]!;
  const bCenter = botIdx[0]![0]!;
  for (let a = 0; a < nAngles; a++) {
    const a1 = (a + 1) % nAngles;
    const t0 = topIdx[1]![a]!;
    const t1 = topIdx[1]![a1]!;
    const b0 = botIdx[1]![a]!;
    const b1 = botIdx[1]![a1]!;
    indices.push(tCenter, t0, t1);
    indices.push(bCenter, b1, b0);
  }

  for (let ring = 1; ring < nRings - 1; ring++) {
    for (let a = 0; a < nAngles; a++) {
      const a1 = (a + 1) % nAngles;
      const tt0 = topIdx[ring]![a]!;
      const tt1 = topIdx[ring]![a1]!;
      const tt2 = topIdx[ring + 1]![a1]!;
      const tt3 = topIdx[ring + 1]![a]!;
      indices.push(tt0, tt1, tt3, tt1, tt2, tt3);

      const bb0 = botIdx[ring]![a]!;
      const bb1 = botIdx[ring]![a1]!;
      const bb2 = botIdx[ring + 1]![a1]!;
      const bb3 = botIdx[ring + 1]![a]!;
      indices.push(bb0, bb3, bb1, bb1, bb3, bb2);
    }
  }

  const outer = nRings - 1;
  for (let a = 0; a < nAngles; a++) {
    const a1 = (a + 1) % nAngles;
    const t0 = topIdx[outer]![a]!;
    const t1 = topIdx[outer]![a1]!;
    const b0 = botIdx[outer]![a]!;
    const b1 = botIdx[outer]![a1]!;
    indices.push(b0, b1, t1, b0, t1, t0);
  }

  return {
    positions,
    indices,
    minSurfaceZ: minSurface,
    bottomZ,
    gridCols: cols,
    gridRows: rows,
  };
}

/** 矩形：规则方格，四角均在轮廓内 */
function buildRectGridMesh(
  crop: TerrainCropRegion,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  baseThicknessMm: number,
  minSurface: number,
): TerrainMeshPayload {
  const bottomZ = -baseThicknessMm;
  const positions: number[] = [];
  const indices: number[] = [];
  const topIdx = new Int32Array(rows * cols);
  const botIdx = new Int32Array(rows * cols);

  function push(x: number, y: number, z: number): number {
    const i = positions.length / 3;
    positions.push(x, y, z);
    return i;
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const { x, y } = gridCornerMm(crop, row, col, rows, cols);
      const z = surfaceZ(x, y, heightMm, cols, rows, crop, minSurface);
      topIdx[row * cols + col] = push(x, y, z);
      botIdx[row * cols + col] = push(x, y, bottomZ);
    }
  }

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const i00 = topIdx[row * cols + col]!;
      const i10 = topIdx[row * cols + col + 1]!;
      const i01 = topIdx[(row + 1) * cols + col]!;
      const i11 = topIdx[(row + 1) * cols + col + 1]!;
      indices.push(i00, i10, i01, i10, i11, i01);

      const b00 = botIdx[row * cols + col]!;
      const b10 = botIdx[row * cols + col + 1]!;
      const b01 = botIdx[(row + 1) * cols + col]!;
      const b11 = botIdx[(row + 1) * cols + col + 1]!;
      indices.push(b00, b01, b10, b10, b01, b11);
    }
  }

  function wallStrip(
    topA: number,
    topB: number,
    botA: number,
    botB: number,
  ): void {
    indices.push(botA, botB, topB, botA, topB, topA);
  }

  for (let row = 0; row < rows - 1; row++) {
    wallStrip(
      topIdx[row * cols]!,
      topIdx[(row + 1) * cols]!,
      botIdx[row * cols]!,
      botIdx[(row + 1) * cols]!,
    );
    wallStrip(
      topIdx[row * cols + cols - 1]!,
      topIdx[(row + 1) * cols + cols - 1]!,
      botIdx[row * cols + cols - 1]!,
      botIdx[(row + 1) * cols + cols - 1]!,
    );
  }
  for (let col = 0; col < cols - 1; col++) {
    wallStrip(
      topIdx[col]!,
      topIdx[col + 1]!,
      botIdx[col]!,
      botIdx[col + 1]!,
    );
    wallStrip(
      topIdx[(rows - 1) * cols + col]!,
      topIdx[(rows - 1) * cols + col + 1]!,
      botIdx[(rows - 1) * cols + col]!,
      botIdx[(rows - 1) * cols + col + 1]!,
    );
  }

  return {
    positions,
    indices,
    minSurfaceZ: minSurface,
    bottomZ,
    gridCols: cols,
    gridRows: rows,
  };
}

/** 多边形等：方格裁剪到凸轮廓 */
function buildClippedGridMesh(
  crop: TerrainCropRegion,
  heightMm: ArrayLike<number>,
  cols: number,
  rows: number,
  baseThicknessMm: number,
  minSurface: number,
): TerrainMeshPayload {
  const bottomZ = -baseThicknessMm;
  const positions: number[] = [];
  const indices: number[] = [];
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  const poly = buildFootprintPolygonMm(crop);
  const clipPoly =
    poly && poly.length >= 3
      ? poly
      : rectangleClipPolygon(hw, hh);

  const vertexKey = new Map<string, number>();
  function vertex(x: number, y: number, z: number): number {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    const e = vertexKey.get(k);
    if (e !== undefined) return e;
    const i = positions.length / 3;
    positions.push(x, y, z);
    vertexKey.set(k, i);
    return i;
  }

  function addFan(xy: Vec2[], zAt: (p: Vec2) => number, winding: "top" | "bot"): void {
    if (xy.length < 3) return;
    const v0 = vertex(xy[0]!.x, xy[0]!.y, zAt(xy[0]!));
    for (let i = 1; i < xy.length - 1; i++) {
      const ia = vertex(xy[i]!.x, xy[i]!.y, zAt(xy[i]!));
      const ib = vertex(xy[i + 1]!.x, xy[i + 1]!.y, zAt(xy[i + 1]!));
      if (winding === "top") indices.push(v0, ia, ib);
      else indices.push(v0, ib, ia);
    }
  }

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const c00 = gridCornerMm(crop, row, col, rows, cols);
      const c10 = gridCornerMm(crop, row, col + 1, rows, cols);
      const c01 = gridCornerMm(crop, row + 1, col, rows, cols);
      const c11 = gridCornerMm(crop, row + 1, col + 1, rows, cols);
      const clipped = clipPolygonConvex([c00, c10, c11, c01], clipPoly);
      if (clipped.length < 3) continue;
      addFan(clipped, (p) => surfaceZ(p.x, p.y, heightMm, cols, rows, crop, minSurface), "top");
      addFan(clipped, () => bottomZ, "bot");
    }
  }

  return {
    positions,
    indices,
    minSurfaceZ: minSurface,
    bottomZ,
    gridCols: cols,
    gridRows: rows,
  };
}

/**
 * 由 DEM 高度场生成封闭实心山体。
 * 圆盘用极坐标网格；矩形用满铺方格；其余形状裁剪方格。
 */
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

  if (crop.shape === "circle" || crop.shape === "polygon") {
    return buildPolarCircleMesh(
      crop,
      heightMm,
      cols,
      rows,
      baseThicknessMm,
      minSurface,
    );
  }
  if (crop.shape === "rectangle") {
    return buildRectGridMesh(
      crop,
      heightMm,
      cols,
      rows,
      baseThicknessMm,
      minSurface,
    );
  }
  return buildClippedGridMesh(
    crop,
    heightMm,
    cols,
    rows,
    baseThicknessMm,
    minSurface,
  );
}

export function minHeightFieldMm(heightMm: ArrayLike<number>): number {
  let min = Infinity;
  for (let i = 0; i < heightMm.length; i++) {
    const v = heightMm[i]!;
    if (Number.isFinite(v) && v < min) min = v;
  }
  return Number.isFinite(min) ? min : 0;
}

export function heightPreviewFromField(
  heightMm: Float64Array,
  cols: number,
  rows: number,
  baseThicknessMm: number,
  minSurfaceZ?: number,
): TerrainHeightPreview {
  return {
    cols,
    rows,
    heights: heightMm,
    minSurfaceZ: minSurfaceZ ?? minHeightFieldMm(heightMm),
    bottomZ: -baseThicknessMm,
    baseThicknessMm,
  };
}
