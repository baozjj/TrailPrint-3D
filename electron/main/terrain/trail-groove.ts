import type {
  TerrainMeshPayload,
  TrailGrooveSpec,
} from "@shared/types/terrain";

/**
 * 任务-04：在主模型顶面沿轨迹执行布尔挖槽。
 * 当前为占位实现，返回原网格并记录待挖槽规格。
 */
export function applyTrailGrooveCut(
  mesh: TerrainMeshPayload,
  groove: TrailGrooveSpec | undefined,
): TerrainMeshPayload {
  if (!groove?.polylineMm?.length || groove.depthMm <= 0) {
    return mesh;
  }
  // TODO(task-04): 顶面三角网格沿折线挤出凹槽（CSG 或高度场雕刻）
  return mesh;
}

/** 供任务-04 查询的挖槽接口元数据 */
export const TRAIL_GROOVE_API_VERSION = 1;
