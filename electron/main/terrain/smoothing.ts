import type { TerrainSmoothing } from "@shared/types/config";

function boxBlurPass(
  src: Float64Array,
  dst: Float64Array,
  cols: number,
  rows: number,
): void {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum = 0;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
          const v = src[r * cols + c];
          if (!Number.isFinite(v)) continue;
          sum += v;
          count++;
        }
      }
      dst[row * cols + col] = count > 0 ? sum / count : src[row * cols + col]!;
    }
  }
}

const PASSES: Record<TerrainSmoothing, number> = {
  raw: 0,
  light: 1,
  medium: 2,
  heavy: 4,
};

/** 用邻域有效值填补 DEM 无数据点，避免高度场出现孔洞 */
export function fillDemHoles(
  elevations: Float64Array,
  cols: number,
  rows: number,
): void {
  const valid = (v: number) => Number.isFinite(v);
  let filled = true;
  let pass = 0;
  while (filled && pass < cols * rows) {
    filled = false;
    pass++;
    const next = new Float64Array(elevations);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        if (valid(elevations[i]!)) continue;
        let sum = 0;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const r = row + dr;
            const c = col + dc;
            if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
            const v = elevations[r * cols + c]!;
            if (!valid(v)) continue;
            sum += v;
            count++;
          }
        }
        if (count > 0) {
          next[i] = sum / count;
          filled = true;
        }
      }
    }
    for (let i = 0; i < elevations.length; i++) {
      if (!valid(elevations[i]!) && valid(next[i]!)) elevations[i] = next[i]!;
    }
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < elevations.length; i++) {
    if (valid(elevations[i]!)) {
      sum += elevations[i]!;
      count++;
    }
  }
  const fallback = count > 0 ? sum / count : 0;
  for (let i = 0; i < elevations.length; i++) {
    if (!valid(elevations[i]!)) elevations[i] = fallback;
  }
}

export function applyTerrainSmoothing(
  heights: Float64Array,
  cols: number,
  rows: number,
  level: TerrainSmoothing,
): Float64Array {
  const passes = PASSES[level];
  if (passes === 0) return heights;

  let src = heights;
  let dst = new Float64Array(heights.length);
  for (let p = 0; p < passes; p++) {
    boxBlurPass(src, dst, cols, rows);
    const tmp = src;
    src = dst;
    dst = tmp;
  }
  return src;
}
