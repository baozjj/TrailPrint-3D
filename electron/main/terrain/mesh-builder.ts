import type { TerrainCropRegion } from "@shared/types/terrain";
import type { TerrainMeshPayload } from "@shared/types/terrain";
import { buildHeightfieldTerrainMesh } from "@shared/utils/heightfield-mesh";

export interface BuildTerrainMeshOptions {
  crop: TerrainCropRegion;
  /** 行优先高度 (mm)，已含 Z 夸张 */
  heightMm: Float64Array;
  cols: number;
  rows: number;
  baseThicknessMm: number;
}

/** 生成封闭 Terrain_Main 网格：顶面起伏 + 纯平底 + 侧壁。 */
export function buildTerrainMainMesh(
  opts: BuildTerrainMeshOptions,
): TerrainMeshPayload {
  return buildHeightfieldTerrainMesh(
    opts.crop,
    opts.heightMm,
    opts.cols,
    opts.rows,
    opts.baseThicknessMm,
  );
}
