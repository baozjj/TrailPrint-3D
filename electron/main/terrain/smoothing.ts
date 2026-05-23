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
