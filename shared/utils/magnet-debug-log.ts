/** 磁铁孔排查日志（主进程 console + 渲染进程 console 共用格式） */
export interface MagnetDebugInfo {
  phase: string;
  mapCropShape?: string;
  polygonSides?: number;
  footprintShape?: string;
  outerVertCount?: number;
  magnetEnabled?: boolean;
  circleCount?: number;
  holeCount?: number;
  holes?: Array<{ x: number; y: number }>;
  cutRadiusMm?: number;
  cutDepthMm?: number;
  triCountBefore?: number;
  triCountAfter?: number;
  removedTriangles?: number;
  note?: string;
}

let logSeq = 0;

function formatMagnetDebug(payload: MagnetDebugInfo): string {
  return `[TrailPrint:Magnet] #${++logSeq} ${JSON.stringify(payload)}`;
}

/** 写入 stderr，便于在 electron-vite 终端里 grep TrailPrint:Magnet */
export function logMagnetDebug(payload: MagnetDebugInfo): void {
  console.warn(formatMagnetDebug(payload));
}

export function magnetDebugSummary(payload: MagnetDebugInfo): string {
  const shape = payload.footprintShape ?? payload.mapCropShape ?? "?";
  const n = payload.holeCount ?? 0;
  const verts = payload.outerVertCount ?? "?";
  return `磁铁孔 ${n} 个（托盘 ${shape}，外轮廓 ${verts} 顶点）`;
}
