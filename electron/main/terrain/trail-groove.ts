import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TrailGrooveSpec } from "@shared/types/terrain";
import {
  distanceToPolylineMm,
  type TrailPointMm,
} from "@shared/utils/trail-coords";
import { computeGrooveFloorZMm } from "@shared/utils/trail-groove-floor";

/**
 * 在主模型高度场上沿轨迹挖平底槽。
 * 走廊内格点统一为 floorZMm（Z=0 向下 depthMm）；槽底以上至原地表为空腔。
 */
export function applyGrooveToHeightField(
  heightMm: Float64Array,
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  groove: TrailGrooveSpec | undefined,
): void {
  if (!groove?.polylineMm?.length || groove.depthMm <= 0) return;

  const floorZ =
    groove.floorZMm ?? computeGrooveFloorZMm(groove.depthMm);
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
        heightMm[row * cols + col] = floorZ;
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

export const TRAIL_GROOVE_API_VERSION = 3;
