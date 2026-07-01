/**
 * 轨迹平底槽底面 Z (mm)。
 * 以 Z=0（基础顶面基准）为起点向下 trailDepthMm，如深度 1.5 → 槽底 -0.5。
 * 走廊内该水平面以上至地表均为空腔。
 */
export function computeGrooveFloorZMm(depthMm: number): number {
  return -depthMm;
}
