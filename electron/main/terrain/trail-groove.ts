import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TrailGrooveSpec } from "@shared/types/terrain";
import {
  distanceToPolylineMm,
  type TrailPointMm,
} from "@shared/utils/trail-coords";
import { computeFlatGrooveFloorZMm } from "@shared/utils/trail-groove-floor";

/**
 * 在主模型高度场上沿轨迹垂直挖平底槽。
 * 走廊内格点统一为 floorZMm（由走廊内地表最低点 − depth 确定）。
 */
export function applyGrooveToHeightField(
  heightMm: Float64Array,
  cols: number,
  rows: number,
  crop: TerrainCropRegion,
  groove: TrailGrooveSpec | undefined,
  surfaceMm?: Float64Array,
): void {
  if (!groove?.polylineMm?.length || groove.depthMm <= 0) return;

  const reference = surfaceMm ?? heightMm;
  const floorZ =
    groove.floorZMm ??
    computeFlatGrooveFloorZMm({
      polylineMm: groove.polylineMm as TrailPointMm[],
      widthMm: groove.widthMm,
      depthMm: groove.depthMm,
      surfaceMm: reference,
      cols,
      rows,
      crop,
    });
  if (floorZ == null || !Number.isFinite(floorZ)) return;

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
        heightMm[i] = floorZ;
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
