import { toRaw } from "vue";
import type { SprayPaintPlan } from "@shared/types/spray-paint";
import type { TerrainCropRegion, TerrainHeightPreview } from "@shared/types/terrain";

/** IPC structured clone 不接受 Vue Proxy，需转为纯对象 */
export function serializeHeightPreview(
  preview: TerrainHeightPreview,
): TerrainHeightPreview {
  const p = toRaw(preview);
  return {
    cols: p.cols,
    rows: p.rows,
    heights: Array.isArray(p.heights)
      ? [...p.heights]
      : Array.from(p.heights),
    minSurfaceZ: p.minSurfaceZ,
    bottomZ: p.bottomZ,
    baseThicknessMm: p.baseThicknessMm,
  };
}

export function serializeCrop(crop: TerrainCropRegion): TerrainCropRegion {
  return { ...toRaw(crop) };
}

export function serializeSprayPlan(plan: SprayPaintPlan): SprayPaintPlan {
  const p = toRaw(plan);
  return {
    ...p,
    colors: p.colors.map((c) => ({ ...c })),
    cellRegions: [...p.cellRegions],
  };
}
