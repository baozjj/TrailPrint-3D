import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TrailGrooveSpec } from "@shared/types/terrain";
import {
  distanceToPolylineMm,
  type TrailPointMm,
} from "@shared/utils/trail-coords";

/**
 * 在主模型高度场上沿轨迹挖槽（深度 = trailDepthMm）。
 * 凹槽宽度含装配公差：widthMm = 轨迹宽度 + 2×trailToleranceMm。
 */
export function applyGrooveToHeightField(
  heightMm: Float64Array,
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  groove: TrailGrooveSpec | undefined,
): void {
  if (!groove?.polylineMm?.length || groove.depthMm <= 0) return;

  const halfW = groove.widthMm / 2;
  const hw = crop.widthMm / 2;
  const hh = crop.heightMm / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const s = cols <= 1 ? 0.5 : col / (cols - 1);
      const t = rows <= 1 ? 0.5 : row / (rows - 1);
      const xMm = -hw + crop.widthMm * s;
      const yMm = -hh + crop.heightMm * t;
      const dist = distanceToPolylineMm(
        xMm,
        yMm,
        groove.polylineMm as TrailPointMm[],
      );
      if (dist <= halfW) {
        const i = row * cols + col;
        heightMm[i] = Math.max(0, heightMm[i]! - groove.depthMm);
      }
    }
  }
}

/** @deprecated 保留兼容；挖槽应在 buildTerrainMainMesh 前对高度场执行 */
export function applyTrailGrooveCut(
  mesh: import("@shared/types/terrain").TerrainMeshPayload,
  _groove: TrailGrooveSpec | undefined,
): import("@shared/types/terrain").TerrainMeshPayload {
  return mesh;
}

export const TRAIL_GROOVE_API_VERSION = 1;
