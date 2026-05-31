import type { TerrainCropRegion } from "../types/terrain";
import { distanceToPolylineMm, type TrailPointMm } from "./trail-coords";

/**
 * 平底凹槽/轨迹件共用的水平底面 Z (mm)。
 * 在凹槽走廊内取挖槽前地表最低点，再向下减去 depthMm，保证走廊内格点只下切、不抬升。
 */
export function computeFlatGrooveFloorZMm(params: {
  polylineMm: TrailPointMm[];
  widthMm: number;
  depthMm: number;
  surfaceMm: Float64Array;
  cols: number;
  rows: number;
  crop: TerrainCropRegion;
}): number | null {
  const { polylineMm, widthMm, depthMm, surfaceMm, cols, rows, crop } = params;
  if (polylineMm.length < 2 || depthMm <= 0 || widthMm <= 0) return null;

  const halfW = widthMm / 2;
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;
  let minSurface = Infinity;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const s = cols <= 1 ? 0.5 : col / (cols - 1);
      const t = rows <= 1 ? 0.5 : row / (rows - 1);
      const xMm = -hw + crop.widthMm * s;
      const yMm = -hh + crop.heightMm * t;
      const dist = distanceToPolylineMm(xMm, yMm, polylineMm);
      if (dist <= halfW) {
        const z = surfaceMm[row * cols + col]!;
        if (z < minSurface) minSurface = z;
      }
    }
  }

  if (!Number.isFinite(minSurface)) return null;
  return Math.max(0, minSurface - depthMm);
}
