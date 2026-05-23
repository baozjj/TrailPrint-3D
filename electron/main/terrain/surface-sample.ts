import type { TerrainCropRegion } from "@shared/types/terrain";

/** 在高度场（行优先 mm）上双线性采样表面 Z */
export function sampleSurfaceHeightMm(
  xMm: number,
  yMm: number,
  heightMm: Float64Array,
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
): number {
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  const s = (xMm + hw) / Math.max(crop.widthMm, 1e-6);
  const t = (yMm + hh) / Math.max(crop.heightMm, 1e-6);

  const colF = s * (cols - 1);
  const rowF = t * (rows - 1);
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(colF)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(rowF)));
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);
  const fc = colF - c0;
  const fr = rowF - r0;

  const z00 = heightMm[r0 * cols + c0] ?? 0;
  const z10 = heightMm[r0 * cols + c1] ?? z00;
  const z01 = heightMm[r1 * cols + c0] ?? z00;
  const z11 = heightMm[r1 * cols + c1] ?? z10;

  const z0 = z00 * (1 - fc) + z10 * fc;
  const z1 = z01 * (1 - fc) + z11 * fc;
  return z0 * (1 - fr) + z1 * fr;
}
